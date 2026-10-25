/* 小睡宝 SnoozePal · 宿主接线（DSH Web 插件入口）
 *
 * 装机四要素里最容易漏的两条，这里都钉住了：
 *   ① `config.root` 来自 cordis.patch.yml 的 `dshHomePath('narcolepsy-workbench')`。
 *      没它 → 数据库落到 :memory:，用户关掉页面数据就没了，而且不报错。
 *   ② `ctx.webServer.register` 只在 Desktop/Web 宿主里才有；纯 node 环境要明确报错，
 *      不能静默什么都不做（宿主表现为"插件装了但界面空白"）。
 *
 * 鉴权：所有请求先过 `ctx.connection.requestRejection()`。它返回 undefined 表示放行，
 * 返回数字表示该拒。**不能自己判断 cookie/session** —— 那是宿主的知识。
 */
import Schema from '@deepseek-ai/schemastery'
import { Workbench } from './workbench.js'
import { API_PREFIX, UI_PREFIX, createApiHandler } from './routes.js'
import { createStaticHandler } from './server.js'
import * as version from '../lib/version.js'

export const name = 'narcolepsy-main'
export const inject = ['webServer', 'connection']
export const Config = Schema.object({
  root: Schema.string()
})

function sendJson(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(body))
}

export function apply(ctx, config = {}) {
  if (!ctx.webServer?.register) {
    throw new Error('Desktop webServer.register is unavailable：本插件只能在 DSH Desktop/Web 宿主里运行')
  }

  /* 启动期失败不让插件注册直接崩掉（否则宿主报一大段栈、用户只看到白屏），
     而是记下来由 UI 显示一条能看懂的横幅 —— 裸 throw 白屏是家族明确禁止的。 */
  let failure = null
  let workbench = null
  try {
    workbench = Workbench.open(config.root ?? null, {
      version: version.version,
      build: version.build,
      displayVersion: version.displayVersion
    })
  } catch (error) {
    failure = error
    ctx.logger?.error?.('narcolepsy: 打开工作台失败', error)
  }

  const info = {
    version: version.version,
    build: version.build,
    displayVersion: version.displayVersion
  }
  const capabilities = failure ? [] : ['bootstrap', 'profile', 'ui']

  const handler = createApiHandler({
    info,
    capabilities,
    failure,
    serveUi: createStaticHandler(),
    bootstrap: () => workbench.bootstrap(),
    profile: (key, opts) => workbench.profile(key, opts)
  })

  /* 鉴权交界：capability 缺失与"请求被拒"是两件事，状态码不同（503 vs rejection）。 */
  const guarded = async (req, res) => {
    if (typeof ctx.connection?.requestRejection !== 'function') {
      return sendJson(res, 503, { error: 'connection authentication capability unavailable' })
    }
    const rejection = ctx.connection.requestRejection(req)
    if (rejection !== undefined) return sendJson(res, rejection, { error: 'Authentication required' })
    return handler(req, res)
  }

  ctx.effect(() => {
    const dispose = ctx.webServer.register({
      kind: 'prefix',
      path: API_PREFIX,
      handler: (req, res) => void guarded(req, res)
    })
    return () => {
      dispose?.()
      try { workbench?.close() } catch { /* 关闭失败不该掩盖关停流程 */ }
    }
  }, 'narcolepsy ui + api')
}

export { API_PREFIX, UI_PREFIX }
