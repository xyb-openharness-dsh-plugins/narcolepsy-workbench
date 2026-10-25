/* server + routes 测试
 *
 * 这一套测的是"HTTP 这一层会不会骗人"。三个真实踩过的点：
 *   ① 静态兜底把要 JS 的 404 变成 HTML（控制台只说 Unexpected token '<'）；
 *   ② 路径穿越（/../../etc/passwd）；
 *   ③ 交界处重复 /api/api（守卫写宽了会把合法路径拦掉）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { pathToFileURL } from 'node:url'

const ROOT = new URL('..', import.meta.url).pathname
const routes = await import(pathToFileURL(join(ROOT, 'dsh/routes.js')).href)
const serverMod = await import(pathToFileURL(join(ROOT, 'dsh/server.js')).href)
const { Workbench } = await import(pathToFileURL(join(ROOT, 'dsh/workbench.js')).href)

const { API_PREFIX, UI_PREFIX, createApiHandler, errorBody } = routes
const { createStaticHandler, workspaceProblems, safeJoin, startWorkbenchServer } = serverMod

/* 起一个真服务，测真实的 HTTP 行为（不 mock req/res —— mock 掉的正是要看的那一层）。 */
async function withServer(fn) {
  const wb = Workbench.open(null, { version: '0.1.0', build: 'test', displayVersion: 'v0.1.0' })
  const api = createApiHandler({
    info: { version: '0.1.0', build: 'test', displayVersion: 'v0.1.0' },
    capabilities: ['bootstrap', 'profile', 'ui'],
    serveUi: createStaticHandler(),
    bootstrap: () => wb.bootstrap(),
    profile: (key, opts) => wb.profile(key, opts)
  })
  const serveUi = createStaticHandler()
  const { server, url } = await startWorkbenchServer({
    api,
    serveUi,
    port: 0
  })
  try {
    await fn(url)
  } finally {
    await new Promise((r) => server.close(r))
    wb.close()
  }
}

test('health：能看到版本号与能力清单', async () => {
  await withServer(async (url) => {
    const res = await fetch(`${url}${API_PREFIX}/health`)
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.equal(body.ok, true)
    assert.equal(body.version, '0.1.0')
    assert.equal(body.apiVersion, 'v1')
    assert.equal(body.ui, UI_PREFIX)
    assert.ok(body.capabilities.includes('bootstrap'))
  })
})

test('bootstrap：两档案，且私密内容默认一个字节都不下发', async () => {
  await withServer(async (url) => {
    const res = await fetch(`${url}${API_PREFIX}/bootstrap`)
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.deepEqual(Object.keys(body.profiles).sort(), ['A', 'B'])
    assert.equal(body.profiles.A.naps.length, 74)
    assert.equal(body.profiles.A.viewpoints.length, 0, '默认不给私密正文')
    assert.equal(body.profiles.A.viewpointsMeta.privateCount, 2, '但要能说出有几条')
    assert.equal(Object.keys(body.tracks).length, 5)
  })
})

test('profile?private=1：本人确认后才拿到私密正文', async () => {
  await withServer(async (url) => {
    const hidden = await (await fetch(`${url}${API_PREFIX}/profile/A`)).json()
    assert.equal(hidden.viewpoints.length, 0)

    const shown = await (await fetch(`${url}${API_PREFIX}/profile/A?private=1`)).json()
    assert.equal(shown.viewpoints.length, 2)
    assert.ok(shown.viewpoints.every((v) => v.private === true))
  })
})

test('未知接口回 JSON 404，不回 HTML', async () => {
  await withServer(async (url) => {
    const res = await fetch(`${url}${API_PREFIX}/nope`)
    assert.equal(res.status, 404)
    assert.match(res.headers.get('content-type'), /application\/json/)
    const body = await res.json()
    assert.equal(body.error, 'not_found')
  })
})

test('UI 前缀不会被 JSON 路由截胡（交界处不许一刀切禁 /api）', async () => {
  await withServer(async (url) => {
    /* 独立启动时 public/index.html 可能还不存在，但响应必须是 UI 层的
       （HTML 或 404 文本），不能是 JSON —— 关键区别在 content-type。 */
    const res = await fetch(`${url}${UI_PREFIX}`)
    assert.doesNotMatch(res.headers.get('content-type') ?? '', /application\/json/,
      'UI 路径被当成 API 处理了')
  })
})

test('静态：路径穿越被拦（403/404，绝不返回 /etc/passwd）', async () => {
  await withServer(async (url) => {
    /* 必须用**编码过的** `../`：`fetch` 会先按 URL 标准把裸 `..` 归一化掉，
       请求根本没到服务端，测的就不是服务器那道防线了（这条曾经假绿过一次）。
       `%2e%2e%2f` 会被服务端 decodeURIComponent 还原成 `../`，才是真的攻击面。 */
    for (const path of [
      `/api/narcolepsy/ui/%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2fetc/passwd`,
      `/api/narcolepsy/ui/..%2f..%2f..%2f..%2fetc/passwd`,
      /* 裸 `..` 一定也要编码：`fetch` 会按 URL 标准先把 `/public/../../../../etc/passwd`
         归一化成 `/etc/passwd` 再发出去，服务端根本看不到 `..`。那种情况落在下一条用例
         （"归一化后的普通路径回 SPA 外壳"），不是穿越。这条曾经假绿过两次：
         一次是 fetch 归一化，一次是 public/index.html 还不存在时兜底 404。 */
      `/public/%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2fetc/passwd`
    ]) {
      const res = await fetch(`${url}${path}`)
      const text = await res.text()
      assert.ok(!text.includes('root:'), `把系统文件读出来了：${path}`)
      assert.ok([403, 404].includes(res.status), `${path} 实际 ${res.status}（穿越请求必须被拒）`)
    }
  })
})

test('静态：归一化后的普通路径回 SPA 外壳（不是穿越，是正常 404 兜底）', async () => {
  await withServer(async (url) => {
    /* `/etc/passwd` 作为普通路径并无 `..`，服务端不该 403：它落在 public 里找不到，
       按 SPA 规则回 index.html。这里断言"回的是外壳"，不是"回了系统文件"。 */
    const res = await fetch(`${url}/etc/passwd`)
    const text = await res.text()
    assert.equal(res.status, 200)
    assert.ok(!text.includes('root:'), '把系统文件读出来了')
    assert.match(res.headers.get('content-type') ?? '', /text\/html/)
  })
})

test('safeJoin：解析后必须仍在 root 内', () => {
  const root = '/tmp/public-root'
  assert.equal(safeJoin(root, '/index.html'), '/tmp/public-root/index.html')
  assert.equal(safeJoin(root, '/../../etc/passwd'), null)
  assert.equal(safeJoin(root, '/a/../../../etc/passwd'), null)
})

test('静态：要 .js 的 404 必须真的 404，不能回 index.html', async () => {
  const dir = mkdtempSync(join(homedir(), '.xyb-static-'))
  try {
    writeFileSync(join(dir, 'index.html'), '<!doctype html><title>首页</title>')
    writeFileSync(join(dir, 'app.js'), 'console.log(1)')
    const serve = createStaticHandler(dir)

    /* 用一个极简 req/res 收集结果 */
    const call = async (urlPath) => {
      const chunks = []
      const res = {
        statusCode: 0,
        headers: {},
        writeHead(code, headers) { this.statusCode = code; this.headers = headers ?? {} },
        end(body) { if (body) chunks.push(String(body)) }
      }
      await serve({ method: 'GET' }, res, urlPath)
      return { status: res.statusCode, type: res.headers['content-type'], body: chunks.join('') }
    }

    const missingJs = await call('/nope.js')
    assert.equal(missingJs.status, 404, '缺 .js 必须是 404')
    assert.doesNotMatch(missingJs.type ?? '', /text\/html/, '不能把 HTML 当 JS 回')

    const missingCss = await call('/nope.css')
    assert.equal(missingCss.status, 404)

    /* 页面类请求仍然回首页（前端有 hash 路由，刷新二级页要能打开） */
    const page = await call('/some/page')
    assert.equal(page.status, 200)
    assert.match(page.type ?? '', /text\/html/)

    const realJs = await call('/app.js')
    assert.equal(realJs.status, 200)
    assert.match(realJs.type ?? '', /javascript/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('workspace：家目录、桌面、下载、/tmp 一律拒', () => {
  assert.ok(workspaceProblems('').length > 0)
  assert.ok(workspaceProblems(homedir()).length > 0, '不能直接用家目录')
  assert.ok(workspaceProblems(join(homedir(), 'Downloads')).length > 0, '不能直接用 ~/Downloads')
  assert.ok(workspaceProblems(join(homedir(), 'Desktop')).length > 0)
  assert.ok(workspaceProblems('/tmp').length > 0)
  assert.deepEqual(workspaceProblems(join(homedir(), 'Documents', 'narco-wb')), [], '子目录可以')
})

test('errorBody：库错误回 503，不是 500', () => {
  assert.equal(errorBody({ code: 'MIGRATE_FAILED', message: 'x' }).status, 503)
  assert.equal(errorBody({ code: 'OPEN_FAILED', message: 'x' }).status, 503)
  assert.equal(errorBody({ status: 413 }).status, 413)
  assert.equal(errorBody(new Error('随便什么错')).status, 500)
})
