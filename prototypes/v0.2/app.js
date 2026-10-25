/* 小睡宝 SnoozePal v0.1.0 — 交互原型
 *
 * 患者数据全部为模拟；不读写真实文件、不调用模型或宿主 API。
 * 临床试验条目是 data/trials/ 的**生成物**（demo-trials.js），不是手抄的数字。
 *
 * 本文件结构：
 *   1. 常量（APP_INFO / 图标 / 10 个一级页 / 30 个二级页）
 *   2. 数据（唯一来源 upwindow.DEMO_DATA + window.DEMO_TRIALS）
 *   3. 组件（指标卡 3D 翻转、一图秀、整页视图）—— 组件只有一份，看板与指标页共用
 *   4. 视图（10 页 × 3 二级）
 *   5. render / 事件委托
 */
(function () {
'use strict';

const APP_INFO = {
  version: '0.1.0',
  channel: 'prototype',
  channelLabel: '交互原型',
  build: '2026-10-25',
  displayVersion: 'v0.1.0'
};

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => Array.from(root.querySelectorAll(s));
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let uidSeq = 0;
const uid = (p) => p + (++uidSeq);
const num = (v, dec = 0) => (v == null || v === '' ? '—' : Number(v).toFixed(dec));

/* ================= 1. 图标与导航 ================= */
const icons = {
  home: 'M3 10 12 3l9 7M5 9v12h5v-7h4v7h5V9',
  badge: 'M12 3l7 4v10l-7 4-7-4V7ZM9 12l2 2 4-4',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5ZM4 20l4-4M8 20l-4-4',
  bed: 'M3 18v-7h13a4 4 0 0 1 4 4v3M3 18h18M3 18v2m18-2v2M7 11V8m0 0a2 2 0 1 1 0-.1',
  list: 'M8 6h12M8 12h12M8 18h12M3.5 6h.01M3.5 12h.01M3.5 18h.01',
  pill: 'M10.5 20.5 3.5 13.5a5 5 0 0 1 7-7l7 7a5 5 0 0 1-7 7ZM7 10l7 7',
  chart: 'M4 3v17h17M7 14l4-5 4 3 5-7',
  /* 临床试验：试管 + 放大镜 */
  trial: 'M9 3h6M10 3v6.2a5 5 0 1 0 4 0V3M15.5 16.5 20 21',
  folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z',
  calendar: 'M4 5h16v16H4ZM8 3v4m8-4v4M4 10h16m-12 4h2m4 0h2m-8 3h2',
  report: 'M6 3h9l4 4v14H6ZM14 3v5h5M9 13l2 2 4-4'
};
const icon = (k) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${icons[k] || icons.badge}"/></svg>`;

/* 10 个一级页，key 与 docs/INTERACTION-DESIGN.md §1 逐字一致（IP3）。
   trials 是新增的第 10 个：患者要知道"有没有在招的研究"，但工作台不做入排判定。 */
const PAGES = [
  ['dashboard', '看板', 'home'], ['diagnosis', '确诊档案', 'report'], ['naps', '嗜睡发作', 'moon'],
  ['night', '夜间睡眠', 'bed'], ['ess', '量表 ESS', 'list'], ['meds', '用药与耐受', 'pill'],
  ['metrics', '检查与指标', 'chart'], ['trials', '临床试验', 'trial'],
  ['admin', '办事与材料', 'folder'], ['visit', '复诊准备', 'calendar']
];

/* 30 个二级页：每一项 = [语义 slug, 中文名]。
   slug 进 URL（`#metrics/one`），中文名进界面 —— 评审 P0-4 就是因为只认数字下标，
   导致 `#visit/review` 静默落到第 0 个 tab。slug 与中文名同源，改一处两处一起变。 */
const SUBS = {
  dashboard: [['today', '今日概览'], ['week', '本周发作'], ['todo', '待办与问题']],
  diagnosis: [['text', '诊断原文'], ['exam', '检查原文'], ['timeline', '时间线']],
  naps: [['list', '记录发作'], ['bucket', '时段聚合'], ['context', '情境分布']],
  night: [['log', '睡眠日志'], ['events', '瘫痪与幻觉'], ['stats', '觉醒统计']],
  ess: [['fill', '本次填写'], ['history', '历史序列'], ['items', '分项']],
  meds: [['current', '当前方案'], ['switch', '换药历史'], ['tolerance', '耐受记录']],
  metrics: [['cards', '指标卡'], ['one', '一图秀'], ['rule', '数据口径']],
  trials: [['profile', '个人建档'], ['match', '匹配结果'], ['library', '试验库']],
  admin: [['docs', '材料清单'], ['export', '导出'], ['note', '说明']],
  visit: [['questions', '问题清单'], ['bring', '带什么'], ['review', '记录回顾']]
};
const SUBPAGES = Object.fromEntries(Object.entries(SUBS).map(([k, v]) => [k, v.map((s) => s[1])]));
const SUBTITLES = {
  dashboard: '发作、夜间、量表与用药放在一起，让下一次门诊有据可查。',
  diagnosis: '诊断与检查只存医生原文与日期，工作台不替你重判分型、不解释检查结果。',
  naps: '一次发作一行：时间、情境、时长、前驱。时长为空是"没记"，不是 0 分钟。',
  night: '夜里的觉醒、瘫痪、幻觉各记一条；只记事实，不推断原因。',
  ess: 'ESS 按整次填：8 项各自选，总分由系统相加，工作台不估算也不解释分数。',
  meds: '换药是新增一行、旧方案留着；剂量只存处方原文，不给增减建议。',
  metrics: '数值只存测到的值和它自己的参考范围；缺参考上限就写"需参考上限"，不借别人的。',
  trials: '登记库里有的（地区、招募状态、标题里的分型线索）才参与匹配；库内没有的字段单独列成缺口，不当 0 分。',
  admin: '办事材料按清单准备；导出默认不含私密条目，也不生成"符合某标准"的表述。',
  visit: '复诊前把想问的、要带的、这段时间的变化放一页；问题是你问，不是替你问。'
};

/* ================= 2. 数据 ================= */
const D = window.DEMO_DATA;
const T = window.DEMO_TRIALS || { trials: [], channels: [], capability: {}, total: 0, generatedAt: null };
const ESS_ITEMS = window.ESS_ITEMS;
const PROFILES = D.profiles;
const TRACKS = D.tracks;
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

const NOW = '2026-10-25';
const daysAgo = (d) => Math.round((Date.parse(NOW) - Date.parse(d)) / 86400000);
const shortDate = (d) => String(d).slice(5).replace('-', '.');
const fmtDate = (d) => String(d ?? '').slice(0, 10);
const essTotal = (rec) => rec.q.reduce((a, b) => a + b, 0);
const P = () => PROFILES[state.profile];

/* 生物标志建档（临床试验页的输入）：每项带**来源**与**未测**三态。
   这些字段来自本人/家长填的"我手上有哪些结果"，不是工作台推断出来的。 */
function bioProfile(profile) {
  const metrics = METRICS[profile];
  const get = (code) => (metrics.find((m) => m.code === code) || { points: [] });
  const last = (code) => {
    const pts = get(code).points;
    return pts.length ? pts[pts.length - 1] : { d: null, v: null };
  };
  const hla = last('hla_drb1'), ox = last('orexin_a'), mslt = last('mslt_latency');
  return {
    subtype: profile === 'A'
      ? { value: '1 型（医生诊断原文，含猝倒）', source: '诊断原文', known: true }
      : { value: '未写分型', source: '诊断原文只写"发作性睡病"', known: false },
    cataplexy: profile === 'A' ? { value: '有', source: '诊断原文', known: true } : { value: '无记录', source: '—', known: false },
    age: profile === 'A' ? { value: '27', source: '档案', known: true } : { value: '15', source: '档案', known: true },
    hla: { value: hla.v == null ? '未测' : hla.v, date: hla.d, source: hla.d ? '基因检测报告' : '—', known: hla.v != null && hla.v !== '未测' },
    orexin: { value: ox.v, date: ox.d, source: ox.d ? '腰穿报告' : '—', known: ox.v != null },
    mslt: { value: mslt.v, date: mslt.d, source: mslt.d ? 'MSLT 报告' : '—', known: mslt.v != null },
    region: { value: '中国大陆', source: '本人填', known: true },
    meds: { value: MEDS[profile].filter((m) => !m.end).map((m) => m.name).join(' / ') || '无记录', source: '用药记录', known: true }
  };
}

/* ================= 3. 状态 ================= */
function hashParts() {
  const raw = location.hash.slice(1);
  const [v, s] = raw.split('/');
  const view = PAGES.some((p) => p[0] === v) ? v : 'dashboard';
  const slugs = SUBS[view].map((x) => x[0]);
  let sub = 0;
  if (s != null && s !== '') {
    const bySlug = slugs.indexOf(s);
    const byIndex = /^\d+$/.test(s) ? parseInt(s, 10) : -1;
    if (bySlug >= 0) sub = bySlug;
    else if (byIndex >= 0 && byIndex < slugs.length) sub = byIndex;
    /* 都不是 → 落回第 0 个；不静默改写成别的页（评审 P0-4 的教训） */
  }
  return { view, sub };
}
const hashOf = (view, sub) => `#${view}/${SUBS[view][sub || 0][0]}`;

const state = {
  view: 'dashboard',
  sub: {},
  profile: 'A',
  agentOpen: false,
  agentSize: 'std',
  /* 一图秀窗口：sel 最多 4 条（16 号 R7），toggles 决定治疗条与分类节点 */
  one: { range: '90', sel: ['ess_total', 'nap_median_min'], toggles: { treatment: true, nodes: true }, pin: null },
  /* 指标卡翻转态存这里，不存 DOM。重绘会打断 480ms 过渡，所以点击只改属性不重绘。 */
  flipped: new Set(),
  privateOpen: false,
  essDraftByProfile: { A: {}, B: {} },
  bio: { A: null, B: null },
  pageStack: [],
  agentLog: []
};
{
  const hp = hashParts();
  state.view = hp.view;
  state.sub[hp.view] = hp.sub;
}

/* ================= 4. 小工具 ================= */
const pill = (t, c = '') => `<span class="pill ${c}">${esc(t)}</span>`;
const row = (b, p, right = '') => `<div class="row"><div class="row-main"><div><b>${b}</b>${p ? `<p>${p}</p>` : ''}</div></div>${right ? `<div class="row-right">${right}</div>` : ''}</div>`;
const emptyBox = (h, p) => `<div class="empty"><h3>${esc(h)}</h3><p>${esc(p)}</p></div>`;
const notice = (html, kind = '') => `<div class="notice ${kind}">${html}</div>`;
const secTitle = (title, extra = '') => `<div class="section-title"><h2>${esc(title)}</h2>${extra || ''}</div>`;
const agentDraftBtn = (entity, label = '让 AI 帮我整理一条草稿') =>
  `<button class="soft" data-action="${entity}:agent-draft">${esc(label)}</button>`;
function pageHead() {
  const cur = state.sub[state.view] || 0;
  const label = PAGES.find((p) => p[0] === state.view)[1];
  return `<div class="page-head"><div><span class="eyebrow">小睡宝 · ${esc(label)}</span>
    <h1>${esc(label)}</h1><p>${esc(SUBTITLES[state.view])}</p></div></div>
  <div class="subnav" role="tablist" aria-label="二级页">${SUBS[state.view].map(([slug, name], i) =>
    `<button role="tab" aria-selected="${cur === i}" data-sub="${i}" data-slug="${slug}">${esc(name)}</button>`).join('')}</div>`;
}

/* ================= 5. 图表 =================
 * smoothPath 用 Fritsch–Carlson 单调三次插值（家族约定）：不会在两点之间冲出数据范围。
 * 图上每条线**各自归一化**（27 号铁律 3），所以纵向不可比大小，横向只比时间。
 */
const CW = 980, CH = 340, CX0 = 62, CX1 = 944, CY0 = 34, CY1 = 292;
function smoothPath(coords) {
  if (coords.length < 2) return '';
  const n = coords.length;
  const dx = [], slope = [];
  for (let i = 0; i < n - 1; i += 1) dx.push(coords[i + 1].x - coords[i].x || 1e-6);
  for (let i = 0; i < n; i += 1) {
    if (i === 0 || i === n - 1) slope.push(0);
    else slope.push((coords[i + 1].y - coords[i - 1].y) / (dx[i - 1] + dx[i]));
  }
  const m = slope.slice();
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

/* 单序列趋势（ESS 历史、单指标迷你等） */
function chartSVG(pts, opts = {}) {
  if (!pts.length) {
    return `<div class="empty"><h3>${esc(opts.emptyTitle || '这个时间窗里没有记录')}</h3><p>${esc(opts.emptyHint || '去前一页记一条，或把时间范围放宽；空图不代表没事。')}</p></div>`;
  }
  const vals = pts.map((p) => (typeof p.v === 'number' ? p.v : null)).filter((v) => v != null);
  if (!vals.length) {
    /* 分类变量：只画节点不连线（27 号铁律 4） */
    const y = (CY0 + CY1) / 2;
    const t0 = Date.parse(pts[0].d), t1 = Date.parse(pts[pts.length - 1].d), span = Math.max(1, t1 - t0);
    return `<div class="chart-wrap"><svg class="chart" viewBox="0 0 ${CW} ${CH}" role="img" aria-label="${esc(opts.label || '分类结果')}">
      <line class="axis" x1="${CX0}" x2="${CX1}" y1="${y}" y2="${y}"/>
      ${pts.map((p) => { const x = CX0 + ((Date.parse(p.d) - t0) / span) * (CX1 - CX0);
        return `<rect class="cat-node" x="${(x - 6).toFixed(1)}" y="${(y - 6).toFixed(1)}" width="12" height="12" rx="3"><title>${esc(p.d)}：${esc(p.v)}</title></rect>
        <text class="tick" x="${x.toFixed(1)}" y="${y - 14}" text-anchor="middle">${esc(p.v)}</text>
        <text class="tick" x="${x.toFixed(1)}" y="${CY1 + 26}" text-anchor="middle">${esc(shortDate(p.d))}</text>`; }).join('')}
    </svg></div>${notice('分类型结果<b>只画节点、不连线</b>：给"阳性 / 阴性 / 未测"连线会暗示程度，那是编出来的。', 'plain')}`;
  }
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (hi === lo) hi = lo + (opts.minSpan || 1);
  const t0 = Date.parse(pts[0].d), t1 = Date.parse(pts[pts.length - 1].d), span = Math.max(1, t1 - t0);
  const xOf = (t) => CX0 + ((t - t0) / span) * (CX1 - CX0);
  const yOf = (v) => CY1 - ((v - lo) / (hi - lo)) * (CY1 - CY0);
  const numeric = pts.filter((p) => typeof p.v === 'number');
  const coords = numeric.map((p) => ({ x: xOf(Date.parse(p.d)), y: yOf(p.v) }));
  const color = opts.color || '#5b67d8';
  const grid = [0, 1, 2, 3].map((i) => { const y = CY0 + i * (CY1 - CY0) / 3; return `<line class="grid" x1="${CX0}" x2="${CX1}" y1="${y}" y2="${y}"/>`; }).join('');
  const path = coords.length > 1 ? `<path class="line" d="${smoothPath(coords)}" stroke="${color}" pathLength="1"/>` : '';
  const dots = coords.map((c, i) => `<circle class="pt" cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="${i === coords.length - 1 ? 5 : 3.6}" fill="${color}"><title>${esc(numeric[i].d)}：${esc(numeric[i].v)}${esc(opts.unit || '')}</title></circle>`).join('');
  const ticks = coords.map((c, i) => (i === 0 || i === coords.length - 1 || i % Math.max(1, Math.floor(coords.length / 4)) === 0)
    ? `<text class="tick" x="${c.x.toFixed(1)}" y="${CY1 + 20}" text-anchor="middle">${esc(shortDate(numeric[i].d))}</text>` : '').join('');
  const lp = coords[coords.length - 1];
  const lastLabel = coords.length ? `<text class="delta-tag" x="${(lp.x - 9).toFixed(1)}" y="${(lp.y - 11).toFixed(1)}" text-anchor="end" fill="${color}">${esc(numeric[numeric.length - 1].v)}${esc(opts.unit || '')}</text>` : '';
  return `<div class="chart-wrap"><svg class="chart" viewBox="0 0 ${CW} ${CH}" role="img" aria-label="${esc(opts.label || '时序图')}">
    ${grid}${ticks}
    <text class="tick" x="${CX0 - 8}" y="${CY0 + 4}" text-anchor="end">${esc(hi)}</text>
    <text class="tick" x="${CX0 - 8}" y="${CY1 + 4}" text-anchor="end">${esc(lo)}</text>
    ${path}${dots}${lastLabel}
  </svg></div>${opts.foot ? `<p class="small-note">${opts.foot}</p>` : ''}`;
}

/* 一图秀：多序列一图（每条线独立归一化）+ 指标选择窗口（≤4 / 独立滚动 / details 折叠） */
function oneChartSVG() {
  const list = METRICS[state.profile];
  const sel = state.one.sel.map((c) => list.find((m) => m.code === c)).filter(Boolean);
  if (!sel.length) {
    return emptyBox('还没有选指标', '在右边（窄屏在下面）的「选择指标」里勾 1–4 项，最多 4 项——再多就分不清哪条是哪条。');
  }
  const withPts = sel.filter((m) => (m.points || []).filter((p) => typeof p.v === 'number').length > 0);
  if (!withPts.length) {
    return emptyBox('选中的指标还没有数值', '分类结果（例如 HLA 阳性/阴性）不进趋势图；点一下卡片背面的说明能看到原因。');
  }
  const allDates = withPts.flatMap((m) => m.points.map((p) => p.d)).sort();
  const t0 = Date.parse(allDates[0]), t1 = Date.parse(allDates[allDates.length - 1]), span = Math.max(1, t1 - t0);
  const xOf = (d) => CX0 + ((Date.parse(d) - t0) / span) * (CX1 - CX0);
  const grid = [0, 1, 2, 3].map((i) => { const y = CY0 + i * (CY1 - CY0) / 3; return `<line class="grid" x1="${CX0}" x2="${CX1}" y1="${y}" y2="${y}"/>`; }).join('');
  /* 每条线自己的 min/max → 0..1。**不许**把不同单位塞进同一根绝对轴。 */
  const paths = withPts.map((m) => {
    const pts = m.points.filter((p) => typeof p.v === 'number');
    const vals = pts.map((p) => p.v);
    let lo = Math.min(...vals), hi = Math.max(...vals);
    if (hi === lo) hi = lo + 1;
    const yOf = (v) => CY1 - ((v - lo) / (hi - lo)) * (CY1 - CY0);
    const coords = pts.map((p) => ({ x: xOf(p.d), y: yOf(p.v) }));
    const path = coords.length > 1 ? `<path class="line" d="${smoothPath(coords)}" stroke="${TRACKS[m.track].color}" pathLength="1"/>` : '';
    const dots = coords.map((c, i) => `<circle class="pt" cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="${i === coords.length - 1 ? 4.6 : 3.2}" fill="${TRACKS[m.track].color}"><title>${esc(m.label)} ${esc(pts[i].d)}：${esc(pts[i].v)}${esc(m.unit)}</title></circle>`).join('');
    return { m, path, dots, last: pts[pts.length - 1], lastCoord: coords[coords.length - 1] };
  });
  /* 末点标签三向避让：按 y 排序后强制 14px 间距，防叠字（16 号 R4） */
  const labels = paths.filter((p) => p.lastCoord).map((p) => ({ x: p.lastCoord.x, y: p.lastCoord.y, text: `${p.m.label} ${p.last.v}${p.m.unit || ''}`, color: TRACKS[p.m.track].color }))
    .sort((a, b) => a.y - b.y);
  for (let i = 1; i < labels.length; i += 1) if (labels[i].y - labels[i - 1].y < 14) labels[i].y = labels[i - 1].y + 14;
  const labelEls = labels.map((l, i) => `<text class="delta-tag" x="${(CX1 - 6).toFixed(1)}" y="${(l.y + (i % 2 ? 4 : -4)).toFixed(1)}" text-anchor="end" fill="${l.color}">${esc(l.text)}</text>`).join('');
  const legend = withPts.map((m, i) => `<li><i style="background:${TRACKS[m.track].color}"></i><span>${esc(m.label)}</span><em>${esc(TRACKS[m.track].label)} · ${m.points.filter((p) => typeof p.v === 'number').length} 点</em></li>`).join('');
  const tickDates = [0, 0.33, 0.66, 1].map((f) => {
    const t = t0 + (t1 - t0) * f;
    return `<text class="tick" x="${xOf(new Date(t).toISOString().slice(0, 10)).toFixed(1)}" y="${CY1 + 20}" text-anchor="middle">${esc(shortDate(new Date(t).toISOString().slice(0, 10)))}</text>`;
  }).join('');
  const treatmentRow = state.one.toggles.treatment ? `
    <g class="treatment-row"><rect x="${CX0}" y="${CY1 + 30}" width="${CX1 - CX0}" height="20" rx="4" fill="#f4f1fb"/>
    <text class="tick" x="${CX0 + 8}" y="${CY1 + 44}">治疗条：用药起止（独立一行，不与指标同轴）</text></g>` : '';
  return `<div class="chart-wrap"><svg class="chart one-chart" viewBox="0 0 ${CW} ${state.one.toggles.treatment ? CH + 24 : CH}" role="img" aria-label="一图秀：${esc(withPts.map((m) => m.label).join('、'))}">
    ${grid}${tickDates}${paths.map((p) => p.path + p.dots).join('')}${labelEls}${treatmentRow}
  </svg></div>
  <ul class="chart-legend">${legend}</ul>
  ${notice('<b>纵向不可比：</b>每条线按自己的最小–最大值归一化。"ESS 20 分"和"发作 30 分钟"在同一张图上只是同处一屏，<b>不是同一个量</b>，也永远不会相加。', 'plain')}`;
}

/* 指标选择窗口：≤4、独立滚动、≤900px 收进 <details> 但能展开（16 号 R7） */
function oneChartPicker() {
  const list = METRICS[state.profile];
  const items = list.map((m) => {
    const on = state.one.sel.includes(m.code);
    const disabled = !on && state.one.sel.length >= 4;
    const n = (m.points || []).filter((p) => typeof p.v === 'number').length;
    return `<button class="pick-row" data-action="one-toggle" data-code="${esc(m.code)}" aria-pressed="${on}" ${disabled ? 'disabled' : ''}>
      <i style="background:${TRACKS[m.track].color}"></i>
      <span class="pick-label">${esc(m.label)}</span>
      <span class="pick-meta">${esc(TRACKS[m.track].label)} · ${n} 点</span>
      <span class="pick-check" aria-hidden="true">${on ? '✓' : ''}</span></button>`;
  }).join('');
  return `<details class="picker" open>
    <summary><span>选择指标</span><b>${state.one.sel.length}/4</b><em>最多 4 项</em></summary>
    <div class="picker-scroll">${items}</div>
    <p class="small-note">勾满 4 项后其余置灰：一张图超过 4 条线就分不清谁是谁。点下列可逐项关闭。</p>
  </details>`;
}

/* ================= 6. 指标卡（唯一组件，看板与指标页共用） =================
 * 27 号合同：
 *   · 276px 固定高，翻转前后 bounding rect 完全一致（靠 .mface 绝对定位）
 *   · 真 3D：perspective + preserve-3d + rotateY(180deg)，不是改 height
 *   · 状态存 state.flipped（Set），点击**只改属性不重绘**（重绘会打断 480ms 过渡）
 *   · 正面六段固定：眉题(轨道点) / 指标名 / 最近值+单位 / 与前次差值(只给差) / 边界说明 / 记录数+来源+翻转提示
 */
function metricCardsGrid(codes, opts = {}) {
  const list = METRICS[state.profile];
  const items = (codes ? codes.map((c) => list.find((m) => m.code === c)).filter(Boolean) : list);
  if (!items.length) return emptyBox('还没有指标', '在「手工加一条」里填 5 个字段就能开始记。');
  /* 按轨道排序（有序：同一条轨的卡挨在一起，眉题就是轨名） */
  const order = Object.keys(TRACKS);
  const sorted = items.slice().sort((a, b) => order.indexOf(a.track) - order.indexOf(b.track));
  return `<div class="metric-grid">${sorted.map((m) => metricCard(m)).join('')}</div>`;
}
function metricCard(m) {
  const track = TRACKS[m.track] || { label: '未分轨', color: '#6b7a90' };
  const pts = m.points || [];
  /* 分类型：最近值是类别字符串，不参与差值 */
  const isCat = m.kind === 'qual' || m.kind === 'grade';
  const numeric = pts.filter((p) => typeof p.v === 'number');
  const lastP = pts[pts.length - 1];
  const prevNum = numeric.length > 1 ? numeric[numeric.length - 2] : null;
  const lastNum = numeric.length ? numeric[numeric.length - 1] : null;
  const delta = !isCat && lastNum && prevNum ? lastNum.v - prevNum.v : null;
  const flipped = state.flipped.has(m.code);
  /* 背面：最近 6 个数值点的迷你折线 + 首末日期 + 末值；单点写"暂不连线" */
  const backPts = numeric.slice(-6);
  let backSvg = '<p class="mcard-empty">只有一次记录，暂不连线。</p>';
  if (backPts.length > 1) {
    const vals = backPts.map((p) => p.v);
    const lo = Math.min(...vals), hi = Math.max(...vals), span = hi - lo || 1;
    const coords = backPts.map((p, i) => ({ x: 10 + i * (260 / (backPts.length - 1)), y: 62 - ((p.v - lo) / span) * 46 }));
    backSvg = `<svg class="mcard-spark" viewBox="0 0 280 74" role="img" aria-label="${esc(m.label)} 最近 ${backPts.length} 次">
      <path d="${smoothPath(coords)}" fill="none" stroke="${track.color}" stroke-width="2" stroke-linecap="round"/>
      ${coords.map((c, i) => `<circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="2.6" fill="${track.color}"><title>${esc(backPts[i].d)}：${esc(backPts[i].v)}</title></circle>`).join('')}
    </svg>`;
  }
  const lastTxt = lastP ? (isCat ? String(lastP.v) : num(lastP.v, m.dec)) : '—';
  return `<button class="mcard" data-action="mcard-flip" data-code="${esc(m.code)}" aria-pressed="${flipped}" aria-label="${esc(m.label)}：${flipped ? '显示背面趋势，点击翻回' : '点击查看趋势'}">
    <div class="mcard-inner">
      <div class="mface front">
        <span class="m-eyebrow"><i style="background:${track.color}"></i>${esc(track.label)}</span>
        <b class="m-name">${esc(m.label)}</b>
        <span class="m-val">${esc(lastTxt)}<em>${esc(m.unit || '')}</em></span>
        <span class="m-delta">${isCat ? '分类结果，不做比较' : delta == null ? '只有一次记录，暂无比较' : `比上次 ${delta > 0 ? '+' : ''}${num(delta, m.dec)}${esc(m.unit || '')}`}</span>
        <p class="m-note">${esc(m.note || '')}</p>
        <span class="m-foot">${pts.length} 次记录 · 最近 ${esc(fmtDate(lastP && lastP.d) || '—')} · ${esc(m.source || '')}<em>点击看趋势 →</em></span>
      </div>
      <div class="mface back">
        <span class="m-eyebrow"><i style="background:${track.color}"></i>${esc(track.label)} · 背面</span>
        <b class="m-name">${esc(m.label)}</b>
        ${backSvg}
        <span class="m-range">${backPts.length ? esc(fmtDate(backPts[0].d)) + ' → ' + esc(fmtDate(backPts[backPts.length - 1].d)) : '暂无区间'}</span>
        <span class="m-foot">末值 ${esc(lastTxt)}${esc(m.unit || '')} · 每点独立归一化<em>点击翻回 ←</em></span>
      </div>
    </div>
  </button>`;
}

/* ================= 7. 整页视图（32 号） =================
 * 判据：内容 >1.5 屏或需内部多区块切换 → 整页，否则弹窗。
 * 导航栈 open/back/close，必须绑 history.pushState({pv:depth},'','#page=key')，
 * Esc 退一层、浏览器返回键等价 back、#page=xxx 刷新仍在该页、焦点回触发者。
 */
let pvTrigger = null;
let pvScrollMemo = {};
function pageViewOpen(key, title, bodyHtml, opts = {}) {
  pvTrigger = document.activeElement;
  const depth = state.pageStack.length + 1;
  state.pageStack.push({ key, title, body: bodyHtml, actions: opts.actions || '', scroll: 0 });
  renderPageView();
  if (!opts.silent) history.pushState({ pv: depth }, '', '#page=' + key);
  $('#pv-body').scrollTop = 0;
  $('#pv-body').focus({ preventScroll: true });
  document.body.classList.add('pv-open');
}
function pageViewBack() {
  if (state.pageStack.length <= 1) { pageViewClose(); return; }
  const cur = state.pageStack.pop();
  pvScrollMemo[cur.key] = $('#pv-body') ? $('#pv-body').scrollTop : 0;
  renderPageView();
  if ($('#pv-body')) $('#pv-body').scrollTop = pvScrollMemo[state.pageStack[state.pageStack.length - 1].key] || 0;
  history.replaceState({ pv: state.pageStack.length }, '', '#page=' + state.pageStack[state.pageStack.length - 1].key);
}
function pageViewClose() {
  state.pageStack = [];
  const el = $('#page-view');
  el.hidden = true;
  el.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('pv-open');
  if (location.hash.startsWith('#page=')) {
    history.replaceState(null, '', hashOf(state.view, state.sub[state.view] || 0));
  }
  if (pvTrigger && typeof pvTrigger.focus === 'function') pvTrigger.focus({ preventScroll: true });
  pvTrigger = null;
}
function renderPageView() {
  const el = $('#page-view');
  if (!state.pageStack.length) { el.hidden = true; el.setAttribute('aria-hidden', 'true'); return; }
  const top = state.pageStack[state.pageStack.length - 1];
  el.hidden = false;
  el.setAttribute('aria-hidden', 'false');
  $('#pv-title').textContent = top.title;
  $('#pv-eyebrow').textContent = `小睡宝 · 整页视图 · 第 ${state.pageStack.length} 层`;
  $('#pv-body').innerHTML = top.body;
  $('#pv-actions').innerHTML = top.actions || `<button class="pv-btn" data-action="pv-print">打印 / 存成 PDF</button>`;
  $$('#page-view [data-action="pv-back"]').forEach((b) => { b.disabled = false; b.textContent = state.pageStack.length > 1 ? '← 返回上一层' : '← 返回'; });
}

/* ================= 8. 视图 ================= */
function vDashboard() {
  const sub = state.sub.dashboard || 0;
  if (sub === 0) return vDashToday();
  if (sub === 1) return vDashWeek();
  return vDashTodo();
}
function vDashToday() {
  const p = P();
  const naps = NAPS[state.profile];
  const week = naps.filter((n) => daysAgo(n.at.slice(0, 10)) <= 7);
  const ess = ESS[state.profile];
  const lastEss = ess[ess.length - 1];
  const curMeds = MEDS[state.profile].filter((m) => !m.end);
  /* 看板复用指标卡组件（同一个函数），取最新 4 项：量表 + 发作 + 夜间 + 体征 */
  const spotlight = ['ess_total', 'nap_median_min', 'awakening_count', 'weight'];
  return `${pageHead()}
  <div class="hero"><div class="avatar-big" aria-hidden="true">${esc(p.initial)}</div>
    <div class="hero-main"><h2>${esc(p.name)}，${esc(p.meta)}</h2>
      <p>${esc(p.headline)}</p>
      <div class="chips" style="margin-top:10px">
        ${pill('近 7 天 ' + week.length + ' 次发作', 'violet')}
        ${lastEss ? pill('上次 ESS ' + essTotal(lastEss) + ' 分（' + shortDate(lastEss.at) + '）', 'grey') : pill('还没有 ESS 记录', 'rose')}
        ${curMeds.length ? pill('在用 ' + curMeds.map((m) => m.name).join(' / '), 'green') : pill('当前无在用药记录', 'grey')}
        ${p.proxied ? pill('家长代记', 'amber') : ''}
      </div>
    </div>
  </div>

  ${secTitle('今天可以做的事', '<span class="card-note">7 个入口对应文档 §2 的 7 条场景路径（S01–S06、S08）</span>')}
  <div class="task-grid">${TASKS[state.profile].map((t) => `<button class="task" data-action="${esc(t.action)}">
    <span class="task-icon">${icon(t.key === 'nap' ? 'naps' : t.key === 'ess' ? 'ess' : t.key === 'visit' ? 'visit' : t.key === 'night' ? 'night' : t.key === 'meds' ? 'meds' : t.key === 'metrics' ? 'metrics' : 'admin')}</span>
    <span class="task-main"><b>${esc(t.title)}</b><p>${esc(t.note)}</p></span>
    <span class="task-scenario">${esc(t.scenario || '')}</span>
    <span class="task-arrow" aria-hidden="true">→</span></button>`).join('')}</div>

  ${secTitle('关键指标', `<button class="soft" data-action="go-metrics-cards">看全部 10 项</button>`)}
  ${metricCardsGrid(spotlight)}
  <p class="small-note">卡片按轨道排序（量表 / 发作 / 夜间 / 体征 / 检查）。点卡片翻到背面看趋势——这里和「检查与指标」页用的是<b>同一个组件</b>。</p>

  ${secTitle('最近发生了什么', `<button class="soft" data-action="go-diagnosis-timeline">看完整时间线</button>`)}
  <div class="grid side">
    <div class="card">${EVENTS[state.profile].slice(-4).reverse().map((e) => row(esc(e.label), esc(fmtDate(e.at) + ' · ' + (e.kind === 'med' ? '用药变更' : e.kind === 'exam' ? '检查' : e.kind === 'visit' ? '门诊' : '其他')), '')).join('')}</div>
    <div class="card">
      <div class="card-head"><h2>还没问的问题</h2><span class="card-note">${QUESTIONS[state.profile].filter((q) => !q.asked).length} 个</span></div>
      ${QUESTIONS[state.profile].filter((q) => !q.asked).slice(0, 3).map((q) => row(esc(q.body), esc(q.forVisit ? '计划在 ' + q.forVisit + ' 问' : '还没定哪次问'), '')).join('') || emptyBox('没有待问的问题', '想到什么就记一条；问不问、怎么问由你决定。')}
    </div>
  </div>

  ${secTitle('临床试验线索', '<span class="card-note">登记库实测有数，界面必须有数</span>')}
  <div class="card">
    ${row('登记库条目', esc(T.total + ' 条（采集于 ' + String(T.generatedAt || '').slice(0, 10) + '）'), pill('已采集', 'green'))}
    ${row('四通道终态', esc((T.channels || []).map((c) => c.id + ' ' + c.status + ' ' + c.count).join(' · ') || '无'), '')}
    ${row('我能不能入组', '工作台<b>不做</b>入排判定：登记库导出里没有入排标准字段，也就没有依据可判。', pill('去问研究者', 'amber'))}
    <div style="margin-top:12px;display:flex;gap:9px;flex-wrap:wrap"><button class="soft" data-action="go-trials-match">看和我有关的试验</button><button data-action="go-trials-library">浏览试验库</button></div>
  </div>
  ${notice(`<b>关于这份演示：</b>患者资料为构造的模拟数据，用于展示交互。临床试验条目来自 <code>data/trials/</code> 的真跑采集（${esc(T.total)} 条 · ${esc(String(T.generatedAt || '').slice(0, 10))}），原型里是生成物 <code>demo-trials.js</code>，不是手抄的数字。`, 'plain')}`;
}
function vDashWeek() {
  const naps = NAPS[state.profile];
  const byDay = {};
  for (const n of naps) { const d = n.at.slice(0, 10); byDay[d] = (byDay[d] || 0) + 1; }
  const days = Object.keys(byDay).sort();
  const mins = naps.filter((n) => n.min != null).map((n) => n.min).sort((a, b) => a - b);
  const med = mins.length ? mins[Math.floor(mins.length / 2)] : null;
  /* D2 三视图并列：时段柱 + 单次时长线 + ESS 总分线，三张都是 svg.chart（评审 P0-7） */
  const buckets = new Array(24).fill(0);
  for (const n of naps) buckets[+n.at.slice(11, 13)] += 1;
  const bmax = Math.max(1, ...buckets);
  const barW = (CX1 - CX0) / 24;
  const barsSvg = `<div class="chart-wrap"><svg class="chart" viewBox="0 0 ${CW} ${CH}" role="img" aria-label="24 小时各时段发作次数">
    ${buckets.map((v, h) => { const x = CX0 + h * barW + 2, h2 = Math.max(2, (v / bmax) * (CY1 - CY0));
      return `<rect class="bar-rect" x="${x.toFixed(1)}" y="${(CY1 - h2).toFixed(1)}" width="${(barW - 4).toFixed(1)}" height="${h2.toFixed(1)}" rx="3"><title>${h} 点：${v} 次</title></rect>
      ${h % 3 === 0 ? `<text class="tick" x="${(x + barW / 2).toFixed(1)}" y="${CY1 + 20}" text-anchor="middle">${h}</text>` : ''}`; }).join('')}
  </svg></div>`;
  const napDur = METRICS[state.profile].find((m) => m.code === 'nap_median_min');
  const essM = METRICS[state.profile].find((m) => m.code === 'ess_total');
  return `${pageHead()}
  <div class="grid three">
    <div class="metric-card"><b>近 90 天发作</b><span class="val">${naps.length}<em>次</em></span><span class="ref">按事件计，一次一行</span></div>
    <div class="metric-card"><b>有记录的发作日</b><span class="val">${days.length}<em>天</em></span><span class="ref">不是"应该发作"的天数</span></div>
    <div class="metric-card"><b>单次时长中位数</b><span class="val">${med == null ? '—' : med}<em>分钟</em></span><span class="ref">${naps.filter((n) => n.min == null).length} 次没记时长</span></div>
  </div>
  ${secTitle('三视图并列（D2）', '<span class="card-note">时段柱 / 单次时长线 / ESS 总分线 · 三条轴各管各的，不合轴</span>')}
  <div class="card"><div class="card-head"><h2>① 时段柱：一天里哪些小时记到了发作</h2><span class="card-note">${naps.length} 次</span></div>
    ${barsSvg}
    <p class="small-note">某小时为 0 表示这段没记到，也可能是没记——两者在数据里分不开，所以不据此给"该避开哪段时间"的建议。</p></div>
  <div class="card" style="margin-top:14px"><div class="card-head"><h2>② 单次时长线：每月中位数</h2><span class="card-note">时长型，NULL ≠ 0</span></div>
    ${chartSVG(napDur ? napDur.points : [], { label: '单次发作时长中位数（按月）', unit: ' 分钟', color: TRACKS.event.color, minSpan: 1, foot: '只统计记了时长的次数；没记的不当 0 分钟参与。按月取中位数，不取均值——均值会被一次特别长的发作拉走。' })}</div>
  <div class="card" style="margin-top:14px"><div class="card-head"><h2>③ ESS 总分线：整次填写</h2><span class="card-note">每次一个点</span></div>
    ${chartSVG(essM ? essM.points : [], { label: 'ESS 总分历史', unit: ' 分', color: TRACKS.scale.color, minSpan: 4, foot: '每次一个点，不是每天一个点。总分由 8 项相加，界面不提供改总分的入口。' })}</div>
  ${secTitle('按天')}
  <div class="card"><div class="table-wrap"><table class="data"><thead><tr><th>日期</th><th class="num">次数</th><th>分布</th></tr></thead><tbody>
    ${days.slice(-14).reverse().map((d) => `<tr><td>${esc(d)}</td><td class="num">${byDay[d]}</td><td>${'▮'.repeat(byDay[d])}</td></tr>`).join('')}
  </tbody></table></div><p class="scroll-hint">显示最近 14 个有记录的日期</p></div>`;
}
function vDashTodo() {
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
        ${notice('对话里说"下午三点半开会睡着了，大概二十分钟"，AI 会先给你一张<b>候选卡</b>；核对后才入库。', 'plain')}
        <div class="agent-draft"><div class="draft-actions">${agentDraftBtn('naps', '用 AI 记一条发作')}<button data-action="nap-manual">手工补一条</button></div></div>
        <p class="small-note">手工通道收敛在卡片「⋯ 更多」后面；本页显式入口只有这 2 个。</p>
      </div>
    </div>`;
  }
  if (sub === 1) {
    const buckets = new Array(24).fill(0);
    for (const n of naps) buckets[+n.at.slice(11, 13)] += 1;
    const bmax = Math.max(1, ...buckets);
    const barW = (CX1 - CX0) / 24;
    const ctxCount = {};
    for (const n of naps) ctxCount[n.context] = (ctxCount[n.context] || 0) + 1;
    return `${pageHead()}
    <div class="card">
      <div class="card-head"><h2>时段聚合（按小时）</h2><span class="card-note">只统计已记录，共 ${naps.length} 次</span></div>
      <div class="chart-wrap"><svg class="chart" viewBox="0 0 ${CW} ${CH}" role="img" aria-label="24 小时各时段发作次数柱状图">
        ${buckets.map((v, h) => { const x = CX0 + h * barW + 2, hh = Math.max(2, (v / bmax) * (CY1 - CY0));
          return `<rect class="bar-rect" x="${x.toFixed(1)}" y="${(CY1 - hh).toFixed(1)}" width="${(barW - 4).toFixed(1)}" height="${hh.toFixed(1)}" rx="3"><title>${h} 点：${v} 次</title></rect>
          ${h % 2 === 0 ? `<text class="tick" x="${(x + barW / 2).toFixed(1)}" y="${CY1 + 20}" text-anchor="middle">${h}</text>` : ''}`; }).join('')}
      </svg></div>
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

function vNight() {
  const sub = state.sub.night || 0;
  const nights = NIGHTS[state.profile];
  const NIGHT_LABEL = { awakening: '夜间觉醒', sleep_paralysis: '睡眠瘫痪', hallucination: '入睡幻觉', vivid_dream: '生动梦境' };
  const NIGHT_PILL = { awakening: 'grey', sleep_paralysis: 'violet', hallucination: 'amber', vivid_dream: 'green' };
  if (sub === 0) {
    return `${pageHead()}
    <div class="grid side">
      <div class="card">
        <div class="card-head"><h2>近期夜间记录</h2><span class="card-note">共 ${nights.length} 条</span></div>
        <div class="table-wrap"><table class="data"><thead><tr><th>时间</th><th>类型</th><th class="num">时长</th><th>备注</th></tr></thead><tbody>
        ${nights.slice(0, 12).map((n) => `<tr><td>${esc(n.at.replace('T', ' '))}</td><td>${pill(NIGHT_LABEL[n.kind] || n.kind, NIGHT_PILL[n.kind] || '')}</td><td class="num">${n.min == null ? '<span class="muted">没记</span>' : n.min + ' 分'}</td><td>${esc(n.note || '—')}</td></tr>`).join('')}
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
      const list = nights.filter((n) => n.kind === k);
      return `<div class="card" style="margin-bottom:12px"><div class="card-head"><h2>${esc(NIGHT_LABEL[k])}</h2><span class="card-note">${list.length} 条</span></div>
      ${list.length ? list.slice(0, 6).map((n) => row(esc(n.at.replace('T', ' ')), esc(n.min == null ? '时长没记' : '约 ' + n.min + ' 分钟'), '')).join('') : emptyBox('还没有这一类记录', '如果没发生过就是没有；不确定的类型可以先记下来标"待确认"。')}</div>`;
    }).join('')}
    ${notice('这些是<b>描述性记录</b>。工作台不判断"是不是发作性睡病的典型表现"，也不据此建议要不要加药。', 'plain')}`;
  }
  const byWeek = {};
  for (const n of nights) { const w = Math.floor(daysAgo(n.at.slice(0, 10)) / 7); byWeek[w] = (byWeek[w] || 0) + 1; }
  const weeks = Object.keys(byWeek).map(Number).sort((a, b) => b - a).slice(0, 12).reverse();
  const max = Math.max(1, ...weeks.map((w) => byWeek[w]));
  return `${pageHead()}
  <div class="grid three">
    <div class="metric-card"><b>夜间记录总数</b><span class="val">${nights.length}<em>条</em></span><span class="ref">90 天内</span></div>
    <div class="metric-card"><b>睡眠瘫痪</b><span class="val">${nights.filter((n) => n.kind === 'sleep_paralysis').length}<em>次</em></span><span class="ref">本人描述</span></div>
    <div class="metric-card"><b>入睡幻觉</b><span class="val">${nights.filter((n) => n.kind === 'hallucination').length}<em>次</em></span><span class="ref">本人描述</span></div>
  </div>
  ${secTitle('按周')}
  <div class="card"><div class="bars">${weeks.map((w) => `<div class="bar-col"><div class="bar" style="height:${Math.max(2, (byWeek[w] / max) * 100)}%"></div><span class="bar-label">W-${w}</span></div>`).join('')}</div>
  <p class="small-note">W-0 是最近 7 天。只统计已记录的事件。</p></div>`;
}

function vEss() {
  const sub = state.sub.ess || 0;
  const list = ESS[state.profile];
  const draft = state.essDraftByProfile[state.profile] || {};
  if (sub === 0) {
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
          <button data-action="ess-fullpage">整页作答</button>
        </div>
        ${canSubmit ? '' : `<p class="small-note">还差 ${8 - answered} 题。8 题都选完才能提交——半份量表不能算一次。</p>`}
      </div>
      <div class="card">
        <div class="card-head"><h2>为什么不能问 AI</h2></div>
        ${notice('ESS 的每一个选项都要<b>你自己选</b>。AI 不能替你估分、不能根据你的描述推一个分数——那不是记录，是造数据。', 'warn')}
        <div class="agent-draft" style="margin:14px 0"><div class="draft-actions">${agentDraftBtn('ess', '让 AI 帮我填')}</div></div>
        <p class="small-note">这个按钮是真的可点，点了会被拒绝并说明原因。<b>入口不藏起来</b>——患者真的会去点，拒绝本身要说清楚。</p>
        <p class="small-note">总分由系统把 8 项相加，任何人都不能手改总分。总分怎么解读，等门诊时问医生。</p>
        ${list.length ? `${secTitle('上次填的')}<div class="row"><div class="row-main"><div><b>${esc(fmtDate(list[list.length - 1].at))}</b><p>总分 ${essTotal(list[list.length - 1])} 分 · 8 项相加</p></div></div><div class="row-right">${pill('已记录', 'grey')}</div></div>` : ''}
      </div>
    </div>`;
  }
  if (sub === 1) {
    const series = list.map((r) => ({ d: r.at, v: essTotal(r) }));
    return `${pageHead()}
    <div class="card">
      <div class="card-head"><h2>ESS 总分历史</h2><span class="card-note">${series.length} 次记录</span></div>
      ${chartSVG(series, { label: 'ESS 总分随时间变化', color: TRACKS.scale.color, unit: ' 分', minSpan: 4, foot: '每次一个点。点是"那次填的总分"，不是每天的分。总分由 8 项相加，界面上不提供手工改总分的入口。' })}
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
    <div class="card-head"><h2>分项（${esc(fmtDate(last.at))}，总分 ${essTotal(last)}）</h2><button class="soft" data-action="ess-items-fullpage">整页作答视图</button></div>
    <div class="table-wrap"><table class="data"><thead><tr><th>题</th><th>情境</th><th class="num">选项</th><th class="num">分值</th></tr></thead><tbody>
      ${last.q.map((v, i) => `<tr><td>Q${i + 1}</td><td>${esc(ESS_ITEMS[i])}</td><td class="num">${esc(['不会犯困', '偶尔会', '有时会', '很可能'][v])}</td><td class="num">${v}</td></tr>`).join('')}
    </tbody></table></div>
    <p class="small-note">分项只用来回看"哪几题当时选得重"，不换算成任何结论。</p>
  </div>`;
}

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

function vMetrics() {
  const sub = state.sub.metrics || 0;
  const list = METRICS[state.profile];
  if (sub === 0) {
    return `${pageHead()}
    ${secTitle('按轨道分系列', '<span class="card-note">同一轨道的卡挨在一起；轨道由数据决定，不由页面写死</span>')}
    ${Object.entries(TRACKS).map(([key, tr]) => {
      const items = list.filter((m) => m.track === key);
      if (!items.length) return '';
      return `<div class="track-section"><div class="track-head"><i style="background:${tr.color}"></i><h2>${esc(tr.label)}</h2><span>${esc(tr.hint)} · ${items.length} 项</span></div>
        <div class="metric-grid">${items.map((m) => metricCard(m)).join('')}</div></div>`;
    }).join('')}
    <div class="grid two" style="margin-top:16px">
      <div class="agent-draft"><div class="draft-actions">${agentDraftBtn('metrics', '粘一段化验单让 AI 整理')}<button data-action="metric-manual">手工加一条</button></div></div>
    </div>
    ${notice('数值只存"测到的值 + 这一项自己的参考范围"。缺参考上限时显示<b>需参考上限</b>，不拿别的病、别的人群的上限顶上。轨道之间<b>永不相加</b>。', 'plain')}`;
  }
  if (sub === 1) {
    return `${pageHead()}
    <div class="one-grid">
      <div class="one-main">
        <div class="card">
          <div class="card-head"><h2>一图秀</h2><span class="card-note">${state.one.sel.length}/4 条线 · 每条独立归一化</span></div>
          ${oneChartSVG()}
        </div>
      </div>
      <aside class="one-side">
        ${oneChartPicker()}
        <div class="card" style="margin-top:14px">
          <div class="card-head"><h2>显示项</h2></div>
          <label class="switch-row"><input type="checkbox" data-action="one-toggle-treatment" ${state.one.toggles.treatment ? 'checked' : ''}><span>治疗条（用药起止）</span></label>
          <label class="switch-row"><input type="checkbox" data-action="one-toggle-nodes" ${state.one.toggles.nodes ? 'checked' : ''}><span>分类结果画节点</span></label>
          <p class="small-note">治疗条永远独立一行，不折进指标轴——药是天数，指标是数值，两者不同量。</p>
        </div>
      </aside>
    </div>`;
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
      <tr><td>轨道</td><td>量表 / 发作 / 夜间 / 体征 / 检查，五轨永不相加</td></tr>
    </tbody></table></div>
    ${notice('分类型记录（例如 HLA 阳性/阴性）<b>不进趋势连线</b>：给类别连线会暗示"程度"，那是编出来的。', 'plain')}
  </div>`;
}

/* ---------------- 临床试验（第 10 个一级页） ----------------
 * 患者要的是"有没有在招的研究、我这个情况能不能去问"；
 * 医生要的是"入排评估"。工作台只做前者：把登记库**已有的字段**摆在患者面前，
 * 把**库内没有的字段**单列为缺口，不替任何人判"你能入组"。
 */
function vTrials() {
  const sub = state.sub.trials || 0;
  if (sub === 0) return vTrialsProfile();
  if (sub === 1) return vTrialsMatch();
  return vTrialsLibrary();
}

function vTrialsProfile() {
  const bio = bioProfile(state.profile);
  const cell = (label, item, hint) => `<tr>
    <td><b>${esc(label)}</b>${hint ? `<p class="small-note">${esc(hint)}</p>` : ''}</td>
    <td>${item.known ? esc(String(item.value ?? '—')) : `<span class="muted">${esc(String(item.value ?? '未测'))}</span>`}</td>
    <td>${item.known ? pill('已建档', 'green') : pill('缺口', 'yellow')}</td>
    <td>${esc(item.source || '—')}${item.date ? `<br><span class="muted">${esc(fmtDate(item.date))}</span>` : ''}</td></tr>`;
  return `${pageHead()}
  ${notice('<b>这一步是"我手上有什么"，不是"我该做什么检查"。</b>建档只把已有报告的结论抄进来；没做的写「未测」，工作台不提示你去补哪项检查——补什么、要不要补，是门诊里问医生的。', 'plain')}
  <div class="card">
    <div class="card-head"><h2>个人生物标志建档</h2><span class="card-note">${[bio.subtype, bio.hla, bio.orexin, bio.mslt].filter((x) => x.known).length}/4 项已建档</span></div>
    <div class="table-wrap"><table class="data"><thead><tr><th>项目</th><th>值</th><th>状态</th><th>来源 / 日期</th></tr></thead><tbody>
      ${cell('分型（1 型 / 2 型）', bio.subtype, '由医生按检查结果判定')}
      ${cell('猝倒', bio.cataplexy)}
      ${cell('HLA-DRB1*15:01', bio.hla, '基因检测报告原文')}
      ${cell('脑脊液食欲素-A', bio.orexin, '阈值各实验室不同')}
      ${cell('MSLT 平均睡眠潜伏期', bio.mslt, 'MSLT 报告原文')}
      ${cell('年龄', bio.age)}
      ${cell('所在地区', bio.region)}
      ${cell('当前用药', bio.meds)}
    </tbody></table></div>
    <div style="margin-top:14px;display:flex;gap:9px;flex-wrap:wrap">
      <button class="primary" data-action="trials-run-match">用这份建档去匹配</button>
      <button data-action="trials-profile-fullpage">整页编辑建档</button>
    </div>
  </div>
  ${notice('建档字段的来源都写明了：<b>报告原文 / 诊断原文 / 本人填</b>。工作台不从症状里反推分型，也不把"没测"当成"阴性"。', 'private')}`;
}

/* 匹配指数：只对**登记库里真实存在**的字段归一化，缺口单列不当 0 分。
   算法必须能逐条讲清楚（患者会问"为什么 3 分"），所以输出的是分维度表，不是一句总分。 */
function computeMatch(bio) {
  const regionHit = (t) => (t.country && /中国|China/i.test(t.country)) ? 1 : 0;
  const statusOrder = { RECRUITING: 1, NOT_YET_RECRUITING: 0.6, ACTIVE_NOT_RECRUITING: 0.4, ENROLLING_BY_INVITATION: 0.4 };
  const statusHit = (t) => (t.status && statusOrder[String(t.status).toUpperCase()]) || 0;
  const subtypeHit = (t) => {
    if (!t.subtype) return null;            /* 登记库没说分型 → 这一维**未知**，不进分母 */
    if (t.subtype === 'both') return 1;
    if (bio.subtype.known) {
      const mine = /1\s*型|伴猝倒/.test(String(bio.subtype.value)) ? 'type1' : (/2\s*型/.test(String(bio.subtype.value)) ? 'type2' : null);
      if (!mine) return null;
      return mine === t.subtype ? 1 : 0;
    }
    return null;                            /* 我没有分型 → 同样未知 */
  };
  return T.trials.map((t) => {
    const dims = [
      { name: '地区', weight: 1, score: regionHit(t), basis: t.country ? `登记国家：${t.country}` : '登记库无国家字段' },
      { name: '招募状态', weight: 1, score: statusHit(t), basis: t.status ? `登记状态：${t.status}` : '登记库无状态字段' },
      { name: '分型线索', weight: 1, score: subtypeHit(t), basis: t.subtype ? `标题写明：${t.subtype}` : '标题与适应症都没写分型' }
    ];
    const known = dims.filter((d) => d.score != null);
    const got = known.reduce((a, d) => a + d.score * d.weight, 0);
    const full = known.reduce((a, d) => a + d.weight, 0);
    const index = full > 0 ? Math.round((got / full) * 100) : null;
    return { t, dims, knownCount: known.length, index, missing: dims.filter((d) => d.score == null).map((d) => d.name) };
  }).filter((r) => r.index != null).sort((a, b) => b.index - a.index);
}

function vTrialsMatch() {
  const bio = bioProfile(state.profile);
  const rows = computeMatch(bio);
  const cap = T.capability || {};
  const knownDims = rows.length ? rows[0].knownCount : 0;
  const missingDims = rows.length ? rows[0].missing : [];
  const top = rows.slice(0, 6);
  if (!T.trials.length) {
    return `${pageHead()}${emptyBox('试验数据还没生成', '先跑采集脚本与生成脚本，再来匹配。空表不代表"没有在招的研究"。')}`;
  }
  return `${pageHead()}
  ${notice(`<b>先说清楚这个指数是什么。</b>它只对登记库里<b>真实存在</b>的字段做归一化：本次参与计算 ${knownDims} 个维度，${missingDims.length ? `另有 ${missingDims.length} 个维度库内没有（${esc(missingDims.join('、'))}），<b>不计入分母、也不当 0 分</b>` : '没有缺口维度'}。它不是"我能不能入组"的答案。`, 'warn')}
  <div class="card">
    <div class="card-head"><h2>匹配结果</h2><span class="card-note">${rows.length} 条可计算 · 共 ${T.trials.length} 条</span></div>
    <div class="table-wrap"><table class="data"><thead><tr><th>试验</th><th class="num">匹配指数</th><th>覆盖维度</th><th>状态</th></tr></thead><tbody>
      ${top.map((r) => `<tr>
        <td><b>${esc(r.t.title)}</b><p class="small-note">${esc(r.t.id)} · ${esc(r.t.source)} · ${esc(r.t.phase || '期别未标')}</p></td>
        <td class="num"><b>${r.index}</b><span class="muted">/100</span></td>
        <td>${r.dims.map((d) => d.score == null ? `<span class="pill grey">${esc(d.name)} 未知</span>` : d.score >= 1 ? `<span class="pill green">${esc(d.name)} 命中</span>` : d.score > 0 ? `<span class="pill yellow">${esc(d.name)} 部分</span>` : `<span class="pill rose">${esc(d.name)} 不符</span>`).join(' ')}</td>
        <td>${esc(r.t.status || '—')}</td></tr>`).join('')}
    </tbody></table></div>
    <p class="scroll-hint">点任意一条看逐维度依据 →</p>
    <div style="margin-top:12px;display:flex;gap:9px;flex-wrap:wrap">
      <button class="soft" data-action="trials-explain" data-idx="0">看第 1 名的逐维度依据</button>
      <button data-action="trials-match-fullpage">整页查看全部 ${rows.length} 条</button>
    </div>
  </div>

  ${secTitle('库内没有的维度（缺口，不当 0 分）')}
  <div class="card">
    <div class="table-wrap"><table class="data"><thead><tr><th>维度</th><th>登记库有吗</th><th>为什么不参与计算</th></tr></thead><tbody>
      <tr><td>入排标准</td><td>${cap.hasEligibilityCriteria ? pill('有', 'green') : pill('没有', 'rose')}</td><td>200 条导出的字段里没有任何入排条文；没有条文就没有可比对的规则</td></tr>
      <tr><td>生物标志阈值</td><td>${cap.hasBiomarkerFields ? pill('有', 'green') : pill('没有', 'rose')}</td><td>库里没有"要求 HLA 阳性""要求食欲素低于 X"这类字段</td></tr>
      <tr><td>年龄区间</td><td>${cap.hasAgeRange ? pill('有', 'green') : pill('没有', 'rose')}</td><td>没有 min/max age 字段，无法判断年龄是否符合</td></tr>
    </tbody></table></div>
    ${notice(`<b>所以这个指数的上限就在这里：</b>它只能告诉你"登记信息里哪些和你对得上"，不能告诉你"你能入组"。要问入组，去问研究联系人或者门诊医生。${cap.note ? `<br>数据文件自己的声明：${esc(cap.note)}` : ''}`, 'plain')}
  </div>

  ${secTitle('格式说明（匹配指数怎么算）')}
  <div class="card">
    <div class="table-wrap"><table class="data"><thead><tr><th>项</th><th>规则</th></tr></thead><tbody>
      <tr><td>取值范围</td><td>0–100 整数；null 表示**无法计算**（所有维度都未知），不显示成 0</td></tr>
      <tr><td>分母</td><td><b>只累加已知维度</b>的权重，未知维度整体剔除</td></tr>
      <tr><td>维度权重</td><td>地区 1 / 招募状态 1 / 分型线索 1（本版等权；将来加维度必须同时改这份表）</td></tr>
      <tr><td>部分命中</td><td>状态为"尚未招募"计 0.6、"不再招募/仅邀请"计 0.4，其余 0</td></tr>
      <tr><td>禁止</td><td>不把"库内无此字段"算 0 分；不输出"符合入组条件"这类表述；不对分型做推断</td></tr>
    </tbody></table></div>
  </div>`;
}

function vTrialsLibrary() {
  const list = T.trials || [];
  const bySource = {};
  for (const t of list) bySource[t.source] = (bySource[t.source] || 0) + 1;
  const recruiting = list.filter((t) => String(t.status || '').toUpperCase() === 'RECRUITING').length;
  const china = list.filter((t) => /中国|China/i.test(t.country || '')).length;
  return `${pageHead()}
  <div class="grid three">
    <div class="metric-card"><b>登记库条目</b><span class="val">${T.total}<em>条</em></span><span class="ref">采集于 ${esc(String(T.generatedAt || '').slice(0, 10))}</span></div>
    <div class="metric-card"><b>正在招募</b><span class="val">${recruiting}<em>条</em></span><span class="ref">按登记状态原文筛，不改写</span></div>
    <div class="metric-card"><b>标注中国的</b><span class="val">${china}<em>条</em></span><span class="ref">国家字段含"中国"或 China</span></div>
  </div>
  ${secTitle('四通道终态', '<span class="card-note">partial / unsupported 不许降级成 ready</span>')}
  <div class="card"><div class="table-wrap"><table class="data"><thead><tr><th>通道</th><th>终态</th><th class="num">条数</th><th>说明</th></tr></thead><tbody>
    ${(T.channels || []).map((c) => `<tr><td><b>${esc(c.id)}</b></td><td>${c.status === 'ready' ? pill('ready', 'green') : c.status === 'partial' ? pill('partial', 'yellow') : pill(c.status, 'rose')}</td><td class="num">${c.count}</td><td>${esc({ ctv: 'ClinicalTrials.gov API v2，两页取全', ictrp: 'WHO ICTRP 检索页被 WAF 拦截，只拿到第 1 页', chictr_online: 'ChiCTR 在线检索返回「非法访问」，一条也没拿到', chinadrugtrials: '药物临床试验登记平台，逐条取详情' }[c.id] || '')}</td></tr>`).join('')}
  </tbody></table></div>
  <p class="small-note">按来源计数：${Object.entries(bySource).map(([k, v]) => k + ' ' + v).join(' · ')}。合计 ${list.length} 条，与 manifest / jsonl / sqlite 三处行数一致。</p></div>
  ${secTitle('全部条目', `<button class="soft" data-action="trials-library-fullpage">整页浏览 ${list.length} 条</button>`)}
  <div class="card"><div class="table-wrap"><table class="data"><thead><tr><th>登记号</th><th>标题</th><th>状态</th><th>期别</th><th>国家</th></tr></thead><tbody>
    ${list.slice(0, 15).map((t) => `<tr><td>${esc(t.id)}</td><td>${esc(t.title)}</td><td>${esc(t.status || '—')}</td><td>${esc(t.phase || '—')}</td><td>${esc(t.country || '—')}</td></tr>`).join('')}
  </tbody></table></div><p class="scroll-hint">只显示前 15 条；整页浏览看全部。</p></div>`;
}

function vAdmin() {
  const sub = state.sub.admin || 0;
  if (sub === 0) {
    const items = ['诊断证明（医院开具）', '门诊病历复印件', '近 3 个月用药记录', 'ESS 量表记录', '单位要求的说明模板'];
    return `${pageHead()}
    <div class="grid side">
      <div class="card">
        <div class="card-head"><h2>材料清单</h2><span class="card-note">${items.length} 项</span></div>
        ${items.map((it, i) => row(esc(it), esc(i < 3 ? '已归档到资料目录' : '还没准备'), i < 3 ? pill('已有', 'green') : pill('缺', 'yellow'))).join('')}
      </div>
      <div class="card">
        <div class="card-head"><h2>说明</h2></div>
        ${notice('清单是<b>你要准备的东西</b>，不是"符合某标准的证明"。工作台不生成"符合诊断标准"这类表述。', 'plain')}<!-- wording-allow: 这里是禁令句，不是在给判读 -->
        ${notice('私密条目（我的看法）默认<b>不随导出一起出去</b>；要带也是你自己决定。', 'private')}
      </div>
    </div>`;
  }
  if (sub === 1) {
    return `${pageHead()}
    <div class="card">
      <div class="card-head"><h2>导出</h2><span class="card-note">三种出口，代码级过滤</span></div>
      ${row('给医生的一页', '发作汇总 + ESS 序列 + 当前用药 + 想问的问题；不含私密条目', '<button class="soft" data-action="admin-export">导出</button>')}
      ${row('给单位 / 学校的说明', '诊断原文 + 用药记录 + 注意事项；不含个人感受', '<button class="soft" data-action="admin-export">导出</button>')}
      ${row('全部数据（自用备份）', '含私密条目；需要本人二次确认', '<button class="soft" data-action="admin-copy">确认后导出</button>')}
      <p class="small-note">三个出口的差异写在数据层：私密表默认不进任何导出，选「全部数据」才显式带上。</p>
    </div>`;
  }
  return `${pageHead()}
  <div class="card">
    <div class="card-head"><h2>办事与材料 · 说明</h2></div>
    ${notice('这个页面解决的是"材料齐不齐、怎么开"，不解决"我够不够条件"。政策口径以办理窗口为准。', 'plain')}
    <div class="table-wrap"><table class="data"><thead><tr><th>场景</th><th>通常要什么</th></tr></thead><tbody>
      <tr><td>单位请假 / 调岗</td><td>诊断证明 + 门诊病历 + 近期用药</td></tr>
      <tr><td>驾照相关</td><td>诊断证明 + 医生出具的意见（本人去问，工作台不代答）</td></tr>
      <tr><td>学校（未成年）</td><td>诊断证明 + 用药说明 + 体育课建议（由医生出）</td></tr>
      <tr><td>医保 / 门特</td><td>诊断证明 + 检查报告 + 处方</td></tr>
    </tbody></table></div>
  </div>`;
}

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
    </div>
    <div class="card" style="margin-top:14px">
      <div class="card-head"><h2>复诊前一页（可打印）</h2><span class="card-note">F2 产物 · 32 号整页视图</span></div>
      ${notice('复诊前一天最常做的一件事：把要问的、要带的、这段时间的变化凑成一页，打印或存 PDF 带去。', 'plain')}
      <div style="margin-top:12px"><button class="primary" data-action="visit-onepage">生成一页（整页视图）</button></div>
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
  dashboard: vDashboard, diagnosis: vDiagnosis, naps: vNaps, night: vNight, ess: vEss,
  meds: vMeds, metrics: vMetrics, trials: vTrials, admin: vAdmin, visit: vVisit
};

/* ================= 9. AI 会话（有真的输入 → 真的解析 → 真的候选卡） ================= */
const AGENT_TIPS = {
  dashboard: '可以说："这周发作都在什么时候？"我把记录列出来，不给你建议。',
  diagnosis: '可以说："把诊断原文念一遍。"我不会解释结果的含义。',
  naps: '可以说："下午三点半开会睡着了，大概二十分钟。"我会先给候选卡，你核对后才入库。',
  night: '可以说："昨晚两点醒了动不了，大概一分钟。"我记成一条夜间事件。',
  ess: '量表不能让我估分。8 题需要你自己选。',
  meds: '可以说："今天换成了阿莫达非尼 150 mg。"我不建议增减。',
  metrics: '可以说："这几项里哪几个我记了两次以上？"',
  trials: '可以说："我 HLA 阳性、有猝倒，哪些试验登记里写了 1 型？"我按登记字段找，不判断能不能入组。',
  admin: '可以说："单位要病情说明，我需要准备哪些？"我只列清单。',
  visit: '可以说："把想问的按顺序排一下。"答案我不编。'
};
/* 解析器：只做"从话里抽字段"，不做判断。抽不到的字段留 null，界面显示"没识别出"。
   真实版由宿主模型做这一步；原型里把「说一句话 → 候选卡 → 核对入库」这条链路真的走通。 */
/* 中文数字 → 阿拉伯数字。患者口述几乎不用阿拉伯数字：
   "三点半""二十分钟""一个多小时"是常态。只转 0–99，够覆盖时刻与分钟。 */
function cnToNum(s) {
  const raw = String(s || '').trim();
  if (!raw) return null;
  if (/^\d+$/.test(raw)) return +raw;
  const D = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  if (raw === '十') return 10;
  const m = raw.match(/^([一二两三四五六七八九])?十([一二三四五六七八九])?$/);
  if (m) return (m[1] ? D[m[1]] : 1) * 10 + (m[2] ? D[m[2]] : 0);
  if (raw.length === 1 && D[raw] != null) return D[raw];
  if (raw.length === 2 && D[raw[0]] != null && D[raw[1]] != null) return D[raw[0]] * 10 + D[raw[1]];
  return null;
}
const CN_NUM = '[0-9一二两三四五六七八九十]{1,3}';

function parseNapText(text) {
  const t = String(text || '');
  /* 时长：20分钟 / 二十分钟 / 半小时 / 一个半小时 / 2小时 */
  let min = null;
  const halfHour = t.match(/半\s*(个)?\s*小时/);
  const hourOneHalf = t.match(/(一|1)\s*个?\s*半\s*小时/);
  if (hourOneHalf) min = 90;
  else if (halfHour) min = 30;
  if (min == null) {
    const mm = t.match(new RegExp(`(${CN_NUM})\\s*(分钟|分|个?小时|钟头)`));
    if (mm) {
      const n = cnToNum(mm[1]);
      if (n != null) min = /小时|钟头/.test(mm[2]) ? n * 60 : n;
    }
  }
  /* 时刻：3:30 / 15点 / 三点半 / 三点一刻 / 下午三点半
     注意「半 / 一刻 / 三刻」必须排在 CN_NUM 前面，否则「三点一刻」里的「一」
     会先被数字规则吃掉，算成 03:01 而不是 03:15。 */
  let at = null;
  let ampmUnknown = false;
  const tm = t.match(new RegExp(`(${CN_NUM})\\s*[点:：]\\s*(半|一刻|三刻|${CN_NUM})?`));
  if (tm) {
    let h = cnToNum(tm[1]);
    let mi = 0;
    if (tm[2] === '半') mi = 30;
    else if (tm[2] === '一刻') mi = 15;
    else if (tm[2] === '三刻') mi = 45;
    else if (tm[2]) mi = cnToNum(tm[2]) || 0;
    /* 原话里明说了下午/晚上而钟点数 ≤12 → 是 12 小时制，加 12。
       没说上下午的，不替患者猜，标 ampmUnknown 让候选卡提示核对。 */
    const pm = /下午|傍晚|晚上|夜里|半夜|深夜/.test(t);
    const am = /上午|早上|早晨|凌晨|中午/.test(t);
    if (h != null && pm && h < 12) h += 12;
    if (h != null && h >= 0 && h <= 24 && mi >= 0 && mi < 60) {
      if (h <= 12 && !pm && !am) ampmUnknown = true;
      at = `${NOW}T${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;
    }
  }
  const ctxMap = [['开会', /开会|会议/], ['开车', /开车|驾车|堵车|等红灯/], ['吃饭', /吃饭|午饭|午餐|晚餐/], ['静坐', /坐着|静坐|坐着不动/], ['阅读', /看书|阅读|读书/], ['通勤', /地铁|公交|通勤|坐车/], ['其他', /其他/]];
  const ctx = (ctxMap.find(([, re]) => re.test(t)) || [])[0] || null;
  const prodrome = /预感|预兆|先觉/.test(t) ? '有' : null;
  return { at, context: ctx, min, prodrome: prodrome || '未记录', ampmUnknown, raw: t };
}
function agentReply(text) {
  const parsed = parseNapText(text);
  if (!text.trim()) return { html: '<p>先把想记的事说一句。</p>' };
  if (state.view === 'naps' || /睡着|犯困|发作|打了.*盹/.test(text)) {
    state.agentDraft = parsed;
    const missing = [parsed.at == null ? '时间' : null, parsed.context == null ? '情境' : null].filter(Boolean);
    if (missing.length) {
      return { html: `<p>我抽出 ${['时间', '情境', '时长'].filter((k) => ({ 时间: parsed.at, 情境: parsed.context, 时长: parsed.min })[k] != null).length} 个字段，<b>${esc(missing.join('、'))}</b>没识别出来。</p>
        <p class="msg-note">对不上就下面点「改一下」或拒收；空着比猜一个准。</p>`, candidate: true };
    }
    return { html: `<p>整理成一条候选：${esc(parsed.at.replace('T', ' '))} · ${esc(parsed.context)} · ${parsed.min == null ? '时长没记' : parsed.min + ' 分钟'}。</p>
      <p class="msg-note">核对后才会入库。</p>`, candidate: true };
  }
  if (state.view === 'ess') return { html: '<p>量表我不能估分。8 题你自己选，选完我在旁边帮你核对有没有漏项。</p>' };
  if (state.view === 'trials') {
    const rows = computeMatch(bioProfile(state.profile));
    const top = rows.slice(0, 3);
    return { html: `<p>按登记字段算，前 ${top.length} 条是：</p><ul style="margin:6px 0 0 16px;font-size:12.5px">${top.map((r) => `<li>${esc(r.t.id)} · 指数 ${r.index}（覆盖 ${r.knownCount} 维）</li>`).join('')}</ul>
      <p class="msg-note">指数只覆盖登记库有的字段，不代表能入组。</p>` };
  }
  return { html: `<p>收到了。演示版只把这句话记在会话里，不会自动生成记录——防止我替你写事实。</p>
    <p class="msg-note">要用 AI 记一条发作，去「嗜睡发作 · 记录发作」说那句话。</p>` };
}

/* ================= 10. render ================= */
function renderAgent() {
  const dock = $('#agent-dock'), grid = $('#work-grid'), toggle = $('#agent-toggle');
  if (!dock) return;
  dock.hidden = !state.agentOpen;
  grid.classList.toggle('with-agent', state.agentOpen);
  $('#agent-body').innerHTML = `<div class="msg bot"><p>${esc(AGENT_TIPS[state.view] || '')}</p><p class="msg-note">演示状态：这个面板不调用模型，但「输入 → 解析 → 候选卡」是真的链路。</p></div>
    ${state.agentLog.map((m) => `<div class="msg ${m.me ? 'me' : 'bot'}">${m.html}</div>`).join('')}`;
  $$('.agent-sizes button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.size === state.agentSize)));
  const w = state.agentSize === 'narrow' ? '26%' : state.agentSize === 'wide' ? '46%' : '35%';
  grid.style.setProperty('--agent-w', w);
  toggle.setAttribute('aria-expanded', String(state.agentOpen));
  $('#agent-state').textContent = state.agentOpen ? '已打开' : '未进入激活';
  const body = $('#agent-body');
  if (body) body.scrollTop = body.scrollHeight;
}

function render() {
  $('#nav').innerHTML = PAGES.map(([id, label, ic]) => `<button class="nav-button" data-nav="${id}" ${state.view === id ? 'aria-current="page"' : ''}>${icon(ic)}<span>${esc(label)}</span>${id === 'trials' ? `<span class="nav-count">${T.total}</span>` : ''}</button>`).join('');
  $('#breadcrumb').textContent = PAGES.find((x) => x[0] === state.view)[1];
  const p = P();
  $('#profile-name').textContent = `${p.name}的资料`;
  $('#profile-meta').textContent = `${p.age} 岁 · ${p.cataplexy === '有' ? '伴猝倒' : (p.meta.split('·')[1] || '').trim()}`;
  $('#profile-avatar').textContent = p.initial;
  $('#main').innerHTML = (VIEWS[state.view] || vDashboard)();
  renderAgent();
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

/* ---------------- dialogs ---------------- */
function dlgProfiles() {
  openDialog('小睡宝', '切换演示档案', `<div class="grid two">${Object.entries(PROFILES).map(([k, p]) => `<button class="task" data-action="pick-profile" data-p="${k}">
    <span class="task-icon" aria-hidden="true">${esc(p.initial)}</span><span class="task-main"><b>${esc(p.name)} · ${esc(p.age)} 岁</b><p>${esc(p.meta)}</p></span></button>`).join('')}</div>
    <p class="small-note">两个档案都是构造的模拟数据。B 档案是家长代记：每条记录会带「家长代记」标记。</p>`, '<button data-action="close">取消</button>');
}
function dlgSettings() {
  const ch = (T.channels || []).map((c) => `${c.id} ${c.status}(${c.count})`).join(' · ');
  openDialog('小睡宝', '设置', `<div class="notice">演示版不读写真实目录。真实版在这里配置：工作区目录、文档解析（MinerU 未接入）、临床数据库。</div>
    <div class="card" style="margin-top:12px"><h3>工作区</h3><p class="small-note">资料目录：<code>~/narcolepsy-workbench/data</code>（演示）</p></div>
    <div class="card" style="margin-top:12px"><h3>文档解析</h3><p class="small-note">MinerU：<b>本轮不接入</b>（docs/DEV-REQUIREMENTS §五默认值③）。没有 Token 也能用工作台，只是不能自动解析 PDF。</p></div>
    <div class="card" style="margin-top:12px"><h3>临床数据库</h3><p class="small-note">2026 临床试验：<b>已采集 ${T.total} 条</b>（${esc(String(T.generatedAt || '').slice(0, 10))}）。四通道终态：${esc(ch)}。</p>
      <p class="small-note">ictrp 为 partial（WAF 拦截只拿到第 1 页）、chictr_online 为 unsupported（返回「非法访问」）。这两条<b>不写成就绪</b>。</p></div>`,
    '<button class="primary" data-action="close">完成</button>');
}
function dlgAbout() {
  openDialog('小睡宝', '关于', `<div class="card"><div class="card-head"><h2>小睡宝 SnoozePal</h2>${pill(APP_INFO.channelLabel, 'violet')}</div>
    <dl class="kv"><dt>版本</dt><dd>${esc(APP_INFO.displayVersion)}</dd></dl>
    <dl class="kv"><dt>构建</dt><dd>${esc(APP_INFO.build)}</dd></dl>
    <dl class="kv"><dt>形态</dt><dd>交互原型（单机多文件）· 全部患者数据为模拟</dd></dl>
    <dl class="kv"><dt>临床数据</dt><dd>指南原件未取得（G1 只登记）；试验四通道实测 200 条（ctv 176 / ictrp 10 partial / chictr_online 0 unsupported / chinadrugtrials 14）</dd></dl>
    <dl class="kv"><dt>家族</dt><dd>小 X 宝家族 · SnoozePal 小睡宝</dd></dl></div>`,
    '<button class="primary" data-action="close">关闭</button>');
}
function dlgHelp() {
  openDialog('小睡宝', '原型操作说明', `<div class="notice">顶栏「AI 对话」打开右侧<b>原生会话挂载位</b>（可 × 隐藏、窄/标准/宽三档）。面板里有输入框：说一句"下午三点半开会睡着了大概二十分钟"，会真的走「解析 → 候选卡 → 核对入库」。</div>
    <div class="notice" style="margin-top:12px">左侧 <b>10 个一级页</b>、每页 <b>3 个二级 tab</b>，地址栏记成 <code>#view/slug</code>（例如 <code>#metrics/one</code>），刷新能还原。</div>
    <div class="notice" style="margin-top:12px">左上角品牌是<b>回首页</b>按钮；头像可切换两个演示档案。</div>
    <div class="notice" style="margin-top:12px"><b>三条红线</b>：ESS 不让 AI 估分；驾驶只记事实不给结论；私密条目默认折叠且不进导出。试验匹配只算登记库已有的字段，不判"能不能入组"。</div>`,
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
  const c = cand || state.agentDraft || { at: null, context: null, min: null, prodrome: '未记录' };
  openDialog('小睡宝', '核对这一条（候选）', `<div class="notice warn">这是从你那句话里整理出的<b>候选</b>。核对之前不会入库；拒收就什么都不发生。</div>
    <div class="cand" style="margin-top:12px"><div class="cand-head">候选字段 · 抽不到的就是空的</div><ul>
      <li><span>时间</span><span>${c.at ? esc(c.at.replace('T', ' ')) + (c.ampmUnknown ? '<br><span class="muted">原话没说上午/下午，按 24 小时制理解</span>' : '') : '<span class="muted">没识别出</span>'}</span></li>
      <li><span>情境</span><span>${c.context ? esc(c.context) : '<span class="muted">没识别出</span>'}</span></li>
      <li><span>时长</span><span>${c.min == null ? '<span class="muted">没识别出（可留空）</span>' : c.min + ' 分钟'}</span></li>
      <li><span>前驱</span><span>${esc(c.prodrome || '未记录')}</span></li>
    </ul></div>
    ${c.ampmUnknown ? `<div class="notice warn" style="margin-top:10px">这句里没说清是上午还是下午。<b>我没有替你猜</b>：上面按 24 小时制显示，不对就点「改一下」。</div>` : ''}
    ${c.raw ? `<p class="small-note">原话：${esc(c.raw)}</p>` : ''}
    <p class="small-note">哪一项不对就点「改一下」补齐，或拒收改用手工表单。</p>`,
    `<button data-action="close">拒收</button><button data-action="nap-edit">改一下</button><button class="primary" data-action="nap-confirm">确认入库</button>`);
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

/* ---------------- 整页视图内容 ---------------- */
function pvEssFill() {
  const draft = state.essDraftByProfile[state.profile] || {};
  const answered = Object.keys(draft).length;
  pageViewOpen('ess-fill', 'ESS 本次填写（整页）', `<div class="pv-wide">
    <div class="progress"><i style="width:${(answered / 8) * 100}%"></i></div>
    <p class="small-note">已答 ${answered}/8。逐题选，选完提交；整页比弹窗宽，8 题一屏看完不用来回滚。</p>
    ${ESS_ITEMS.map((q, i) => `<div class="ess-item"><div class="ess-q"><span class="qno">Q${i + 1}</span><b>${esc(q)}</b></div>
      <div class="ess-opts">${[0, 1, 2, 3].map((v) => `<button data-action="ess-pick" data-i="${i}" data-v="${v}" aria-pressed="${draft[i] === v}">${esc(['不会犯困', '偶尔会', '有时会', '很可能'][v])}</button>`).join('')}</div></div>`).join('')}
    <div style="display:flex;gap:9px;margin-top:16px;flex-wrap:wrap"><button class="primary" data-action="ess-submit" ${answered === 8 ? '' : 'disabled'}>提交这一次</button><button data-action="pv-close">取消</button></div>
  </div>`);
}
function pvVisitOnepage() {
  const sel = METRICS[state.profile];
  const get = (c) => (sel.find((m) => m.code === c) || { points: [] });
  const essP = get('ess_total').points, napP = get('nap_median_min').points;
  const qs = QUESTIONS[state.profile].filter((q) => !q.asked);
  const curMeds = MEDS[state.profile].filter((m) => !m.end);
  pageViewOpen('visit-onepage', '复诊前一页', `<div class="pv-print">
    <header class="print-head"><h1>复诊前一页</h1><p>${esc(P().name)} · ${esc(P().age)} 岁 · 生成于 ${esc(NOW)}（演示数据）</p></header>
    <section><h2>我要问的 ${qs.length} 个问题</h2><ol>${qs.map((q) => `<li>${esc(q.body)}</li>`).join('') || '<li>暂时没有</li>'}</ol></section>
    <section><h2>这段时间的记录</h2>
      <p>发作：${NAPS[state.profile].length} 次（其中 ${NAPS[state.profile].filter((n) => n.min == null).length} 次没记时长）</p>
      <p>单次时长中位数：${napP.length ? napP[napP.length - 1].v + ' 分钟（' + esc(fmtDate(napP[napP.length - 1].d)) + '）' : '—'}</p>
      <p>ESS：${essP.length ? essP.map((p) => esc(shortDate(p.d)) + ' ' + p.v + ' 分').join(' → ') : '无记录'}</p>
      <p>夜间记录：${NIGHTS[state.profile].length} 条</p>
    </section>
    <section><h2>当前用药</h2><ul>${curMeds.map((m) => `<li>${esc(m.name)} ${esc(m.dose)}（${esc(m.start)} 起）</li>`).join('') || '<li>无在用药记录</li>'}</ul></section>
    <section><h2>要带的材料</h2><ul><li>诊断证明、门诊病历</li><li>原始报告 ${P().exam.length} 份（PSG / MSLT）</li><li>本页打印件</li></ul></section>
    <footer class="print-foot"><p>本页只陈述记录与数字，不含任何判断或建议。分型与用药以医生意见为准。</p></footer>
  </div>`, { actions: '<button class="pv-btn" data-action="pv-print">打印 / 存成 PDF</button>' });
}
function pvTrialsLibrary() {
  const list = T.trials || [];
  pageViewOpen('trials-library', `试验库（${list.length} 条）`, `<div class="pv-wide">
    <p class="small-note">全部 ${list.length} 条按来源与状态列出。字段只有登记库里真有的那些；期别、国家缺失时显示「—」，不补。</p>
    <div class="table-wrap"><table class="data"><thead><tr><th>登记号</th><th>标题</th><th>状态</th><th>期别</th><th>国家</th><th>来源</th></tr></thead><tbody>
      ${list.map((t) => `<tr><td>${esc(t.id)}</td><td>${esc(t.title)}</td><td>${esc(t.status || '—')}</td><td>${esc(t.phase || '—')}</td><td>${esc(t.country || '—')}</td><td>${esc(t.source)}</td></tr>`).join('')}
    </tbody></table></div>
  </div>`);
}
function pvTrialsMatch() {
  const rows = computeMatch(bioProfile(state.profile));
  pageViewOpen('trials-match', `匹配结果（${rows.length} 条可计算）`, `<div class="pv-wide">
    <div class="notice warn"><b>指数只覆盖登记库有的字段。</b>没有入排标准、没有生物标志阈值、没有年龄区间，这三项不参与计算，也不当 0 分。</div>
    <div class="table-wrap"><table class="data"><thead><tr><th>登记号</th><th>标题</th><th class="num">指数</th><th>逐维度依据</th></tr></thead><tbody>
      ${rows.map((r) => `<tr><td>${esc(r.t.id)}</td><td>${esc(r.t.title)}</td><td class="num"><b>${r.index}</b></td>
        <td>${r.dims.map((d) => `<div style="font-size:12px">${esc(d.name)}：${d.score == null ? '<span class="muted">未知（不计入）</span>' : (d.score >= 1 ? '命中' : d.score > 0 ? '部分' : '不符')} · ${esc(d.basis)}</div>`).join('')}</td></tr>`).join('')}
    </tbody></table></div>
  </div>`);
}
function pvTrialsProfile() {
  const bio = bioProfile(state.profile);
  pageViewOpen('trials-profile', '个人生物标志建档（整页编辑）', `<div class="pv-wide">
    <p class="small-note">这里只抄报告上已有的结论。没做的写「未测」——工作台不提示你补哪项检查。</p>
    <div class="grid two">
      <label class="field"><span class="form-label">分型（医生诊断原文）</span><input value="${esc(bio.subtype.known ? bio.subtype.value : '')}" placeholder="例如 1 型（伴猝倒）"></label>
      <label class="field"><span class="form-label">HLA-DRB1*15:01</span><input value="${esc(bio.hla.known ? bio.hla.value : '')}" placeholder="阳性 / 阴性 / 未测"></label>
      <label class="field"><span class="form-label">脑脊液食欲素-A（pg/mL）</span><input value="${bio.orexin.known ? esc(bio.orexin.value) : ''}" placeholder="留空 = 未测"></label>
      <label class="field"><span class="form-label">MSLT 平均睡眠潜伏期（分钟）</span><input value="${bio.mslt.known ? esc(bio.mslt.value) : ''}" placeholder="留空 = 未测"></label>
    </div>
    <div class="notice plain">保存后只影响匹配时用的输入，不改检查原文。存档入口在资料目录 imports/。</div>
    <div style="margin-top:14px"><button class="primary" data-action="pv-close">返回</button></div>
  </div>`);
}
function pvNapDetail() {
  const naps = NAPS[state.profile].slice(0, 40);
  pageViewOpen('naps-detail', `发作明细（最近 ${naps.length} 次）`, `<div class="pv-wide">
    <p class="small-note">一次一行。时长「没记」保持空，不填 0。</p>
    <div class="table-wrap"><table class="data"><thead><tr><th>时间</th><th>情境</th><th class="num">时长</th><th>前驱</th><th>来源</th></tr></thead><tbody>
      ${naps.map((n) => `<tr><td>${esc(n.at.replace('T', ' '))}</td><td>${esc(n.context)}</td><td class="num">${n.min == null ? '<span class="muted">没记</span>' : n.min + ' 分'}</td><td>${esc(n.prodrome)}</td><td>${n.proxy ? '家长代记' : '本人'}</td></tr>`).join('')}
    </tbody></table></div>
  </div>`);
}

/* ================= 11. 事件 ================= */
document.addEventListener('click', (e) => {
  /* 整页视图内的按钮先处理（它在 modal 层，别被下面的逻辑抢走） */
  const pvBtn = e.target.closest('[data-action^="pv-"]');
  if (pvBtn) {
    const a = pvBtn.dataset.action;
    if (a === 'pv-back') { pageViewBack(); return; }
    if (a === 'pv-close') { pageViewClose(); return; }
    if (a === 'pv-print') { toast('演示版不真的调用打印；真实版这里走 window.print() 并套 @media print 样式。'); return; }
  }

  const nav = e.target.closest('[data-nav]');
  if (nav) {
    state.view = nav.dataset.nav; state.sub[state.view] = 0; state.privateOpen = false;
    location.hash = hashOf(state.view, 0); render(); $('#main').focus({ preventScroll: true }); window.scrollTo(0, 0); return;
  }
  const sub = e.target.closest('[data-sub]');
  if (sub) {
    state.sub[state.view] = +sub.dataset.sub; state.privateOpen = false;
    location.hash = hashOf(state.view, +sub.dataset.sub); render(); return;
  }
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const act = el.dataset.action;

  /* 指标卡翻转：只改属性，不重绘（重绘会打断 480ms 过渡，27 号合同） */
  if (act === 'mcard-flip') {
    const code = el.dataset.code;
    const on = !state.flipped.has(code);
    if (on) state.flipped.add(code); else state.flipped.delete(code);
    el.setAttribute('aria-pressed', String(on));
    return;
  }
  /* 一图秀指标开关：这里**允许**重绘（图表本身没有过渡动画依赖） */
  if (act === 'one-toggle') {
    const code = el.dataset.code;
    if (state.one.sel.includes(code)) state.one.sel = state.one.sel.filter((x) => x !== code);
    else if (state.one.sel.length < 4) state.one.sel = [...state.one.sel, code];
    else { toast('最多 4 条线；先关掉一条再加。'); return; }
    render(); return;
  }

  /* 合同：`<实体>:agent-draft` 一律产出候选卡，不直接入库（ZERO-TO-DEV 1.4） */
  if (act.endsWith(':agent-draft')) {
    const entity = act.split(':')[0];
    state.agentOpen = true;
    if (entity === 'ess') { toast('量表不让 AI 估分：8 题需要你自己选。'); return; }
    if (entity === 'naps') {
      state.agentLog.push({ me: false, html: '<p>把想记的说一句，我整理成候选：例如「下午三点半开会睡着了大概二十分钟」。</p>' });
      renderAgent();
      const inp = $('#agent-input');
      if (inp) inp.focus();
      return;
    }
    toast(`已把「${entity}」的整理请求放进会话区（演示：不调用模型）。真实版会返回候选卡，核对后才入库。`);
    renderAgent(); return;
  }

  const map = {
    home: () => { state.view = 'dashboard'; state.sub.dashboard = 0; location.hash = hashOf('dashboard', 0); render(); toast('回到看板'); },
    profiles: dlgProfiles, settings: dlgSettings, about: dlgAbout, help: dlgHelp, close: closeDialog,
    'open-store': () => toast('资料目录已激活（演示）'),
    agent: () => { state.agentOpen = !state.agentOpen; renderAgent(); },
    'agent-send': () => {
      const inp = $('#agent-input');
      const text = inp ? inp.value : '';
      if (!inp) return;
      state.agentLog.push({ me: true, html: `<p>${esc(text || '（空）')}</p>` });
      const r = agentReply(text);
      state.agentLog.push({ me: false, html: r.html + (r.candidate ? '<p style="margin-top:8px"><button class="soft" data-action="nap-candidate">打开候选卡</button></p>' : '') });
      inp.value = '';
      renderAgent();
      if (r.candidate) { state.agentOpen = true; renderAgent(); }
    },
    'nap-candidate': () => dlgNapCandidate(state.agentDraft || parseNapText('')),
    'agent-build': () => toast('已生成"本页要点"提示词（演示）：只包含已核对的事实，不含私密条目。'),
    'agent-demo': () => toast('模拟回复自检通过：未发现诊断性表述、未发现用药建议。'),
    'go-naps-add': () => { state.view = 'naps'; state.sub.naps = 0; location.hash = hashOf('naps', 0); render(); },
    'go-ess-fill': () => { state.view = 'ess'; state.sub.ess = 0; location.hash = hashOf('ess', 0); render(); },
    'go-visit': () => { state.view = 'visit'; state.sub.visit = 0; location.hash = hashOf('visit', 0); render(); },
    'go-admin': () => { state.view = 'admin'; state.sub.admin = 0; location.hash = hashOf('admin', 0); render(); },
    'go-night-add': () => { state.view = 'night'; state.sub.night = 0; location.hash = hashOf('night', 0); render(); },
    'go-meds': () => { state.view = 'meds'; state.sub.meds = 0; location.hash = hashOf('meds', 0); render(); },
    'go-metrics-latest': () => { state.view = 'metrics'; state.sub.metrics = 0; location.hash = hashOf('metrics', 0); render(); },
    'go-metrics-cards': () => { state.view = 'metrics'; state.sub.metrics = 0; location.hash = hashOf('metrics', 0); render(); },
    'go-trials-match': () => { state.view = 'trials'; state.sub.trials = 1; location.hash = hashOf('trials', 1); render(); },
    'go-trials-library': () => { state.view = 'trials'; state.sub.trials = 2; location.hash = hashOf('trials', 2); render(); },
    'go-diagnosis-timeline': () => { state.view = 'diagnosis'; state.sub.diagnosis = 2; location.hash = hashOf('diagnosis', 2); render(); },
    'pick-profile': (node) => {
      state.profile = node.dataset.p; state.privateOpen = false;
      /* 草稿按档案分开存：切档案不清草稿（评审 P2-1） */
      closeDialog(); render(); toast(`已切换到 ${P().name} 的资料（演示）`);
    },
    'view-source': () => openDialog('小睡宝', '原文出处', `<p style="font-size:12.5px">原始报告存放在资料目录 <code>imports/</code> 下（演示）。</p><p class="small-note">工作台不改动原文，也不替你解释它。</p>`, '<button class="primary" data-action="close">关闭</button>'),
    'nap-manual': dlgNapManual,
    'nap-save': () => {
      const at = $('#nap-at').value || '2026-10-25T15:30';
      const min = $('#nap-min').value === '' ? null : +$('#nap-min').value;
      NAPS[state.profile].unshift({ at, context: $('#nap-ctx').value, min, prodrome: $('#nap-prod').value, proxy: state.profile === 'B' ? 1 : 0, note: '' });
      NAPS[state.profile].sort((a, b) => (a.at < b.at ? 1 : -1));
      closeDialog(); render(); toast('已保存这一条发作（演示：只在本页内存里，刷新重置）');
    },
    'nap-edit': () => { closeDialog(); dlgNapManual(); },
    'nap-confirm': () => {
      const c = state.agentDraft;
      if (!c || c.at == null || c.context == null) { toast('时间和情境还没识别出来，先点「改一下」补齐。'); return; }
      NAPS[state.profile].unshift({ at: c.at, context: c.context, min: c.min, prodrome: c.prodrome || '未记录', proxy: state.profile === 'B' ? 1 : 0, note: '来自对话' });
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
      METRICS[state.profile].push({ code: 'm' + Date.now().toString(36), track: 'lab', label, unit: $('#mt-unit').value.trim(), dec: 1, kind: 'numeric', refLow: $('#mt-lo').value === '' ? null : +$('#mt-lo').value, refHigh: $('#mt-hi').value === '' ? null : +$('#mt-hi').value, source: '手工记录', points: [{ d: NOW, v: +v }], note: '手工加的一条，未在报告上核对' });
      closeDialog(); render(); toast('已加一条指标；缺参考上限会显示「需参考上限」');
    },
    'ess-pick': (node) => {
      const d = state.essDraftByProfile[state.profile] || (state.essDraftByProfile[state.profile] = {});
      d[+node.dataset.i] = +node.dataset.v;
      render(); if (state.pageStack.length) renderPageView();
    },
    'ess-reset': () => { state.essDraftByProfile[state.profile] = {}; render(); },
    'ess-fullpage': () => pvEssFill(),
    'ess-items-fullpage': () => pvEssFill(),
    'ess-submit': () => {
      const d = state.essDraftByProfile[state.profile] || {};
      if (Object.keys(d).length !== 8) { toast('还差几题没选。'); return; }
      ESS[state.profile].push({ at: NOW, q: [0, 1, 2, 3, 4, 5, 6, 7].map((i) => d[i]), proxy: state.profile === 'B' ? 1 : 0, note: '本次填写' });
      state.essDraftByProfile[state.profile] = {};
      if (state.pageStack.length) pageViewClose();
      state.sub.ess = 1; location.hash = hashOf('ess', 1); render();
      toast('已提交：去「历史序列」看这一次');
    },
    'metric-pick': (node) => {
      const c = node.dataset.code;
      state.one.sel = state.one.sel.includes(c) ? state.one.sel.filter((x) => x !== c) : [...state.one.sel, c];
      render();
    },
    'add-question': dlgQuestionAdd,
    'q-save': () => {
      const b = $('#q-body').value.trim();
      if (!b) { toast('问题还是空的。'); return; }
      QUESTIONS[state.profile].push({ body: b, forVisit: null, asked: null });
      closeDialog(); render(); toast('已加入问题清单');
    },
    'ask-mark': (node) => { QUESTIONS[state.profile][+node.dataset.i].asked = NOW; render(); toast('已标记为问过'); },
    'toggle-private': () => { state.privateOpen = !state.privateOpen; render(); },
    'admin-export': () => toast('已保存到资料目录 exports/（演示）；私密条目未包含。'),
    'admin-copy': () => toast('已复制到剪贴板（演示）。'),
    /* 整页视图入口 */
    'visit-onepage': () => pvVisitOnepage(),
    'naps-detail': () => pvNapDetail(),
    'trials-match-fullpage': () => pvTrialsMatch(),
    'trials-library-fullpage': () => pvTrialsLibrary(),
    'trials-profile-fullpage': () => pvTrialsProfile(),
    'trials-run-match': () => { state.view = 'trials'; state.sub.trials = 1; location.hash = hashOf('trials', 1); render(); toast('已用当前建档重算匹配'); },
    'trials-explain': () => {
      const rows = computeMatch(bioProfile(state.profile));
      const r = rows[0];
      if (!r) { toast('没有可计算的条目。'); return; }
      openDialog('小睡宝 · 匹配依据', r.t.title, `<div class="cand"><div class="cand-head">${esc(r.t.id)} · 指数 ${r.index}/100</div>
        <ul>${r.dims.map((d) => `<li><span>${esc(d.name)}</span><span>${d.score == null ? '未知（不计入分母）' : (d.score >= 1 ? '命中' : d.score > 0 ? '部分 ' + d.score : '不符')}<br><span class="muted">${esc(d.basis)}</span></span></li>`).join('')}</ul></div>
        <div class="notice plain">覆盖 ${r.knownCount} 个已知维度${r.missing.length ? `，${esc(r.missing.join('、'))} 未知` : ''}。入排标准、生物标志阈值、年龄区间登记库里没有，任何指数都不能替代研究者的入排评估。</div>`,
        '<button class="primary" data-action="close">关闭</button>');
    },
    'agent-size': () => {}
  };
  if (act === 'agent-size') { state.agentSize = el.dataset.size; renderAgent(); return; }
  if (map[act]) map[act](el);
});

document.addEventListener('change', (e) => {
  const a = e.target.dataset ? e.target.dataset.action : null;
  if (a === 'one-toggle-treatment') { state.one.toggles.treatment = e.target.checked; render(); }
  if (a === 'one-toggle-nodes') { state.one.toggles.nodes = e.target.checked; render(); }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (state.pageStack.length) { pageViewClose(); return; }
    if ($('#dialog').open) closeDialog();
  }
  /* 会话区里按 Enter（不带 Shift）就发送 */
  if (e.key === 'Enter' && !e.shiftKey && e.target.id === 'agent-input') { e.preventDefault(); const b = $('[data-action="agent-send"]'); if (b) b.click(); }
});
/* 浏览器返回键等价 back（32 号 A3） */
window.addEventListener('popstate', (ev) => {
  if (ev.state && ev.state.pv) {
    while (state.pageStack.length > ev.state.pv) state.pageStack.pop();
    renderPageView();
    return;
  }
  if (state.pageStack.length) { state.pageStack = []; renderPageView(); }
});
window.addEventListener('hashchange', () => {
  const h = location.hash;
  if (h.startsWith('#page=')) { /* 刷新带 #page= 时由 boot 处理，不在这里抢 */ return; }
  const { view, sub } = hashParts();
  if (view === state.view && sub === (state.sub[state.view] || 0)) return;
  state.view = view; state.sub[view] = sub; state.privateOpen = false; render();
});
$('#font-toggle').addEventListener('click', () => { const on = document.body.classList.toggle('large'); $('#font-toggle').setAttribute('aria-pressed', String(on)); });

/* boot：刷新带 #page= 时把整页视图还原到该页（32 号 A7） */
(function boot() {
  render();
  const m = location.hash.match(/^#page=(.+)$/);
  if (m) {
    const key = m[1];
    const map = { 'visit-onepage': pvVisitOnepage, 'trials-library': pvTrialsLibrary, 'trials-match': pvTrialsMatch, 'trials-profile': pvTrialsProfile, 'ess-fill': pvEssFill, 'naps-detail': pvNapDetail };
    if (map[key]) { map[key](); history.replaceState({ pv: 1 }, '', '#page=' + key); }
  }
})();

})();
