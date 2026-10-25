/* 小睡宝 SnoozePal · 读模型
 *
 * 唯一验收标准是 **parity**：这里读出来的形状，必须和 prototypes/v0.2/demo-data.js
 * 里 `window.DEMO_DATA` 的形状逐字段对得上。原型是视觉基准，读模型要是自己发明一套
 * 字段名，界面就会出现"某个位置永远空着"，而且不报错。
 *
 * 三条硬规则（改前必读）：
 *   ① **rowid 顺序不是语义顺序**：复合主键表按 `ORDER BY rowid` 读，有 ord 的按
 *      `ORDER BY ord, id`。裸 SELECT 复合主键表会按索引字母序返回，同一天的两条
 *      记录会莫名颠倒。
 *   ② **null 就是 null，不许补 0**：duration_min 为空表示"没记时长"，不是"睡了 0 分钟"。
 *      补 0 会让趋势图出现一个假的谷底。
 *   ③ **读时不造判读**：这里不做"是否严重""是否达标"的判断，也不算分级。
 *      标准会升版，把判断落库或落读模型，等于把旧标准的结论写成了历史事实。
 */
import { METRIC_DEFS, TRACKS, ESS_ITEMS } from './metric-catalog.js'

/* node:sqlite 返回的是 null-prototype 行对象，直接往下传会让 deepStrictEqual 失败，
   也会让 JSON.stringify 出来的东西在某些场景少键。统一摊平成普通对象。 */
const rows = (db, sql, ...args) => db.prepare(sql).all(...args).map((r) => ({ ...r }))

const num = (v) => (v == null ? null : Number(v))

/** 档案列表（切换器的数据源）。 */
export function readProfiles(db) {
  return rows(db, `SELECT profile_key AS key, display_name AS name, born_year, dx_text, cataplexy,
                          onset_date, note, sex, occupation, worry_text, activity_text, proxied, ord
                     FROM profile ORDER BY ord, profile_key`).map((r) => ({
    key: r.key,
    name: r.name,
    bornYear: num(r.born_year),
    dx: r.dx_text,
    cataplexy: r.cataplexy,
    onset: r.onset_date,
    note: r.note,
    sex: r.sex,
    occupation: r.occupation,
    worry: r.worry_text,
    activity: r.activity_text,
    proxied: r.proxied === 1,
    exam: rows(db, `SELECT name, at AS date, place, note FROM profile_exam
                     WHERE profile_key = ? ORDER BY ord, id`, r.key)
  }))
}

/** 嗜睡发作。按时间倒序（最近的在前），时长可能是 null。 */
export function readNaps(db, profileKey) {
  return rows(db, `SELECT at, context, duration_min, prodrome, note, proxy
                     FROM naps WHERE profile_key = ? ORDER BY at DESC, rowid DESC`, profileKey)
    .map((r) => ({
      at: r.at,
      context: r.context,
      min: num(r.duration_min),
      prodrome: r.prodrome,
      proxy: r.proxy === 1,
      note: r.note ?? ''
    }))
}

/** 夜间事件。 */
export function readNights(db, profileKey) {
  return rows(db, `SELECT at, kind, duration_min, note FROM night_events
                    WHERE profile_key = ? ORDER BY at DESC, rowid DESC`, profileKey)
    .map((r) => ({ at: r.at, kind: r.kind, min: num(r.duration_min), note: r.note ?? '' }))
}

/** ESS 整次记录。总分是派生值，读出来按 q1..q8 重算，**不信库里的 total**（防手改）。 */
export function readEss(db, profileKey) {
  return rows(db, `SELECT at, q1,q2,q3,q4,q5,q6,q7,q8, total, proxy, note FROM ess_sessions
                    WHERE profile_key = ? ORDER BY at`, profileKey)
    .map((r) => {
      const q = [r.q1, r.q2, r.q3, r.q4, r.q5, r.q6, r.q7, r.q8].map((v) => Number(v))
      const sum = q.reduce((a, b) => a + b, 0)
      /* 库里 total 与 8 项之和不一致，说明有人绕过界面改过库：如实报出来，
         不静默用 sum 覆盖，也不假装 total 是对的。 */
      if (r.total != null && Number(r.total) !== sum) {
        throw new Error(`ESS 记录 ${r.at} 的总分（${r.total}）与 8 项之和（${sum}）不一致，库被手工改过`)
      }
      return { at: r.at, q, total: sum, proxy: r.proxy === 1, note: r.note ?? '' }
    })
}

/** 用药：有 supersedes_id 的表示"换掉了上一行"，按 ord 排；结束日期空 = 仍在使用。 */
export function readMeds(db, profileKey) {
  return rows(db, `SELECT id, name, dose_text, start_date, end_date, controlled, supersedes_id, ord, note
                     FROM meds WHERE profile_key = ? ORDER BY ord, id`, profileKey)
    .map((r) => ({
      id: Number(r.id),
      name: r.name,
      dose: r.dose_text,
      start: r.start_date,
      end: r.end_date,
      controlled: r.controlled === 1,
      supersedes: r.supersedes_id == null ? null : Number(r.supersedes_id),
      ord: Number(r.ord),
      note: r.note ?? ''
    }))
}

/** 耐受性自评：med 用名称（原型就是这么索引的）。 */
export function readTolerance(db, profileKey) {
  return rows(db, `SELECT t.at, m.name AS med, t.item, t.value, t.unit
                     FROM med_tolerance t LEFT JOIN meds m ON m.id = t.med_id
                    WHERE t.profile_key = ? ORDER BY t.at, t.rowid`, profileKey)
    .map((r) => ({ at: r.at, med: r.med, item: r.item, value: num(r.value), unit: r.unit }))
}

/**
 * 指标：形状与原型 `metrics[key]` 一致 —— 每个 code 一条，points 是 [{d,v}]。
 * 数值点从 value_num 读，分类点（qual/grade）从 value_text 读，统一还原成 v。
 *
 * 两类 code：
 *   ① 目录里的（`dsh/metric-catalog.js`）—— 按目录顺序排在前面，定义以目录为准；
 *   ② **目录外的**（患者手工加的一条）—— 排在目录项之后，定义从库里那一行读。
 *
 * 为什么②也要读出来：原型的「检查与指标」允许手工加一条（`code: 'm'+时间戳`）。
 * 早期实现只 `return METRIC_DEFS.map(...)`，手工加的记录写进库却在界面上凭空消失，
 * 不报错、也不留痕 —— 那是最坏的一种"丢数据"（患者以为记下来了）。
 * 目录外的 entry 不是"绕过生成器"的证据，它就是用户的记录。
 */
export function readMetrics(db, profileKey) {
  const raw = rows(db, `SELECT code, at, value_num, value_text, unit, kind, dec, ref_low, ref_high, section_title, note
                           FROM metrics WHERE profile_key = ? ORDER BY at, rowid`, profileKey)

  const grouped = new Map()
  for (const r of raw) {
    if (!grouped.has(r.code)) grouped.set(r.code, [])
    grouped.get(r.code).push(r)
  }

  const known = new Set(METRIC_DEFS.map((d) => d.code))
  const fromCatalog = METRIC_DEFS.map((def) => {
    const list = grouped.get(def.code) ?? []
    const isNum = def.kind === 'numeric'
    return {
      code: def.code,
      track: def.track,
      label: def.label,
      unit: def.unit,
      dec: def.dec,
      kind: def.kind,
      refLow: def.refLow,
      refHigh: def.refHigh,
      source: def.source,
      note: def.note,
      points: list.map((r) => ({ d: r.at, v: isNum ? num(r.value_num) : r.value_text }))
    }
  })

  const extras = [...grouped.keys()]
    .filter((code) => !known.has(code))
    .sort((a, b) => {
      const ka = grouped.get(a), kb = grouped.get(b)
      const fa = ka[0], fb = kb[0]
      return String(fa.at) < String(fb.at) ? -1 : String(fa.at) > String(fb.at) ? 1 : String(a) < String(b) ? -1 : 1
    })
    .map((code) => {
      const list = grouped.get(code)
      const first = list[0]
      const kind = first.kind ?? 'numeric'
      const title = first.section_title || '手工记录'
      return {
        code,
        track: 'lab',                       // 手工条目归到检查轨；轨道表里没有"其他"这一轨
        label: title,                        // 原型手工加一条时把"指标名"写在 section_title 里
        unit: first.unit ?? '',
        dec: first.dec == null ? 1 : Number(first.dec),
        kind,
        refLow: num(first.ref_low),
        refHigh: num(first.ref_high),
        source: first.note || '手工记录',
        note: first.note ?? '',
        points: list.map((r) => ({ d: r.at, v: kind === 'numeric' ? num(r.value_num) : r.value_text }))
      }
    })

  return [...fromCatalog, ...extras]
}

export function readDocuments(db, profileKey) {
  return rows(db, `SELECT title, kind, body_text, added_at FROM documents
                    WHERE profile_key = ? ORDER BY added_at DESC, id`, profileKey)
    .map((r) => ({ title: r.title, kind: r.kind, body: r.body_text ?? '', added: r.added_at }))
}

/** 想问医生的问题：in_use = 1 才是仍在清单里的（第 3 条硬约束：删除是"移出清单"，不是物理删）。 */
export function readQuestions(db, profileKey) {
  return rows(db, `SELECT body, for_visit, asked_at FROM questions
                    WHERE profile_key = ? AND in_use = 1 ORDER BY ord, id`, profileKey)
    .map((r) => ({ body: r.body, forVisit: r.for_visit, asked: r.asked_at }))
}

/**
 * 私密区**元数据**：只告诉界面"有几条、藏起来了"，不含正文。
 *
 * 为什么要有这个：私密内容默认一个字节都不下发（三出口代码级过滤 —— 默认首屏、
 * 导出、AI 上下文），但界面得能显示"本人有 2 条记录，需本人确认后查看"。
 * 只发条数不发正文，既能让界面说清状态，又保证未确认前正文根本没到浏览器。
 */
export function readViewpointsMeta(db, profileKey) {
  const counts = db.prepare(`SELECT
      SUM(CASE WHEN private = 1 THEN 1 ELSE 0 END) AS private_count,
      COUNT(*) AS total
    FROM viewpoints WHERE profile_key = ?`).get(profileKey)
  return { privateCount: num(counts?.private_count) ?? 0, total: num(counts?.total) ?? 0 }
}

/** 患者自己的看法：private = 1 默认不外传，includePrivate=false 时整节剔除。 */
export function readViewpoints(db, profileKey, { includePrivate = false } = {}) {
  /* 时间正序：与 events / questions 的读法一致，也和原型 demo-data.js 的书写顺序一致
     （parity 是这一层唯一的验收标准，倒序看着"更近的在前"但会让 parity 对不上）。 */
  const all = rows(db, `SELECT body, at, private FROM viewpoints
                         WHERE profile_key = ? ORDER BY at, id`, profileKey)
    .map((r) => ({ body: r.body, at: r.at, private: r.private === 1 }))
  return includePrivate ? all : all.filter((v) => !v.private)
}

export function readEvents(db, profileKey) {
  return rows(db, `SELECT at, label, kind, private, ord FROM events
                    WHERE profile_key = ? ORDER BY at, ord, id`, profileKey)
    .map((r) => ({ at: r.at, label: r.label, kind: r.kind, private: r.private === 1 }))
}

/** 看板待办卡：不进库（它是界面的"下一步做什么"，不是患者数据）。 */
export const TASKS = {
  A: [
    { key: 'nap', scenario: 'S01', title: '今天记一次发作', note: '一条记录只要 4 个字段；也可以直接跟 AI 说', action: 'go-naps-add' },
    { key: 'ess', scenario: 'S03', title: '该填 ESS 了', note: '上次 2026-10-20 · 8 题约 3 分钟', action: 'go-ess-fill' },
    { key: 'visit', scenario: 'S02', title: '3 天后复诊', note: '2026-11-03 神经内科 · 有 3 个问题还没问', action: 'go-visit' },
    { key: 'night', scenario: 'S04', title: '昨晚睡得怎么样', note: '觉醒 2 次、睡瘫 2 次、没记幻觉；补一条只要 3 个字段', action: 'go-night-add' },
    { key: 'meds', scenario: 'S05', title: '用药有变化吗', note: '10-08 起莫达非尼改 200 mg 早一次；旧方案留着没删', action: 'go-meds' },
    { key: 'metrics', scenario: 'S08', title: '最近一次检查', note: '10-20 门诊称重 54.1 kg；SpO₂ 97%；食欲素-A 还是 3 月那次', action: 'go-metrics-latest' },
    { key: 'admin', scenario: 'S06', title: '办事材料', note: '单位要病情说明；驾照换证也要材料', action: 'go-admin' }
  ],
  B: [
    { key: 'nap', scenario: 'S01', title: '今天记一次发作', note: '家长代记会带标记，孩子本人可改', action: 'go-naps-add' },
    { key: 'ess', scenario: 'S03', title: '该填 ESS 了', note: '上次 2026-10-18 · 家长旁听', action: 'go-ess-fill' },
    { key: 'visit', scenario: 'S02', title: '16 天后复诊', note: '2026-11-10 儿科 · 有 2 个问题还没问', action: 'go-visit' },
    { key: 'night', scenario: 'S04', title: '昨晚睡得怎么样', note: '睡瘫 4 次、觉醒 6 次；孩子说不清幻觉，标"待确认"', action: 'go-night-add' },
    { key: 'meds', scenario: 'S05', title: '用药有变化吗', note: '9-02 起莫达非尼加至 150 mg；孩子说下午还是困', action: 'go-meds' },
    { key: 'metrics', scenario: 'S08', title: '最近一次检查', note: '10-18 体重 50.6 kg；MSLT 5.2 分钟；HLA 还没测', action: 'go-metrics-latest' },
    { key: 'admin', scenario: 'S06', title: '办事材料', note: '学校要病情说明；体育课免修也要材料', action: 'go-admin' }
  ]
}

/**
 * 整个档案的读模型：一次读出原型 `DEMO_DATA` 里按档案分的那几块。
 * private 出去的必须显式传 includePrivate。
 */
export function readProfile(db, profileKey, { includePrivate = false } = {}) {
  const profile = readProfiles(db).find((p) => p.key === profileKey)
  if (!profile) throw new Error(`没有这个档案：${profileKey}`)
  return {
    profile,
    naps: readNaps(db, profileKey),
    nights: readNights(db, profileKey),
    ess: readEss(db, profileKey),
    meds: readMeds(db, profileKey),
    tolerance: readTolerance(db, profileKey),
    metrics: readMetrics(db, profileKey),
    documents: readDocuments(db, profileKey),
    questions: readQuestions(db, profileKey),
    viewpoints: readViewpoints(db, profileKey, { includePrivate }),
    viewpointsMeta: readViewpointsMeta(db, profileKey),
    events: readEvents(db, profileKey),
    tasks: TASKS[profileKey] ?? []
  }
}

/** bootstrap：界面启动只要这一次请求就够（10 页所需数据全在里面）。 */
export function readBootstrap(db, { version, build, includePrivate = false } = {}) {
  const profiles = readProfiles(db)
  const payload = { profiles: {} }
  for (const p of profiles) {
    payload.profiles[p.key] = readProfile(db, p.key, { includePrivate })
  }
  return {
    version: version ?? null,
    build: build ?? null,
    tracks: TRACKS,
    /* ESS 八题原文属于**量表定义**，不是患者数据：跟 tracks 一样由服务端下发，
       界面不许自己再抄一份（抄出来的第二份迟早和量表原文对不上）。 */
    essItems: ESS_ITEMS,
    profiles: payload.profiles,
    /* 演示数据的标记：界面据此在页脚标明"这是演示档案"，不冒充真实患者。 */
    demo: { seeded: profiles.length > 0, profiles: profiles.length }
  }
}
