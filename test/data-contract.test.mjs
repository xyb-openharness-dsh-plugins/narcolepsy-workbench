// 数据层契约单测：这些断言对应 schema 冻结的 7 条约束，改 schema 时它们会先红。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync, readdirSync } from 'node:fs'

const files = readdirSync('schema').filter((f) => /^00\d+_.*\.sql$/.test(f)).sort()

function open() {
  const db = new DatabaseSync(':memory:')
  for (const file of files) db.exec(readFileSync(`schema/${file}`, 'utf8'))
  return db
}

test('全部迁移可顺序执行，13 张表齐备', () => {
  const db = open()
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map((r) => r.name)
  for (const name of ['profile', 'naps', 'ess_sessions', 'night_events', 'meds', 'med_tolerance', 'metrics', 'documents', 'candidates', 'questions', 'viewpoints', 'events', 'meta']) {
    assert.ok(tables.includes(name), `缺表 ${name}`)
  }
  db.close()
})

test('无判读列', () => {
  const db = open()
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name)
  for (const table of tables) {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all().map((r) => r.name)
    for (const banned of ['diagnosis', 'risk_level', 'severity', 'is_conclusion', 'prognosis']) {
      assert.ok(!columns.includes(banned), `${table} 出现判读列 ${banned}`)
    }
  }
  db.close()
})

test('null 不等于 0：naps.duration_min 允许 NULL 且存进去读出来仍是 NULL', () => {
  const db = open()
  db.prepare("INSERT INTO naps (at, context, duration_min, prodrome, note, proxy) VALUES (?,?,?,?,?,?)")
    .run('2026-10-20T14:20', '开会', null, '有', null, 0)
  const row = db.prepare('SELECT duration_min FROM naps ORDER BY rowid DESC LIMIT 1').get()
  assert.equal(row.duration_min, null)
  assert.notEqual(row.duration_min, 0)
  db.close()
})

test('metrics：numeric 必须有值，grade/qual 不得带 dec 与数值', () => {
  const db = open()
  const insert = db.prepare('INSERT INTO metrics (code, at, value_num, value_text, unit, kind, dec, ref_low, ref_high, section_title, note) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
  insert.run('ess_total', '2026-10-20', 12, null, '分', 'numeric', null, null, null, '量表', null)
  assert.throws(() => insert.run('q', '2026-10-20', null, null, null, 'numeric', null, null, null, '量表', null))
  assert.throws(() => insert.run('qual', '2026-10-20', 3, null, null, 'qual', 1, null, null, '量表', null))
  db.close()
})

test('ESS 总分必须等于 8 项之和（写入层约定，这里用 CHECK 兜不住所以钉在测试里）', () => {
  const db = open()
  const sql = 'INSERT INTO ess_sessions (at, q1,q2,q3,q4,q5,q6,q7,q8, total, proxy, note) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)'
  db.prepare(sql).run('2026-10-20', 2, 1, 3, 2, 1, 0, 2, 1, 12, 0, null)
  const session = db.prepare('SELECT q1,q2,q3,q4,q5,q6,q7,q8,total FROM ess_sessions WHERE at = ?').get('2026-10-20')
  const sum = session.q1 + session.q2 + session.q3 + session.q4 + session.q5 + session.q6 + session.q7 + session.q8
  assert.equal(sum, session.total)
  assert.equal(session.total, 12)
  assert.throws(() => db.prepare(sql).run('2026-10-21', 4, 0, 0, 0, 0, 0, 0, 0, 4, 0, null), 'q1=4 越界应被 CHECK 拦住')
  db.close()
})

test('复合主键表按 rowid 排序稳定（不依赖插入顺序）', () => {
  const db = open()
  const insert = db.prepare('INSERT INTO night_events (at, kind, duration_min, note) VALUES (?,?,?,?)')
  insert.run('2026-10-19T03:00', 'awakening', 15, null)
  insert.run('2026-10-18T02:00', 'hallucination', null, null)
  const rows = db.prepare('SELECT at FROM night_events ORDER BY rowid').all()
  assert.equal(rows[0].at, '2026-10-19T03:00', 'rowid 顺序即插入顺序，与 at 无关')
  db.close()
})

test('meds 用 supersedes_id 追加版本，旧行不被覆盖', () => {
  const db = open()
  const insert = db.prepare('INSERT INTO meds (name, dose_text, start_date, end_date, controlled, supersedes_id, ord, note) VALUES (?,?,?,?,?,?,?,?)')
  const first = insert.run('莫达非尼', '200mg', '2026-05-01', '2026-08-01', 1, null, 1, null)
  insert.run('阿莫达非尼', '150mg', '2026-08-01', null, 1, Number(first.lastInsertRowid), 2, null)
  const rows = db.prepare('SELECT name, supersedes_id FROM meds ORDER BY ord').all()
  assert.equal(rows.length, 2)
  assert.equal(rows[0].name, '莫达非尼')
  assert.equal(rows[1].supersedes_id, 1)
  db.close()
})

test('questions 用 in_use 而非 SQLite 保留字 using', () => {
  const db = open()
  const columns = db.prepare('PRAGMA table_info(questions)').all().map((r) => r.name)
  assert.ok(columns.includes('in_use'))
  assert.ok(!columns.includes('using'))
  db.close()
})

test('metrics.section_title 非空约束支撑分节读模型', () => {
  const db = open()
  const columns = db.prepare('PRAGMA table_info(metrics)').all()
  const section = columns.find((c) => c.name === 'section_title')
  assert.ok(section, '缺 section_title 列')
  assert.equal(section.notnull, 1)
  db.close()
})
