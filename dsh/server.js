/* 小睡宝 SnoozePal · 静态资源 + 独立启动的 HTTP 服务
 *
 * 静态层有两个必须钉住的坑（LESSONS 原文）：
 *   ① **路径穿越**：`/../../etc/passwd` 必须被拦，解析后的真实路径必须仍在 public/ 里；
 *   ② **SPA 兜底会把要 JS 的 404 变成 HTML**：控制台只报 `Unexpected token '<'`，
 *      排查时根本想不到是静态层给了首页。所以兜底**只对"看起来像页面请求"的路径**生效：
 *      没有扩展名、或者扩展名是 .html 的，才回 index.html；要 .js/.css 的就是 404。
 */
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { dirname, extname, join, normalize, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'

export const PUBLIC_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'public')

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon'
}

/* 允许扩展名的白名单：不在表里的当 404，避免把源码（.map/.ts）泄露出去。 */
const isAssetRequest = (p) => {
  const ext = extname(p).toLowerCase()
  return ext !== '' && ext !== '.html'
}

/**
 * 工作目录合法性：拒绝绝对不该当"用户资料目录"的地方。
 * 这些不是洁癖 —— 把数据库写进 ~/Downloads 根，用户永远找不到自己的数据。
 */
export function workspaceProblems(target) {
  const problems = []
  if (typeof target !== 'string' || !target.trim()) return ['工作目录不能为空']
  if (!target.startsWith('/')) problems.push('必须是绝对路径')
  const t = resolve(target)
  const home = homedir()
  if (t === home) problems.push('不能直接用家目录，请选一个子目录')
  for (const name of ['Desktop', 'Downloads', 'Documents']) {
    if (t === join(home, name)) problems.push(`不能直接用 ~/${name}，请在里面建一个子目录`)
  }
  if (t === '/' || t === '/tmp' || t === '/var' || t === '/private/tmp') problems.push('不能用系统临时目录')
  return problems
}

/**
 * 安全拼接：解析后的路径必须仍在 root 里，**越界就返回 null**。
 *
 * 注意这里不做"把 `..` 剥掉再拼"那种净化：剥掉之后路径虽然落在 root 内，
 * 却会得到一个用户根本没请求的文件（`/../../etc/passwd` → `root/etc/passwd`），
 * 排查时看不出被拦过。直接判定越界、返回 null，由调用方回 403，语义才不含糊。
 */
export function safeJoin(root, urlPath) {
  let decoded
  try {
    decoded = decodeURIComponent(urlPath.split('?')[0])
  } catch {
    return null // 非法百分号编码
  }
  if (decoded.includes('\0')) return null
  /* 去掉前导斜杠后按相对路径解析：`resolve(root, '../../etc/passwd')` →
     `/etc/passwd`（落到 root 外，被下面的判断拦住）。
     不能先用 `normalize()` 再 join —— `normalize('/../../etc/passwd')` 会先在文件系统
     根处把 `..` 吃掉变成 `/etc/passwd`，再 join 就"落在 root 内"了，看起来像通过。 */
  const target = resolve(root, decoded.replace(/^[/\\]+/, ''))
  const rootWithSep = root.endsWith(sep) ? root : root + sep
  if (target !== root && !target.startsWith(rootWithSep)) return null
  return target
}

export function createStaticHandler(publicDir = PUBLIC_DIR) {
  return async function servePublic(req, res, urlPath = '/') {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { allow: 'GET, HEAD' })
      return res.end()
    }

    const clean = urlPath === '/' ? '/index.html' : urlPath
    const target = safeJoin(publicDir, clean)
    if (!target) {
      res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' })
      return res.end('禁止访问')
    }

    try {
      const info = await stat(target)
      if (info.isDirectory()) throw new Error('is dir')
      const body = await readFile(target)
      res.writeHead(200, {
        'content-type': MIME[extname(target).toLowerCase()] ?? 'application/octet-stream',
        'content-length': body.length,
        'cache-control': 'no-cache'
      })
      return res.end(req.method === 'HEAD' ? undefined : body)
    } catch {
      /* 不是资源请求（没扩展名 / .html）才回首页；要 .js 的 404 必须真的 404，
         否则浏览器拿到 HTML 当 JS 解析，控制台只说 Unexpected token '<'。 */
      if (isAssetRequest(clean)) {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
        return res.end('Not Found')
      }
      try {
        const body = await readFile(join(publicDir, 'index.html'))
        res.writeHead(200, { 'content-type': MIME['.html'], 'content-length': body.length })
        return res.end(req.method === 'HEAD' ? undefined : body)
      } catch {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
        return res.end('Not Found')
      }
    }
  }
}

/**
 * 独立启动（开发与验收用）。port=0 交给系统分配，测试里才不会有端口冲突。
 */
export async function startWorkbenchServer({ api, serveUi, port = 4173, host = '127.0.0.1' }) {
  const server = createServer((req, res) => {
    const path = req.url ?? '/'
    if (path.startsWith('/api/')) return void api(req, res)
    return void serveUi(req, res, path)
  })
  await new Promise((done, fail) => {
    server.once('error', fail)
    server.listen(port, host, done)
  })
  const address = server.address()
  return { server, port: address.port, host: address.address, url: `http://${host}:${address.port}` }
}
