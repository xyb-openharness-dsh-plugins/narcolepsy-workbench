#!/usr/bin/env node
/**
 * 装机副本自检：拿**装进 profile 的那一份**（不是源码树）跑一遍真实请求。
 *
 * 为什么需要它：`npm run check` / `check:ui` 跑的都是源码树，而装机出问题恰恰是
 * 「源码树好好的、装进去少文件/少路由/起不来」。家族教训里这一类最贵：
 * 症状是"装了能开、进去是空的"，服务照常 200，只是列表全空，看起来像"还没数据"。
 *
 * 判据（每条都要能 FAIL）：
 *   ① `dsh/index.js` 能被 import（exports 里有 name / apply / Config）；
 *   ② `apply(ctx)` **返回 undefined**（cordis 对 apply 的返回值严格要求：非 async、返回 undefined，
 *      返回普通对象会报 `Invalid effect`）；
 *   ③ 真的调了 `webServer.register({kind:'prefix', path:'/api/narcolepsy'})`；
 *   ④ 打真请求：health / bootstrap / profile?private=1 / ui/index.html 都是对的；
 *   ⑤ bootstrap 里**私密正文一个字节都没有**（只给条数），`?private=1` 才拿到正文。
 *
 * 两条已知前提，写在这里免得下次有人以为是用例写错：
 *   · 宿主提供的 peer（`@deepseek-ai/schemastery`）在 profile 的 node_modules 里不一定有，
 *     运行时由宿主注入。所以这里把装机副本复制到临时目录、给 peer 放最小桩再跑；
 *     桩只实现 `Schema.object/string`，够本插件定义 Config。
 *   · profile 目录是**只读对象**：本脚本对副本操作，绝不改 profile 里的文件。
 *
 * 用法：
 *   node scripts/probe-installed.mjs                     # 自动找 Desktop 实际加载的 profile
 *   node scripts/probe-installed.mjs --from <包目录>      # 指定任意解包目录（tgz 解开也行）
 *   node scripts/probe-installed.mjs --json
 * 退出码：0 通过；1 有断言失败；2 找不到装机副本。
 */
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'

const args = process.argv.slice(2)
const argValue = (flag) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : null)
const JSON_OUT = args.includes('--json')

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const NAME = pkg.name

/* ---------------- 找装机副本 ---------------- */
function appSupportRoot() {
  if (process.platform === 'darwin') return join(homedir(), 'Library', 'Application Support')
  if (process.platform === 'win32') return process.env.APPDATA || join(homedir(), 'AppData', 'Roaming')
  return process.env.XDG_CONFIG_HOME || join(homedir(), '.config')
}

function findInstalled() {
  const explicit = argValue('--from')
  if (explicit) return explicit
  const harness = join(appSupportRoot(), 'dsh-desktop', 'harness')
  const profilesDir = join(harness, 'profiles')
  if (!existsSync(profilesDir)) return null
  /* 不猜 profile 名：找哪个 profile 里**真的**有本包的 node_modules 目录 */
  for (const name of readdirSync(profilesDir)) {
    const candidate = join(profilesDir, name, 'node_modules', ...NAME.split('/'))
    if (existsSync(join(candidate, 'package.json'))) return candidate
  }
  return null
}

const failures = []
const passes = []
function check(ok, name, detail) {
  if (ok) passes.push(name)
  else failures.push(detail === undefined ? name : `${name} → ${JSON.stringify(detail)}`)
}

const source = findInstalled()
if (!source) {
  console.error(`✗ 没找到已安装的 ${NAME}。先按 docs/06-VALIDATION-AND-RELEASE.md 装进 Desktop 的 profile，`)
  console.error('  或用 --from <解包目录> 直接对本地产物验证。')
  process.exit(2)
}

/* ---------------- 复制到临时目录 + 给 peer 放桩 ---------------- */
const scratch = mkdtempSync(join(tmpdir(), 'narco-installed-'))
const boxed = join(scratch, NAME.split('/').pop())
const modules = join(scratch, 'node_modules', '@deepseek-ai', 'schemastery')
mkdirSync(modules, { recursive: true })
cpSync(source, boxed, { recursive: true })

writeFileSync(join(modules, 'package.json'), JSON.stringify({
  name: '@deepseek-ai/schemastery', version: '0.0.0-stub', type: 'module', main: 'index.js'
}, null, 2))
writeFileSync(join(modules, 'index.js'), `/* 宿主注入的 peer 的最小桩：本插件只用 Schema.object/string 定义 Config。 */
const Schema = {
  object: (shape) => ({ __schema: 'object', shape }),
  string: () => ({ __schema: 'string' }),
  number: () => ({ __schema: 'number' }),
  boolean: () => ({ __schema: 'boolean' }),
  any: () => ({ __schema: 'any' })
}
export { Schema }
export default Schema
`)

const workspace = join(scratch, 'data')
mkdirSync(workspace, { recursive: true })

let server = null
try {
  const mod = await import(join(boxed, 'dsh', 'index.js'))

  check(typeof mod.apply === 'function', 'dsh/index.js 导出了 apply()')
  check(typeof mod.name === 'string' && mod.name.length > 0, '插件有 name（宿主日志里要用）', mod.name)
  check(Array.isArray(mod.inject) && mod.inject.includes('webServer'), 'inject 里声明了 webServer', mod.inject)
  check(!!mod.Config, '导出了 Config（宿主用它校验 config.root）')

  let handler = null
  let registered = null
  const ctx = {
    logger: { error: () => {}, warn: () => {}, info: () => {}, debug: () => {} },
    webServer: {
      register: (opts) => { handler = opts.handler; registered = opts; return () => {} }
    },
    connection: { requestRejection: () => undefined },
    effect: (fn) => { const dispose = fn(); return () => { try { dispose?.() } catch { /* ignore */ } } }
  }

  const returned = mod.apply(ctx, { root: workspace })
  check(returned === undefined, 'apply() 返回 undefined（cordis 要求：非 async、不给普通对象）', returned)
  check(!!handler, '真的调了 webServer.register() 并拿到 handler')
  check(registered?.kind === 'prefix', 'register 用 prefix 形态挂载', registered?.kind)
  check(registered?.path === mod.API_PREFIX, 'register 的 path 与 API_PREFIX 一致', { got: registered?.path, want: mod.API_PREFIX })

  if (!handler) throw new Error('没有 handler，后面没法打请求')

  server = createServer((req, res) => handler(req, res))
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  const get = async (path) => {
    const res = await fetch(base + path)
    const text = await res.text()
    let json = null
    try { json = JSON.parse(text) } catch { /* 不是 JSON 的就不解析 */ }
    return { status: res.status, type: res.headers.get('content-type') ?? '', text, json }
  }

  const health = await get(`${mod.API_PREFIX}/health`)
  check(health.status === 200, 'health 200', health.status)
  check(health.json?.ok === true, 'health.ok === true', health.json?.ok)
  check(health.json?.version === pkg.version, 'health 里的版本与 package.json 一致', { got: health.json?.version, want: pkg.version })

  const boot = await get(`${mod.API_PREFIX}/bootstrap`)
  check(boot.status === 200, 'bootstrap 200', boot.status)
  const profiles = Object.keys(boot.json?.profiles ?? {})
  check(profiles.length > 0, 'bootstrap 里至少有一个档案（否则装进去是空库）', profiles)
  check(Object.keys(boot.json?.tracks ?? {}).length === 5, 'bootstrap 带 5 条指标轨道')
  const A = boot.json?.profiles?.[profiles[0]] ?? {}
  check(Array.isArray(A.naps) && A.naps.length > 0, '档案里有发作记录（不是空数组）', A.naps?.length)
  check(Array.isArray(A.metrics) && A.metrics.length > 0, '档案里有指标点', A.metrics?.length)

  /* 私密：默认一个字节都不下发，只给条数 */
  const meta = A.viewpointsMeta ?? {}
  check(Array.isArray(A.viewpoints) && A.viewpoints.length === 0, '默认 bootstrap 不含私密正文', A.viewpoints)
  check((meta.privateCount ?? 0) > 0, '默认只给"有几条藏起来了"，不给正文', meta)

  const withPrivate = await get(`${mod.API_PREFIX}/profile/${encodeURIComponent(profiles[0])}?private=1`)
  check(withPrivate.status === 200, '显式 private=1 的档案读取 200', withPrivate.status)
  check((withPrivate.json?.viewpoints?.length ?? 0) >= (meta.privateCount ?? 0), 'private=1 才拿到私密正文', withPrivate.json?.viewpoints?.length)

  const ui = await get(`${mod.UI_PREFIX}/index.html`)
  check(ui.status === 200, 'UI 首页 200', ui.status)
  check(/text\/html/.test(ui.type), 'UI 首页是 HTML（不是 JSON、不是兜底空壳）', ui.type)
  check(/<div class="workspace">/.test(ui.text), 'UI 首页是业务外壳（含 .workspace）')
  const appJs = await get(`${mod.UI_PREFIX}/app.js`)
  check(appJs.status === 200 && /javascript/.test(appJs.type), 'UI 的 app.js 以 JS 返回', { status: appJs.status, type: appJs.type })

  const unknown = await get(`${mod.API_PREFIX}/no-such-endpoint`)
  check(unknown.status === 404 && !!unknown.json, '未知接口回 JSON 404（不是 HTML）', { status: unknown.status, type: unknown.type })
} catch (error) {
  check(false, '装机副本加载失败', String(error && error.message ? error.message : error))
} finally {
  if (server) await new Promise((resolve) => server.close(resolve))
  rmSync(scratch, { recursive: true, force: true })
}

if (JSON_OUT) {
  console.log(JSON.stringify({ source, pass: passes.length, fail: failures.length, passes, failures }, null, 2))
} else {
  console.log(`装机副本：${source}`)
  for (const name of passes) console.log(`  ✓ ${name}`)
  for (const name of failures) console.log(`  ✗ ${name}`)
  console.log(`\n${failures.length ? '✗' : '✓'} 装机副本自检：${passes.length} 通过 · ${failures.length} 失败`)
}
process.exit(failures.length ? 1 : 0)
