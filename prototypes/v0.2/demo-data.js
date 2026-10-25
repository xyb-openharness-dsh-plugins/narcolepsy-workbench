/* 小睡宝 SnoozePal · 演示数据（唯一源）
 *
 * 硬规则（docs/14-HTML-AND-DATA-CONTRACT.md）：原型只有这一份数据来源，页面不得内联写死第二条。
 * 患者资料全部为构造的模拟数据，不是真实病例；临床试验条目另见 data/trials/（真实登记摘录）。
 * 发作与夜间事件按固定种子生成——同一天打开两次结果一致，走查时不会"每次刷新数字都变"。
 */
'use strict';

/* 整份数据包在 IIFE 里：两个脚本是 classic script（共用全局作用域），
   顶层 const 会和 app.js 的 PROFILES / DEMO_DATA 撞名（实测报
   "Identifier 'PROFILES' has already been declared"，整页白屏）。 */
(function () {

/* 固定种子伪随机（mulberry32）：保证刷新后数据不变，截图可复现。 */
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CONTEXTS = ['开会', '开车', '吃饭', '静坐', '阅读', '通勤', '其他'];
const NIGHT_KINDS = ['awakening', 'sleep_paralysis', 'hallucination', 'vivid_dream'];

/* 近 90 天的日期序列（含今天），从 2026-07-28 到 2026-10-25。 */
function dayList() {
  const days = [];
  const start = Date.parse('2026-07-28T00:00:00');
  for (let i = 0; i < 90; i += 1) {
    days.push(new Date(start + i * 86400000).toISOString().slice(0, 10));
  }
  return days;
}

function makeNaps(seed, opts) {
  const rand = seeded(seed);
  const out = [];
  for (const day of dayList()) {
    const roll = rand();
    // 大致每天 0–2 次；后期（8 月底起换药）频率下降，这个趋势是演示用的，不代表疗效判断
    const base = opts.improving && day >= '2026-08-26' ? 0.45 : 0.95;
    const count = roll > base ? (rand() > 0.72 ? 2 : 1) : (rand() > 0.55 ? 1 : 0);
    for (let i = 0; i < count; i += 1) {
      const hour = [9, 10, 11, 13, 14, 15, 16, 17, 20][Math.floor(rand() * 9)];
      const minute = [0, 10, 15, 20, 25, 30, 40, 50][Math.floor(rand() * 8)];
      const dur = rand() > 0.85 ? null : Math.round((8 + rand() * 32) / 1) ;
      out.push({
        at: `${day}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
        context: CONTEXTS[Math.floor(rand() * CONTEXTS.length)],
        min: dur,
        prodrome: rand() > 0.45 ? '有' : (rand() > 0.5 ? '无' : '未记录'),
        proxy: opts.proxy && rand() > 0.55 ? 1 : 0,
        note: ''
      });
    }
  }
  return out.sort((a, b) => (a.at < b.at ? 1 : -1));
}

function makeNights(seed, opts) {
  const rand = seeded(seed);
  const out = [];
  for (const day of dayList()) {
    if (rand() > 0.42) continue;
    const kind = NIGHT_KINDS[Math.floor(rand() * (opts.rich ? 4 : 2))];
    const hour = [1, 2, 3, 4, 5][Math.floor(rand() * 5)];
    out.push({
      at: `${day}T${String(hour).padStart(2, '0')}:${String([0, 15, 30, 45][Math.floor(rand() * 4)]).padStart(2, '0')}`,
      kind,
      min: kind === 'awakening' ? Math.round(5 + rand() * 40) : (rand() > 0.5 ? 1 : null),
      note: ''
    });
  }
  return out.sort((a, b) => (a.at < b.at ? 1 : -1));
}

/* ---------------- 多轨指标（27 号四条约束：永不加总 / 永不折算 / 各自独立归一化 / 分类只画节点） ----------------
 *
 * 为什么必须分轨：同一患者同一时间存在两个**不可能相加**的量（ESS 是「分」、发作时长是「分钟」、
 * 夜间觉醒是「次」、体重是「kg」），把它们塞进同一张图同一根轴，等于替患者虚构了一个换算关系。
 * 轨道归属写在数据里（track 字段），**页面不许自己分组**——否则同一个指标在两张卡上会挂到不同轨。
 */
const TRACKS = {
  scale: { label: '量表轨', color: '#5b67d8', hint: '按整次填写' },
  event: { label: '发作轨', color: '#a8551c', hint: '按事件计' },
  night: { label: '夜间轨', color: '#6b4fa8', hint: '按夜计' },
  vitals: { label: '体征轨', color: '#2f6f66', hint: '按次测量' },
  lab: { label: '检查轨', color: '#8a5a0c', hint: '按次检查 · 含分类结果' }
};

const median = (nums) => {
  const s = nums.filter((v) => v != null).slice().sort((a, b) => a - b);
  return s.length ? s[Math.floor((s.length - 1) / 2)] : null;
};
const round1 = (v) => (v == null ? null : Math.round(v * 10) / 10);

/* 按月聚合：日期取「该月最后一条记录的日期」（真实日期，不编一个"月末"出来） */
function byMonth(list, dateOf) {
  const map = new Map();
  for (const it of list) {
    const d = String(dateOf(it)).slice(0, 10);
    const m = d.slice(0, 7);
    if (!map.has(m)) map.set(m, []);
    map.get(m).push({ d, it });
  }
  return [...map.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([month, arr]) => ({ month, last: arr.map((x) => x.d).sort().slice(-1)[0], items: arr.map((x) => x.it), n: arr.length }));
}

/* 派生口径全部从 naps / nights / ess 三条原始数组算出来，**不在这里手抄第二份数字**
   （14 号：数据只有一个来源）。上一版把 ess_total / nap_duration 的 points 留成空数组，
   导致「趋势」页永远空态、D2 三视图只落地 1/3 —— 这是评审 P0-7 的根因。 */
function makeMetrics(profileKey, naps, nights, ess) {
  const months = byMonth(naps, (n) => n.at);
  const nightMonths = byMonth(nights, (n) => n.at);

  const napMedian = months.map((g) => ({ d: g.last, v: median(g.items.map((n) => n.min)) })).filter((p) => p.v != null);
  const napCount = months.map((g) => ({ d: g.last, v: g.items.length }));
  const wakeCount = nightMonths.map((g) => ({ d: g.last, v: g.items.filter((n) => n.kind === 'awakening').length }));
  const paralysisCount = nightMonths.map((g) => ({ d: g.last, v: g.items.filter((n) => n.kind === 'sleep_paralysis').length }));
  const essPoints = ess.map((r) => ({ d: r.at, v: r.q.reduce((a, b) => a + b, 0) }));

  const B = profileKey === 'B';
  return [
    /* 量表轨：整次一个点，不是每天一个点（ADR-2） */
    { code: 'ess_total', track: 'scale', label: 'ESS 总分', unit: '分', dec: 0, kind: 'numeric', refLow: null, refHigh: null, source: '量表 ESS · 整次', points: essPoints, note: '每次填写一个点；总分由 8 项相加，不可手改。' },
    /* 发作轨：时长型（可为空，NULL ≠ 0）+ 计数型，两个不同单位不折算 */
    { code: 'nap_median_min', track: 'event', label: '单次发作时长中位数', unit: '分钟', dec: 0, kind: 'numeric', refLow: null, refHigh: null, source: '嗜睡发作 · 按月', points: napMedian, note: '只统计记了时长的次数；没记的不当 0 分钟参与。' },
    { code: 'nap_count_month', track: 'event', label: '每月发作次数', unit: '次', dec: 0, kind: 'numeric', refLow: null, refHigh: null, source: '嗜睡发作 · 按月', points: napCount, note: '按事件计数；某月没记到不代表没发作。' },
    /* 夜间轨 */
    { code: 'awakening_count', track: 'night', label: '夜间觉醒次数', unit: '次', dec: 0, kind: 'numeric', refLow: null, refHigh: null, source: '夜间睡眠 · 按月', points: wakeCount, note: '同一夜多次记多次。' },
    { code: 'paralysis_count', track: 'night', label: '睡眠瘫痪次数', unit: '次', dec: 0, kind: 'numeric', refLow: null, refHigh: null, source: '夜间睡眠 · 按月', points: paralysisCount, note: '本人描述的次数，不是"有多少次发生了"。' },
    /* 体征轨 */
    { code: 'weight', track: 'vitals', label: '体重', unit: 'kg', dec: 1, kind: 'numeric', refLow: null, refHigh: null, source: '门诊称重', points: B ? [{ d: '2026-06-05', v: 48.5 }, { d: '2026-08-15', v: 49.8 }, { d: '2026-10-18', v: 50.6 }] : [{ d: '2026-04-11', v: 54.2 }, { d: '2026-06-13', v: 55.0 }, { d: '2026-08-26', v: 53.6 }, { d: '2026-10-20', v: 54.1 }], note: '报告上没有参考范围，就写「需参考范围」，不借别人的。' },
    { code: 'spo2_rest', track: 'vitals', label: '静息血氧饱和度', unit: '%', dec: 0, kind: 'numeric', refLow: 95, refHigh: 100, source: 'PSG / 门诊', points: B ? [{ d: '2026-05-21', v: 98 }] : [{ d: '2026-03-28', v: 97 }, { d: '2026-08-26', v: 98 }, { d: '2026-10-20', v: 97 }], note: '参考范围取报告原文，仅此一项有上限。' },
    /* 检查轨：hla 是分类变量，只画节点不连线（27 号第 4 条） */
    { code: 'orexin_a', track: 'lab', label: '脑脊液食欲素-A', unit: 'pg/mL', dec: 0, kind: 'numeric', refLow: 110, refHigh: null, source: '腰椎穿刺 · 报告原文', points: B ? [] : [{ d: '2026-03-29', v: 68 }], note: '阈值各实验室不同（常用 110 或 200 pg/mL），以报告原文为准；缺上限不借别人的。' },
    { code: 'mslt_latency', track: 'lab', label: 'MSLT 平均睡眠潜伏期', unit: '分钟', dec: 1, kind: 'numeric', refLow: 8, refHigh: null, source: 'MSLT 报告原文', points: B ? [{ d: '2026-05-22', v: 5.2 }] : [{ d: '2026-03-29', v: 4.1 }], note: '单次检查一个点；复查才多一个点。' },
    { code: 'hla_drb1', track: 'lab', label: 'HLA-DRB1*15:01', unit: '', dec: 0, kind: 'category', refLow: null, refHigh: null, source: '基因检测报告', points: B ? [{ d: '2026-05-22', v: '未测' }] : [{ d: '2026-03-28', v: '阳性' }], note: '分类型结果：只画节点、不连线——给类别连线会暗示"程度"，那是编出来的。' }
  ];
}

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
    exam: [
      { name: '夜间多导睡眠监测（PSG）', date: '2026-05-21', place: 'XX 医院睡眠中心', note: '原文：睡眠潜伏期 8 分钟，呼吸事件指数 0.8 次/小时' },
      { name: '多次睡眠潜伏期试验（MSLT）', date: '2026-05-22', place: 'XX 医院睡眠中心', note: '原文：4 次小睡平均潜伏期 5.2 分钟' }
    ]
  }
};

const DEMO_DATA = {
  tracks: TRACKS,
  profiles: PROFILES,
  naps: { A: makeNaps(20261025, { improving: true, proxy: false }), B: makeNaps(771102, { improving: false, proxy: true }) },
  nights: { A: makeNights(20261025, { rich: true }), B: makeNights(771102, { rich: false }) },
  /* ESS 整次：q 是 8 项原始分（0–3），total 由服务端派生，原型里用 sum 函数算，不手填总分 */
  ess: {
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
  },
  meds: {
    A: [
      { name: '莫达非尼', dose: '200 mg 早一次', start: '2026-04-15', end: '2026-08-25', controlled: 1, ord: 1, note: '处方来源：XX 医院神经内科；处方天数 30 天' },
      { name: '阿莫达非尼', dose: '150 mg 早一次', start: '2026-08-26', end: null, controlled: 1, ord: 2, note: '换药原因原文：「白天仍然困，试试长效」' },
      { name: '文拉法辛', dose: '37.5 mg 晚一次', start: '2026-09-10', end: null, controlled: 0, ord: 3, note: '记录自医生处方，未写适应症' }
    ],
    B: [
      { name: '莫达非尼', dose: '100 mg 早一次', start: '2026-06-10', end: null, controlled: 1, ord: 1, note: '家长代记；处方由监护人保管' }
    ]
  },
  tolerance: {
    A: [
      { at: '2026-04-20', med: '莫达非尼', item: '食欲下降', value: 1, unit: '自评 0–3' },
      { at: '2026-05-08', med: '莫达非尼', item: '口干', value: 2, unit: '自评 0–3' },
      { at: '2026-06-02', med: '莫达非尼', item: '心悸', value: 1, unit: '自评 0–3' },
      { at: '2026-09-02', med: '阿莫达非尼', item: '睡眠变浅', value: 2, unit: '自评 0–3' }
    ],
    B: [
      { at: '2026-06-18', med: '莫达非尼', item: '食欲下降', value: 2, unit: '自评 0–3' }
    ]
  },
  metrics: null, /* 见文件末尾：由 naps / nights / ess 三条原始数组派生，不在此手抄 */
  questions: {
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
  },
  viewpoints: {
    A: [
      { body: '我觉得下午两点到四点最难熬，比早上困得多。', at: '2026-09-30', private: 1 },
      { body: '被同事看见那次之后，我在工位上不敢趴着，硬撑反而更难受。', at: '2026-10-08', private: 1 }
    ],
    B: [
      { body: '孩子说晚上"醒着但动不了"，听起来很吓人，但白天问他他又不愿意讲。', at: '2026-09-20', private: 1 }
    ]
  },
  events: {
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
  },
  /* 看板待办：入口文案必须与 docs/INTERACTION-DESIGN.md §2 逐字一致（IP3）
     每条带 scenario 编号：S01 记发作 / S02 复诊准备 / S03 填 ESS / S04 夜间事件 /
     S05 换药 / S06 办事材料 / S08 看懂检查。评审 P0-2 说 S04/S05/S08 的入口卡根本没实现，
     这里把它们做成**同一批任务卡**，不再另开一种"场景卡"，免得两套入口各说各话。 */
  tasks: {
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
};

/* ESS 八题（题目文本为公开量表的标准情境描述，工作台只记录选择，不解释分数） */
window.ESS_ITEMS = [
  '坐着阅读时',
  '看电视时',
  '在公共场所坐着不动时（如开会、剧场）',
  '连续坐车一小时（不含休息）',
  '下午躺下休息时',
  '坐着与人交谈时',
  '午餐后安静坐着（未饮酒）',
  '驾车等红灯或堵车几分钟时'
];

/* 指标按档案派生：必须在 naps/nights/ess 都定下来之后才能算，
   所以放在文件末尾一次性填进 DEMO_DATA.metrics（避免上面手抄第二份数字）。 */
DEMO_DATA.metrics = {};
for (const key of Object.keys(PROFILES)) {
  DEMO_DATA.metrics[key] = makeMetrics(key, DEMO_DATA.naps[key], DEMO_DATA.nights[key], DEMO_DATA.ess[key]);
}

window.DEMO_DATA = DEMO_DATA;

})();
