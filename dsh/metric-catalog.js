/* 小睡宝 SnoozePal · 指标目录（指标定义的唯一来源）
 *
 * 为什么单独一个文件：一个指标有**两层东西**——
 *   ① 定义（叫什么、什么单位、几位小数、挂哪条轨、参考范围多少、口径说明是什么）；
 *   ② 观测（某天的值）。
 * 定义只能有一份。上一版把定义写死在原型 demo-data.js 里，开发版的读模型又要再写一遍，
 * 两处一漂移，同一个指标在原型和开发版就会显示成两个不同的单位。
 *
 * 所以：原型数据生成器（demo/build-demo-data.mjs）与读模型（dsh/readmodels.js）都从这里取定义，
 * 观测值各自从数据库/生成器来。
 *
 * **kind 只有三个值，与 schema 的 CHECK 逐字一致**：'numeric' | 'grade' | 'qual'。
 * 原型里曾把分类型写成 `kind: 'category'` —— 那是第二套词表，`metrics.kind` 的 CHECK 里没有它，
 * 写库会被拦。分类型结果（HLA-DRB1）用 'qual'，语义是"无序类别"，不是"轻重程度"。
 * 判据：这个指标能不能连线？不能连线的就是 qual/grade，能连线的才是 numeric。
 */
'use strict'

/* 五条轨道（27 号）：同一患者同一时间存在不可能相加的量，就不许进同一根轴。
 * 轨道归属写在定义里，页面不许自己分组——否则同一个指标在两张卡上会挂到不同轨。 */
export const TRACKS = {
  scale: { label: '量表轨', color: '#5b67d8', hint: '按整次填写' },
  event: { label: '发作轨', color: '#a8551c', hint: '按事件计' },
  night: { label: '夜间轨', color: '#6b4fa8', hint: '按夜计' },
  vitals: { label: '体征轨', color: '#2f6f66', hint: '按次测量' },
  lab: { label: '检查轨', color: '#8a5a0c', hint: '按次检查 · 含分类结果' }
}

/* ESS 八题的情境文本（公开量表的标准问法）。工作台只记录选择，不解释分数、不给分级。 */
export const ESS_ITEMS = [
  '坐着阅读时',
  '看电视时',
  '在公共场所坐着不动时（如开会、剧场）',
  '连续坐车一小时（不含休息）',
  '下午躺下休息时',
  '坐着与人交谈时',
  '午餐后安静坐着（未饮酒）',
  '驾车等红灯或堵车几分钟时'
]

/* 十个指标的定义。refLow / refHigh 为 null = 报告上没有参考范围，界面写「需参考范围」，
 * **不许借别的指标的参考范围**（借了就等于替检验科出结论）。 */
export const METRIC_DEFS = [
  {
    code: 'ess_total', track: 'scale', section: '量表',
    label: 'ESS 总分', unit: '分', dec: 0, kind: 'numeric',
    refLow: null, refHigh: null,
    source: '量表 ESS · 整次',
    note: '每次填写一个点；总分由 8 项相加，不可手改。'
  },
  {
    code: 'nap_median_min', track: 'event', section: '嗜睡发作',
    label: '单次发作时长中位数', unit: '分钟', dec: 0, kind: 'numeric',
    refLow: null, refHigh: null,
    source: '嗜睡发作 · 按月',
    note: '只统计记了时长的次数；没记的不当 0 分钟参与。'
  },
  {
    code: 'nap_count_month', track: 'event', section: '嗜睡发作',
    label: '每月发作次数', unit: '次', dec: 0, kind: 'numeric',
    refLow: null, refHigh: null,
    source: '嗜睡发作 · 按月',
    note: '按事件计数；某月没记到不代表没发作。'
  },
  {
    code: 'awakening_count', track: 'night', section: '夜间睡眠',
    label: '夜间觉醒次数', unit: '次', dec: 0, kind: 'numeric',
    refLow: null, refHigh: null,
    source: '夜间睡眠 · 按月',
    note: '同一夜多次记多次。'
  },
  {
    code: 'paralysis_count', track: 'night', section: '夜间睡眠',
    label: '睡眠瘫痪次数', unit: '次', dec: 0, kind: 'numeric',
    refLow: null, refHigh: null,
    source: '夜间睡眠 · 按月',
    note: '本人描述的次数，不是"有多少次发生了"。'
  },
  {
    code: 'weight', track: 'vitals', section: '体征',
    label: '体重', unit: 'kg', dec: 1, kind: 'numeric',
    refLow: null, refHigh: null,
    source: '门诊称重',
    note: '报告上没有参考范围，就写「需参考范围」，不借别人的。'
  },
  {
    code: 'spo2_rest', track: 'vitals', section: '体征',
    label: '静息血氧饱和度', unit: '%', dec: 0, kind: 'numeric',
    refLow: 95, refHigh: 100,
    source: 'PSG / 门诊',
    note: '参考范围取报告原文，仅此一项有上限。'
  },
  {
    code: 'orexin_a', track: 'lab', section: '检查',
    label: '脑脊液食欲素-A', unit: 'pg/mL', dec: 0, kind: 'numeric',
    refLow: 110, refHigh: null,
    source: '腰椎穿刺 · 报告原文',
    note: '阈值各实验室不同（常用 110 或 200 pg/mL），以报告原文为准；缺上限不借别人的。'
  },
  {
    code: 'mslt_latency', track: 'lab', section: '检查',
    label: 'MSLT 平均睡眠潜伏期', unit: '分钟', dec: 1, kind: 'numeric',
    refLow: 8, refHigh: null,
    source: 'MSLT 报告原文',
    note: '单次检查一个点；复查才多一个点。'
  },
  {
    code: 'hla_drb1', track: 'lab', section: '检查',
    label: 'HLA-DRB1*15:01', unit: '', dec: 0, kind: 'qual',
    refLow: null, refHigh: null,
    source: '基因检测报告',
    note: '分类型结果：只画节点、不连线——给类别连线会暗示"程度"，那是编出来的。'
  }
]

export const METRIC_BY_CODE = new Map(METRIC_DEFS.map((m) => [m.code, m]))

/* 定长的、与档案无关的清单：原型与开发版都按这个顺序分组显示。 */
export const METRIC_ORDER = METRIC_DEFS.map((m) => m.code)

export function metricDef(code) {
  const def = METRIC_BY_CODE.get(code)
  if (!def) throw new Error(`未知指标 code：${code}（指标定义只能来自 dsh/metric-catalog.js）`)
  return def
}
