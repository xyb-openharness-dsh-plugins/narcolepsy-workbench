#!/usr/bin/env node
/**
 * 生成 lib/version.js —— 版本号唯一来源是仓库根的 VERSION。
 *
 * 用法：
 *   node scripts/build-version.mjs           写入（内容没变不落盘）
 *   node scripts/build-version.mjs --check   只校验
 *
 * 陷阱（家族踩过）：lib/version.js 里的 commit 记的是**生成时**的 HEAD，一提交就落后一格。
 * 所以 --check 比对时忽略 commit 行，再用 `git merge-base --is-ancestor <recorded> HEAD`
 * 核这个 commit 真实存在且是祖先（防编造哈希）。git 成败一律看退出码，不看输出是否为空。
 *
 * 导出名与 breast/cervical 家族一致（小写 + APP_INFO），check-conformance 认的是 `export const version`。
 */
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const target = join(root, 'lib', 'version.js')
const checkOnly = process.argv.includes('--check')

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/
const CHANNELS = ['prototype', 'beta', 'stable']
const CHANNEL_LABELS = {
  prototype: '交互原型 · 未接入 DSH',
  beta: '测试版 · 数据仅在本机',
  stable: '正式版 · 数据仅在本机',
}

const version = readFileSync(join(root, 'VERSION'), 'utf8').trim()
if (!SEMVER.test(version)) {
  console.error(`✗ VERSION 不是合法语义化版本：${version}`)
  process.exit(1)
}

const channel = process.env.SNOOZEPAL_CHANNEL || 'beta'
if (!CHANNELS.includes(channel)) {
  console.error(`✗ SNOOZEPAL_CHANNEL 只能是 ${CHANNELS.join(' / ')}，收到：${channel}`)
  process.exit(1)
}

const git = (args) => {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' })
  return result.status === 0 ? result.stdout.trim() : null
}

const commit = git(['rev-parse', '--short', 'HEAD']) || 'local'
const build = new Date().toISOString().slice(0, 10)

const body = `// 本文件由 scripts/build-version.mjs 生成，请勿手改。
// 唯一来源：仓库根目录的 VERSION。改版本先改 VERSION，再跑 npm run build:version。
// 生成规则见 docs/VERSIONING.md §4。
export const version = '${version}'
export const build = '${build}'
export const channel = '${channel}'
export const commit = '${commit}'

export const displayVersion = \`v\${version}\`
export const channelLabel = '${CHANNEL_LABELS[channel]}'

export const APP_INFO = Object.freeze({
  version,
  displayVersion,
  build,
  channel,
  channelLabel,
  commit,
})
`

if (checkOnly) {
  if (!existsSync(target)) {
    console.error('✗ 缺少 lib/version.js（先跑 npm run build:version）')
    process.exit(1)
  }
  const current = readFileSync(target, 'utf8')
  const strip = (text) => text.replace(/^export const (commit|build) = .*$/gm, '')
  if (strip(current) !== strip(body)) {
    console.error('✗ lib/version.js 与 VERSION 不一致（忽略 commit/build 行后仍不同）')
    process.exit(1)
  }
  const recorded = current.match(/^export const commit = '(.*)'$/m)?.[1]
  if (recorded && recorded !== 'local') {
    // --is-ancestor 成功时**没有输出**：必须用退出码判断，不能判字符串是否为空。
    const result = spawnSync('git', ['merge-base', '--is-ancestor', recorded, 'HEAD'], { cwd: root })
    if (result.status !== 0) {
      console.error(`✗ lib/version.js 记录的 commit ${recorded} 不存在或不是 HEAD 的祖先`)
      process.exit(1)
    }
  }
  console.log(`✓ 版本一致：v${version} (${channel})`)
  process.exit(0)
}

const previous = existsSync(target) ? readFileSync(target, 'utf8') : ''
if (previous === body) {
  console.log(`· lib/version.js 未变化（v${version}）`)
  process.exit(0)
}
writeFileSync(target, body)
console.log(`✓ 已写入 lib/version.js（v${version} · ${channel} · ${commit}）`)
