/* 小睡宝 SnoozePal · HTTP 路由
 *
 * 交界守卫（ZERO-TO-DEV 2.1 的红线）：
 *   API_PREFIX = /api/narcolepsy，界面挂在 `${API_PREFIX}/ui`。
 *   页面里的 API_BASE 是**挂载前缀**（独立启动时空串，宿主里是 /api/narcolepsy），
 *   页面统一拼 `${API_BASE}/api/<资源>`。所以这里只禁**交界处重复的 /api/api**，
 *   绝不能用 `includes('/api')` 一刀切 —— 那会把合法的 /api/narcolepsy/ui 也拦掉。
 */
import { URL } from 'node:url'

export const API_PREFIX = '/api/narcolepsy'
export const UI_PREFIX = `${API_PREFIX}/ui`
export const MAX_BODY_BYTES = 1024 * 1024

/** 把错误翻成能看懂的状态码。只认具名 code，不猜。 */
export function errorBody(error) {
  const code = error?.code
  if (code === 'MIGRATE_FAILED' || code === 'OPEN_FAILED') {
    return { status: 503, body: { error: 'store_unavailable', message: error.message } }
  }
  if (code === 'NO_TOKEN' || code === 'UNAUTHORIZED') {
    return { status: 502, body: { error: 'upstream_auth', message: error.message } }
  }
  if (error?.status === 413) return { status: 413, body: { error: 'payload_too_large', message: '请求体过大' } }
  return { status: 500, body: { error: 'internal_error', message: error?.message ?? '未知错误' } }
}

function sendJson(res, status, payload) {
  const text = JSON.stringify(payload)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(text),
    'cache-control': 'no-store'
  })
  res.end(text)
}

async function readBody(req, limit = MAX_BODY_BYTES) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > limit) {
      const error = new Error('请求体过大')
      error.status = 413
      throw error
    }
    chunks.push(chunk)
  }
  if (!chunks.length) return null
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    const error = new Error('请求体不是合法 JSON')
    error.status = 400
    throw error
  }
}

/**
 * 造一个 API handler。
 * @param {object} opts
 * @param {() => object} opts.bootstrap 取 bootstrap 数据（每次请求重新读，不缓存旧快照）
 * @param {(key: string, opts: object) => object} opts.profile 取单个档案
 * @param {(req,res,urlPath: string) => void} opts.serveUi 静态资源
 * @param {{version: string, build: string, displayVersion: string}} opts.info
 * @param {string[]} opts.capabilities
 * @param {Error|null} opts.failure 启动期失败原因（有值就只回 health）
 */
export function createApiHandler({ bootstrap, profile, serveUi, info, capabilities = [], failure = null }) {
  return async function handler(req, res) {
    const url = new URL(req.url, 'http://127.0.0.1')
    const path = url.pathname

    /* UI 先匹配：/api/narcolepsy/ui 与 /api/narcolepsy/ui/... 都归静态层，
       不能走到下面的 JSON 路由去（否则打开页面会得到一串 JSON）。 */
    if (path === UI_PREFIX || path.startsWith(`${UI_PREFIX}/`)) {
      return serveUi(req, res, path.slice(UI_PREFIX.length) || '/')
    }

    if (path === `${API_PREFIX}/health`) {
      return sendJson(res, failure ? 503 : 200, {
        ok: !failure,
        version: info?.version ?? null,
        build: info?.build ?? null,
        displayVersion: info?.displayVersion ?? null,
        apiVersion: 'v1',
        ui: UI_PREFIX,
        capabilities,
        error: failure?.message ?? null
      })
    }

    if (failure) {
      return sendJson(res, 503, { error: 'bootstrap_unavailable', message: failure.message })
    }

    try {
      if (path === `${API_PREFIX}/bootstrap`) {
        if (req.method !== 'GET') return sendJson(res, 405, { error: 'method_not_allowed', message: '只支持 GET' })
        return sendJson(res, 200, bootstrap())
      }

      /* 私密内容：单独一个口子，必须显式带 private=1。默认 bootstrap 里没有正文。 */
      const pm = path.match(new RegExp(`^${API_PREFIX}/profile/([^/]+)$`))
      if (pm) {
        if (req.method !== 'GET') return sendJson(res, 405, { error: 'method_not_allowed', message: '只支持 GET' })
        const includePrivate = url.searchParams.get('private') === '1'
        return sendJson(res, 200, profile(decodeURIComponent(pm[1]), { includePrivate }))
      }

      return sendJson(res, 404, { error: 'not_found', message: `没有这个接口：${path}` })
    } catch (error) {
      const { status, body } = errorBody(error)
      return sendJson(res, status, body)
    }
  }
}

export { readBody, sendJson }
