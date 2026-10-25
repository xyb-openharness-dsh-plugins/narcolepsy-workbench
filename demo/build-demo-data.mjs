/* 小睡宝 SnoozePal · 演示数据生成器（唯一数据源）
 *
 * 产出两件：
 *   ① demo/demo-data.sqlite —— 可 SQL 查询的演示库（开发版 `dsh/demo.js` 用它播种）；
 *   ② prototypes/v0.2/demo-data.js —— 原型只读数据层（生成物，勿手改）；
 *   ③ public/demo-data.js —— 开发版的**离线回退**（与 ② 逐字节相同）。
 *
 * 为什么 ② 和 ③ 必须是同一份：开发版优先走 API，拿不到才回退这份演示数据。
 * 两处手工同步必然漂移（宫颈样板就是靠人手保持一致的），所以这里一次写两处、
 * `--check` 一次比两处 —— 回退数据与原型数据不同，等于"离线看到的东西和验收基准不是一个"。
 *
 * 运行：node demo/build-demo-data.mjs        写两件产物
 *       node demo/build-demo-data.mjs --check 只比对不写（进 npm run check）
 *
 * 两种用法（14 号：数据只有一个来源）：
 *   1. 直接跑（CLI）：写上面两件产物；
 *   2. 被 import：只拿到 `buildDemoData()` 返回的纯数据，**一个字节都不碰磁盘**
 *      —— `dsh/demo.js` 靠它把演示档案写进本机 sqlite。
 *
 * 硬规则（改前必读）：
 *   - 患者数据全部虚构；临床试验条目另见 data/trials/（真跑采集，不是编的）。
 *   - **指标定义取自 dsh/metric-catalog.js**，这里只派生观测值。上一版把定义写死在本文件里，
 *     读模型要再写一遍，两处漂移就会出现"同一个指标两个单位"。
 *   - **固定种子**：同一天打开两次数字一致，截图可复现。
 *   - **INSERT 一律写显式列名**，禁止 `INSERT INTO t VALUES (?,?,…)`。
 *   - 派生值（ESS 总分）算出来再写，不手抄。
 */
import { writeFileSync, readFileSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { METRIC_DEFS, TRACKS, ESS_ITEMS } from '../dsh/metric-catalog.js'
import { openDatabase, migrate, closeDatabase } from '../dsh/store.js'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const P2 = join(ROOT, 'prototypes/v0.2')
const PUB = join(ROOT, 'public')
const DB_PATH = join(ROOT, 'demo/demo-data.sqlite')

/* ---------- 基础工具 ---------- */

/* 固定种子伪随机（mulberry32）。 */
function seeded(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const CONTEXTS = ['开会', '开车', '吃饭', '静坐', '阅读', '通勤', '其他']
const NIGHT_KINDS = ['awakening', 'sleep_paralysis', 'hallucination', 'vivid_dream']

/* 近 90 天的日期序列，从 2026-07-28 到 2026-10-25。 */
function dayList() {
  const days = []
  const start = Date.parse('2026-07-28T00:00:00')
  for (let i = 0; i < 90; i += 1) {
    days.push(new Date(start + i * 86400000).toISOString().slice(0, 10))
  }
  return days
}

const median = (nums) => {
  const s = nums.filter((v) => v != null).slice().sort((a, b) => a - b)
  return s.length ? s[Math.floor((s.length - 1) / 2)] : null
}

/* 按月聚合：日期取「该月最后一条记录的日期」（真实日期，不编一个"月末"出来）。 */
function byMonth(list, dateOf) {
  const map = new Map()
  for (const it of list) {
    const d = String(dateOf(it)).slice(0, 10)
    const m = d.slice(0, 7)
    if (!map.has(m)) map.set(m, [])
    map.get(m).push({ d, it })
  }
  return [...map.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([month, arr]) => ({ month, last: arr.map((x) => x.d).sort().slice(-1)[0], items: arr.map((x) => x.it), n: arr.length }))
}

function makeNaps(seed, opts) {
  const rand = seeded(seed)
  const out = []
  for (const day of dayList()) {
    const roll = rand()
    // 大致每天 0–2 次；后期（8 月底起换药）频率下降，这个趋势是演示用的，不代表疗效判断
    const base = opts.improving && day >= '2026-08-26' ? 0.45 : 0.95
    const count = roll > base ? (rand() > 0.72 ? 2 : 1) : (rand() > 0.55 ? 1 : 0)
    for (let i = 0; i < count; i += 1) {
      const hour = [9, 10, 11, 13, 14, 15, 16, 17, 20][Math.floor(rand() * 9)]
      const minute = [0, 10, 15, 20, 25, 30, 40, 50][Math.floor(rand() * 8)]
      const dur = rand() > 0.85 ? null : Math.round(8 + rand() * 32)
      out.push({
        at: `${day}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
        context: CONTEXTS[Math.floor(rand() * CONTEXTS.length)],
        min: dur,
        prodrome: rand() > 0.45 ? '有' : (rand() > 0.5 ? '无' : '未记录'),
        proxy: opts.proxy && rand() > 0.55 ? 1 : 0,
        note: ''
      })
    }
  }
  return out.sort((a, b) => (a.at < b.at ? 1 : -1))
}

function makeNights(seed, opts) {
  const rand = seeded(seed)
  const out = []
  for (const day of dayList()) {
    if (rand() > 0.42) continue
    const kind = NIGHT_KINDS[Math.floor(rand() * (opts.rich ? 4 : 2))]
    const hour = [1, 2, 3, 4, 5][Math.floor(rand() * 5)]
    out.push({
      at: `${day}T${String(hour).padStart(2, '0')}:${String([0, 15, 30, 45][Math.floor(rand() * 4)]).padStart(2, '0')}`,
      kind,
      min: kind === 'awakening' ? Math.round(5 + rand() * 40) : (rand() > 0.5 ? 1 : null),
      note: ''
    })
  }
  return out.sort((a, b) => (a.at < b.at ? 1 : -1))
}

/* ---------- 派生指标：只算观测值，定义来自 metric-catalog ---------- */

const WEIGHT = {
  A: [{ d: '2026-04-11', v: 54.2 }, { d: '2026-06-13', v: 55.0 }, { d: '2026-08-26', v: 53.6 }, { d: '2026-10-20', v: 54.1 }],
  B: [{ d: '2026-06-05', v: 48.5 }, { d: '2026-08-15', v: 49.8 }, { d: '2026-10-18', v: 50.6 }]
}
const SPO2 = {
  A: [{ d: '2026-03-28', v: 97 }, { d: '2026-08-26', v: 98 }, { d: '2026-10-20', v: 97 }],
  B: [{ d: '2026-05-21', v: 98 }]
}
const OREXIN = { A: [{ d: '2026-03-29', v: 68 }], B: [] }
const MSLT = { A: [{ d: '2026-03-29', v: 4.1 }], B: [{ d: '2026-05-22', v: 5.2 }] }
const HLA = { A: [{ d: '2026-03-28', v: '阳性' }], B: [{ d: '2026-05-22', v: '未测' }] }

function metricPoints(profileKey, code, { naps, nights, ess }) {
  switch (code) {
    case 'ess_total':
      // 整次一个点，不是每天一个点（ADR-2）；总分由 8 项相加派生
      return ess.map((r) => ({ d: r.at, v: r.q.reduce((a, b) => a + b, 0) }))
    case 'nap_median_min':
      return byMonth(naps, (n) => n.at).map((g) => ({ d: g.last, v: median(g.items.map((n) => n.min)) })).filter((p) => p.v != null)
    case 'nap_count_month':
      return byMonth(naps, (n) => n.at).map((g) => ({ d: g.last, v: g.items.length }))
    case 'awakening_count':
      return byMonth(nights, (n) => n.at).map((g) => ({ d: g.last, v: g.items.filter((n) => n.kind === 'awakening').length }))
    case 'paralysis_count':
      return byMonth(nights, (n) => n.at).map((g) => ({ d: g.last, v: g.items.filter((n) => n.kind === 'sleep_paralysis').length }))
    case 'weight': return WEIGHT[profileKey]
    case 'spo2_rest': return SPO2[profileKey]
    case 'orexin_a': return OREXIN[profileKey]
    case 'mslt_latency': return MSLT[profileKey]
    case 'hla_drb1': return HLA[profileKey]
    default: throw new Error(`指标 ${code} 没有派生规则（定义与派生必须一一对应）`)
  }
}

/* ---------- 档案 ---------- */

const PROFILES = {
  A: {
    name: '陈默',
    initial: '陈',
    sex: '女',
    age: 27,
    meta: '发作性睡病 · 伴猝倒 · 设计公司职员',
    headline: '发作性睡病（2026-04 确诊），8 月底调整过一次用药；白天突睡 3 个月共记录若干次，具体次数以「嗜睡发作」页为准',
    dx: '发作性睡病，伴猝倒（医生原文，2026-04-11）',
    dxNote: '分型按医生记录；工作台不推断 1 型/2 型',
    cataplexy: '有',
    onset: '2025-11',
    psycho: '最担心开车和开会时突然睡着，也怕被当成"不认真"',
    activity: '上下班坐地铁；开车只在市区短途，犯困就靠边停',
    proxied: false,
    occupation: '设计公司职员',
    bornYear: 1999,
    exam: [
      { name: '夜间多导睡眠监测（PSG）', date: '2026-03-28', place: 'XX 医院睡眠中心', note: '原文：睡眠潜伏期 6 分钟，REM 潜伏期 22 分钟；呼吸事件指数 1.2 次/小时' },
      { name: '多次睡眠潜伏期试验（MSLT）', date: '2026-03-29', place: 'XX 医院睡眠中心', note: '原文：5 次小睡平均潜伏期 4.1 分钟，出现 2 次 SOREMP' },
      { name: '血常规 + 生化', date: '2026-08-26', place: 'XX 医院', note: '原文数值见「检查与指标」；工作台只存数值与参考范围' }
    ]
  },
  B: {
    name: '李知远',
    initial: '李',
    sex: '男',
    age: 15,
    meta: '发作性睡病 · 初中生 · 家长代记',
    headline: '发作性睡病（2026-06 确诊），白天嗜睡影响上课；本档案由家长代记，每条记录带「家长代记」标记',
    dx: '发作性睡病（医生原文，2026-06-05）',
    dxNote: '分型按医生记录；工作台不推断 1 型/2 型',
    cataplexy: '未记录',
    onset: '2026-01',
    psycho: '最担心在学校被老师误会成不专心，也怕同学知道',
    activity: '每天 6:40 起床，晚自习后 21:30 到家；体育课照常上',
    proxied: true,
    occupation: '初中生（在读）',
    bornYear: 2011,
    exam: [
      { name: '夜间多导睡眠监测（PSG）', date: '2026-05-21', place: 'XX 医院睡眠中心', note: '原文：睡眠潜伏期 8 分钟，呼吸事件指数 0.8 次/小时' },
      { name: '多次睡眠潜伏期试验（MSLT）', date: '2026-05-22', place: 'XX 医院睡眠中心', note: '原文：4 次小睡平均潜伏期 5.2 分钟' }
    ]
  }
}

/* ESS 整次：q 是 8 项原始分（0–3），total 由 sum 派生。 */
const ESS = {
  A: [
    { at: '2026-04-11', q: [3, 3, 3, 3, 2, 2, 3, 2], proxy: 0, note: '确诊那次门诊' },
    { at: '2026-06-13', q: [3, 3, 2, 3, 2, 1, 2, 2], proxy: 0, note: '' },
    { at: '2026-08-26', q: [3, 2, 2, 3, 1, 1, 2, 2], proxy: 0, note: '换药前' },
    { at: '2026-09-24', q: [2, 2, 2, 2, 1, 1, 2, 1], proxy: 0, note: '换药后一个月' },
    { at: '2026-10-20', q: [2, 2, 1, 2, 1, 0, 2, 1], proxy: 0, note: '' }
  ],
  B: [
    { at: '2026-06-05', q: [3, 3, 3, 2, 2, 2, 3, 1], proxy: 1, note: '家长代填（家长旁听）' },
    { at: '2026-08-15', q: [3, 2, 3, 2, 2, 1, 2, 1], proxy: 1, note: '' },
    { at: '2026-10-18', q: [2, 2, 2, 2, 1, 1, 2, 1], proxy: 1, note: '' }
  ]
}

const MEDS = {
  A: [
    { name: '莫达非尼', dose: '200 mg 早一次', start: '2026-04-15', end: '2026-08-25', controlled: 1, ord: 1, note: '处方来源：XX 医院神经内科；处方天数 30 天' },
    { name: '阿莫达非尼', dose: '150 mg 早一次', start: '2026-08-26', end: null, controlled: 1, ord: 2, replaces: true, note: '换药原因原文：「白天仍然困，试试长效」' },
    { name: '文拉法辛', dose: '37.5 mg 晚一次', start: '2026-09-10', end: null, controlled: 0, ord: 3, note: '记录自医生处方，未写适应症' }
  ],
  B: [
    { name: '莫达非尼', dose: '100 mg 早一次', start: '2026-06-10', end: null, controlled: 1, ord: 1, note: '家长代记；处方由监护人保管' }
  ]
}

const TOLERANCE = {
  A: [
    { at: '2026-04-20', med: '莫达非尼', item: '食欲下降', value: 1, unit: '自评 0–3' },
    { at: '2026-05-08', med: '莫达非尼', item: '口干', value: 2, unit: '自评 0–3' },
    { at: '2026-06-02', med: '莫达非尼', item: '心悸', value: 1, unit: '自评 0–3' },
    { at: '2026-09-02', med: '阿莫达非尼', item: '睡眠变浅', value: 2, unit: '自评 0–3' }
  ],
  B: [
    { at: '2026-06-18', med: '莫达非尼', item: '食欲下降', value: 2, unit: '自评 0–3' }
  ]
}

const QUESTIONS = {
  A: [
    { body: '换成长效之后白天还是困，是不是剂量还要再调？', forVisit: '2026-11-03 神经内科', asked: null },
    { body: '白天在工位突然睡着被同事看到，需不需要跟公司说明？怎么说比较合适？', forVisit: '2026-11-03 神经内科', asked: null },
    { body: '现在这个情况能不能开车？市区短途算不算？', forVisit: '2026-11-03 神经内科', asked: null },
    { body: '管制类药品每次开药只能开多久？出差要带药怎么办？', forVisit: null, asked: '2026-08-26' }
  ],
  B: [
    { body: '孩子上课睡觉被老师批评，需不需要请医生开个说明？', forVisit: '2026-11-10 儿科', asked: null },
    { body: '体育课要不要申请免修？', forVisit: '2026-11-10 儿科', asked: null }
  ]
}

const VIEWPOINTS = {
  A: [
    { body: '我觉得下午两点到四点最难熬，比早上困得多。', at: '2026-09-30', private: 1 },
    { body: '被同事看见那次之后，我在工位上不敢趴着，硬撑反而更难受。', at: '2026-10-08', private: 1 }
  ],
  B: [
    { body: '孩子说晚上"醒着但动不了"，听起来很吓人，但白天问他他又不愿意讲。', at: '2026-09-20', private: 1 }
  ]
}

const EVENTS = {
  A: [
    { at: '2025-11-01', label: '开始出现白天突睡', kind: 'other', private: 0 },
    { at: '2026-03-28', label: 'PSG 检查', kind: 'exam', private: 0 },
    { at: '2026-03-29', label: 'MSLT 检查', kind: 'exam', private: 0 },
    { at: '2026-04-11', label: '确诊（门诊）', kind: 'visit', private: 0 },
    { at: '2026-04-15', label: '开始莫达非尼 200 mg', kind: 'med', private: 0 },
    { at: '2026-08-25', label: '莫达非尼停用', kind: 'med', private: 0 },
    { at: '2026-08-26', label: '换阿莫达非尼 150 mg', kind: 'med', private: 0 },
    { at: '2026-09-10', label: '加文拉法辛 37.5 mg', kind: 'med', private: 0 },
    { at: '2026-10-20', label: '门诊复诊', kind: 'visit', private: 0 }
  ],
  B: [
    { at: '2026-01-10', label: '老师反映上课睡觉', kind: 'other', private: 0 },
    { at: '2026-05-21', label: 'PSG 检查', kind: 'exam', private: 0 },
    { at: '2026-06-05', label: '确诊（门诊）', kind: 'visit', private: 0 },
    { at: '2026-06-10', label: '开始莫达非尼 100 mg', kind: 'med', private: 0 }
  ]
}

/* 看板待办：入口文案与 docs/INTERACTION-DESIGN.md §2 逐字一致（IP3）。
   scenario 编号 S01 记发作 / S02 复诊准备 / S03 填 ESS / S04 夜间事件 / S05 换药 / S06 办事材料 / S08 看懂检查。 */
const TASKS = {
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

const DOCUMENTS = {
  A: [
    { title: '出院小结 2026-04.pdf', kind: '出院小结', body: '原文存放；工作台不当成结论', added: '2026-04-12' },
    { title: 'PSG + MSLT 报告 2026-03.pdf', kind: '检查报告', body: '原文存放', added: '2026-03-30' }
  ],
  B: [
    { title: 'PSG 报告 2026-05.pdf', kind: '检查报告', body: '原文存放', added: '2026-05-22' }
  ]
}

/* ---------- 组装纯数据（不碰磁盘） ---------- */

export function buildDemoData() {
  const naps = { A: makeNaps(20261025, { improving: true, proxy: false }), B: makeNaps(771102, { improving: false, proxy: true }) }
  const nights = { A: makeNights(20261025, { rich: true }), B: makeNights(771102, { rich: false }) }

  /* 指标 = 定义（目录）+ 观测（派生）。字段顺序与原型一致，parity 要求逐字符可比。 */
  const metrics = {}
  for (const key of Object.keys(PROFILES)) {
    metrics[key] = METRIC_DEFS.map((def) => ({
      code: def.code,
      track: def.track,
      label: def.label,
      unit: def.unit,
      dec: def.dec,
      kind: def.kind,
      refLow: def.refLow,
      refHigh: def.refHigh,
      source: def.source,
      points: metricPoints(key, def.code, { naps: naps[key], nights: nights[key], ess: ESS[key] }),
      note: def.note
    }))
  }

  return {
    tracks: TRACKS,
    profiles: PROFILES,
    naps,
    nights,
    ess: ESS,
    meds: MEDS,
    tolerance: TOLERANCE,
    metrics,
    questions: QUESTIONS,
    viewpoints: VIEWPOINTS,
    events: EVENTS,
    tasks: TASKS,
    documents: DOCUMENTS,
    essItems: ESS_ITEMS
  }
}

/* ---------- 产 1：sqlite ---------- */

function writeSqlite(data) {
  /* 先删掉旧库再重建：迁移文件是"只跑一次"的（0002 会重建表），
     在已有库上重跑会撞 UNIQUE。生成器每次都是从零建，这也是"可复现"的前提。 */
  if (existsSync(DB_PATH)) rmSync(DB_PATH)
  const db = openDatabase(DB_PATH)
  try {
    /* 迁移不在这里手写：走 dsh/store.js 的 migrate()，事务与外键开关只有一套实现。 */
    migrate(db)

    db.exec('BEGIN')
    const insProfile = db.prepare('INSERT INTO profile (profile_key, display_name, born_year, dx_text, cataplexy, onset_date, note, updated_at, ord, sex, occupation, worry_text, activity_text, proxied) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    const insExam = db.prepare('INSERT INTO profile_exam (profile_key, name, at, place, note, ord) VALUES (?,?,?,?,?,?)')
    const insNap = db.prepare('INSERT INTO naps (profile_key, at, context, duration_min, prodrome, note, proxy) VALUES (?,?,?,?,?,?,?)')
    const insEss = db.prepare('INSERT INTO ess_sessions (profile_key, at, q1,q2,q3,q4,q5,q6,q7,q8, total, proxy, note) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)')
    const insNight = db.prepare('INSERT INTO night_events (profile_key, at, kind, duration_min, note) VALUES (?,?,?,?,?)')
    const insMed = db.prepare('INSERT INTO meds (profile_key, name, dose_text, start_date, end_date, controlled, supersedes_id, ord, note) VALUES (?,?,?,?,?,?,?,?,?)')
    const insTol = db.prepare('INSERT INTO med_tolerance (profile_key, at, med_id, item, value, unit, note) VALUES (?,?,?,?,?,?,?)')
    const insMetric = db.prepare('INSERT INTO metrics (profile_key, code, at, value_num, value_text, unit, kind, dec, ref_low, ref_high, section_title, note) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
    const insDoc = db.prepare('INSERT INTO documents (profile_key, title, kind, body_text, added_at) VALUES (?,?,?,?,?)')
    const insQ = db.prepare('INSERT INTO questions (profile_key, body, for_visit, asked_at, in_use, ord, created_at) VALUES (?,?,?,?,?,?,?)')
    const insVp = db.prepare('INSERT INTO viewpoints (profile_key, body, at, private) VALUES (?,?,?,?)')
    const insEv = db.prepare('INSERT INTO events (profile_key, at, label, kind, private, ord) VALUES (?,?,?,?,?,?)')

    for (const [key, p] of Object.entries(data.profiles)) {
      insProfile.run(
        key, p.name, p.bornYear ?? null, p.dx ?? null, p.cataplexy ?? null, p.onset ?? null,
        p.psycho ?? null, '2026-10-25', key === 'A' ? 0 : 1,
        p.sex ?? null, p.occupation ?? null, p.psycho ?? null, p.activity ?? null, p.proxied ? 1 : 0
      )
      ;(p.exam ?? []).forEach((e, i) => insExam.run(key, e.name, e.date ?? null, e.place ?? null, e.note ?? null, i * 10))
      data.naps[key].forEach((n) => insNap.run(key, n.at, n.context, n.min ?? null, n.prodrome ?? null, n.note || null, n.proxy ? 1 : 0))
      data.ess[key].forEach((r) => {
        const total = r.q.reduce((a, b) => a + b, 0)  // 派生，不手抄
        insEss.run(key, r.at, ...r.q, total, r.proxy ? 1 : 0, r.note || null)
      })
      data.nights[key].forEach((n) => insNight.run(key, n.at, n.kind, n.min ?? null, n.note || null))

      // 用药行：id 是自增。supersedes_id 只在**真的换掉上一行**时写，
      // 追加用药（文拉法辛是"加"，不是"换"）必须留 NULL —— 否则读模型会把并列的药画成一条链。
      const medIds = []
      data.meds[key].forEach((m) => {
        const prev = medIds.length ? medIds[medIds.length - 1] : null
        const supersedes = m.replaces === true ? prev : null
        const info = insMed.run(key, m.name, m.dose ?? null, m.start ?? null, m.end ?? null, m.controlled ? 1 : 0, supersedes, m.ord, m.note || null)
        medIds.push(Number(info.lastInsertRowid))
      })
      data.tolerance[key].forEach((t) => {
        const idx = data.meds[key].findIndex((m) => m.name === t.med)
        const medId = idx >= 0 ? medIds[idx] : medIds[0]
        insTol.run(key, t.at, medId ?? null, t.item, t.value ?? null, t.unit ?? null, null)
      })

      for (const m of data.metrics[key]) {
        const isNum = m.kind === 'numeric'
        for (const pt of m.points) {
          // 数值点进 value_num、分类点进 value_text；dec 只有数值型才有
          insMetric.run(
            key, m.code, pt.d,
            isNum ? pt.v : null,
            isNum ? null : String(pt.v),
            isNum ? (m.unit || null) : null,
            m.kind,
            isNum ? (m.dec ?? null) : null,
            isNum ? (m.refLow ?? null) : null,
            isNum ? (m.refHigh ?? null) : null,
            m.source.split(' · ')[0],
            m.note || null
          )
        }
      }

      data.documents[key].forEach((d) => insDoc.run(key, d.title, d.kind, d.body, d.added))
      data.questions[key].forEach((q, i) => insQ.run(key, q.body, q.forVisit ?? null, q.asked ?? null, 1, (i + 1) * 10, '2026-10-20'))
      data.viewpoints[key].forEach((v) => insVp.run(key, v.body, v.at, v.private ? 1 : 0))
      data.events[key].forEach((e, i) => insEv.run(key, e.at, e.label, e.kind, e.private ? 1 : 0, i * 10))
    }
    db.exec('COMMIT')
  } catch (error) {
    try { db.exec('ROLLBACK') } catch { /* 回滚失败不掩盖原始错误 */ }
    throw error
  } finally {
    closeDatabase(db)
  }
}

/* ---------- 产 2：原型数据层 ---------- */

function renderPrototypeJs(data) {
  return [
    '/* 由 demo/build-demo-data.mjs 生成；勿手改，改数据请改生成器后重新运行。 */',
    "/* 唯一数据源：dsh/metric-catalog.js（指标定义）+ demo/build-demo-data.mjs（观测派生）。 */",
    '(function () {',
    "'use strict';",
    'window.DEMO_DATA = ' + JSON.stringify(data, null, 0) + ';',
    'window.ESS_ITEMS = ' + JSON.stringify(data.essItems) + ';',
    '})();',
    ''
  ].join('\n')
}

/* ---------- CLI ---------- */

function isDirectRun() {
  return process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
}

if (isDirectRun()) {
  mkdirSync(join(ROOT, 'schema'), { recursive: true })
  const data = buildDemoData()
  const js = renderPrototypeJs(data)

  if (process.argv.includes('--check')) {
    let stale = false
    for (const target of [join(P2, 'demo-data.js'), join(PUB, 'demo-data.js')]) {
      const current = existsSync(target) ? readFileSync(target, 'utf8') : ''
      if (current !== js) {
        console.error(`✗ ${target.slice(ROOT.length + 1)} 与生成器不一致：改了数据必须重新生成并提交。`)
        stale = true
      }
    }
    if (stale) {
      console.error('  运行：node demo/build-demo-data.mjs')
      process.exit(1)
    }
    console.log('✓ 原型与开发版的数据层都与生成器一致')
    process.exit(0)
  }

  writeSqlite(data)
  writeFileSync(join(P2, 'demo-data.js'), js)
  writeFileSync(join(PUB, 'demo-data.js'), js)

  const nPoints = Object.values(data.metrics).reduce((a, m) => a + m.reduce((b, x) => b + x.points.length, 0), 0)
  console.log(`✓ demo/demo-data.sqlite + prototypes/v0.2/demo-data.js + public/demo-data.js 生成完毕：`
    + `${Object.keys(data.profiles).length} 档案 / ${METRIC_DEFS.length} 项指标 / ${nPoints} 个数据点 / `
    + `发作 ${Object.values(data.naps).reduce((a, x) => a + x.length, 0)} 条 / 夜间 ${Object.values(data.nights).reduce((a, x) => a + x.length, 0)} 条 / ESS ${Object.values(data.ess).reduce((a, x) => a + x.length, 0)} 次`)
}
