#!/usr/bin/env node
/**
 * README 截图资产校验（docs/33-README-SCREENSHOTS.md §6，可断言部分）
 *
 * 断言：
 *   1. README 里每个 `![](...)` 图片路径都存在（破图即返工）
 *   2. 每张图 < 2MB
 *   3. 引用的截图数量 ≥ 4
 *   4. 截图文件名含版本号，且与 VERSION 一致
 *   5. docs/screenshots/ 非空
 *   6. 至少一张"展开态"（33 号 §2 第 5 条：折叠/展开各一张）
 *
 * 退出码非 0 即不通过。用法：node scripts/check-readme-assets.mjs [项目根]
 */
import { readFile, stat, readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(process.argv[2] || join(dirname(fileURLToPath(import.meta.url)), '..'))
const SHOT_DIR = 'docs/screenshots'
const MAX_BYTES = 2 * 1024 * 1024

const errors = []
const warns = []

const version = (await readFile(join(ROOT, 'VERSION'), 'utf8')).trim()
const readmePath = join(ROOT, 'README.md')
if (!existsSync(readmePath)) {
  console.error('✗ 找不到 README.md')
  process.exit(1)
}
const readme = await readFile(readmePath, 'utf8')

/* 1+2. 逐张验证存在与体积 */
const refs = [...readme.matchAll(/!\[([^\]]*)\]\(([^)\s]+)\)/g)].map((m) => ({ alt: m[1], href: m[2] }))
const seen = new Set()
for (const { alt, href } of refs) {
  if (/^https?:/i.test(href)) { warns.push(`外链图片未本地校验：${href}`); continue }
  const abs = join(ROOT, href)
  if (!existsSync(abs)) { errors.push(`破图：${href}（alt="${alt}"）`); continue }
  const { size } = await stat(abs)
  if (size > MAX_BYTES) errors.push(`图片过大：${href} ${(size / 1048576).toFixed(2)}MB > 2MB`)
  seen.add(href)
}

/* 3. 数量 */
if (seen.size < 4) errors.push(`README 引用截图 ${seen.size} 张 < 4 张（33 号 §2）`)

/* 4. 文件名含版本，且与 VERSION 一致 */
for (const href of seen) {
  const base = href.split('/').pop() || ''
  if (!base.includes(`-${version}.`)) {
    if (/readme-.*-(\d+\.\d+\.\d+)\./.test(base)) errors.push(`截图版本与 VERSION 不一致：${base}（VERSION=${version}）`)
    else errors.push(`截图文件名不含版本号：${base}（应为 readme-<功能>-${version}.png）`)
  }
}

/* 5. 目录非空 */
const dirAbs = join(ROOT, SHOT_DIR)
if (!existsSync(dirAbs)) errors.push(`缺少目录 ${SHOT_DIR}/`)
else {
  const files = (await readdir(dirAbs)).filter((f) => /\.(png|jpe?g|webp)$/i.test(f))
  if (files.length === 0) errors.push(`${SHOT_DIR}/ 为空`)
  /* 6. 展开态 */
  if (!seen.size || ![...seen].some((h) => /expand|open|expanded/.test(h))) {
    errors.push('缺少"展开态"截图（33 号 §2 第 5 条要求折叠/展开各一张）')
  }
}

const ok = errors.length === 0
console.log(`${ok ? '✓' : '✗'} README 截图资产：引用 ${seen.size} 张 · 目录 ${existsSync(dirAbs) ? (await readdir(dirAbs)).filter((f) => /\.(png|jpe?g|webp)$/i.test(f)).length : 0} 个文件 · VERSION ${version}`)
for (const w of warns) console.log(`  ! ${w}`)
for (const e of errors) console.log(`  ✗ ${e}`)
if (!ok) process.exit(1)
