'use strict';
/* 小睡宝 SnoozePal v0.1.0 — 交互原型。患者数据全部为模拟；不读写真实文件、不调用模型或宿主 API。
 * 视觉体系沿用家族原型（淋巴瘤 v0.1 → 小畅宝 v0.2 → 小咽宝 v0.1 → 小莲宝 v0.1），品牌色重映射为
 * 夜深靛蓝 #5B67D8（docs/DESIGN-SESSION.md：靛蓝 + 白 + 文字标识）。
 *
 * 与其它病种原型的结构差异（改前先看，别跨仓互抄）：
 *   1. 一级页 9 个（SPEC §4：9 一级 / 26 二级），导航 key 与 docs/INTERACTION-DESIGN.md §1 逐字一致；
 *   2. 发作按**事件**存（一次一行，时长为空 ≠ 0），不做"每天一行 24 格"；
 *   3. ESS 按**整次**存（8 项 + 总分派生），不做 8 条独立指标线；
 *   4. 「驾驶」只记事实，不给能不能开的结论；「管制药」只标 flag，不给用药建议。 */

const APP_INFO = {
  version: '0.1.0',
  build: '2026-10-25',
  channel: 'prototype',
  channelLabel: '交互原型 · 未接入 DSH'
};
APP_INFO.displayVersion = `v${APP_INFO.version}`;

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => Array.from(root.querySelectorAll(s));
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let uidSeq = 0;
const uid = (p) => p + (++uidSeq);

/* ---------------- icons & nav ---------------- */
const icons = {
  home: 'M3 10 12 3l9 7M5 9v12h5v-7h4v7h5V9',
  badge: 'M12 3l7 4v10l-7 4-7-4V7ZM9 12l2 2 4-4',
  /* 嗜睡发作：一个下坠的"困"符号（月亮 + 下沉箭头） */
  moon: 'M20 14.5A8 8 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5ZM4 20l4-4M8 20l-4-4',
  /* 夜间睡眠：床 + 星 */
  bed: 'M3 18v-7h13a4 4 0 0 1 4 4v3M3 18h18M3 18v2m18-2v2M7 11V8m0 0a2 2 0 1 1 0-.1',
  /* 量表：清单 */
  list: 'M8 6h12M8 12h12M8 18h12M3.5 6h.01M3.5 12h.01M3.5 18h.01',
  /* 用药：胶囊 */
  pill: 'M10.5 20.5 3.5 13.5a5 5 0 0 1 7-7l7 7a5 5 0 0 1-7 7ZM7 10l7 7',
  /* 指标：折线 + 轴 */
  chart: 'M4 3v17h17M7 14l4-5 4 3 5-7',
  /* 办事与材料：文件夹 */
  folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z',
  /* 复诊准备：日历 */
  calendar: 'M4 5h16v16H4ZM8 3v4m8-4v4M4 10h16m-12 4h2m4 0h2m-8 3h2',
  /* 确诊档案：文件 + 勾 */
  report: 'M6 3h9l4 4v14H6ZM14 3v5h5M9 13l2 2 4-4'
};
const ICON_ALIAS = { dashboard: 'home', diagnosis: 'report', naps: 'moon', night: 'bed', ess: 'list', meds: 'pill', metrics: 'chart', admin: 'folder', visit: 'calendar' };
const icon = (k) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${icons[ICON_ALIAS[k]] || icons[k] || icons.badge}"/></svg>`;

/* 9 个一级页，key 与 docs/INTERACTION-DESIGN.md §1 表格逐字一致（IP3） */
const PAGES = [
  ['dashboard', '看板', 'home'], ['diagnosis', '确诊档案', 'report'], ['naps', '嗜睡发作', 'moon'],
  ['night', '夜间睡眠', 'bed'], ['ess', '量表 ESS', 'list'], ['meds', '用药与耐受', 'pill'],
  ['metrics', '检查与指标', 'chart'], ['admin', '办事与材料', 'folder'], ['visit', '复诊准备', 'calendar']
];
const SUBPAGES = {
  dashboard: ['今日概览', '本周发作', '待办与问题'],
  diagnosis: ['诊断原文', '检查原文', '时间线'],
  naps: ['记录发作', '时段聚合', '情境分布'],
  night: ['睡眠日志', '瘫痪与幻觉', '觉醒统计'],
  ess: ['本次填写', '历史序列', '分项'],
  meds: ['当前方案', '换药历史', '耐受记录'],
  metrics: ['指标列表', '趋势', '数据口径'],
  admin: ['材料清单', '导出', '说明'],
  visit: ['问题清单', '带什么', '记录回顾']
};
const SUBTITLES = {
  dashboard: '发作、夜间、量表与用药放在一起，让下一次门诊有据可查。',
  diagnosis: '诊断与检查只存医生原文与日期，工作台不替你重判分型、不解释检查结果。',
  naps: '一次发作一行：时间、情境、时长、前驱。时长为空是"没记"，不是 0 分钟。',
  night: '夜里的觉醒、瘫痪、幻觉各记一条；只记事实，不推断原因。',
  ess: 'ESS 按整次填：8 项各自选，总分由系统相加，工作台不估算也不解释分数。',
  meds: '换药是新增一行、旧方案留着；剂量只存处方原文，不给增减建议。',
  metrics: '数值只存测到的值和它自己的参考范围；缺参考上限就写"需参考上限"，不借别人的。',
  admin: '办事材料按清单准备；导出默认不含私密条目，也不生成"符合某标准"的表述。',
  visit: '复诊前把想问的、要带的、这段时间的变化放一页；问题是你问，不是替你问。'
};

/* ---------------- data ---------------- */
const D = window.DEMO_DATA;
const ESS_ITEMS = window.ESS_ITEMS;
const PROFILES = D.profiles;
const NAPS = D.naps;
const NIGHTS = D.nights;
const ESS = D.ess;
const MEDS = D.meds;
const TOL = D.tolerance;
const METRICS = D.metrics;
const QUESTIONS = D.questions;
const VIEWPOINTS = D.viewpoints;
const EVENTS = D.events;
const TASKS = D.tasks;

const state = {
  view: (location.hash.slice(1) || 'dashboard'),
  sub: {},
  profile: 'A',
  agentOpen: false,
  agentSize: 'std',
  sel: ['weight', 'spo2_rest'],  // 默认只选「有两次以上记录」的指标；ess_total / nap_duration 是派生口径，在这里没有原始点
  range: '90',
  privateOpen: false,
  essDraft: {},
  essStep: 0,
  napDraft: null
};
if (!PAGES.some((p) => p[0] === state.view)) state.view = 'dashboard';

/* 深链接 `#view/sub`：二级 tab 也能直接用 URL 定位（走查与无头断言都靠它）。
   解析失败就退回该页第一个二级，不报错、不空白。 */
function hashParts() {
  const raw = location.hash.slice(1);
  const [v, s] = raw.split('/');
  const view = PAGES.some((p) => p[0] === v) ? v : 'dashboard';
  const n = s == null ? 0 : parseInt(s, 10);
  const sub = Number.isInteger(n) && n >= 0 && n < SUBPAGES[view].length ? n : 0;
  return { view, sub };
}
state.view = hashParts().view;
state.sub[state.view] = hashParts().sub;

const P = () => PROFILES[state.profile];
const essTotal = (rec) => rec.q.reduce((a, b) => a + b, 0);
const NOW = '2026-10-25';
const daysAgo = (d) => Math.round((Date.parse(NOW) - Date.parse(d)) / 86400000);
const shortDate = (d) => String(d).slice(5).replace('-', '.');
const fmtDate = (d) => String(d ?? '').slice(0, 10);

/* ---------------- 小工具 ---------------- */
const pill = (t, c = '') => `<span class="pill ${c}">${esc(t)}</span>`;
const row = (b, p, right = '') => `<div class="row"><div class="row-main"><div><b>${b}</b>${p ? `<p>${p}</p>` : ''}</div></div>${right ? `<div class="row-right">${right}</div>` : ''}</div>`;
const emptyBox = (h, p) => `<div class="empty"><h3>${esc(h)}</h3><p>${esc(p)}</p></div>`;
const notice = (html, kind = '') => `<div class="notice ${kind}">${html}</div>`;
const secTitle = (title, extra = '') => `<div class="section-title"><h2>${esc(title)}</h2>${extra}</div>`;
const pageHead = (sub) => {
  const cur = state.sub[state.view] || 0;
  return `<div class="page-head"><div><span class="eyebrow">${esc(SUBTITLES[state.view] ? '小睡宝 · ' + (PAGES.find((p) => p[0] === state.view)[1]) : '')}</span>
    <h1>${esc(PAGES.find((p) => p[0] === state.view)[1])}</h1><p>${esc(SUBTITLES[state.view])}</p></div></div>
  <div class="subnav" role="tablist" aria-label="二级页">${SUBPAGES[state.view].map((s, i) => `<button role="tab" aria-selected="${cur === i}" data-sub="${i}">${esc(s)}</button>`).join('')}</div>`;
};
/* AI 草稿入口：data-action 统一走 `<实体>:agent-draft`（ZERO-TO-DEV 1.4 合同） */
const agentDraftBtn = (entity, label = '让 AI 帮我整理一条草稿') =>
  `<button class="soft" data-action="${entity}:agent-draft">${esc(label)}</button>`;

/* ---------------- 图表（Fritsch–Carlson 单调三次插值） ---------------- */
const CW = 980, CH = 340, CX0 = 58, CX1 = 940, CY0 = 34, CY1 = 288;
function smoothPath(coords) {
  if (coords.length < 2) return '';
  const n = coords.length;
  const dx = [], m = [];
  for (let i = 0; i < n - 1; i += 1) dx.push(coords[i + 1].x - coords[i].x || 1e-6);
  const slope = coords.map((c, i) => (i === 0 || i === n - 1) ? 0 : (coords[i + 1].y - coords[i - 1].y) / (dx[i - 1] + dx[i]));
  m[0] = 0; m[n - 1] = 0;
  for (let i = 1; i < n - 1; i += 1) {
    const s0 = slope[i], s1 = slope[i];
    m[i] = s0 * s1 <= 0 ? 0 : s0;
  }
  /* Fritsch–Carlson 限幅：相邻两点斜率的加权调和均值，防止过冲 */
  for (let i = 0; i < n - 1; i += 1) {
    const s = (coords[i + 1].y - coords[i].y) / dx[i];
    if (s === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / s, b = m[i + 1] / s;
    const h = Math.hypot(a, b);
    if (h > 3) { const t = 3 / h; m[i] = t * a * s; m[i + 1] = t * b * s; }
  }
  let d = `M ${coords[0].x.toFixed(1)} ${coords[0].y.toFixed(1)}`;
  for (let i = 0; i < n - 1; i += 1) {
    const h = dx[i] / 3;
    d += ` C ${(coords[i].x + h).toFixed(1)} ${(coords[i].y + m[i] * h).toFixed(1)}, ${(coords[i + 1].x - h).toFixed(1)} ${(coords[i + 1].y - m[i + 1] * h).toFixed(1)}, ${coords[i + 1].x.toFixed(1)} ${coords[i + 1].y.toFixed(1)}`;
  }
  return d;
}

function essSeries() {
  return ESS[state.profile].map((r) => ({ d: r.at, v: essTotal(r) }));
}
function napsByDay() {
  const map = {};
  for (const n of NAPS[state.profile]) {
    const day = n.at.slice(0, 10);
    map[day] = (map[day] || 0) + 1;
  }
  return map;
}
function napBuckets() {
  const h = new Array(24).fill(0);
  for (const n of NAPS[state.profile]) h[+n.at.slice(11, 13)] += 1;
  return h;
}
function nightByKind(kind) {
  return NIGHTS[state.profile].filter((n) => n.kind === kind);
}
const NIGHT_LABEL = { awakening: '夜间觉醒', sleep_paralysis: '睡眠瘫痪', hallucination: '入睡幻觉', vivid_dream: '生动梦境' };
const NIGHT_PILL = { awakening: 'grey', sleep_paralysis: 'violet', hallucination: 'amber', vivid_dream: 'green' };

function chartSVG(series, opts = {}) {
  const pts = series.pts || [];
  if (!pts.length) {
    return `<div class="empty"><h3>${esc(opts.emptyTitle || '这个时间窗里没有记录')}</h3><p>${esc(opts.emptyHint || '去前一页记一条，或把时间范围放宽；空图不代表没事。')}</p></div>`;
  }
  const vals = pts.map((p) => p.v);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (hi === lo) { hi = lo + (opts.minSpan || 1); }
  const t0 = Date.parse(pts[0].d), t1 = Date.parse(pts[pts.length - 1].d);
  const span = Math.max(1, t1 - t0);
  const xOf = (t) => CX0 + ((t - t0) / span) * (CX1 - CX0);
  const yOf = (v) => CY1 - ((v - lo) / (hi - lo)) * (CY1 - CY0);
  const coords = pts.map((p) => ({ x: xOf(Date.parse(p.d)), y: yOf(p.v) }));
  const path = pts.length > 1 ? `<path class="line" d="${smoothPath(coords)}" stroke="${opts.color || '#5b67d8'}" pathLength="1"/>` : '';
  const grid = [0, 1, 2, 3].map((i) => { const y = CY0 + i * (CY1 - CY0) / 3; return `<line class="grid" x1="${CX0}" x2="${CX1}" y1="${y}" y2="${y}"/>`; }).join('');
  const dots = coords.map((c, i) => `<circle class="pt" cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="${i === coords.length - 1 ? 5 : 3.6}" fill="${opts.color || '#5b67d8'}"/>`).join('');
  const ticks = coords.map((c, i) => (i === 0 || i === coords.length - 1 || i % Math.max(1, Math.floor(coords.length / 4)) === 0)
    ? `<text class="tick" x="${c.x.toFixed(1)}" y="${CY1 + 18}" text-anchor="middle">${esc(shortDate(pts[i].d))}</text>` : '').join('');
  const lastPos = coords[coords.length - 1];
  const label = `<text class="delta-tag" x="${(lastPos.x - 8).toFixed(1)}" y="${(lastPos.y - 10).toFixed(1)}" text-anchor="end" fill="${opts.color || '#5b67d8'}">${esc(String(pts[pts.length - 1].v))}${esc(opts.unit || '')}</text>`;
  return `<div class="chart-wrap"><svg class="chart" viewBox="0 0 ${CW} ${CH}" role="img" aria-label="${esc(opts.label || '时序图')}">
    ${grid}${ticks}
    <text class="tick" x="${CX0 - 46}" y="${CY0 + 4}">${esc(String(hi))}</text>
    <text class="tick" x="${CX0 - 46}" y="${CY1 + 4}">${esc(String(lo))}</text>
    ${path}${dots}${label}
  </svg></div>${opts.foot ? `<p class="small-note">${opts.foot}</p>` : ''}`;
}

const sparkline = (points) => {
  const vals = points.map((p) => p.v);
  if (vals.length < 2) return '';
  const lo = Math.min(...vals), hi = Math.max(...vals), span = hi - lo || 1;
  const coords = points.map((p, i) => ({ x: 4 + i * (192 / Math.max(1, points.length - 1)), y: 30 - ((p.v - lo) / span) * 26 }));
  return `<div class="spark"><svg viewBox="0 0 200 34" aria-hidden="true"><path d="${smoothPath(coords)}" fill="none" stroke="#8f97e6" stroke-width="1.8"/></svg></div>`;
};

/* ================= 视图：看板 ================= */
function vDashboard() {
  const p = P(), sub = state.sub.dashboard || 0;
  if (sub === 0) return vDashToday(p);
  if (sub === 1) return vDashWeek(p);
  return vDashTodo(p);
}
function vDashToday(p) {
  const naps = NAPS[state.profile];
  const week = naps.filter((n) => daysAgo(n.at.slice(0, 10)) <= 7);
  const ess = ESS[state.profile];
  const lastEss = ess[ess.length - 1];
  const total = lastEss ? essTotal(lastEss) : null;
  const curMeds = MEDS[state.profile].filter((m) => !m.end);
  return `${pageHead()}
  <div class="hero"><div class="avatar-big" aria-hidden="true">${esc(p.initial)}</div>
    <div class="hero-main"><h2>${esc(p.name)}，${esc(p.meta)}</h2>
      <p>${esc(p.headline)}</p>
      <div class="chips" style="margin-top:10px">
        ${pill('近 7 天 ' + week.length + ' 次发作', 'violet')}
        ${lastEss ? pill('上次 ESS ' + total + ' 分（' + shortDate(lastEss.at) + '）', 'grey') : pill('还没有 ESS 记录', 'rose')}
        ${curMeds.length ? pill('在用 ' + curMeds.map((m) => m.name).join(' / '), 'green') : pill('当前无在用药记录', 'grey')}
        ${p.proxied ? pill('家长代记', 'amber') : ''}
      </div>
    </div>
  </div>
  ${secTitle('今天可以做的事')}
  <div class="task-grid">${TASKS[state.profile].map((t) => `<button class="task" data-action="${esc(t.action)}">
    <span class="task-icon">${icon(t.key === 'nap' ? 'naps' : t.key === 'ess' ? 'ess' : t.key === 'visit' ? 'visit' : 'admin')}</span>
    <span class="task-main"><b>${esc(t.title)}</b><p>${esc(t.note)}</p></span>
    <span class="task-arrow" aria-hidden="true">→</span></button>`).join('')}</div>

  ${secTitle('最近发生了什么', `<button class="soft" data-action="go-diagnosis-timeline">看完整时间线</button>`)}
  <div class="grid side">
    <div class="card">${EVENTS[state.profile].slice(-4).reverse().map((e) => `${row(esc(e.label), esc(fmtDate(e.at) + ' · ' + (e.kind === 'med' ? '用药变更' : e.kind === 'exam' ? '检查' : e.kind === 'visit' ? '门诊' : '其他')), '')}`).join('')}</div>
    <div class="card">
      <div class="card-head"><h2>还没问的问题</h2><span class="card-note">${QUESTIONS[state.profile].filter((q) => !q.asked).length} 个</span></div>
      ${QUESTIONS[state.profile].filter((q) => !q.asked).slice(0, 3).map((q) => row(esc(q.body), esc(q.forVisit ? '计划在 ' + q.forVisit + ' 问' : '还没定哪次问'), '')).join('') || emptyBox('没有待问的问题', '想到什么就记一条；问不问、怎么问由你决定。')}
    </div>
  </div>
  ${notice(`<b>关于这份演示：</b>患者资料为构造的模拟数据，用于展示交互。临床试验线索本轮<b>尚未采集</b>（四通道均未运行，记「未查过」），因此本页不出现试验条数。`, 'plain')}`;
}
function vDashWeek(p) {
  const byDay = napsByDay();
  const days = Object.keys(byDay).sort();
  const max = Math.max(1, ...Object.values(byDay));
  const buckets = napBuckets();
  const bmax = Math.max(1, ...buckets);
  const total = NAPS[state.profile].length;
  return `${pageHead()}
  <div class="grid three">
    <div class="metric-card"><b>近 90 天发作</b><span class="val">${total}<em>次</em></span><span class="ref">按事件计，一次一行</span></div>
    <div class="metric-card"><b>有记录的发作日</b><span class="val">${days.length}<em>天</em></span><span class="ref">不是"应该发作"的天数</span></div>
    <div class="metric-card"><b>单次时长中位数</b><span class="val">${(() => { const v = NAPS[state.profile].filter((n) => n.min != null).map((n) => n.min).sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : '—'; })()}<em>分钟</em></span><span class="ref">${NAPS[state.profile].filter((n) => n.min == null).length} 次没记时长</span></div>
  </div>
  ${secTitle('按小时的分布', '<span class="card-note">只统计已记录的发作，不给"该注意哪时段"的建议</span>')}
  <div class="card">
    <div class="bars" role="img" aria-label="24 小时内各时段的发作次数柱状图">${buckets.map((v, h) => `<div class="bar-col"><div class="bar ${v === 0 ? 'zero' : ''}" style="height:${Math.max(2, (v / bmax) * 100)}%" title="${h} 点：${v} 次"></div>${h % 3 === 0 ? `<span class="bar-label">${h}</span>` : `<span class="bar-label">&nbsp;</span>`}</div>`).join('')}</div>
    <p class="small-note">横轴 0–23 点。某时段为 0 表示这段没记到，也可能是没记——两者在数据里分不开，所以不画趋势结论。</p>
  </div>
  ${secTitle('按天')}
  <div class="card"><div class="table-wrap"><table class="data"><thead><tr><th>日期</th><th class="num">次数</th><th>分布</th></tr></thead><tbody>
    ${days.slice(-14).reverse().map((d) => `<tr><td>${esc(d)}</td><td class="num">${byDay[d]}</td><td>${'▮'.repeat(byDay[d])}</td></tr>`).join('')}
  </tbody></table></div><p class="scroll-hint">显示最近 14 个有记录的日期</p></div>`;
}
function vDashTodo(p) {
  const qs = QUESTIONS[state.profile];
  return `${pageHead()}
  <div class="grid side">
    <div class="card">
      <div class="card-head"><h2>待办</h2>${agentDraftBtn('dashboard', '让 AI 帮我列这一周的待办')}</div>
      ${TASKS[state.profile].map((t) => row(esc(t.title), esc(t.note), `<button class="soft" data-action="${esc(t.action)}">去处理</button>`)).join('')}
    </div>
    <div class="card">
      <div class="card-head"><h2>问题清单</h2><span class="card-note">${qs.filter((q) => !q.asked).length} 个待问</span></div>
      ${qs.map((q) => row(esc(q.body), esc(q.asked ? '已问过 · ' + q.asked : (q.forVisit ? '计划 ' + q.forVisit : '没定哪次问')), q.asked ? pill('已问', 'green') : pill('待问', 'yellow'))).join('') || emptyBox('还没有记问题', '下次门诊前想到什么就先写下，不用组织语言。')}
    </div>
  </div>`;
}

/* ================= 视图：确诊档案 ================= */
function vDiagnosis() {
  const p = P(), sub = state.sub.diagnosis || 0;
  if (sub === 0) return `${pageHead()}
  <div class="grid side">
    <div class="card accent">
      <div class="card-head"><h2>诊断原文</h2>${pill('照抄，不改写', 'violet')}</div>
      <dl class="kv"><dt>诊断（医生原文）</dt><dd>${esc(p.dx)}</dd></dl>
      <dl class="kv"><dt>确诊日期</dt><dd>${esc(p.exam && p.exam.length ? '见检查原文' : '—')}</dd></dl>
      <dl class="kv"><dt>猝倒</dt><dd>${esc(p.cataplexy)}</dd></dl>
      <dl class="kv"><dt>起病时间（本人回忆）</dt><dd>${esc(p.onset)}</dd></dl>
      ${notice('分型（1 型 / 2 型）由医生按检查结果判定。工作台<b>不做推断</b>，也不根据症状列表帮你"判断是哪型"。', 'plain')}
    </div>
    <div class="card">
      <div class="card-head"><h2>我最在意的</h2></div>
      <p style="font-size:13px">${esc(p.psycho)}</p>
      ${notice('这句话是本人写的，不是医生结论，也不进任何导出（默认私密）。', 'private')}
    </div>
  </div>`;
  if (sub === 1) return `${pageHead()}
  ${p.exam.map((e) => `<div class="card" style="margin-bottom:12px"><div class="card-head"><h2>${esc(e.name)}</h2><span class="card-note">${esc(e.date)} · ${esc(e.place)}</span></div>
    <p style="font-size:13px">${esc(e.note)}</p>
    <div class="row" style="border-bottom:0;padding-top:10px"><div class="row-main"><p>原始报告文件存放在资料目录 imports/ 下；工作台不改动原文。</p></div><button class="soft" data-action="view-source">看原文出处</button></div></div>`).join('')}
  ${notice('检查结果怎么读，以医生解释为准。这里只存原文与日期，不生成"你的结果说明白不正常"这类判断。', 'plain')}`;
  return `${pageHead()}
  <div class="card"><div class="timeline">${EVENTS[state.profile].slice().reverse().map((e) => `<div class="tl-item done"><span class="tl-date">${esc(fmtDate(e.at))}</span><b>${esc(e.label)}</b><p>${esc(e.kind === 'med' ? '用药变更' : e.kind === 'exam' ? '检查' : e.kind === 'visit' ? '门诊' : '其它记录')}</p></div>`).join('')}</div></div>
  <p class="small-note">时间线把诊断、检查、用药变更、门诊按日期串起来；同名事件不合并，改了就是新增一条。</p>`;
}

/* ================= 视图：嗜睡发作 ================= */
function vNaps() {
  const sub = state.sub.naps || 0;
  const naps = NAPS[state.profile];
  if (sub === 0) {
    const recent = naps.slice(0, 12);
    return `${pageHead()}
    <div class="grid side">
      <div class="card">
        <div class="card-head"><h2>最近 12 次</h2><span class="card-note">共 ${naps.length} 次</span></div>
        <div class="table-wrap"><table class="data"><thead><tr><th>时间</th><th>情境</th><th class="num">时长</th><th>前驱</th><th>来源</th></tr></thead><tbody>
        ${recent.map((n) => `<tr><td>${esc(n.at.replace('T', ' '))}</td><td>${esc(n.context)}</td><td class="num">${n.min == null ? '<span class="muted">没记</span>' : n.min + ' 分'}</td><td>${esc(n.prodrome)}</td><td>${n.proxy ? pill('家长代记', 'amber') : '<span class="muted">本人记</span>'}</td></tr>`).join('')}
        </tbody></table></div>
        <p class="scroll-hint">时长"没记"与"0 分钟"是两件事，表里分开显示。</p>
      </div>
      <div class="card">
        <div class="card-head"><h2>记一条</h2></div>
        ${notice('对话里说"刚才三点半开会睡着了，大概二十分钟"，AI 会先给你一张<b>候选卡</b>；核对后才入库。', 'plain')}
        <div class="agent-draft"><div class="draft-actions">${agentDraftBtn('naps', '用 AI 记一条发作')}<button data-action="nap-manual">手工补一条</button></div></div>
        <p class="small-note">手工通道收敛在卡片「⋯ 更多」后面；本页显式入口只有这 2 个。</p>
      </div>
    </div>`;
  }
  if (sub === 1) {
    const buckets = napBuckets();
    const bmax = Math.max(1, ...buckets);
    const ctxCount = {};
    for (const n of naps) ctxCount[n.context] = (ctxCount[n.context] || 0) + 1;
    return `${pageHead()}
    <div class="card">
      <div class="card-head"><h2>时段聚合（按小时）</h2><span class="card-note">只统计已记录，共 ${naps.length} 次</span></div>
      <div class="bars" role="img" aria-label="各小时发作次数">${buckets.map((v, h) => `<div class="bar-col"><div class="bar ${v === 0 ? 'zero' : ''}" style="height:${Math.max(2, (v / bmax) * 100)}%"></div><span class="bar-label">${h % 2 === 0 ? h : '&nbsp;'}</span></div>`).join('')}</div>
      ${notice('这条曲线是<b>记录密度</b>，不是病情曲线：没记的时段和为 0 的时段长得一样。工作台不会据此告诉你"该避开哪段时间"。', 'warn')}
    </div>
    ${secTitle('按情境')}
    <div class="card"><div class="table-wrap"><table class="data"><thead><tr><th>情境</th><th class="num">次数</th><th class="num">占比</th></tr></thead><tbody>
      ${Object.entries(ctxCount).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<tr><td>${esc(k)}</td><td class="num">${v}</td><td class="num">${Math.round((v / naps.length) * 100)}%</td></tr>`).join('')}
    </tbody></table></div></div>`;
  }
  const ctxCount = {};
  for (const n of naps) ctxCount[n.context] = (ctxCount[n.context] || 0) + 1;
  const total = naps.length || 1;
  return `${pageHead()}
  <div class="grid two">
    ${Object.entries(ctxCount).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<div class="card">
      <div class="card-head"><h2>${esc(k)}</h2>${pill(v + ' 次', 'violet')}</div>
      <div class="progress"><i style="width:${Math.round((v / total) * 100)}%"></i></div>
      <p class="small-note">占全部记录的 ${Math.round((v / total) * 100)}%。情境由本人选择，选项固定为 7 个，不新增。</p></div>`).join('')}
  </div>
  ${notice('「情境」是发生时的场景标签，不是原因分析。工作台不会把"开会时睡着"解释成"你对会议有压力"。', 'plain')}`;
}

/* ================= 视图：夜间睡眠 ================= */
function vNight() {
  const sub = state.sub.night || 0;
  const nights = NIGHTS[state.profile];
  if (sub === 0) {
    return `${pageHead()}
    <div class="grid side">
      <div class="card">
        <div class="card-head"><h2>近期夜间记录</h2><span class="card-note">共 ${nights.length} 条</span></div>
        <div class="table-wrap"><table class="data"><thead><tr><th>时间</th><th>类型</th><th class="num">时长</th><th>备注</th></tr></thead><tbody>
        ${nights.slice(0, 12).map((n) => `<tr><td>${esc(n.at.replace('T', ' '))}</td><td>${pill(NIGHT_LABEL[n.kind], NIGHT_PILL[n.kind])}</td><td class="num">${n.min == null ? '<span class="muted">没记</span>' : n.min + ' 分'}</td><td>${esc(n.note || '—')}</td></tr>`).join('')}
        </tbody></table></div>
      </div>
      <div class="card">
        <div class="card-head"><h2>记一条夜间事件</h2></div>
        ${notice('"醒了但动不了"、"刚睡着就听到声音"这类经历很难事后描述清楚。先记下<b>时间 + 类型 + 大概多久</b>三样就够。', 'plain')}
        <div class="agent-draft"><div class="draft-actions">${agentDraftBtn('night', '用 AI 记一条夜间事件')}<button data-action="night-manual">手工补一条</button></div></div>
      </div>
    </div>`;
  }
  if (sub === 1) {
    const groups = ['sleep_paralysis', 'hallucination', 'vivid_dream'];
    return `${pageHead()}
    ${groups.map((k) => {
      const list = nightByKind(k);
      return `<div class="card" style="margin-bottom:12px"><div class="card-head"><h2>${esc(NIGHT_LABEL[k])}</h2><span class="card-note">${list.length} 条</span></div>
      ${list.length ? list.slice(0, 6).map((n) => row(esc(n.at.replace('T', ' ')), esc(n.min == null ? '时长没记' : '约 ' + n.min + ' 分钟'), '')).join('') : emptyBox('还没有这一类记录', '如果没发生过就是没有；不确定的类型可以先记下来标"待确认"。')}</div>`;
    }).join('')}
    ${notice('这些是<b>描述性记录</b>。工作台不判断"是不是发作性睡病的典型表现"，也不据此建议要不要加药。', 'plain')}`;
  }
  const byWeek = {};
  for (const n of nights) {
    const w = Math.floor(daysAgo(n.at.slice(0, 10)) / 7);
    byWeek[w] = (byWeek[w] || 0) + 1;
  }
  const weeks = Object.keys(byWeek).map(Number).sort((a, b) => b - a).slice(0, 12).reverse();
  const max = Math.max(1, ...weeks.map((w) => byWeek[w]));
  return `${pageHead()}
  <div class="grid three">
    <div class="metric-card"><b>夜间记录总数</b><span class="val">${nights.length}<em>条</em></span><span class="ref">90 天内</span></div>
    <div class="metric-card"><b>睡眠瘫痪</b><span class="val">${nightByKind('sleep_paralysis').length}<em>次</em></span><span class="ref">本人描述</span></div>
    <div class="metric-card"><b>入睡幻觉</b><span class="val">${nightByKind('hallucination').length}<em>次</em></span><span class="ref">本人描述</span></div>
  </div>
  ${secTitle('按周')}
  <div class="card"><div class="bars">${weeks.map((w) => `<div class="bar-col"><div class="bar" style="height:${Math.max(2, (byWeek[w] / max) * 100)}%"></div><span class="bar-label">W-${w}</span></div>`).join('')}</div>
  <p class="small-note">W-0 是最近 7 天。只统计已记录的事件。</p></div>`;
}

/* ================= 视图：量表 ESS ================= */
function vEss() {
  const sub = state.sub.ess || 0;
  const list = ESS[state.profile];
  if (sub === 0) {
    const draft = state.essDraft[state.profile] || {};
    const answered = Object.keys(draft).length;
    const canSubmit = answered === 8;
    return `${pageHead()}
    <div class="grid side">
      <div class="card">
        <div class="card-head"><h2>本次填写</h2><span class="card-note">已答 ${answered}/8</span></div>
        <div class="progress"><i style="width:${(answered / 8) * 100}%"></i></div>
        ${ESS_ITEMS.map((q, i) => `<div class="ess-item"><div class="ess-q"><span class="qno">Q${i + 1}</span><b>${esc(q)}</b></div>
          <div class="ess-opts">${[0, 1, 2, 3].map((v) => `<button data-action="ess-pick" data-i="${i}" data-v="${v}" aria-pressed="${draft[i] === v}">${esc(['不会犯困', '偶尔会', '有时会', '很可能'][v])}</button>`).join('')}</div></div>`).join('')}
        <div style="display:flex;gap:9px;margin-top:16px;flex-wrap:wrap">
          <button class="primary" data-action="ess-submit" ${canSubmit ? '' : 'disabled'}>提交这一次</button>
          <button data-action="ess-reset">清空重填</button>
        </div>
        ${canSubmit ? '' : `<p class="small-note">还差 ${8 - answered} 题。8 题都选完才能提交——半份量表不能算一次。</p>`}
      </div>
      <div class="card">
        <div class="card-head"><h2>为什么不能问 AI</h2></div>
        ${notice('ESS 的每一个选项都要<b>你自己选</b>。AI 不能替你估分、不能根据你的描述推一个分数——那不是记录，是造数据。', 'warn')}
        <p class="small-note">总分由系统把 8 项相加，任何人都不能手改总分。总分怎么解读，等门诊时问医生。</p>
        ${list.length ? `${secTitle('上次填的')}${row(esc(fmtDate(list[list.length - 1].at)), esc('总分 ' + essTotal(list[list.length - 1]) + ' 分'), pill(essTotal(list[list.length - 1]) >= 11 ? '已记录' : '已记录', 'grey'))}` : ''}
      </div>
    </div>`;
  }
  if (sub === 1) {
    const series = essSeries();
    return `${pageHead()}
    <div class="card">
      <div class="card-head"><h2>ESS 总分历史</h2><span class="card-note">${series.length} 次记录</span></div>
      ${chartSVG({ pts: series }, { label: 'ESS 总分随时间变化', color: '#5b67d8', unit: ' 分', minSpan: 4, foot: '每次一个点。点是"那次填的总分"，不是每天的分。总分由 8 项相加，界面上不提供手工改总分的入口。' })}
    </div>
    ${secTitle('每次记录')}
    <div class="card"><div class="table-wrap"><table class="data"><thead><tr><th>日期</th><th class="num">总分</th><th>填表人</th><th>备注</th></tr></thead><tbody>
      ${list.slice().reverse().map((r) => `<tr><td>${esc(fmtDate(r.at))}</td><td class="num">${essTotal(r)}</td><td>${r.proxy ? pill('家长代填', 'amber') : '本人'}</td><td>${esc(r.note || '—')}</td></tr>`).join('')}
    </tbody></table></div></div>`;
  }
  const last = list[list.length - 1];
  if (!last) return `${pageHead()}${emptyBox('还没有填过量表', '去「本次填写」做一次；或者在门诊候诊时用手机填。')}`;
  return `${pageHead()}
  <div class="card">
    <div class="card-head"><h2>分项（${esc(fmtDate(last.at))}，总分 ${essTotal(last)}）</h2><span class="card-note">8 项原始分 0–3</span></div>
    <div class="table-wrap"><table class="data"><thead><tr><th>题</th><th>情境</th><th class="num">选项</th><th class="num">分值</th></tr></thead><tbody>
      ${last.q.map((v, i) => `<tr><td>Q${i + 1}</td><td>${esc(ESS_ITEMS[i])}</td><td class="num">${esc(['不会犯困', '偶尔会', '有时会', '很可能'][v])}</td><td class="num">${v}</td></tr>`).join('')}
    </tbody></table></div>
    <p class="small-note">分项只用来回看"哪几题当时选得重"，不换算成任何结论。</p>
  </div>`;
}

/* ================= 视图：用药与耐受 ================= */
function vMeds() {
  const sub = state.sub.meds || 0;
  const list = MEDS[state.profile].slice().sort((a, b) => (a.start < b.start ? 1 : -1));
  if (sub === 0) {
    return `${pageHead()}
    <div class="grid side">
      <div class="card">
        <div class="card-head"><h2>用药记录（含已停）</h2><span class="card-note">${list.length} 条</span></div>
        ${list.map((m) => `<div class="row"><div class="row-main"><div><b>${esc(m.name)} · ${esc(m.dose)}</b>
          <p>${esc(m.start)} → ${m.end ? esc(m.end) : '至今'}${m.note ? ' · ' + esc(m.note) : ''}</p></div></div>
          <div class="row-right">${m.end ? pill('已停用', 'grey') : pill('在用', 'green')}${m.controlled ? pill('管制类', 'rose') : ''}</div></div>`).join('')}
      </div>
      <div class="card">
        <div class="card-head"><h2>记一次换药</h2></div>
        ${notice('换药是<b>新增一行</b>，旧方案保留。剂量只存处方上写的原文（例如"150 mg 早一次"），不帮你换算。', 'plain')}
        <div class="agent-draft"><div class="draft-actions">${agentDraftBtn('meds', '拍处方让 AI 整理')}<button data-action="med-manual">手工记一次换药</button></div></div>
        ${notice('管制类药品标记只表示"这个药属于管制目录"，用于提醒开药期限与出行带药；工作台<b>不给</b>用药、增减、停药任何建议。', 'plain')}
      </div>
    </div>`;
  }
  if (sub === 1) {
    return `${pageHead()}
    <div class="card"><div class="timeline">${list.slice().reverse().map((m) => `<div class="tl-item done"><span class="tl-date">${esc(m.start)}${m.end ? ' → ' + esc(m.end) : ' 起'}</span>
      <b>${esc(m.name)} · ${esc(m.dose)}</b><p>${esc(m.note || '处方原文记录')}</p></div>`).join('')}</div></div>
    <p class="small-note">换药时间线按处方开始日排。换药决定是医生的，工作台只记"什么时候换成了什么"。</p>`;
  }
  const tol = TOL[state.profile];
  return `${pageHead()}
  <div class="card">
    <div class="card-head"><h2>耐受记录</h2><span class="card-note">自评 0–3，不是分级</span></div>
    ${tol.length ? tol.slice().reverse().map((t) => row(esc(t.item), esc(fmtDate(t.at) + ' · ' + t.med), `<span class="num" style="font-weight:600">${t.value}</span>`)).join('') : emptyBox('还没有耐受记录', '吃完药难受、犯困、口干这类都可以记；记的是你的感受，不是医生给的分级。')}
    <p class="small-note">0–3 是<b>本人的主观打分</b>（0＝没有，3＝很难受），不是 CTCAE 分级，也不与任何临床分级换算。本仓不启用 CTCAE（见 docs/METRIC-GRADING.md）。</p>
  </div>
  <div class="agent-draft" style="display:flex;gap:9px;flex-wrap:wrap">${agentDraftBtn('meds', '用 AI 记一条耐受感受')}</div>`;
}

/* ================= 视图：检查与指标 ================= */
function metricCardA(m) {
  const pts = m.points || [];
  return `<div class="metric-card"><b>${esc(m.label)}</b><span class="val">${pts.length ? esc(pts[pts.length - 1].v) : '—'}<em>${esc(m.unit)}</em></span>
    <span class="ref">${m.refLow != null || m.refHigh != null ? '参考 ' + (m.refLow ?? '?') + '–' + (m.refHigh ?? '?') : '需参考上限'}</span>${pts.length > 1 ? sparkline(pts) : ''}</div>`;
}
function vMetrics() {
  const sub = state.sub.metrics || 0;
  const list = METRICS[state.profile];
  if (sub === 0) {
    return `${pageHead()}
    <div class="section-title"><h2>分组</h2><span class="card-note">只显示已记录的值</span></div>
    ${list.map((m) => `<div class="card" style="margin-bottom:12px"><div class="card-head"><h2>${esc(m.section)}</h2></div>
      <div class="grid three">${metricCardA(m)}</div></div>`).join('')}
    <div class="grid two" style="margin-top:12px">
      <div class="agent-draft"><div class="draft-actions">${agentDraftBtn('metrics', '粘一段化验单让 AI 整理')}<button data-action="metric-manual">手工加一条</button></div></div>
    </div>
    ${notice('数值只存"测到的值 + 这一项自己的参考范围"。缺参考上限时显示<b>需参考上限</b>，不拿别的病、别的人群的上限顶上。', 'plain')}`;
  }
  if (sub === 1) {
    const withPts = list.filter((m) => (m.points || []).length > 1);
    if (!withPts.length) return `${pageHead()}${emptyBox('还没有可画趋势的指标', '至少两次记录才能连成趋势；先记一次，下次再来。')}`;
    return `${pageHead()}
    <div class="chips" style="margin-bottom:14px">${withPts.map((m) => `<button class="chip" data-action="metric-pick" data-code="${esc(m.code)}" aria-pressed="${state.sel.includes(m.code)}">${esc(m.label)}</button>`).join('')}</div>
    ${withPts.filter((m) => state.sel.includes(m.code)).map((m) => `<div class="card" style="margin-bottom:12px">
      <div class="card-head"><h2>${esc(m.label)}</h2><span class="card-note">${m.refLow != null || m.refHigh != null ? '参考 ' + (m.refLow ?? '?') + '–' + (m.refHigh ?? '?') : '需参考上限'}</span></div>
      ${chartSVG({ pts: m.points }, { label: m.label + ' 趋势', unit: ' ' + m.unit, minSpan: 1, foot: '纵轴按这一项自己的最小–最大值归一化，不代表数值可与其他指标比较。' })}
    </div>`).join('') || emptyBox('没有选中指标', '上面勾一个指标就能看它的趋势。')}`;
  }
  return `${pageHead()}
  <div class="card">
    <div class="card-head"><h2>数据口径</h2></div>
    <div class="table-wrap"><table class="data"><thead><tr><th>项目</th><th>口径</th></tr></thead><tbody>
      <tr><td>ESS 总分</td><td>整次记录，8 项相加；不是每天一个点</td></tr>
      <tr><td>单次发作时长</td><td>时长型，可为空（NULL ≠ 0）；"没记"不参与中位数</td></tr>
      <tr><td>夜间觉醒次数</td><td>按事件计数，同一夜多次记多次</td></tr>
      <tr><td>参考范围</td><td>一项一个范围，只存报告上有的；缺失即"需参考上限"</td></tr>
      <tr><td>趋势图归一化</td><td>每项用自己的极值，横向可比时间、纵向不可比大小</td></tr>
    </tbody></table></div>
    ${notice('分类型记录（例如夜间事件类型）<b>不进趋势图</b>：给类别连线会暗示"程度"，那是编出来的。', 'plain')}
  </div>`;
}

/* ================= 视图：办事与材料 ================= */
function vAdmin() {
  const sub = state.sub.admin || 0;
  const qs = QUESTIONS[state.profile];
  if (sub === 0) {
    const items = ['诊断证明（医院开具）', '门诊病历复印件', '近 3 个月用药记录', 'ESS 量表记录', '单位要求的说明模板'];
    return `${pageHead()}
    <div class="grid side">
      <div class="card">
        <div class="card-head"><h2>材料清单</h2><span class="card-note">按用途分</span></div>
        ${items.map((t, i) => row(esc(t), esc(i < 3 ? '资料目录里已有原件' : i === 3 ? '可从「量表 ESS」导出' : '需要向医院索取'), i < 3 ? pill('有', 'green') : pill('待办', 'yellow'))).join('')}
      </div>
      <div class="card">
        <div class="card-head"><h2>注意</h2></div>
        ${notice('工作台<b>不生成</b>任何"符合某标准""建议批准"的表述。它只把你自己已有的记录整理成一页，剩下的由医院和单位判断。', 'warn')}
        <p class="small-note">导出默认<b>不含</b>标为私密的内容（我的看法、夜间细节等），要看清楚再导出。</p>
      </div>
    </div>`;
  }
  if (sub === 1) {
    return `${pageHead()}
    <div class="card">
      <div class="card-head"><h2>导出内容预览</h2><span class="card-note">私密条目已排除</span></div>
      <div class="notice plain" style="font:12px/1.75 ui-monospace,SFMono-Regular,monospace;white-space:pre-wrap">${esc([
        '# 就诊用材料（演示导出）',
        '',
        '档案：' + P().name + '（' + P().meta + '）',
        '',
        '## 事实区（已核对）',
        '- 诊断：' + P().dx,
        '- 当前用药：' + (MEDS[state.profile].filter((m) => !m.end).map((m) => m.name + ' ' + m.dose).join('；') || '无记录'),
        '- ESS：' + (ESS[state.profile].length ? ESS[state.profile].slice(-3).map((r) => fmtDate(r.at) + ' ' + essTotal(r) + ' 分').join('，') : '无记录'),
        '',
        '## 想问的事（不是医生结论）',
        ...qs.filter((q) => !q.asked).map((q) => '- ' + q.body),
        '',
        '> 本文件由患者本人整理，不构成医疗建议；私密条目未包含。'
      ].join('\n'))}</div>
      <div style="display:flex;gap:9px;margin-top:14px;flex-wrap:wrap"><button class="primary" data-action="admin-export">保存到资料目录</button><button data-action="admin-copy">复制文本</button></div>
    </div>`;
  }
  return `${pageHead()}
  <div class="grid two">
    <div class="card"><div class="card-head"><h2>三类出口</h2></div>
      ${row('就诊导出', '给医生看的记录摘要；不含私密条目', pill('已实现', 'green'))}
      ${row('办事导出', '给单位/学校的材料；不生成结论性表述', pill('已实现', 'green'))}
      ${row('完整备份', '整库导出；含私密条目，需要二次确认', pill('骨架', 'yellow'))}
    </div>
    <div class="card"><div class="card-head"><h2>说明</h2></div>
      ${notice('导出在代码层过滤私密条目（<code>viewpoints.private = 1</code>），不是靠界面上藏起来。', 'plain')}
      <p class="small-note">本页演示为前端模拟；真实版由服务端按三出口白名单生成文件，并记录一条导出台账。</p>
    </div>
  </div>`;
}

/* ================= 视图：复诊准备 ================= */
function vVisit() {
  const sub = state.sub.visit || 0;
  const qs = QUESTIONS[state.profile];
  if (sub === 0) {
    const pending = qs.filter((q) => !q.asked);
    return `${pageHead()}
    <div class="grid side">
      <div class="card">
        <div class="card-head"><h2>问题清单</h2><span class="card-note">${pending.length} 个待问</span></div>
        ${qs.map((q, i) => `<div class="row"><div class="row-main"><div><b>${esc(q.body)}</b><p>${esc(q.asked ? '已问过 · ' + q.asked : (q.forVisit ? '计划在 ' + q.forVisit + ' 问' : '还没定哪次问'))}</p></div></div>
          <div class="row-right">${q.asked ? pill('已问', 'green') : `<button class="soft" data-action="ask-mark" data-i="${i}">标记已问</button>`}</div></div>`).join('') || emptyBox('还没有问题', '想问什么就先记一条，不用组织语言。')}
        <div style="margin-top:14px;display:flex;gap:9px;flex-wrap:wrap"><button data-action="add-question">记一条新问题</button>${agentDraftBtn('visit', '让 AI 帮我整理成问题')}</div>
      </div>
      <div class="card">
        <div class="card-head"><h2>红线</h2></div>
        ${notice('工作台<b>不生成</b>"医生会怎么答"。它只帮你把问题按顺序排好，答案在门诊里。', 'warn')}
        ${notice('"能不能开车"这类问题，工作台只帮你<b>记住去问</b>，不给结论。', 'plain')}
      </div>
    </div>`;
  }
  if (sub === 1) {
    const curMeds = MEDS[state.profile].filter((m) => !m.end);
    return `${pageHead()}
    <div class="grid two">
      <div class="card"><div class="card-head"><h2>带什么</h2></div>
        ${row('当前用药清单', esc(curMeds.map((m) => m.name + ' ' + m.dose).join('；') || '无记录'), pill('可导出', 'green'))}
        ${row('量表记录', esc(ESS[state.profile].length + ' 次，最近 ' + (ESS[state.profile].length ? fmtDate(ESS[state.profile].slice(-1)[0].at) : '—')), pill('可导出', 'green'))}
        ${row('发作汇总', esc(NAPS[state.profile].length + ' 次记录'), pill('可导出', 'green'))}
        ${row('原始报告', esc(P().exam.length + ' 份（PSG / MSLT 等）'), pill('在资料目录', 'grey'))}
      </div>
      <div class="card"><div class="card-head"><h2>这三个月的变化</h2></div>
        ${row('ESS 总分', esc(ESS[state.profile].length ? essTotal(ESS[state.profile][0]) + ' → ' + essTotal(ESS[state.profile].slice(-1)[0]) + ' 分' : '无记录'), '')}
        ${row('发作记录', esc(NAPS[state.profile].length + ' 次'), '')}
        ${row('用药变更', esc(MEDS[state.profile].length + ' 条记录'), '')}
        <p class="small-note">只陈述数字与日期，不写"好转/加重"。判断留给医生。</p>
      </div>
    </div>`;
  }
  const views = VIEWPOINTS[state.profile];
  const open = state.privateOpen;
  return `${pageHead()}
  <div class="card">
    <div class="card-head"><h2>我的看法（私密）</h2>${pill('默认不进导出', 'violet')}</div>
    ${open ? views.map((v) => row(esc(v.body), esc(fmtDate(v.at) + ' · 本人写的，不是医生结论'), '')).join('') : `<div class="empty"><h3>内容已折叠</h3><p>这里放的是本人写下的感受，默认折叠、默认不进导出。</p>
      <button class="soft" data-action="toggle-private" style="margin-top:12px">本人确认，展开查看</button></div>`}
    ${open ? `<button data-action="toggle-private" style="margin-top:12px">收起</button>` : ''}
  </div>
  ${secTitle('记录回顾')}
  <div class="card">
    ${row('近 90 天', esc(NAPS[state.profile].length + ' 次发作 · ' + NIGHTS[state.profile].length + ' 条夜间记录'), '')}
    ${row('量表', esc(ESS[state.profile].length + ' 次（整次记录）'), '')}
    ${row('用药', esc(MEDS[state.profile].length + ' 条（含已停用）'), '')}
    <div style="margin-top:12px">${agentDraftBtn('visit', '让 AI 把这三个月整理成一页')}</div>
  </div>`;
}

const VIEWS = {
  dashboard: vDashboard, diagnosis: vDiagnosis, naps: vNaps, night: vNight,
  ess: vEss, meds: vMeds, metrics: vMetrics, admin: vAdmin, visit: vVisit
};

/* ---------------- agent dock ---------------- */
const AGENT_TIPS = {
  dashboard: '可以问我："这周发作都在什么时候？"我会先把记录列出来，不给建议。',
  diagnosis: '可以问我："把诊断原文念一遍。"我不会解释结果的含义。',
  naps: '可以问我："刚才三点半开会睡着了大概二十分钟，帮我记一条。"我会先给你候选卡。',
  night: '可以问我："昨晚两点醒了动不了，大概一分钟。"我会记成一条夜间事件。',
  ess: '量表不能让我估分。8 题需要你自己选。',
  meds: '可以问我："帮我记一下今天换成了阿莫达非尼 150 mg。"我不会建议增减。',
  metrics: '可以问我："这几项里哪几个我记了两次以上？"',
  admin: '可以问我："单位要病情说明，我需要准备哪些？"我只列清单，不写证明内容。',
  visit: '可以问我："帮我把想问的按顺序排一下。"答案我不编。'
};
function renderAgent() {
  const dock = $('#agent-dock'), grid = $('#work-grid'), toggle = $('#agent-toggle');
  if (!dock) return;
  dock.hidden = !state.agentOpen;
  grid.classList.toggle('with-agent', state.agentOpen);
  $('#agent-body').innerHTML = `<div class="msg bot"><p>${esc(AGENT_TIPS[state.view] || '')}</p><p class="msg-note">演示状态：这个面板不会真的调用模型。真实版接宿主原生会话。</p></div>`;
  $$('.agent-sizes button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.size === state.agentSize)));
  const w = state.agentSize === 'narrow' ? '26%' : state.agentSize === 'wide' ? '46%' : '35%';
  grid.style.setProperty('--agent-w', w);
  toggle.setAttribute('aria-expanded', String(state.agentOpen));
  $('#agent-state').textContent = state.agentOpen ? '已打开' : '未进入激活';
}

/* ---------------- dialog / toast ---------------- */
let toastTimer = null;
function toast(msg, actionHtml = '') {
  const el = $('#toast');
  el.innerHTML = esc(msg) + actionHtml;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 4200);
}
function openDialog(eyebrow, title, body, foot) {
  $('#dialog-eyebrow').textContent = eyebrow;
  $('#dialog-title').textContent = title;
  $('#dialog-body').innerHTML = body;
  $('#dialog-foot').innerHTML = foot || '<button class="primary" data-action="close">关闭</button>';
  const d = $('#dialog');
  if (typeof d.showModal === 'function') d.showModal(); else d.setAttribute('open', '');
}
function closeDialog() {
  const d = $('#dialog');
  if (typeof d.close === 'function') d.close(); else d.removeAttribute('open');
}

/* ---------------- 各 dialog ---------------- */
function dlgProfiles() {
  openDialog('小睡宝', '切换演示档案', `<div class="grid two">${Object.entries(PROFILES).map(([k, p]) => `<button class="task" data-action="pick-profile" data-p="${k}">
    <span class="task-icon" aria-hidden="true">${esc(p.initial)}</span><span class="task-main"><b>${esc(p.name)} · ${esc(p.age)} 岁</b><p>${esc(p.meta)}</p></span></button>`).join('')}</div>
    <p class="small-note">两个档案都是构造的模拟数据。B 档案是家长代记：每条记录会带「家长代记」标记。</p>`, '<button data-action="close">取消</button>');
}
function dlgSettings() {
  openDialog('小睡宝', '设置', `<div class="notice">演示版不读写真实目录。真实版在这里配置：工作区目录、文档解析（MinerU 未接入）、临床数据库。</div>
    <div class="card" style="margin-top:12px"><h3>工作区</h3><p class="small-note">资料目录：<code>~/narcolepsy-workbench/data</code>（演示）</p></div>
    <div class="card" style="margin-top:12px"><h3>文档解析</h3><p class="small-note">MinerU：<b>本轮不接入</b>（docs/DEV-REQUIREMENTS §五默认值③）。没有 Token 也能用工作台，只是不能自动解析 PDF。</p></div>
    <div class="card" style="margin-top:12px"><h3>临床数据库</h3><p class="small-note">2026 临床试验：<b>尚未采集</b>。四通道（ictrp / ctv / chictr_online / chinadrugtrials）均未运行，记「未查过」；本版界面不出现试验条数。</p></div>`,
    '<button class="primary" data-action="close">完成</button>');
}
function dlgAbout() {
  openDialog('小睡宝', '关于', `<div class="card"><div class="card-head"><h2>小睡宝 SnoozePal</h2>${pill(APP_INFO.channelLabel, 'violet')}</div>
    <dl class="kv"><dt>版本</dt><dd>${esc(APP_INFO.displayVersion)}</dd></dl>
    <dl class="kv"><dt>构建</dt><dd>${esc(APP_INFO.build)}</dd></dl>
    <dl class="kv"><dt>形态</dt><dd>交互原型（单机多文件）· 全部患者数据为模拟</dd></dl>
    <dl class="kv"><dt>临床数据</dt><dd>指南原件未取得（G1 只登记）；试验四通道未运行（记「未查过」）</dd></dl>
    <dl class="kv"><dt>家族</dt><dd>小 X 宝家族 · SnoozePal 小睡宝</dd></dl></div>`,
    '<button class="primary" data-action="close">关闭</button>');
}
function dlgHelp() {
  openDialog('小睡宝', '原型操作说明', `<div class="notice">顶栏「AI 对话」打开右侧<b>原生会话挂载位</b>（可 × 隐藏、窄/标准/宽三档）。演示版不调用模型。</div>
    <div class="notice" style="margin-top:12px">左侧 9 个一级页：看板 / 确诊档案 / 嗜睡发作 / 夜间睡眠 / 量表 ESS / 用药与耐受 / 检查与指标 / 办事与材料 / 复诊准备。每页 3 个二级 tab。</div>
    <div class="notice" style="margin-top:12px">左上角头像可切换<b>两个演示档案</b>：陈默（27 岁 · 伴猝倒 · 换过一次药）、李知远（15 岁 · 初中生 · 家长代记）。</div>
    <div class="notice" style="margin-top:12px"><b>三条红线</b>：ESS 不让 AI 估分；驾驶只记事实不给结论；私密条目默认折叠且不进导出。</div>`,
    '<button class="primary" data-action="close">知道了</button>');
}

function dlgNapManual() {
  openDialog('小睡宝', '手工补一条发作', `<label class="field"><span class="form-label">什么时候</span><input type="datetime-local" id="nap-at" value="2026-10-25T15:30"></label>
    <label class="field"><span class="form-label">什么情境</span><select id="nap-ctx">${['开会', '开车', '吃饭', '静坐', '阅读', '通勤', '其他'].map((c) => `<option>${c}</option>`).join('')}</select></label>
    <label class="field"><span class="form-label">大概多久（分钟，不知道就留空）</span><input type="number" id="nap-min" min="0" max="600" inputmode="numeric" placeholder="留空 = 没记"></label>
    <label class="field"><span class="form-label">睡着前有没有预感</span><select id="nap-prod"><option>有</option><option>无</option><option>未记录</option></select></label>
    <p class="small-note">4 个字段。留空表示"没记"，不是 0 分钟——数据层两者分开存。</p>`,
    '<button data-action="close">取消</button><button class="primary" data-action="nap-save">保存这一条</button>');
}
function dlgNapCandidate(cand) {
  openDialog('小睡宝', '核对这一条（候选）', `<div class="notice warn">这是 AI 从你的话里整理出的<b>候选</b>。核对之前不会入库；拒收就什么都不发生。</div>
    <div class="cand" style="margin-top:12px"><div class="cand-head">候选字段</div><ul>
      <li><span>时间</span><span>${esc(cand.at.replace('T', ' '))}</span></li>
      <li><span>情境</span><span>${esc(cand.context)}</span></li>
      <li><span>时长</span><span>${cand.min == null ? '没识别出（可留空）' : cand.min + ' 分钟'}</span></li>
      <li><span>前驱</span><span>${esc(cand.prodrome)}</span></li>
    </ul></div><p class="small-note">哪一项不对就点"改一下"，或直接拒收改用手工表单。</p>`,
    '<button data-action="close">拒收</button><button data-action="nap-confirm">确认入库</button>');
}
function dlgMedManual() {
  openDialog('小睡宝', '手工记一次换药', `<label class="field"><span class="form-label">药名</span><input id="med-name" placeholder="例如 阿莫达非尼"></label>
    <label class="field"><span class="form-label">剂量（处方原文）</span><input id="med-dose" placeholder="例如 150 mg 早一次"></label>
    <label class="field"><span class="form-label">开始日期</span><input type="date" id="med-start" value="2026-10-25"></label>
    <label class="field"><span class="form-label">是否管制类</span><select id="med-ctrl"><option value="0">否</option><option value="1">是</option></select></label>
    <p class="small-note">剂量照处方抄，不要自己换算或折算。旧方案不会被覆盖。</p>`,
    '<button data-action="close">取消</button><button class="primary" data-action="med-save">保存</button>');
}
function dlgNightManual() {
  openDialog('小睡宝', '手工补一条夜间事件', `<label class="field"><span class="form-label">时间</span><input type="datetime-local" id="nt-at" value="2026-10-25T02:00"></label>
    <label class="field"><span class="form-label">类型</span><select id="nt-kind"><option value="awakening">夜间觉醒</option><option value="sleep_paralysis">睡眠瘫痪</option><option value="hallucination">入睡幻觉</option><option value="vivid_dream">生动梦境</option></select></label>
    <label class="field"><span class="form-label">大概持续（分钟，可留空）</span><input type="number" id="nt-min" min="0" inputmode="numeric" placeholder="留空 = 没记"></label>
    <p class="small-note">3 个字段。类型说不清楚可以先选一个，备注里写"待确认"，不改就是不确定。</p>`,
    '<button data-action="close">取消</button><button class="primary" data-action="night-save">保存</button>');
}
function dlgQuestionAdd() {
  openDialog('小睡宝', '记一条新问题', `<label class="field"><span class="form-label">想问的事</span><textarea id="q-body" placeholder="想问什么就写什么，不用组织语言"></textarea></label>
    <p class="small-note">只记"我想问"。工作台不会生成"医生大概会怎么答"。</p>`,
    '<button data-action="close">取消</button><button class="primary" data-action="q-save">加入清单</button>');
}
function dlgMetricManual() {
  openDialog('小睡宝', '手工加一条指标', `<label class="field"><span class="form-label">指标名</span><input id="mt-label" placeholder="例如 静息 SpO₂"></label>
    <label class="field"><span class="form-label">数值</span><input id="mt-val" inputmode="decimal" placeholder="例如 97"></label>
    <label class="field"><span class="form-label">单位</span><input id="mt-unit" placeholder="例如 %"></label>
    <label class="field"><span class="form-label">参考下限（可留空）</span><input id="mt-lo" inputmode="decimal"></label>
    <label class="field"><span class="form-label">参考上限（可留空）</span><input id="mt-hi" inputmode="decimal"></label>
    <p class="small-note">5 个字段：本仓最多的手工表单。参考范围只在报告上有时才填，没有就留空。</p>`,
    '<button data-action="close">取消</button><button class="primary" data-action="mt-save">保存</button>');
}

/* ---------------- render ---------------- */
function render() {
  $('#nav').innerHTML = PAGES.map(([id, label, ic]) => `<button class="nav-button" data-nav="${id}" ${state.view === id ? 'aria-current="page"' : ''}>${icon(ic)}<span>${esc(label)}</span></button>`).join('');
  $('#breadcrumb').textContent = PAGES.find((x) => x[0] === state.view)[1];
  const p = P();
  $('#profile-name').textContent = `${p.name}的资料`;
  $('#profile-meta').textContent = `${p.age} 岁 · ${p.cataplexy === '有' ? '伴猝倒' : p.meta.split('·')[1] ? p.meta.split('·')[1].trim() : '—'}`;
  $('#profile-avatar').textContent = p.initial;
  $('#main').innerHTML = (VIEWS[state.view] || vDashboard)();
  renderAgent();
}

/* 演示用：把 AI 说的一句话解析成候选（真实版由宿主模型做，这里只是把"候选 → 核对"的链路走通） */
function draftNapFromText() {
  const base = { at: '2026-10-25T15:30', context: '开会', min: 20, prodrome: '未记录' };
  return base;
}

/* ---------------- events ---------------- */
document.addEventListener('click', (e) => {
  const nav = e.target.closest('[data-nav]');
  if (nav) { state.view = nav.dataset.nav; state.sub[state.view] = 0; state.privateOpen = false; location.hash = state.view + '/0'; render(); $('#main').focus({ preventScroll: true }); window.scrollTo(0, 0); return; }
  const sub = e.target.closest('[data-sub]');
  if (sub) { state.sub[state.view] = +sub.dataset.sub; state.privateOpen = false; location.hash = state.view + '/' + sub.dataset.sub; render(); return; }
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const act = el.dataset.action;

  /* 合同：`<实体>:agent-draft` 一律产出候选卡，不直接入库（ZERO-TO-DEV 1.4） */
  if (act.endsWith(':agent-draft')) {
    const entity = act.split(':')[0];
    state.agentOpen = true;
    if (entity === 'naps') { dlgNapCandidate(draftNapFromText()); return; }
    if (entity === 'ess') { toast('量表不让 AI 估分：8 题需要你自己选。'); return; }
    toast(`已把「${entity}」的整理请求放进会话区（演示：不调用模型）。真实版会返回候选卡，核对后才入库。`);
    renderAgent();
    return;
  }

  const map = {
    profiles: dlgProfiles, settings: dlgSettings, about: dlgAbout, help: dlgHelp,
    close: closeDialog,
    'open-store': () => toast('资料目录已激活（演示）'),
    agent: () => { state.agentOpen = !state.agentOpen; renderAgent(); },
    'agent-build': () => toast('已生成"本页要点"提示词（演示）：只包含已核对的事实，不含私密条目。'),
    'agent-demo': () => toast('模拟回复自检通过：未发现诊断性表述、未发现用药建议。'),
    'go-naps-add': () => { state.view = 'naps'; state.sub.naps = 0; location.hash = 'naps'; render(); },
    'go-ess-fill': () => { state.view = 'ess'; state.sub.ess = 0; location.hash = 'ess'; render(); },
    'go-visit': () => { state.view = 'visit'; state.sub.visit = 0; location.hash = 'visit'; render(); },
    'go-admin': () => { state.view = 'admin'; state.sub.admin = 0; location.hash = 'admin'; render(); },
    'go-diagnosis-timeline': () => { state.view = 'diagnosis'; state.sub.diagnosis = 2; location.hash = 'diagnosis'; render(); },
    'pick-profile': (node) => { state.profile = node.dataset.p; state.sel = ['weight']; state.privateOpen = false; state.essDraft = {}; closeDialog(); render(); toast(`已切换到 ${P().name} 的资料（演示）`); },
    'view-source': () => openDialog('小睡宝', '原文出处', `<p style="font-size:12.5px">原始报告存放在资料目录 <code>imports/</code> 下（演示）。</p><p class="small-note">工作台不改动原文，也不替你解释它。</p>`, '<button class="primary" data-action="close">关闭</button>'),
    'nap-manual': dlgNapManual,
    'nap-save': () => {
      const at = $('#nap-at').value || '2026-10-25T15:30';
      const min = $('#nap-min').value === '' ? null : +$('#nap-min').value;
      NAPS[state.profile].unshift({ at, context: $('#nap-ctx').value, min, prodrome: $('#nap-prod').value, proxy: state.profile === 'B' ? 1 : 0, note: '' });
      NAPS[state.profile].sort((a, b) => (a.at < b.at ? 1 : -1));
      closeDialog(); render(); toast('已保存这一条发作（演示：只在本页内存里，刷新重置）');
    },
    'nap-confirm': () => {
      const c = draftNapFromText();
      NAPS[state.profile].unshift({ ...c, proxy: state.profile === 'B' ? 1 : 0, note: '' });
      NAPS[state.profile].sort((a, b) => (a.at < b.at ? 1 : -1));
      closeDialog(); render(); toast('已确认入库：这次发作多了一条记录', '<button data-action="go-naps-add">去看</button>');
    },
    'night-manual': dlgNightManual,
    'night-save': () => {
      const at = $('#nt-at').value || '2026-10-25T02:00';
      const min = $('#nt-min').value === '' ? null : +$('#nt-min').value;
      NIGHTS[state.profile].unshift({ at, kind: $('#nt-kind').value, min, note: '手工补记' });
      NIGHTS[state.profile].sort((a, b) => (a.at < b.at ? 1 : -1));
      closeDialog(); render(); toast('已保存这条夜间事件');
    },
    'med-manual': dlgMedManual,
    'med-save': () => {
      const name = $('#med-name').value.trim(), dose = $('#med-dose').value.trim();
      if (!name || !dose) { toast('药名和剂量都要填；剂量照处方原文抄。'); return; }
      MEDS[state.profile].forEach((m) => { if (!m.end) m.end = $('#med-start').value; });
      MEDS[state.profile].push({ name, dose, start: $('#med-start').value, end: null, controlled: +$('#med-ctrl').value, ord: MEDS[state.profile].length + 1, note: '手工记录' });
      closeDialog(); render(); toast('已新增一条用药记录，旧方案保留');
    },
    'metric-manual': dlgMetricManual,
    'mt-save': () => {
      const label = $('#mt-label').value.trim(), v = $('#mt-val').value.trim();
      if (!label || v === '') { toast('指标名和数值都要填。'); return; }
      METRICS[state.profile].push({ code: 'm' + Date.now().toString(36), label, unit: $('#mt-unit').value.trim(), dec: 1, kind: 'numeric', section: '手工记录', refLow: $('#mt-lo').value === '' ? null : +$('#mt-lo').value, refHigh: $('#mt-hi').value === '' ? null : +$('#mt-hi').value, points: [{ d: '2026-10-25', v: +v }] });
      closeDialog(); render(); toast('已加一条指标；缺参考上限会显示「需参考上限」');
    },
    'ess-pick': (node) => {
      const d = state.essDraft[state.profile] || (state.essDraft[state.profile] = {});
      d[+node.dataset.i] = +node.dataset.v;
      render();
    },
    'ess-reset': () => { state.essDraft[state.profile] = {}; render(); },
    'ess-submit': () => {
      const d = state.essDraft[state.profile] || {};
      if (Object.keys(d).length !== 8) { toast('还差几题没选。'); return; }
      ESS[state.profile].push({ at: '2026-10-25', q: [0, 1, 2, 3, 4, 5, 6, 7].map((i) => d[i]), proxy: state.profile === 'B' ? 1 : 0, note: '本次填写' });
      state.essDraft[state.profile] = {}; state.sub.ess = 1; location.hash = 'ess/1'; render();
      toast('已提交：去「历史序列」看这一次');
    },
    'metric-pick': (node) => {
      const c = node.dataset.code;
      state.sel = state.sel.includes(c) ? state.sel.filter((x) => x !== c) : [...state.sel, c];
      render();
    },
    'add-question': dlgQuestionAdd,
    'q-save': () => {
      const b = $('#q-body').value.trim();
      if (!b) { toast('问题还是空的。'); return; }
      QUESTIONS[state.profile].push({ body: b, forVisit: null, asked: null });
      closeDialog(); render(); toast('已加入问题清单');
    },
    'ask-mark': (node) => { QUESTIONS[state.profile][+node.dataset.i].asked = '2026-10-25'; render(); toast('已标记为问过'); },
    'toggle-private': () => { state.privateOpen = !state.privateOpen; render(); },
    'admin-export': () => toast('已保存到资料目录 exports/（演示）；私密条目未包含。'),
    'admin-copy': () => toast('已复制到剪贴板（演示）。'),
    'agent-size': () => {}
  };
  if (act === 'agent-size') { state.agentSize = el.dataset.size; renderAgent(); return; }
  if (map[act]) map[act](el);
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && $('#dialog').open) closeDialog();
});
$('#font-toggle').addEventListener('click', () => { const on = document.body.classList.toggle('large'); $('#font-toggle').setAttribute('aria-pressed', String(on)); });
window.addEventListener('hashchange', () => {
  const { view, sub } = hashParts();
  if (view === state.view && sub === (state.sub[state.view] || 0)) return;
  state.view = view; state.sub[view] = sub; state.privateOpen = false; render();
});

render();
