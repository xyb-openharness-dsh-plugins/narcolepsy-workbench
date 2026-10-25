#!/usr/bin/env node
/**
 * 版本号一致性校验（页面 / 包 / 构建期注入 / 原型快照）。
 *
 * 单一来源是仓库根的 `VERSION`。本脚本核对所有「会显示给人看」的位置，
 * 防止页面上的 vX.Y.Z 与实际版本漂移。
 *
 * 两类分别对待：
 *   1. **随 VERSION 走**：`public/index.html`（标题、ver-chip、页脚）、
 *      `public/app.js` 的 APP_INFO 默认值、`lib/version.js`、`package.json`；
 *   2. **冻结在快照版本**：`prototypes/v0.2/` 是 G2 签认过的视觉基准，
 *      **不跟着 VERSION 前移**（D37：改了它，"UI 以那个原型为准"这条依据就没了）。
 *
 * 用法：node scripts/check-version.mjs
 */
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(join(ROOT, p), 'utf8')
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/

/** 原型快照冻结的版本：G2 签认时那个号，不再移动。 */
const FROZEN_PROTOTYPE = '0.1.0'

const problems = []
const checks = []
const check = (name, actual, expected) => {
  const ok = actual === expected
  checks.push({ name, actual, expected, ok })
  if (!ok) problems.push(`${name}：期望 ${expected}，实际 ${actual ?? '（未找到）'}`)
}

if (!existsSync(join(ROOT, 'VERSION'))) {
  console.error('✗ 缺少 VERSION 文件（仓库根目录）')
  process.exit(1)
}
const version = read('VERSION').trim()
if (!SEMVER.test(version)) {
  console.error(`✗ VERSION 不是合法语义化版本：${version}`)
  process.exit(1)
}

/* 0) 原型快照：只核对"没被改号"，不与 VERSION 比 */
if (existsSync(join(ROOT, 'prototypes/v0.2/app.js'))) {
  check('prototypes/v0.2/app.js（快照冻结）',
    read('prototypes/v0.2/app.js').match(/version:\s*'([^']+)'/)?.[1], FROZEN_PROTOTYPE)
  const html = read('prototypes/v0.2/index.html')
  check('prototypes/v0.2/index.html <title>（快照冻结）',
    html.match(/<title>[^<]*?v(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)<\/title>/)?.[1], FROZEN_PROTOTYPE)
  const lits = [...new Set([...html.matchAll(/v(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)/g)].map((m) => m[1]))]
  check('prototypes/v0.2/index.html 版本字面量（去重）', lits.join(', '), FROZEN_PROTOTYPE)
}

/* 1) 开发版页面：标题 + 全部 vX.Y.Z 字面量 */
const indexPath = join(ROOT, 'public/index.html')
if (!existsSync(indexPath)) {
  console.error('✗ 缺少 public/index.html（开发版业务界面）')
  process.exit(1)
}
const html = read('public/index.html')
check('public/index.html <title>',
  html.match(/<title>[^<]*?v(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)<\/title>/)?.[1], version)
const publicLits = [...new Set([...html.matchAll(/v(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)/g)].map((m) => m[1]))]
check('public/index.html 版本字面量（去重）', publicLits.join(', '), version)

/* 2) 前端 APP_INFO 的默认值（数据没回来之前先显示它） */
const appJs = read('public/app.js')
check('public/app.js APP_INFO.version', appJs.match(/version:\s*'([^']+)'/)?.[1], version)

/* 3) 构建期注入的 lib/version.js（生成物） */
if (existsSync(join(ROOT, 'lib/version.js'))) {
  check('lib/version.js version', read('lib/version.js').match(/export const version = '([^']+)'/)?.[1], version)
} else {
  problems.push('缺少 lib/version.js（先跑 npm run build:version）')
}

/* 4) 包版本 */
check('package.json version', JSON.parse(read('package.json')).version, version)

const pad = (s, n) => String(s ?? '（未找到）').padEnd(n)
for (const c of checks) console.log(`${c.ok ? '✓' : '✗'} ${pad(c.name, 46)} ${c.actual ?? '—'}`)

if (problems.length) {
  console.error('\n版本号不一致：')
  for (const p of problems) console.error(`  - ${p}`)
  console.error('\n改版本：先改 VERSION → npm run build:version → 同步 public/index.html 与 public/app.js。')
  console.error('原型 prototypes/v0.2 冻结在签认时的版本，不随 VERSION 移动（D37）。\n')
  process.exit(1)
}
console.log(`\n✓ 版本一致：v${version}（核对 ${checks.length} 处；原型快照冻结在 v${FROZEN_PROTOTYPE}）`)
