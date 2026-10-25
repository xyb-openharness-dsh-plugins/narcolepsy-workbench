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
  db.prepare("INSERT INTO naps (profile_key, at, context, duration_min, prodrome, note, proxy) VALUES (?,?,?,?,?,?,?)")
    .run('A', '2026-10-20T14:20', '开会', null, '有', null, 0)
  const row = db.prepare('SELECT duration_min FROM naps ORDER BY rowid DESC LIMIT 1').get()
  assert.equal(row.duration_min, null)
  assert.notEqual(row.duration_min, 0)
  db.close()
})

test('metrics：numeric 必须有值，grade/qual 不得带 dec 与数值', () => {
  const db = open()
  const insert = db.prepare('INSERT INTO metrics (profile_key, code, at, value_num, value_text, unit, kind, dec, ref_low, ref_high, section_title, note) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
  insert.run('A', 'ess_total', '2026-10-20', 12, null, '分', 'numeric', null, null, null, '量表', null)
  assert.throws(() => insert.run('A', 'q', '2026-10-20', null, null, null, 'numeric', null, null, null, '量表', null))
  assert.throws(() => insert.run('A', 'qual', '2026-10-20', 3, null, null, 'qual', 1, null, null, '量表', null))
  db.close()
})

test('ESS 总分必须等于 8 项之和（写入层约定，这里用 CHECK 兜不住所以钉在测试里）', () => {
  const db = open()
  const sql = 'INSERT INTO ess_sessions (profile_key, at, q1,q2,q3,q4,q5,q6,q7,q8, total, proxy, note) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)'
  db.prepare(sql).run('A', '2026-10-20', 2, 1, 3, 2, 1, 0, 2, 1, 12, 0, null)
  const session = db.prepare('SELECT q1,q2,q3,q4,q5,q6,q7,q8,total FROM ess_sessions WHERE at = ?').get('2026-10-20')
  const sum = session.q1 + session.q2 + session.q3 + session.q4 + session.q5 + session.q6 + session.q7 + session.q8
  assert.equal(sum, session.total)
  assert.equal(session.total, 12)
  assert.throws(() => db.prepare(sql).run('A', '2026-10-21', 4, 0, 0, 0, 0, 0, 0, 0, 4, 0, null), 'q1=4 越界应被 CHECK 拦住')
  db.close()
})

test('复合主键表按 rowid 排序稳定（不依赖插入顺序）', () => {
  const db = open()
  const insert = db.prepare('INSERT INTO night_events (profile_key, at, kind, duration_min, note) VALUES (?,?,?,?,?)')
  insert.run('A', '2026-10-19T03:00', 'awakening', 15, null)
  insert.run('A', '2026-10-18T02:00', 'hallucination', null, null)
  const rows = db.prepare('SELECT at FROM night_events ORDER BY rowid').all()
  assert.equal(rows[0].at, '2026-10-19T03:00', 'rowid 顺序即插入顺序，与 at 无关')
  db.close()
})

test('meds 用 supersedes_id 追加版本，旧行不被覆盖', () => {
  const db = open()
  const insert = db.prepare('INSERT INTO meds (profile_key, name, dose_text, start_date, end_date, controlled, supersedes_id, ord, note) VALUES (?,?,?,?,?,?,?,?,?)')
  const first = insert.run('A', '莫达非尼', '200mg', '2026-05-01', '2026-08-01', 1, null, 1, null)
  insert.run('A', '阿莫达非尼', '150mg', '2026-08-01', null, 1, Number(first.lastInsertRowid), 2, null)
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

test('多档案隔离：A 的行不会出现在 B 的查询里', () => {
  const db = open()
  const insert = db.prepare('INSERT INTO naps (profile_key, at, context, duration_min, prodrome, note, proxy) VALUES (?,?,?,?,?,?,?)')
  insert.run('A', '2026-10-20T15:30', '开会', 20, null, null, 0)
  insert.run('B', '2026-10-20T09:10', '通勤', 90, null, null, 1)
  const a = db.prepare("SELECT context FROM naps WHERE profile_key = 'A' ORDER BY rowid").all().map((r) => r.context)
  const b = db.prepare("SELECT context FROM naps WHERE profile_key = 'B' ORDER BY rowid").all().map((r) => r.context)
  assert.deepEqual(a, ['开会'])
  assert.deepEqual(b, ['通勤'])
  // 同一 rowid_key 在 A/B 下各自独立：复合主键是 (profile_key, rowid_key)
  const keys = db.prepare('SELECT profile_key, rowid_key FROM naps ORDER BY profile_key').all()
  assert.deepEqual(keys.map((r) => [r.profile_key, r.rowid_key]), [['A', 1], ['B', 2]])
  assert.throws(() => insert.run('', '2026-10-20T10:00', '其他', null, null, null, 0), 'profile_key 空串应被 CHECK 拦住')
  db.close()
})

test('profile 表主键是 profile_key，不再是 CHECK(id = 1) 单行设计', () => {
  const db = open()
  const pk = db.prepare('PRAGMA table_info(profile)').all().filter((c) => c.pk > 0).map((c) => c.name)
  assert.deepEqual(pk, ['profile_key'])
  const insert = db.prepare('INSERT INTO profile (profile_key, display_name, updated_at, ord) VALUES (?,?,?,?)')
  insert.run('A', '陈默', '2026-10-25', 0)
  insert.run('B', '李知远', '2026-10-25', 1)
  assert.equal(db.prepare('SELECT COUNT(*) c FROM profile').get().c, 2)
  db.close()
})

test('0002 迁移不丢行：单档案数据整批变成 profile_key=A', () => {
  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  db.exec(readFileSync('schema/0001_initial.sql', 'utf8'))
  // 按 0001 的单档案口径写一份"老用户已有数据"
  db.exec(`INSERT INTO profile (display_name, born_year, dx_text, cataplexy, onset_date, note, updated_at)
           VALUES ('陈默', 1999, '发作性睡病 1 型', '有', '2024-03', '', '2026-10-25')`)
  db.exec(`INSERT INTO naps (at, context, duration_min, prodrome, note, proxy)
           VALUES ('2026-10-20T15:30', '开会', 20, '困意', NULL, 0)`)
  db.exec(`INSERT INTO ess_sessions (at, q1,q2,q3,q4,q5,q6,q7,q8, total, proxy, note)
           VALUES ('2026-10-25', 1,2,1,2,1,2,1,1, 11, 0, NULL)`)
  db.exec(`INSERT INTO meds (name, dose_text, start_date, end_date, controlled, supersedes_id, ord, note)
           VALUES ('莫达非尼', '200mg', '2024-04-01', NULL, 1, NULL, 10, NULL)`)
  db.exec(`INSERT INTO med_tolerance (at, med_id, item, value, unit, note) VALUES ('2026-10-01', 1, '头痛', 2, NULL, NULL)`)
  db.exec(`INSERT INTO metrics (code, at, value_num, value_text, unit, kind, dec, ref_low, ref_high, section_title, note)
           VALUES ('weight', '2026-10-20', 54.1, NULL, 'kg', 'numeric', 1, NULL, NULL, '体征', NULL)`)
  db.exec(`INSERT INTO metrics (code, at, value_num, value_text, unit, kind, dec, ref_low, ref_high, section_title, note)
           VALUES ('hla_drb1', '2026-09-01', NULL, '阳性', NULL, 'qual', NULL, NULL, NULL, '检查', NULL)`)
  db.exec(`INSERT INTO night_events (at, kind, duration_min, note) VALUES ('2026-10-19T02:10', 'awakening', 15, NULL)`)
  db.exec(`INSERT INTO documents (title, kind, body_text, added_at) VALUES ('出院小结', 'discharge', '原文', '2026-10-01')`)
  db.exec(`INSERT INTO candidates (document_id, field, value_text, status, created_at) VALUES (1, 'dx_text', '发作性睡病', 'pending', '2026-10-01')`)
  db.exec(`INSERT INTO questions (body, for_visit, asked_at, in_use, ord, created_at) VALUES ('ESS 要不要重填', '2026-10-28', NULL, 1, 10, '2026-10-20')`)
  db.exec(`INSERT INTO viewpoints (body, at, private) VALUES ('我觉得下午更严重', '2026-10-20', 1)`)
  db.exec(`INSERT INTO events (at, label, kind, private, ord) VALUES ('2026-10-20', '开会睡着', 'other', 0, 0)`)

  const business = ['profile', 'naps', 'ess_sessions', 'night_events', 'meds', 'med_tolerance', 'metrics', 'documents', 'candidates', 'questions', 'viewpoints', 'events']
  const before = Object.fromEntries(business.map((t) => [t, db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c]))

  db.exec(readFileSync('schema/0002_multi_profile.sql', 'utf8'))

  for (const t of business) {
    assert.equal(db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c, before[t], `${t} 行数迁移前后不一致`)
    assert.equal(db.prepare(`SELECT COUNT(*) c FROM ${t} WHERE profile_key <> 'A'`).get().c, 0, `${t} 出现非 A 的 profile_key`)
  }
  // 列值本身也不能变
  assert.equal(db.prepare("SELECT value_text FROM metrics WHERE code = 'hla_drb1'").get().value_text, '阳性')
  assert.equal(db.prepare('SELECT duration_min FROM naps').get().duration_min, 20)
  assert.equal(db.prepare('SELECT in_use FROM questions').get().in_use, 1)
  assert.equal(db.prepare('SELECT private FROM viewpoints').get().private, 1)
  db.close()
})
