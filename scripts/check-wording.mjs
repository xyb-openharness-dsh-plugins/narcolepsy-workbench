#!/usr/bin/env node
/**
 * 文案红线检查 —— 患者工作台不许越过"整理信息"这条线。
 *
 * 禁词（硬红）：建议治疗 / 可能复发 / 可以停药 / 无需就医 / 推荐方案 / 治愈率 / 生存率
 * 扩词（指南语境，出现在产品语句里即红）：应该 / 必须 / 建议复查 / 需要治疗 / 暂停用药 / 可以考虑加用
 * 本癌种专属红线：可以开车 / 不宜驾驶 / 建议加量 / 换药 / 确诊为 / 排除 / 符合诊断标准
 *
 * 豁免：自检清单、测试夹具、文档中"禁词表"本身——该行末尾写 `wording-allow`。
 * 扫描范围只包含**会渲染给用户**的代码与文案：public/ prototypes/ src/ dsh/ lib/。
 * docs/ 与 scripts/ 不扫（它们必须能写出这些词来讨论红线）。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'

const ROOTS = ['public', 'prototypes', 'src', 'dsh', 'lib']
const EXT = new Set(['.js', '.mjs', '.html', '.css', '.json'])

const HARD = ['建议治疗', '可能复发', '可以停药', '无需就医', '推荐方案', '治愈率', '生存率']
const GUIDE = ['建议复查', '需要治疗', '暂停用药', '可以考虑加用']
const LOCAL = ['可以开车', '不宜驾驶', '建议加量', '建议换药', '确诊为', '符合诊断标准']

const ALLOW = 'wording-allow'
const problems = []
let scanned = 0

function walk(dir) {
  let entries
  try { entries = readdirSync(dir) } catch { return }
  for (const entry of entries) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue
    const full = join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) walk(full)
    else if (EXT.has(extname(entry))) inspect(full)
  }
}

function inspect(file) {
  const lines = readFileSync(file, 'utf8').split('\n')
  scanned += 1
  lines.forEach((line, index) => {
    if (line.includes(ALLOW)) return
    for (const word of [...HARD, ...GUIDE, ...LOCAL]) {
      if (line.includes(word)) problems.push(`${file}:${index + 1} 命中「${word}」`)
    }
  })
}

for (const root of ROOTS) walk(root)

if (problems.length) {
  console.error(`✗ 文案红线：${problems.length} 处`)
  for (const problem of problems.slice(0, 40)) console.error('  - ' + problem)
  if (problems.length > 40) console.error(`  …还有 ${problems.length - 40} 处`)
  process.exit(1)
}
console.log(`✓ 文案红线通过（扫描 ${scanned} 个文件，禁词 ${HARD.length + GUIDE.length + LOCAL.length} 个）`)
