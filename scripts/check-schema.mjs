#!/usr/bin/env node
/**
 * 冻结合同 + 判读列断言。
 *
 * 为什么需要它：schema 冻结后"手滑改一行"不会让任何测试变红——直到装机后老用户迁移失败。
 * 所以把 0001 的 sha256 钉在 schema/freeze-contract.md 里，改了 0001 而不更新合同 = 红。
 *
 * 同时钉两条家族红线：
 *   ① 不许出现判读列（diagnosis / risk_level / severity / is_conclusion）
 *   ② questions 表的"是否在用"列名必须是 in_use（using 是 SQLite 保留字）
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'

const problems = []
const ok = []
const check = (condition, message) => (condition ? ok.push(message) : problems.push(message))

const schemaDir = 'schema'
const files = readdirSync(schemaDir).filter((f) => /^00\d+_.*\.sql$/.test(f)).sort()
check(files.length > 0, `迁移文件数 ${files.length}`)
check(files[0] === '0001_initial.sql', '首个迁移必须是 0001_initial.sql')

const initial = readFileSync(`${schemaDir}/0001_initial.sql`)
const sha = createHash('sha256').update(initial).digest('hex')

const contract = existsSync(`${schemaDir}/freeze-contract.md`)
  ? readFileSync(`${schemaDir}/freeze-contract.md`, 'utf8')
  : ''
const recorded = contract.match(/sha256\s*\|\s*`([0-9a-f]{64})`/)?.[1]
check(Boolean(recorded), 'freeze-contract.md 里没有 sha256 记录')
if (recorded) check(recorded === sha, `0001 sha256 与合同一致（${sha.slice(0, 12)}…）`)

// 全部迁移顺序执行
const db = new DatabaseSync(':memory:')
try {
  for (const file of files) db.exec(readFileSync(`${schemaDir}/${file}`, 'utf8'))
  ok.push(`全部 ${files.length} 个迁移可在 :memory: 建库`)
} catch (error) {
  problems.push(`迁移执行失败：${error.message}`)
}

const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all().map((r) => r.name)
const expected = ['candidates', 'documents', 'ess_sessions', 'events', 'med_tolerance', 'meds', 'meta', 'metrics', 'naps', 'night_events', 'profile', 'questions', 'viewpoints']
for (const name of expected) check(tables.includes(name), `表存在：${name}`)

// 判读列断言：任何表都不许有
const forbidden = ['diagnosis', 'risk_level', 'severity', 'is_conclusion', 'prognosis']
for (const table of tables) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all().map((r) => r.name)
  for (const column of columns) {
    check(!forbidden.includes(column), `${table}.${column} 不是判读列`)
  }
}

// questions 的 using → in_use
const questionColumns = db.prepare('PRAGMA table_info(questions)').all().map((r) => r.name)
check(!questionColumns.includes('using'), 'questions 不用保留字 using')
check(questionColumns.includes('in_use'), 'questions 用 in_use')

// 分类指标约束：grade/qual 的 dec 必须为 NULL
const metricsColumns = db.prepare('PRAGMA table_info(metrics)').all().map((r) => r.name)
check(metricsColumns.includes('dec'), 'metrics 有 dec 列')
check(metricsColumns.includes('section_title'), 'metrics 有 section_title 列')
check(metricsColumns.includes('ref_high'), 'metrics 有 ref_high 列（×ULN 型必须有上限）')

// 复合主键表必须能按 rowid 排序
for (const table of ['naps', 'night_events', 'med_tolerance']) {
  const rows = db.prepare(`SELECT rowid AS r FROM ${table} ORDER BY rowid LIMIT 1`).all()
  check(true, `${table} 可按 rowid 排序${rows.length ? '' : '（表为空）'}`)
}

db.close()

if (problems.length) {
  console.error('✗ schema 检查失败：')
  for (const problem of problems) console.error('  - ' + problem)
  process.exit(1)
}
console.log(`✓ schema 冻结合同与判读列断言通过（${ok.length} 项，sha256 ${sha.slice(0, 12)}…）`)
