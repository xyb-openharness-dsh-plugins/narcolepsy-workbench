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
  metrics: {
    A: [
      { code: 'ess_total', label: 'ESS 总分', unit: '分', dec: 0, kind: 'numeric', section: '量表', refLow: null, refHigh: null, points: [] },
      { code: 'nap_duration', label: '单次发作时长（近 20 次均值）', unit: '分钟', dec: 0, kind: 'numeric', section: '发作', refLow: null, refHigh: null, points: [] },
      { code: 'awakening_count', label: '夜间觉醒次数（每周）', unit: '次', dec: 0, kind: 'numeric', section: '夜间', refLow: null, refHigh: null, points: [] },
      { code: 'spo2_rest', label: '静息 SpO₂', unit: '%', dec: 0, kind: 'numeric', section: '生命体征', refLow: 95, refHigh: 100, points: [{ d: '2026-03-28', v: 97 }, { d: '2026-08-26', v: 98 }, { d: '2026-10-20', v: 97 }] },
      { code: 'weight', label: '体重', unit: 'kg', dec: 1, kind: 'numeric', section: '生命体征', refLow: null, refHigh: null, points: [{ d: '2026-04-11', v: 54.2 }, { d: '2026-06-13', v: 55.0 }, { d: '2026-08-26', v: 53.6 }, { d: '2026-10-20', v: 54.1 }] }
    ],
    B: [
      { code: 'ess_total', label: 'ESS 总分', unit: '分', dec: 0, kind: 'numeric', section: '量表', refLow: null, refHigh: null, points: [] },
      { code: 'nap_duration', label: '单次发作时长（近 20 次均值）', unit: '分钟', dec: 0, kind: 'numeric', section: '发作', refLow: null, refHigh: null, points: [] },
      { code: 'weight', label: '体重', unit: 'kg', dec: 1, kind: 'numeric', section: '生命体征', refLow: null, refHigh: null, points: [{ d: '2026-06-05', v: 48.5 }, { d: '2026-08-15', v: 49.8 }, { d: '2026-10-18', v: 50.6 }] }
    ]
  },
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
  /* 看板待办：入口文案必须与 docs/INTERACTION-DESIGN.md §2 逐字一致（IP3） */
  tasks: {
    A: [
      { key: 'nap', title: '今天记一次发作', note: '一条记录只要 4 个字段；也可以直接跟 AI 说', action: 'go-naps-add' },
      { key: 'ess', title: '该填 ESS 了', note: '上次 2026-10-20 · 8 题约 3 分钟', action: 'go-ess-fill' },
      { key: 'visit', title: '3 天后复诊', note: '2026-11-03 神经内科 · 有 3 个问题还没问', action: 'go-visit' },
      { key: 'admin', title: '办事材料', note: '单位要病情说明；驾照换证也要材料', action: 'go-admin' }
    ],
    B: [
      { key: 'nap', title: '今天记一次发作', note: '家长代记会带标记，孩子本人可改', action: 'go-naps-add' },
      { key: 'ess', title: '该填 ESS 了', note: '上次 2026-10-18 · 家长旁听', action: 'go-ess-fill' },
      { key: 'visit', title: '16 天后复诊', note: '2026-11-10 儿科 · 有 2 个问题还没问', action: 'go-visit' }
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

window.DEMO_DATA = DEMO_DATA;

})();
