/* store + 读模型 parity 测试
 *
 * 这一套测的是"库"和"原型数据层"说得是不是同一件事。
 * 为什么 parity 是这一层唯一的验收标准：原型是视觉基准（四条总原则之一），
 * 读模型要是自己发明字段名，界面就会出现"某块永远空着"且不报错 —— 这种 bug
 * 只能靠逐字段比对抓出来，靠眼睛看界面看不出来。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const ROOT = new URL('..', import.meta.url).pathname

/* profile 有 NOT NULL 的 updated_at / ord / proxied：测试里建档案统一走这个 helper，
   免得每个用例都要抄一次列清单（抄漏了报错信息还不直观）。 */
function addProfile(db, key, name = '测试') {
  db.prepare('INSERT INTO profile (profile_key, display_name, updated_at, ord, proxied) VALUES (?,?,?,?,?)')
    .run(key, name, '2026-10-25', 0, 0)
}

const store = await import(pathToFileURL(join(ROOT, 'dsh/store.js')).href)
const rm = await import(pathToFileURL(join(ROOT, 'dsh/readmodels.js')).href)

/* 原型数据层：它是 parity 的另一半。用 vm 之外的简单办法 —— 它只往 window 上挂东西。 */
function loadPrototypeData() {
  const src = readFileSync(join(ROOT, 'prototypes/v0.2/demo-data.js'), 'utf8')
  const sandbox = { window: {} }
  // eslint-disable-next-line no-new-func
  new Function('window', src)(sandbox.window)
  return { data: sandbox.window.DEMO_DATA, essItems: sandbox.window.ESS_ITEMS }
}

test('迁移：:memory: 能建库，跑两次幂等', () => {
  const db = store.openDatabase(':memory:')
  const first = store.migrate(db)
  assert.deepEqual(first, [1, 2, 3], '三个迁移都该跑')
  assert.deepEqual(store.migrate(db), [], '第二次应该什么都不跑')
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all().map((r) => r.name)
  assert.ok(tables.includes('schema_migrations'))
  assert.equal(tables.length, 15, `业务表 14 张 + 迁移台账 1 张，实际 ${tables.length}`)
  store.closeDatabase(db)
})

test('迁移：外键在迁移后是打开的', () => {
  const db = store.openDatabase(':memory:')
  store.migrate(db)
  const fk = db.prepare('PRAGMA foreign_keys').get()
  assert.equal(Object.values(fk)[0], 1, '迁移期间关外键，结束后必须恢复')
  store.closeDatabase(db)
})

test('迁移：0003 给 profile 补的列都在', () => {
  const db = store.openDatabase(':memory:')
  store.migrate(db)
  const cols = db.prepare('PRAGMA table_info(profile)').all().map((c) => c.name)
  for (const c of ['sex', 'occupation', 'worry_text', 'activity_text', 'proxied']) {
    assert.ok(cols.includes(c), `profile 缺列 ${c}`)
  }
  assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE name='profile_exam'").get(), '缺 profile_exam 表')
  store.closeDatabase(db)
})

test('读模型：形状与原型完全 parity（除排序无关的部分逐字段相同）', async () => {
  const { data } = loadPrototypeData()
  const gen = await import(pathToFileURL(join(ROOT, 'demo/build-demo-data.mjs')).href)
  const built = gen.buildDemoData()
  assert.ok(built, '生成器要能给出纯数据')

  /* 库用生成器产出的固定路径（它自己会从零重建）。 */
  const dbPath = join(ROOT, 'demo/demo-data.sqlite')
  assert.ok(existsSync(dbPath), '需要先跑 node demo/build-demo-data.mjs 生成演示库')
  const db = store.openDatabase(dbPath)

  const boot = rm.readBootstrap(db, { includePrivate: true })
  assert.deepEqual(Object.keys(boot.profiles).sort(), ['A', 'B'])
  assert.equal(Object.keys(boot.tracks).length, 5, '五条轨道')

  for (const key of ['A', 'B']) {
    const R = boot.profiles[key]

    /* naps：字段名与含义逐条相同 */
    assert.deepEqual(
      R.naps,
      data.naps[key].map((n) => ({
        at: n.at, context: n.context, min: n.min ?? null,
        prodrome: n.prodrome, proxy: !!n.proxy, note: n.note || ''
      })),
      `${key} naps 与原型不一致`
    )

    assert.deepEqual(
      R.nights,
      data.nights[key].map((n) => ({ at: n.at, kind: n.kind, min: n.min ?? null, note: n.note || '' })),
      `${key} nights 与原型不一致`
    )

    assert.deepEqual(
      R.ess.map((r) => ({ at: r.at, q: r.q, proxy: r.proxy, note: r.note })),
      data.ess[key].map((r) => ({ at: r.at, q: r.q, proxy: !!r.proxy, note: r.note || '' })),
      `${key} ess 与原型不一致`
    )

    assert.deepEqual(
      R.metrics.map((m) => ({ code: m.code, kind: m.kind, points: m.points })),
      data.metrics[key].map((m) => ({ code: m.code, kind: m.kind, points: m.points })),
      `${key} metrics 点位与原型不一致`
    )

    assert.deepEqual(
      R.questions, data.questions[key].map((q) => ({ body: q.body, forVisit: q.forVisit ?? null, asked: q.asked ?? null })),
      `${key} questions 与原型不一致`
    )

    assert.deepEqual(
      R.viewpoints, data.viewpoints[key].map((v) => ({ body: v.body, at: v.at, private: !!v.private })),
      `${key} viewpoints 与原型不一致`
    )

    assert.deepEqual(
      R.events, data.events[key].map((e) => ({ at: e.at, label: e.label, kind: e.kind, private: !!e.private })),
      `${key} events 与原型不一致`
    )
  }
  store.closeDatabase(db)
})

test('读模型：null 不许被补成 0（没记时长 ≠ 睡了 0 分钟）', () => {
  const db = store.openDatabase(':memory:')
  store.migrate(db)
  addProfile(db, 'T')
  db.prepare('INSERT INTO naps (profile_key, at, context, duration_min) VALUES (?,?,?,?)').run('T', '2026-10-01T10:00', '开会', null)
  db.prepare('INSERT INTO naps (profile_key, at, context, duration_min) VALUES (?,?,?,?)').run('T', '2026-10-02T10:00', '开会', 20)
  const naps = rm.readNaps(db, 'T')
  assert.equal(naps.length, 2)
  const noDur = naps.find((n) => n.at.startsWith('2026-10-01'))
  assert.equal(noDur.min, null, '没记时长必须读成 null，不能是 0')
  store.closeDatabase(db)
})

test('读模型：ESS 总分按 8 项重算，库里 total 被手改要报错', () => {
  const db = store.openDatabase(':memory:')
  store.migrate(db)
  addProfile(db, 'T')
  db.prepare(`INSERT INTO ess_sessions (profile_key, at, q1,q2,q3,q4,q5,q6,q7,q8, total, proxy)
              VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run('T', '2026-10-01', 3, 3, 3, 2, 2, 2, 2, 1, 18, 0)
  const ess = rm.readEss(db, 'T')
  assert.equal(ess[0].total, 18)

  db.prepare('UPDATE ess_sessions SET total = 5 WHERE at = ?').run('2026-10-01')
  assert.throws(() => rm.readEss(db, 'T'), /不一致/, '手改的 total 必须被抓住，不能静默用 sum 覆盖')
  store.closeDatabase(db)
})

test('读模型：私密看法默认一个字节都不下发，但给出条数', () => {
  const db = store.openDatabase(':memory:')
  store.migrate(db)
  addProfile(db, 'T')
  db.prepare('INSERT INTO viewpoints (profile_key, body, at, private) VALUES (?,?,?,?)').run('T', '私密内容', '2026-10-01', 1)
  db.prepare('INSERT INTO viewpoints (profile_key, body, at, private) VALUES (?,?,?,?)').run('T', '公开内容', '2026-10-02', 0)

  const hidden = rm.readViewpoints(db, 'T')
  assert.equal(hidden.length, 1, '默认只给非私密')
  assert.ok(!hidden.some((v) => v.body === '私密内容'), '私密正文不许出现')

  const meta = rm.readViewpointsMeta(db, 'T')
  assert.deepEqual(meta, { privateCount: 1, total: 2 }, '元数据要能说出"有 1 条藏起来了"')

  const all = rm.readViewpoints(db, 'T', { includePrivate: true })
  assert.equal(all.length, 2, '本人确认后才有两条')
  store.closeDatabase(db)
})

test('多档案隔离：读模型只读自己档案的行', () => {
  const db = store.openDatabase(':memory:')
  store.migrate(db)
  addProfile(db, 'A', '甲')
  addProfile(db, 'B', '乙')
  db.prepare('INSERT INTO naps (profile_key, at, context) VALUES (?,?,?)').run('A', '2026-10-01T10:00', '开会')
  db.prepare('INSERT INTO naps (profile_key, at, context) VALUES (?,?,?)').run('B', '2026-10-02T10:00', '开车')

  assert.equal(rm.readNaps(db, 'A').length, 1)
  assert.equal(rm.readNaps(db, 'A')[0].context, '开会')
  assert.equal(rm.readNaps(db, 'B')[0].context, '开车')
  store.closeDatabase(db)
})

test('用药：换药才写 supersedes，追加用药留 null', () => {
  const db = store.openDatabase(':memory:')
  store.migrate(db)
  addProfile(db, 'T')
  const ins = db.prepare('INSERT INTO meds (profile_key, name, dose_text, controlled, supersedes_id, ord) VALUES (?,?,?,?,?,?)')
  ins.run('T', '莫达非尼', '200 mg', 1, null, 1)
  ins.run('T', '阿莫达非尼', '150 mg', 1, 1, 2)   // 换掉上一条
  ins.run('T', '文拉法辛', '37.5 mg', 0, null, 3)  // 追加，不是换

  const meds = rm.readMeds(db, 'T')
  assert.equal(meds.length, 3)
  assert.equal(meds[1].supersedes, 1, '阿莫达非尼换掉了莫达非尼')
  assert.equal(meds[2].supersedes, null, '文拉法辛是加药，不能指向上一条')
  store.closeDatabase(db)
})

test('指标：目录外的 code 要读出来，排在目录项之后（不许静默丢弃）', () => {
  const db = store.openDatabase(':memory:')
  store.migrate(db)
  addProfile(db, 'T')
  /* 患者手工加的一条：code 不在目录里，指标名写在 section_title。
     这条记录必须出现在读模型里 —— 库里有、界面上没有，等于把人记的东西弄丢了。 */
  db.prepare(`INSERT INTO metrics (profile_key, code, at, value_num, unit, kind, dec, section_title, note)
              VALUES (?,?,?,?,?,?,?,?,?)`)
    .run('T', 'not_in_catalog', '2026-10-01', 72, 'ng/L', 'numeric', 1, '食欲素-A（外院）', '手工记录')
  const metrics = rm.readMetrics(db, 'T')
  assert.equal(metrics.length, 11, '10 项目录指标 + 1 项目录外')
  assert.equal(metrics[10].code, 'not_in_catalog', '目录外的排在目录项之后')
  assert.equal(metrics[10].label, '食欲素-A（外院）', '指标名从 section_title 还原')
  assert.equal(metrics[10].unit, 'ng/L')
  assert.deepEqual(metrics[10].points, [{ d: '2026-10-01', v: 72 }])
  assert.equal(metrics[10].track, 'lab', '手工条目归到检查轨')
  store.closeDatabase(db)
})
