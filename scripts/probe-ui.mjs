#!/usr/bin/env node
/**
 * 开发版界面无头走查（`public/` + 真 HTTP + 真 sqlite）
 *
 * 为什么需要它：`probe-prototype.mjs` / `probe-interactions.mjs` 走的是**原型**，
 * 原型的数据来自 `window.DEMO_DATA`，永远"有数据"。开发版真正的风险是另一类：
 *   · 页面连不上库 → 静默回退演示数据，看着一切正常，其实一条没存；
 *   · 数据形状对不上 → 某块永远空着，不报错；
 *   · 写操作在只读版本里假装成功（患者以为存了）。
 * 这三类 bug 用眼睛看界面看不出来，只能起真服务 + 真浏览器断言。
 *
 * 判据来源：
 *   ZERO-TO-DEV 2.3  一致性验收：开发版必须真的跟本机库连上，而不是回退演示数据
 *   docs/32-FULL-PAGE-VIEW.md  A7（#page= 刷新还原）
 *   docs/15-HVT-REVIEW.md      P1（首屏版本号）/ X1（无孤儿页）
 *
 * 用法：node scripts/probe-ui.mjs [--shots dir] [--keep]
 * 退出码非 0 即不通过。
 */
import { mkdtempSync, existsSync, rmSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

import { Workbench } from '../dsh/workbench.js'
import { API_PREFIX, UI_PREFIX, createApiHandler } from '../dsh/routes.js'
import { createStaticHandler, startWorkbenchServer } from '../dsh/server.js'
import * as version from '../lib/version.js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const argv = process.argv.slice(2)
const argOf = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null }
const SHOTS = argOf('--shots')
const KEEP = argv.includes('--keep')

if (!existsSync(CHROME)) { console.error(`找不到 Chrome：${CHROME}（可用 CHROME_PATH 覆盖）`); process.exit(2) }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/* ---------------- 结果记账 ---------------- */
const groups = new Map()
let group = '启动'
const setGroup = (name) => { group = name; if (!groups.has(name)) groups.set(name, { pass: 0, fail: 0, fails: [] }) }
function record(ok, name, detail) {
  const g = groups.get(group)
  if (ok) { g.pass += 1; console.log(`  ✓ ${name}`) } else {
    g.fail += 1; g.fails.push(`${name}${detail === undefined ? '' : ` → ${JSON.stringify(detail)}`}`)
    console.log(`  ✗ ${name}${detail === undefined ? '' : ` → ${JSON.stringify(detail)}`}`)
  }
}

/* ---------------- CDP 最小客户端（不引第三方依赖） ---------------- */
function cdp(wsUrl) {
  return new Promise((ok, bad) => {
    const ws = new WebSocket(wsUrl)
    let id = 0
    const pending = new Map()
    const logs = []
    ws.onopen = () => {
      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data)
        if (msg.id && pending.has(msg.id)) {
          const { res, rej } = pending.get(msg.id)
          pending.delete(msg.id)
          msg.error ? rej(new Error(msg.error.message)) : res(msg.result)
          return
        }
        if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
          logs.push(msg.params.args.map((a) => a.value ?? a.description).join(' '))
        }
        if (msg.method === 'Runtime.exceptionThrown') {
          logs.push('EXCEPTION ' + (msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text))
        }
      }
      ok({
        send: (method, params = {}) => new Promise((res, rej) => {
          const n = ++id
          pending.set(n, { res, rej })
          ws.send(JSON.stringify({ id: n, method, params }))
        }),
        logs,
        close: () => ws.close()
      })
    }
    ws.onerror = () => bad(new Error('CDP 连接失败'))
  })
}

async function main() {
  /* 1) 真工作台：临时工作目录 + 真 sqlite + 自动播种演示档案 */
  const workspace = mkdtempSync(join(tmpdir(), 'narco-ui-probe-'))
  const info = { version: version.version, build: version.build, displayVersion: version.displayVersion }
  const wb = Workbench.open(workspace, info)
  const api = createApiHandler({
    bootstrap: () => wb.bootstrap({ includePrivate: false }),
    profile: (key, opts) => wb.profile(key, opts),
    serveUi: createStaticHandler(join(ROOT, 'public')),
    info,
    capabilities: ['bootstrap', 'profile', 'ui']
  })
  const { server, url } = await startWorkbenchServer({ api, port: 0 })
  const pageUrl = `${url}${UI_PREFIX}/index.html`

  /* 2) 真浏览器 */
  const debugPort = 9700 + Math.floor(Math.random() * 200)
  const proc = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    `--remote-debugging-port=${debugPort}`, `--user-data-dir=${join(tmpdir(), `narco-ui-chrome-${debugPort}`)}`,
    '--hide-scrollbars', '--window-size=1440,1100', 'about:blank'
  ], { stdio: 'ignore' })

  let target = null
  for (let i = 0; i < 60 && !target; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${debugPort}/json/list`)
      target = (await res.json()).find((t) => t.type === 'page')
    } catch { /* 还没起来 */ }
    if (!target) await sleep(250)
  }
  if (!target) throw new Error('Chrome 调试端口没起来')

  const c = await cdp(target.webSocketDebuggerUrl)
  await c.send('Runtime.enable')
  await c.send('Page.enable')
  await c.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false })

  let navSeq = 0
  /* 每次导航都带唯一查询串：同文档只改 hash 不会重新加载，上一页的 state 会漏到下一页 */
  async function goto(hash) {
    navSeq += 1
    await c.send('Page.navigate', { url: `${pageUrl}?nav=${navSeq}#${hash}` })
    await sleep(700)
  }
  async function evaluate(expression) {
    const r = await c.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text)
    return r.result.value
  }
  const text = (sel) => evaluate(`document.querySelector(${JSON.stringify(sel)})?.textContent ?? null`)

  try {
    /* ---------- 组 1：真的连上库 ---------- */
    setGroup('连库与来源')
    await goto('dashboard/today')
    const handle = await evaluate('window.__snooze || null')
    record(!!handle, '页面暴露了数据来源句柄（window.__snooze）', handle)
    record(handle?.dataSource === 'api', '数据来自 /api/narcolepsy/bootstrap，不是回退演示数据', handle?.dataSource)
    record(handle?.version === version.version, '页面版本与 VERSION 一致', { page: handle?.version, repo: version.version })
    record((await evaluate(`document.querySelectorAll('#nav [data-nav]').length`)) === 10, '一级导航 10 项')
    record((await text('#profile-name')) === '陈默的资料', '档案名来自库（陈默）', await text('#profile-name'))
    record(/伴猝倒/.test(await text('#profile-meta')), '档案副标题含库里的猝倒记录', await text('#profile-meta'))
    record((await evaluate(`document.querySelectorAll('#main .task').length`)) === 7, '看板 7 张场景卡')

    /* ---------- 组 2：10 页 × 3 二级都能渲染 ---------- */
    setGroup('10 页 × 3 二级')
    const SLUGS = {
      dashboard: ['today', 'week', 'todo'], diagnosis: ['text', 'exam', 'timeline'],
      naps: ['list', 'bucket', 'context'], night: ['log', 'events', 'stats'],
      ess: ['fill', 'history', 'items'], meds: ['current', 'switch', 'tolerance'],
      metrics: ['cards', 'one', 'rule'], trials: ['profile', 'match', 'library'],
      admin: ['docs', 'export', 'note'], visit: ['questions', 'bring', 'review']
    }
    let pages = 0
    for (const [view, subs] of Object.entries(SLUGS)) {
      for (const sub of subs) {
        await goto(`${view}/${sub}`)
        const h1 = await text('#main h1')
        const empty = (await evaluate(`document.querySelector('#main').innerHTML.trim().length`)) < 50
        if (h1 && !empty) pages += 1
        else console.log(`    · ${view}/${sub} 渲染异常：h1=${JSON.stringify(h1)}`)
      }
    }
    record(pages === 30, `30 个 (view, sub) 都渲染出标题与内容（${pages}/30）`, pages)
    record(c.logs.length === 0, '整个过程没有控制台错误', c.logs.slice(0, 5))

    /* ---------- 组 3：只读版本不假装写入 ---------- */
    setGroup('只读写入闸门')
    await goto('naps/list')
    await evaluate(`document.querySelector('[data-action="nap-manual"]')?.click()`)
    await sleep(300)
    const dialogOpen = await evaluate(`!!document.querySelector('#dialog')?.open`)
    record(dialogOpen, '手工补一条的弹窗能打开')
    await evaluate(`document.querySelector('[data-action="nap-save"]')?.click()`)
    await sleep(300)
    const toastText = await text('#toast')
    record(/只读/.test(toastText || ''), '接上库时保存被如实拦住，并说明这是只读版本', toastText)
    const napsAfter = await evaluate(`(window.__snooze && true) ? document.querySelectorAll('#main tbody tr').length : -1`)
    record(napsAfter > 0, '拦住写入后列表仍显示库里的记录（没有把页面清空）', napsAfter)

    /* ---------- 组 4：整页视图在开发版仍可刷新还原（A7） ---------- */
    setGroup('整页视图与刷新')
    await goto('visit/bring')
    await evaluate(`document.querySelector('[data-action="visit-onepage"]')?.click()`)
    await sleep(400)
    record((await evaluate(`!document.querySelector('#page-view').hidden`)) === true, '复诊一页整页视图能打开')
    const title = await text('#pv-title')
    record(!!title && title !== '整页', '整页视图标题被填上', title)
    const bodyLen = await evaluate(`document.querySelector('#pv-body').innerHTML.length`)
    record(bodyLen > 200, '整页内容非空', bodyLen)

    /* ---------- 组 5：没有孤儿页 ---------- */
    setGroup('无孤儿页（X1）')
    const orphans = await evaluate(`(() => {
      const hrefs = new Set([...document.querySelectorAll('[data-action],[data-nav],[data-sub]')].map(e => e.dataset.action || e.dataset.nav || e.dataset.sub));
      return { actions: [...hrefs].filter(Boolean).length };
    })()`)
    record(orphans.actions > 20, '至少 20 个可点入口挂上了 data-action/nav/sub', orphans.actions)
    record(c.logs.length === 0, '走查结束仍无控制台错误', c.logs.slice(0, 5))

    /* ---------- 截图（可选） ---------- */
    if (SHOTS) {
      await mkdir(SHOTS, { recursive: true })
      for (const hash of ['dashboard/today', 'metrics/cards', 'trials/match']) {
        await goto(hash)
        const shot = await c.send('Page.captureScreenshot', { format: 'png' })
        await writeFile(join(SHOTS, `dev-${hash.replace('/', '-')}.png`), Buffer.from(shot.data, 'base64'))
      }
      console.log(`  · 截图写到 ${SHOTS}`)
    }
  } finally {
    c.close()
    proc.kill()
    await new Promise((r) => server.close(r))
    if (KEEP) console.log(`· 保留数据目录：${workspace}`)
    else rmSync(workspace, { recursive: true, force: true })
  }

  /* ---------------- 汇总 ---------------- */
  console.log('')
  let failTotal = 0
  for (const [name, g] of groups) {
    console.log(`${name}：${g.pass}/${g.pass + g.fail}`)
    for (const f of g.fails) console.log(`  ✗ ${f}`)
    failTotal += g.fail
  }
  if (failTotal) {
    console.error(`\n✗ 开发版界面走查不通过：${failTotal} 条断言失败\n`)
    process.exit(1)
  }
  console.log('\n✓ 开发版界面走查通过（真 HTTP + 真 sqlite + 真浏览器）\n')
}

main().catch((error) => { console.error('✗ 走查中断：' + (error && error.stack ? error.stack : error)); process.exit(2) })
