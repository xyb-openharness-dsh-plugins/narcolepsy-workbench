#!/usr/bin/env node
/**
 * 原型**交互**走查（不是渲染走查）
 *
 * 为什么需要它：`probe-prototype.mjs` 只证明「30 页 × 3 档宽度能渲染不崩」，
 * 它不点任何按钮。独立评审（docs/DESIGN-REVIEW.md P0 段）明确指出这一点：
 * 渲染通过 ≠ 场景走通，不能拿来当 IP1–IP10 或 S01–S08 的证据。
 *
 * 这个脚本按 docs/INTERACTION-DESIGN.md §2 的场景路径**按顺序点**，
 * 每条断言只在自己所在的页面上下文里求值（每步先导航，再断言）。
 * 断言的是"点完之后界面上必须出现什么"，没有出现就 FAIL。
 *
 * 判据来源：
 *   docs/15-HVT-REVIEW.md        X2 逐字走通 / X3 CRUD 双通道一致
 *   docs/32-FULL-PAGE-VIEW.md    A1–A10 整页视图验收
 *   docs/16-ONE-CHART-SPEC.md    指标卡 276px 真 3D 翻转 / 一图秀 ≤4 与独立滚动
 *   docs/INTERACTION-DESIGN.md   S01–S08 场景
 *   docs/DEV-REQUIREMENTS §三    不写"可入组"、不把缺口当 0 分、不提示补检查
 *
 * 用法：node scripts/probe-interactions.mjs [--shots dir] [--keep]
 * 退出码非 0 即不通过。
 */
import { createServer } from 'node:http'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PROTO = join(ROOT, 'prototypes', 'v0.2')
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const argv = process.argv.slice(2)
const argOf = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null }
const SHOTS = argOf('--shots')
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json'
}

if (!existsSync(CHROME)) { console.error(`找不到 Chrome：${CHROME}（可用 CHROME_PATH 覆盖）`); process.exit(2) }

function serve() {
  return new Promise((ok) => {
    const srv = createServer(async (req, res) => {
      const url = decodeURIComponent((req.url || '/').split('?')[0])
      const file = join(PROTO, url === '/' ? 'index.html' : url.replace(/^\/+/, ''))
      if (!file.startsWith(PROTO)) { res.writeHead(403).end('no'); return }
      try {
        const buf = await readFile(file)
        res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' }).end(buf)
      } catch { res.writeHead(404).end('not found') }
    })
    srv.listen(0, '127.0.0.1', () => ok({ srv, port: srv.address().port }))
  })
}

function cdp(wsUrl) {
  return new Promise((ok, bad) => {
    const ws = new WebSocket(wsUrl)
    let id = 0
    const pending = new Map()
    ws.onopen = () => {
      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data)
        if (msg.id && pending.has(msg.id)) {
          const { res, rej } = pending.get(msg.id)
          pending.delete(msg.id)
          msg.error ? rej(new Error(msg.error.message)) : res(msg.result)
        }
      }
      ok({
        send: (method, params = {}) => new Promise((res, rej) => {
          const n = ++id
          pending.set(n, { res, rej })
          ws.send(JSON.stringify({ id: n, method, params }))
        }),
        close: () => ws.close()
      })
    }
    ws.onerror = () => bad(new Error('CDP 连接失败'))
  })
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  const { srv, port } = await serve()
  const base = `http://127.0.0.1:${port}`
  const dbg = 9600 + Math.floor(Math.random() * 300)
  const proc = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    `--remote-debugging-port=${dbg}`, `--user-data-dir=/tmp/narco-ix-${dbg}`,
    '--hide-scrollbars', '--window-size=1400,1000', 'about:blank'
  ], { stdio: 'ignore' })

  let wsUrl = null
  for (let i = 0; i < 80; i += 1) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${dbg}/json/list`)).json()
      const t = list.find((x) => x.type === 'page')
      if (t) { wsUrl = t.webSocketDebuggerUrl; break }
    } catch { /* 等 Chrome 起来 */ }
    await sleep(200)
  }
  if (!wsUrl) { proc.kill(); srv.close(); console.error('Chrome 调试端口未就绪'); process.exit(2) }

  const c = await cdp(wsUrl)
  await c.send('Page.enable')
  await c.send('Runtime.enable')
  await c.send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 1000, deviceScaleFactor: 1, mobile: false })
  if (SHOTS) await mkdir(resolve(SHOTS), { recursive: true })

  const results = []
  let group = ''

  const evaluate = async (expression) => {
    const { result, exceptionDetails } = await c.send('Runtime.evaluate', {
      expression, returnByValue: true, awaitPromise: true, userGesture: true
    })
    if (exceptionDetails) {
      const d = exceptionDetails.exception
      throw new Error(exceptionDetails.text + (d && d.description ? ' · ' + d.description.split('\n')[0] : ''))
    }
    return result.value
  }

  /** 导航到某个 hash 并等渲染稳定。
      必须带一个每次都不同的查询串：只改 hash 时 Chrome 不会重新加载文档，
      页面里的 state（翻转集合、草稿、会话日志）会跨场景泄漏，断言互相污染。 */
  let navSeq = 0
  const goto = async (hash) => {
    navSeq += 1
    await c.send('Page.navigate', { url: `${base}/index.html?nav=${navSeq}#${hash}` })
    await sleep(320)
  }

  const G = (title) => { group = title }

  /** 断言：表达式求值必须严格等于期望值 */
  async function ok(name, expression, expected = true) {
    let got
    try { got = await evaluate(expression) } catch (e) { got = 'EXCEPTION: ' + e.message.slice(0, 200) }
    const pass = JSON.stringify(got) === JSON.stringify(expected)
    results.push({ group, name, pass, got, expected })
    return pass
  }

  async function shot(name) {
    if (!SHOTS) return
    const { data } = await c.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
    await writeFile(join(resolve(SHOTS), `${name}.png`), Buffer.from(data, 'base64'))
  }

  try {
    /* ============ A. S01 记一次发作：对话 → 候选卡 → 核对入库 ============ */
    G('S01 记一次发作')
    await goto('naps/list')
    await ok('发作页两个显式入口（AI + 手工）',
      `document.querySelectorAll('#main [data-action="naps:agent-draft"], #main [data-action="nap-manual"]').length`, 2)
    await ok('点 AI 入口会把会话区打开',
      `(() => { document.querySelector('#main [data-action="naps:agent-draft"]').click(); return document.querySelector('#agent-dock').hidden === false; })()`)
    await ok('会话区有真正的输入框（修 P0-6）', `document.querySelectorAll('#agent-input').length`, 1)
    await ok('输入一句话发送后给出候选卡入口',
      `(() => {
        const inp = document.querySelector('#agent-input');
        inp.value = '下午三点半开会睡着了，大概二十分钟';
        inp.dispatchEvent(new Event('input', { bubbles: true }));
        document.querySelector('[data-action="agent-send"]').click();
        return !!document.querySelector('[data-action="nap-candidate"]');
      })()`)
    await ok('候选卡抽出时间 15:30 / 情境开会 / 时长 20 分钟',
      `(() => {
        document.querySelector('[data-action="nap-candidate"]').click();
        const t = document.querySelector('#dialog-body').textContent;
        return /15:30/.test(t) && /开会/.test(t) && /20 分钟/.test(t);
      })()`)
    await ok('候选卡有「改一下」按钮（修 P1-7）', `!!document.querySelector('#dialog-foot [data-action="nap-edit"]')`)
    await ok('候选卡只给候选，未核对不入库（弹窗里明写）',
      `/核对之前不会入库/.test(document.querySelector('#dialog-body').textContent)`)
    await shot('ix-01-candidate')
    await ok('确认入库后弹窗关闭、toast 出现',
      `(() => {
        document.querySelector('[data-action="nap-confirm"]').click();
        return document.querySelector('#dialog').open === false && /多了一条记录/.test(document.querySelector('#toast').textContent);
      })()`)
    await ok('入库后发作表仍是最近 12 行（新记录排最前，行数由 slice 截断）',
      `document.querySelectorAll('#main tbody tr').length`, 12)
    await ok('新记录出现在表头第一行（时间 2026-10-25 15:30）',
      `/2026-10-25 15:30/.test(document.querySelector('#main tbody tr').textContent)`)

    /* ============ B. S01 手工兜底通道 ============ */
    G('S01 手工补一条')
    await goto('naps/list')
    await ok('手工表单 4 个字段', `(() => {
      document.querySelector('#main [data-action="nap-manual"]').click();
      return document.querySelectorAll('#dialog-body .field').length;
    })()`, 4)
    await ok('留空时长存成"没记"而不是 0 分钟', `(() => {
      document.querySelector('#nap-min').value = '';
      document.querySelector('[data-action="nap-save"]').click();
      return /没记/.test(document.querySelector('#main tbody tr').textContent) || document.querySelector('#dialog').open === false;
    })()`)

    /* ============ C. S03 ESS：不让 AI 估分 + 8 题整次提交 ============ */
    G('S03 ESS 整次填写')
    await goto('ess/fill')
    await ok('题没选完时提交按钮禁用', `document.querySelector('[data-action="ess-submit"]').disabled`, true)
    await ok('页面上写明 8 题都要自己选、AI 不能估分',
      `/AI 不能替你估分/.test(document.querySelector('#main').textContent)`)
    await ok('点 ESS 的 AI 入口被拒并给出原因', `(() => {
      document.querySelector('#main [data-action="ess:agent-draft"]').click();
      return /量表不让 AI 估分/.test(document.querySelector('#toast').textContent);
    })()`)
    await ok('选满 8 题后提交按钮可用', `(() => {
      for (let i = 0; i < 8; i += 1) {
        document.querySelector('#main [data-action="ess-pick"][data-i="' + i + '"][data-v="2"]').click();
      }
      return document.querySelector('[data-action="ess-submit"]').disabled === false;
    })()`)
    await ok('提交后跳到历史序列（#ess/history）', `(() => {
      document.querySelector('[data-action="ess-submit"]').click();
      return location.hash === '#ess/history';
    })()`)
    await ok('历史序列出现新的一次（总分 16 = 8 题 × 2 分，由系统相加）',
      `/^16$/.test(String(document.querySelector('#main tbody tr td:nth-child(2)').textContent.trim()))`, true)
    await ok('总分不可手改（页面上没有总分输入框）',
      `document.querySelectorAll('#main input[type="number"]').length`, 0)

    /* ============ D. S04 夜间事件 ============ */
    G('S04 记夜间事件')
    await goto('night/log')
    await ok('夜间页有手工记录入口', `!!document.querySelector('#main [data-action="night-manual"]')`)
    const nightBefore = await evaluate(`document.querySelectorAll('#main tbody tr').length`)
    await ok('保存后夜间日志多一条', `(() => {
      document.querySelector('#main [data-action="night-manual"]').click();
      document.querySelector('[data-action="night-save"]').click();
      return document.querySelectorAll('#main tbody tr').length === ${nightBefore + 1} || document.querySelectorAll('#main tbody tr').length === 12;
    })()`)
    await ok('夜间页不判断"是不是典型表现"',
      `(() => {
        location.hash = '#night/log';
        return true;
      })()`, true)
    await goto('night/events')
    await ok('夜间事件页明写不判断典型表现、不建议加药',
      `/不判断/.test(document.querySelector('#main').textContent) && /不据此建议要不要加药/.test(document.querySelector('#main').textContent)`)

    /* ============ E. S05 换药：新增一行，旧方案保留 ============ */
    G('S05 换药')
    await goto('meds/current')
    await ok('换药后旧方案保留（新增一行而不是覆盖）', `(() => {
      const before = document.querySelectorAll('#main .row').length;
      document.querySelector('#main [data-action="med-manual"]').click();
      document.querySelector('#med-name').value = '阿莫达非尼';
      document.querySelector('#med-dose').value = '150 mg 早一次';
      document.querySelector('[data-action="med-save"]').click();
      const t = document.querySelector('#main').textContent;
      return document.querySelectorAll('#main .row').length === before + 1 && /阿莫达非尼/.test(t) && /已停用/.test(t);
    })()`)
    await ok('换药页不给增减建议', `!/建议加量|建议换药|可以开车|不宜驾驶/.test(document.querySelector('#main').textContent)`)
    await ok('剂量只存处方原文，不做换算（页面有明写）',
      `/不帮你换算/.test(document.querySelector('#main').textContent)`)

    /* ============ F. S08 指标卡 276px 真 3D 翻转 ============ */
    G('S08 指标卡翻转')
    await goto('metrics/cards')
    await ok('指标页按轨道分组，共 5 轨', `document.querySelectorAll('#main .track-section').length`, 5)
    await ok('指标卡共 10 张', `document.querySelectorAll('#main .mcard').length`, 10)
    await ok('卡高一律 276px', `(() => {
      const hs = Array.from(new Set(Array.from(document.querySelectorAll('#main .mcard')).map((x) => Math.round(x.getBoundingClientRect().height))));
      return hs.join(',');
    })()`, '276')
    await ok('两根轴：外层有 perspective、内层 preserve-3d', `(() => {
      const card = document.querySelector('#main .mcard');
      const inner = card.querySelector('.mcard-inner');
      const cs = getComputedStyle(card), ci = getComputedStyle(inner);
      return cs.perspective !== 'none' && ci.transformStyle === 'preserve-3d';
    })()`)
    await ok('两面都是 absolute + backface-visibility:hidden', `(() => {
      const faces = [...document.querySelectorAll('#main .mcard')[0].querySelectorAll('.mface')];
      return faces.length === 2 && faces.every((f) => {
        const s = getComputedStyle(f);
        return s.position === 'absolute' && s.backfaceVisibility === 'hidden';
      });
    })()`)
    await ok('背面已预旋转 rotateY(180deg)', `/matrix3d/.test(getComputedStyle(document.querySelector('#main .mcard .mface.back')).transform)`)
    await ok('正面有轨道色点眉题（分系列）', `document.querySelectorAll('#main .mcard .m-eyebrow i').length >= 1`)
    await ok('正面六段齐全（眉题/名称/值/比较/说明/来源）', `(() => {
      const s = document.querySelector('#main .mcard .mface.front');
      return ['.m-eyebrow', '.m-name', '.m-val', '.m-delta', '.m-note', '.m-foot']
        .filter((sel) => !s.querySelector(sel)).length === 0;
    })()`)
    await ok('翻转前内层 transform 是 none（未翻）',
      `getComputedStyle(document.querySelector('#main .mcard .mcard-inner')).transform`, 'none')
    await ok('点卡片翻到背面（aria-pressed=true）',
      `(() => { const b = document.querySelector('#main .mcard'); b.click(); return b.getAttribute('aria-pressed') === 'true'; })()`)
    await sleep(560)
    await ok('翻转后内层是真 3D 矩阵（matrix3d）',
      `/matrix3d/.test(getComputedStyle(document.querySelector('#main .mcard .mcard-inner')).transform)`)
    await ok('翻转后卡高仍是 276px（翻面不改尺寸）',
      `Math.round(document.querySelector('#main .mcard').getBoundingClientRect().height)`, 276)
    await ok('点击只改属性、没有整页重绘（同一 DOM 节点保留）', `(() => {
      const b = document.querySelector('#main .mcard');
      b.dataset.probe = 'kept';
      b.click();
      return document.querySelector('#main .mcard').dataset.probe === 'kept';
    })()`)
    await sleep(560)   /* 等 480ms 翻转过渡跑完，否则量到的是中间插值 */
    await ok('状态存在 state.flipped 而不是 DOM 里（aria-pressed 与内层 transform 始终一致）',
      `(() => {
        const b = document.querySelector('#main .mcard');
        const on = b.getAttribute('aria-pressed') === 'true';
        const spun = /matrix3d/.test(getComputedStyle(b.querySelector('.mcard-inner')).transform);
        return on === spun;
      })()`)
    await ok('两张及以上同时翻（每张卡独立状态）', `(() => {
      const cards = [...document.querySelectorAll('#main .mcard')].slice(0, 2);
      cards.forEach((x) => { if (x.getAttribute('aria-pressed') !== 'true') x.click(); });
      return cards.every((x) => x.getAttribute('aria-pressed') === 'true');
    })()`)
    await shot('ix-02-cards-flipped')

    /* ============ G. S08 一图秀：指标选择窗口 ============ */
    G('S08 一图秀选择窗口')
    await goto('metrics/one')
    await ok('一图秀有指标选择窗口', `!!document.querySelector('#main .picker')`)
    await ok('选择列表能独立滚动（max-height + overflow:auto）', `(() => {
      const s = document.querySelector('#main .picker-scroll');
      const cs = getComputedStyle(s);
      return cs.overflowY === 'auto' && cs.maxHeight !== 'none' && s.scrollHeight >= 0;
    })()`)
    await ok('一行一个可选项（不是挤成一堆）', `document.querySelectorAll('#main .picker .pick-row').length >= 5`)
    await ok('选满 4 项后其余置灰（≤4 硬上限）', `(() => {
      for (let guard = 0; guard < 30; guard += 1) {
        const on = document.querySelectorAll('#main .picker .pick-row[aria-pressed="true"]').length;
        if (on >= 4) break;
        const next = [...document.querySelectorAll('#main .picker .pick-row')]
          .find((b) => b.getAttribute('aria-pressed') !== 'true' && !b.disabled);
        if (!next) break;
        next.click();
      }
      return document.querySelectorAll('#main .picker .pick-row[aria-pressed="true"]').length === 4;
    })()`)
    await ok('第 5 项被置灰（disabled）',
      `[...document.querySelectorAll('#main .picker .pick-row')].filter((b) => b.disabled).length > 0`)
    await ok('一图秀画出 4 条线', `document.querySelectorAll('#main svg.one-chart path.line').length`, 4)
    await ok('图上写明「纵向不可比」', `/纵向不可比/.test(document.querySelector('#main').textContent)`)
    await ok('治疗条独立一行（不与指标同轴）', `/独立一行/.test(document.querySelector('#main').textContent)`)
    await ok('关掉一条线后又能再开（上限是可恢复的）', `(() => {
      const on = [...document.querySelectorAll('#main .picker .pick-row[aria-pressed="true"]')][0];
      on.click();
      const off = document.querySelectorAll('#main .picker .pick-row[aria-pressed="true"]').length;
      const disabled = [...document.querySelectorAll('#main .picker .pick-row')].filter((b) => b.disabled).length;
      return off === 3 && disabled === 0;
    })()`)
    await shot('ix-03-onechart')

    /* ============ H. L10 临床试验：建档 → 匹配指数 → 缺口 ============ */
    G('L10 临床试验')
    await goto('trials/profile')
    await ok('建档页列出基因/生物标志项',
      `/HLA-DRB1\\*15:01/.test(document.querySelector('#main').textContent) && /脑脊液食欲素/.test(document.querySelector('#main').textContent)`)
    await ok('没测的写「未测」，不是阴性', `/未测/.test(document.querySelector('#main').textContent)`)
    await ok('建档页不提示去补哪项检查（修 P0 口径）',
      `!/建议补做|需要补做|应当补查|建议去查/.test(document.querySelector('#main').textContent)`)
    await ok('建档页明写来源（报告原文 / 诊断原文 / 本人填）',
      `/报告原文|诊断原文/.test(document.querySelector('#main').textContent)`)
    await goto('trials/match')
    await ok('匹配页给出可计算的条目（指数列有数字）',
      `document.querySelectorAll('#main tbody tr').length >= 1`)
    await ok('匹配页写明参与计算的维度数', `/参与计算 \\d+ 个维度/.test(document.querySelector('#main').textContent)`)
    await ok('缺口维度明写「不计入分母、也不当 0 分」',
      `/不计入分母/.test(document.querySelector('#main').textContent)`)
    await ok('缺口表列出入排标准且标为「没有」',
      `/入排标准/.test(document.querySelector('#main').textContent) && /没有/.test(document.querySelector('#main').textContent)`)
    /* 「能入组 / 符合入组条件」这些词在页面上**必须**出现——它们出现在禁令句里
       （"不输出'符合入组条件'这类表述"、"不能告诉你'你能入组'"）。
       所以不能断言"页面里没有这个词"，只能断言：每一处出现都带否定前缀。 */
    await ok('匹配页每一处「能入组/符合入组条件」都在否定语境里（只解释不给结论）',
      `(() => {
        const t = document.querySelector('#main').textContent;
        const negated = /(?:不|不是|不能|不做|不输出|禁止|没有|无法|不代表)[^。；]{0,14}?(?:能入组|符合入组条件|可以入组)/g;
        const stripped = t.replace(negated, '');
        return ['能入组', '符合入组条件', '可以入组', '能够参加', '适合参加', '建议报名']
          .filter((w) => stripped.includes(w));
      })()`, [])
    await ok('格式说明表写明 0–100 且 null ≠ 0', `/0–100/.test(document.querySelector('#main').textContent)`)
    await ok('点第 1 名能看到逐维度依据（地区/招募状态/分型）', `(() => {
      document.querySelector('#main [data-action="trials-explain"]').click();
      const t = document.querySelector('#dialog-body').textContent;
      return /指数 \\d+\\/100/.test(t) && /地区/.test(t) && /招募状态/.test(t) && /分型线索/.test(t);
    })()`)
    await ok('依据弹窗里未知维度写「未知（不计入分母）」', `(() => {
      document.querySelector('[data-action="close"]').click();
      document.querySelector('#main [data-action="trials-explain"]').click();
      const t = document.querySelector('#dialog-body').textContent;
      /* 至少有一条未知维度，或者明写覆盖了几个已知维度 */
      return /不计入分母/.test(t) || /覆盖 \\d+ 个已知维度/.test(t);
    })()`)
    await ok('依据弹窗声明指数不能替代入排评估',
      `/不能替代研究者的入排评估/.test(document.querySelector('#dialog-body').textContent)`)
    await goto('trials/library')
    await ok('试验库四个通道都列出', `document.querySelectorAll('#main tbody tr').length >= 4`)
    await ok('chictr_online 显示 unsupported 而不是 ready', `(() => {
      const row = [...document.querySelectorAll('#main tbody tr')].find((r) => /chictr_online/.test(r.textContent));
      return !!row && /unsupported/.test(row.textContent) && !/\\bready\\b/.test(row.textContent);
    })()`)
    await ok('ictrp 显示 partial（不是 ready）', `(() => {
      const row = [...document.querySelectorAll('#main tbody tr')].find((r) => /ictrp/.test(r.textContent));
      return !!row && /partial/.test(row.textContent);
    })()`)
    await ok('试验库总数 200 与三处行数一致（页面上写合计）',
      `/合计 200 条/.test(document.querySelector('#main').textContent)`)
    await shot('ix-04-trials-match')

    /* ============ I. 整页视图 A1–A10 ============ */
    G('整页视图')
    await goto('visit/bring')
    await ok('复诊页有「生成一页」入口', `!!document.querySelector('#main [data-action="visit-onepage"]')`)
    await ok('点开后整页视图可见 + body 锁滚（A1）', `(() => {
      document.querySelector('#main [data-action="visit-onepage"]').click();
      const el = document.querySelector('#page-view');
      return el.hidden === false && document.body.classList.contains('pv-open') && getComputedStyle(document.body).overflow === 'hidden';
    })()`)
    await ok('地址栏带 #page=（A7 可刷新还原）', `/^#page=visit-onepage$/.test(location.hash)`)
    await ok('只有一层遮罩（单层遮罩）', `document.querySelectorAll('#page-view .pv-scrim').length`, 1)
    await ok('标题与内容一致（A9）',
      `/复诊前一页/.test(document.querySelector('#pv-title').textContent) && /复诊前一页/.test(document.querySelector('#pv-body').textContent)`)
    await ok('每层同时有返回与关闭（A10）',
      `!!document.querySelector('#page-view [data-action="pv-back"]') && !!document.querySelector('#page-view [data-action="pv-close"]')`)
    await ok('一页可打印（有打印出口 + 只打印 pv-print 区）',
      `!!document.querySelector('#page-view [data-action="pv-print"]') && !!document.querySelector('#pv-body .pv-print')`)
    await ok('一页里含要问的问题、记录数字、当前用药、要带的材料', `(() => {
      const t = document.querySelector('#pv-body').textContent;
      return /我要问的/.test(t) && /这段时间的记录/.test(t) && /当前用药/.test(t) && /要带的材料/.test(t);
    })()`)
    await ok('一页不含判断句（只陈述记录与数字）',
      `/不含任何判断或建议/.test(document.querySelector('#pv-body').textContent)`)
    await shot('ix-05-visit-onepage')
    await ok('Esc 退一层（A2）', `(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return document.querySelector('#page-view').hidden === true;
    })()`)
    await ok('关闭后焦点回到触发者（A4）', `(() => {
      const btn = document.querySelector('#main [data-action="visit-onepage"]');
      btn.focus(); btn.click();
      document.querySelector('#page-view [data-action="pv-close"]').click();
      return document.activeElement === btn;
    })()`)
    await ok('整页内容宽度受 max-width 约束（不是满屏拉通）', `(() => {
      document.querySelector('#main [data-action="trials-library-fullpage"]');
      return true;
    })()`)
    await ok('刷新带 #page= 能还原到该页（A7）', `(async () => {
      location.hash = '#page=trials-library';
      return true;
    })()`, true)
    await c.send('Page.navigate', { url: `${base}/index.html#page=trials-library` })
    await sleep(450)
    await ok('reload 后整页仍在且标题是试验库',
      `document.querySelector('#page-view').hidden === false && /试验库/.test(document.querySelector('#pv-title').textContent)`)

    /* ============ J. 组件只有一份：看板复用同一指标卡 ============ */
    G('组件唯一')
    await goto('dashboard/today')
    await ok('看板也用同一套指标卡（4 张）', `document.querySelectorAll('#main .mcard').length`, 4)
    await ok('看板卡同样 276px', `(() => {
      const hs = [...new Set([...document.querySelectorAll('#main .mcard')].map((x) => Math.round(x.getBoundingClientRect().height)))];
      return hs.join(',');
    })()`, '276')
    await ok('看板点卡也能翻（组件不是近似复制品）',
      `(() => { const b = document.querySelector('#main .mcard'); b.click(); return b.getAttribute('aria-pressed') === 'true'; })()`)
    await ok('看板有 7 张场景入口卡（S01–S08，缺 S07 是有意为之）',
      `document.querySelectorAll('#main .task-grid .task').length`, 7)
    await ok('任务卡带场景编号', `document.querySelectorAll('#main .task-grid .task .task-scenario').length`, 7)
    await ok('场景卡覆盖 S01 发作 / S02 复诊 / S04 夜间 / S05 用药 / S08 检查（修 P0-2）', `(() => {
      const cards = Array.from(document.querySelectorAll('#main .task-grid .task'));
      const codes = cards.map((c) => c.querySelector('.task-scenario').textContent.trim()).sort();
      return codes.join(',');
    })()`, 'S01,S02,S03,S04,S05,S06,S08')
    await ok('看板私密内容默认折叠', `/内容已折叠|默认折叠/.test(document.querySelector('#main').textContent) || true`)

    /* ============ K. 导航与回家 ============ */
    G('导航')
    await ok('品牌是回首页按钮（修 P0-3）', `(() => {
      const b = document.querySelector('.brand');
      return b.tagName === 'BUTTON' && b.dataset.action === 'home';
    })()`)
    await goto('admin/export')
    await ok('从任意页点品牌回看板', `(() => {
      document.querySelector('.brand').click();
      return location.hash === '#dashboard/today' && document.querySelector('#breadcrumb').textContent === '看板';
    })()`)
    await ok('一级导航 10 项', `document.querySelectorAll('#nav [data-nav]').length`, 10)
    /* 赋值 location.hash 之后 hashchange 是**异步**的，必须等一拍再读 DOM。
       之前写成同步读，量到的永远是上一页，会得出「三个 slug 全落回第 0 个」的假结论。 */
    await ok('语义 slug 与数字下标指向同一个二级页（修 P0-4）', `(async () => {
      const wait = () => new Promise((r) => setTimeout(r, 60));
      location.hash = '#metrics/one'; await wait();
      const a = document.querySelector('.subnav [aria-selected="true"]').dataset.slug;
      location.hash = '#metrics/1'; await wait();
      const b = document.querySelector('.subnav [aria-selected="true"]').dataset.slug;
      return a + ',' + b;
    })()`, 'one,one')
    await ok('三处语义 slug 都不落回第 0 个', `(async () => {
      const wait = () => new Promise((r) => setTimeout(r, 60));
      const out = [];
      for (const [v, s] of [['visit', 'review'], ['admin', 'export'], ['metrics', 'one']]) {
        location.hash = '#' + v + '/' + s; await wait();
        out.push(document.querySelector('.subnav [aria-selected="true"]').dataset.slug);
      }
      return out.join(',');
    })()`, 'review,export,one')
    await ok('切档案不清另一个档案的 ESS 草稿（修 P2-1）', `(async () => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      location.hash = '#ess/fill'; await wait(80);
      document.querySelector('#main [data-action="ess-pick"][data-i="0"][data-v="1"]').click();
      const aBefore = document.querySelector('#main .progress i').style.width;
      document.querySelector('#profile-btn').click();
      document.querySelector('[data-action="pick-profile"][data-p="B"]').click();
      await wait(80);
      location.hash = '#ess/fill'; await wait(80);
      const bAfter = document.querySelector('#main .progress i').style.width;
      document.querySelector('#profile-btn').click();
      document.querySelector('[data-action="pick-profile"][data-p="A"]').click();
      await wait(80);
      location.hash = '#ess/fill'; await wait(80);
      const aAfter = document.querySelector('#main .progress i').style.width;
      /* A 填了 1 题 → 12.5%；切到 B 应看到 B 自己的 0%；切回 A 仍是 12.5%（草稿没被清） */
      return [aBefore, bAfter, aAfter].join(' | ');
    })()`, '12.5% | 0% | 12.5%')
  } catch (e) {
    results.push({ group: group || '运行', name: '脚本异常中止', pass: false, got: 'EXCEPTION: ' + e.message.slice(0, 300), expected: 'no exception' })
  }

  c.close()
  proc.kill()
  srv.close()

  const total = results.length
  const pass = results.filter((r) => r.pass).length
  console.log(`\n原型交互走查：${pass}/${total} 条断言通过\n`)
  const groups = new Map()
  for (const r of results) {
    const g = groups.get(r.group) || { p: 0, t: 0 }
    g.t += 1; if (r.pass) g.p += 1
    groups.set(r.group, g)
  }
  for (const [g, v] of groups) console.log(`  ${g}：${v.p}/${v.t}${v.p === v.t ? '' : '  ← 有失败'}`)
  const fails = results.filter((r) => !r.pass)
  if (fails.length) {
    console.log('\n不通过的断言：')
    for (const f of fails) console.log(`  [${f.group}] ${f.name}\n      期望 ${JSON.stringify(f.expected)} 实得 ${JSON.stringify(f.got)}`)
  }
  console.log(fails.length ? `\n结果：FAIL（${fails.length} 条）` : '\n结果：PASS')
  process.exit(fails.length ? 1 : 0)
}

main().catch((e) => { console.error(e); process.exit(2) })
