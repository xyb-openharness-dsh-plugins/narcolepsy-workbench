/* 开发与验收用的独立启动器
 *
 * 用途：不装进 DSH 宿主也能把整条链路跑起来（`npm start -- --workspace <目录>`）。
 * 这正是 ZERO-TO-DEV 2.3 里那条"装机前必须先在干净目录跑一轮无头实测"的工具。
 *
 * 为什么 workspace 一定要走校验：把数据库写进 ~/Downloads 根或 /tmp，
 * 用户永远找不到自己的数据，而且下次换个目录打开就是"空库"。
 */
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { Workbench } from '../dsh/workbench.js'
import { API_PREFIX, UI_PREFIX, createApiHandler } from '../dsh/routes.js'
import { createStaticHandler, startWorkbenchServer, workspaceProblems } from '../dsh/server.js'
import * as version from '../lib/version.js'

function argValue(name) {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

const workspaceArg = argValue('workspace')
const port = Number(argValue('port') ?? 4173)

let workspace = workspaceArg
if (workspace) {
  const problems = workspaceProblems(workspace)
  if (problems.length) {
    console.error(`✗ 工作目录不合格：${workspace}`)
    for (const p of problems) console.error(`  · ${p}`)
    process.exit(1)
  }
}

/* 没指定目录就开一个家目录下的临时工作区（不用 os.tmpdir()：
   macOS 的 /var/folders 会被 workspaceProblems 当成系统临时目录拒掉，也不好找）。 */
if (!workspace) {
  workspace = mkdtempSync(join(homedir(), '.xyb-narcolepsy-dev-'))
  console.log(`· 未指定 --workspace，本次用临时目录：${workspace}`)
}

const info = { version: version.version, build: version.build, displayVersion: version.displayVersion }

let workbench
try {
  workbench = Workbench.open(workspace, info)
} catch (error) {
  console.error(`✗ 打开工作台失败：${error.code ?? ''} ${error.message}`)
  process.exit(1)
}

const seeded = workbench.seeded
console.log(seeded.seeded
  ? `· 已播种演示档案：${seeded.profiles} 个`
  : '· 库里已有档案，跳过播种（不覆盖用户数据）')

const api = createApiHandler({
  info,
  capabilities: ['bootstrap', 'profile', 'ui'],
  serveUi: createStaticHandler(),
  bootstrap: () => workbench.bootstrap(),
  profile: (key, opts) => workbench.profile(key, opts)
})
const serveUi = createStaticHandler()

const { port: actualPort, url } = await startWorkbenchServer({ api, serveUi, port })

console.log('')
console.log(`  小睡宝工作台已启动   ${url}${UI_PREFIX}`)
console.log(`  API 健康检查        ${url}${API_PREFIX}/health`)
console.log(`  数据目录            ${workspace}`)
console.log('')
console.log('  按 Ctrl+C 停止')

const shutdown = () => {
  try { workbench.close() } catch { /* 关库失败不该卡住退出 */ }
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
