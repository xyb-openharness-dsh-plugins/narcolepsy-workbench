#!/usr/bin/env node
/**
 * 原型无头走查（HVT X1/X4 + 窄宽规则验法）
 *
 * 判据来源：
 *   docs/15-HVT-REVIEW.md      X1 无孤儿页 / X4 无头断言出数字
 *   docs/30-RESPONSIVE-RULES.md 业务区视口 = 业务面板宽度、不许横向溢出、不许竖排单字
 *
 * 做法：起一个本地静态服务 → 用本机 Chrome 的 CDP 逐页打开 → 在页面里量数字 → 退出码非 0 即不通过。
 * 不引第三方依赖（node 22 自带 WebSocket，Chrome 自带 CDP）。
 *
 * 用法：
 *   node scripts/probe-prototype.mjs                    # 全量 30 个 (view, sub) × 3 档宽度
 *   node scripts/probe-prototype.mjs --width 1200       # 只测一档宽度
 *   node scripts/probe-prototype.mjs --shots out/       # 顺便截图（每页一张）
 */
import { createServer } from 'node:http'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PROTO = join(ROOT, 'prototypes', 'v0.2')
const args = process.argv.slice(2)
const argOf = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null }
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' }
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

/* 与 docs/INTERACTION-DESIGN.md §1 逐字一致的 10×3=30。改这里必须同时改文档，反之亦然。
 * slug 是深链接里的语义名（#metrics/one）—— 评审 P0-4 就是因为只认数字下标才静默落错页，
 * 所以这里两种写法都走一遍：`<slug>` 与 `<数字>` 必须落到**同一个**二级页。 */
const SLUGS = {
  dashboard: ['today', 'week', 'todo'],
  diagnosis: ['text', 'exam', 'timeline'],
  naps: ['list', 'bucket', 'context'],
  night: ['log', 'events', 'stats'],
  ess: ['fill', 'history', 'items'],
  meds: ['current', 'switch', 'tolerance'],
  metrics: ['cards', 'one', 'rule'],
  trials: ['profile', 'match', 'library'],
  admin: ['docs', 'export', 'note'],
  visit: ['questions', 'bring', 'review']
}
const PAGES = {
  dashboard: 3, diagnosis: 3, naps: 3, night: 3, ess: 3, meds: 3,
  metrics: 3, trials: 3, admin: 3, visit: 3
}
const WIDTHS = argOf('--width') ? [Number(argOf('--width'))] : [1400, 1000, 860]
const SHOTS = argOf('--shots')

if (!existsSync(CHROME)) { console.error(`找不到 Chrome：${CHROME}（可用 CHROME_PATH 覆盖）`); process.exit(2) }
if (!existsSync(join(PROTO, 'index.html'))) { console.error(`找不到原型：${join(PROTO, 'index.html')}`); process.exit(2) }

/* ---------- 静态服务 ---------- */
function serve() {
  return new Promise((ok) => {
    const srv = createServer(async (req, res) => {
      const url = decodeURIComponent((req.url || '/').split('?')[0])
      const file = join(PROTO, url === '/' ? 'index.html' : url.replace(/^\/+/, ''))
      if (!file.startsWith(PROTO)) { res.writeHead(403).end('no'); return }
      try {
        const buf = await readFile(file)
        res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' }).end(buf)
      } catch { res.writeHead(404).end('not found') }
    })
    srv.listen(0, '127.0.0.1', () => ok({ srv, port: srv.address().port }))
  })
}

/* ---------- CDP 最小客户端 ---------- */
async function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl)
  let id = 0
  const pending = new Map()
  const events = []
  await new Promise((ok, bad) => { ws.onopen = ok; ws.onerror = () => bad(new Error('CDP 连接失败')) })
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data)
    if (msg.id && pending.has(msg.id)) {
      const { ok, bad } = pending.get(msg.id)
      pending.delete(msg.id)
      msg.error ? bad(new Error(msg.error.message)) : ok(msg.result)
    } else if (msg.method) events.push(msg)
  }
  const send = (method, params = {}) => new Promise((ok, bad) => {
    const n = ++id
    pending.set(n, { ok, bad })
    ws.send(JSON.stringify({ id: n, method, params }))
  })
  return { send, events, close: () => ws.close() }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  const { srv, port } = await serve()
  const base = `http://127.0.0.1:${port}`
  const port2 = 9333 + Math.floor(Math.random() * 200)
  const proc = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    `--remote-debugging-port=${port2}`, `--user-data-dir=/tmp/narco-probe-${port2}`,
    '--hide-scrollbars', '--window-size=1400,1000', 'about:blank'
  ], { stdio: 'ignore' })

  /* 等 devtools 起来 */
  let target = null
  for (let i = 0; i < 60; i += 1) {
    try {
      const r = await fetch(`http://127.0.0.1:${port2}/json/list`)
      const list = await r.json()
      target = list.find((t) => t.type === 'page')
      if (target) break
    } catch { /* 还没起来 */ }
    await sleep(200)
  }
  if (!target) { proc.kill(); srv.close(); console.error('Chrome 调试端口未就绪'); process.exit(2) }

  const c = await cdp(target.webSocketDebuggerUrl)
  await c.send('Page.enable')
  await c.send('Runtime.enable')
  await c.send('Log.enable')

  if (SHOTS) await mkdir(resolve(SHOTS), { recursive: true })

  const fails = []
  const rows = []
  for (const width of WIDTHS) {
    await c.send('Emulation.setDeviceMetricsOverride', { width, height: 1100, deviceScaleFactor: 1, mobile: false })
    for (const [view, subs] of Object.entries(PAGES)) {
      for (let sub = 0; sub < subs; sub += 1) {
        const expectedSlug = SLUGS[view][sub]
        /* 交替用 slug 与数字下标访问：两种写法都必须落到同一个二级页 */
        const useSlug = (sub % 2 === 0)
        const url = `${base}/index.html#${view}/${useSlug ? expectedSlug : sub}`
        c.events.length = 0
        await c.send('Page.navigate', { url })
        await sleep(260)

        const { result } = await c.send('Runtime.evaluate', {
          awaitPromise: false, returnByValue: true,
          expression: `(() => {
            const out = {};
            const de = document.documentElement;
            out.scrollW = de.scrollWidth;
            out.innerW = window.innerWidth;
            out.overflowX = de.scrollWidth > window.innerWidth + 1;
            /* 竖排单字：元素宽度 < 3em 且自身文字 ≥ 6 字（窄宽规则 · 探针 1）。
               SVG 内的 text 不算：图表标签本来就不换行，量它的盒宽没有意义（量到的是笔画宽）。 */
            const squeezed = [];
            for (const el of document.querySelectorAll('#main *')) {
              if (el.closest('svg')) continue;
              const txt = (el.childElementCount === 0 ? el.textContent : '').trim();
              if (txt.length < 6) continue;
              const cs = getComputedStyle(el);
              const fs = parseFloat(cs.fontSize) || 15;
              if (el.getBoundingClientRect().width < fs * 3) squeezed.push(txt.slice(0, 18));
            }
            out.squeezed = squeezed.slice(0, 5);
            out.squeezedCount = squeezed.length;
            /* 页脚贴底：footer 底边应 >= 视口高度 - 4（内容少的页也要贴住） */
            const foot = document.querySelector('.footer');
            out.footerBottom = foot ? Math.round(foot.getBoundingClientRect().bottom) : null;
            out.viewportH = window.innerHeight;
            /* 首屏可见版本号（HVT P1） */
            const chip = document.querySelector('.ver-chip');
            out.versionVisible = !!(chip && chip.offsetParent !== null && /v\\d+\\.\\d+\\.\\d+/.test(chip.textContent));
            out.versionText = chip ? chip.textContent.trim() : '';
            /* X1 无孤儿页：nav 里点得到的 view 数 == 文档里的 9 */
            out.navCount = document.querySelectorAll('#nav [data-nav]').length;
            out.subCount = document.querySelectorAll('.subnav [role=tab]').length;
            out.h1 = (document.querySelector('#main h1') || {}).textContent || '';
            /* 图表必须是真的 svg 且带 class="chart"（一图秀合同） */
            out.svgCharts = document.querySelectorAll('svg.chart').length;
            out.dialogsOpen = document.querySelectorAll('dialog[open]').length;
            /* 语义 slug 必须与数字下标落到同一页（P0-4 回归） */
            out.activeSub = (() => {
              const t = document.querySelector('.subnav [aria-selected="true"]');
              return t ? t.dataset.slug : null;
            })();
            /* 指标卡：276px 固定高 + 真 3D 结构（27 号合同） */
            const cards = [...document.querySelectorAll('.mcard')];
            out.cardCount = cards.length;
            out.cardHeights = [...new Set(cards.map((c) => Math.round(c.getBoundingClientRect().height)))];
            out.card3d = cards.length ? cards.every((c) => {
              const inner = c.querySelector('.mcard-inner');
              const faces = c.querySelectorAll('.mface');
              if (!inner || faces.length !== 2) return false;
              const cs = getComputedStyle(inner);
              const pcs = getComputedStyle(c);
              return cs.transformStyle === 'preserve-3d' && pcs.perspective !== 'none'
                && [...faces].every((f) => getComputedStyle(f).backfaceVisibility === 'hidden'
                  && getComputedStyle(f).position === 'absolute');
            }) : null;
            /* 指标卡必须有轨道眉题（分系列），不能是平铺浅卡 */
            out.cardTracks = cards.length ? cards.every((c) => !!c.querySelector('.m-eyebrow i')) : null;
            /* 一图秀：指标选择窗口必须存在、能独立滚动、≤4（16 号 R7） */
            const picker = document.querySelector('.picker');
            out.hasPicker = !!picker;
            out.pickerScrollable = picker ? (() => { const s = picker.querySelector('.picker-scroll'); if (!s) return false; const cs = getComputedStyle(s); return cs.overflowY === 'auto' && cs.maxHeight !== 'none'; })() : null;
            out.pickerRows = picker ? picker.querySelectorAll('.pick-row').length : 0;
            out.pickerOn = picker ? picker.querySelectorAll('.pick-row[aria-pressed="true"]').length : 0;
            out.pickerCapped = picker ? [...picker.querySelectorAll('.pick-row')].filter((b) => b.disabled).length : 0;
            out.oneLines = document.querySelectorAll('svg.one-chart path.line').length;
            /* 整页视图层：默认关闭，且只有一个遮罩层（32 号 A1 前提） */
            out.pvHidden = document.querySelector('#page-view') ? document.querySelector('#page-view').hidden : null;
            out.pvScrims = document.querySelectorAll('.pv-scrim').length;
            /* 品牌必须是按钮（P0-3 回首页） */
            out.brandIsButton = (() => { const b = document.querySelector('.brand'); return !!b && b.tagName === 'BUTTON' && b.dataset.action === 'home'; })();
            /* 会话区必须有输入框（P0-6） */
            out.agentInputs = document.querySelectorAll('#agent-dock input, #agent-dock textarea').length;
            return out;
          })()`
        })
        const m = result.value
        /* 一图秀的 ≤4 上限要**真的点到 4 项**才看得出来：默认只选 2 项时没有置灰项。
           所以这里再点一次，把选择补到 4，然后数被置灰的行。 */
        if (view === 'metrics' && sub === 1) {
          const { result: capRes } = await c.send('Runtime.evaluate', {
            returnByValue: true,
            expression: `(() => {
              /* 每次点击都会重绘（一图秀的图表本来就没有过渡依赖），
                 所以必须**每轮重新查一次 DOM**，不能攥着一批旧节点往下点。 */
              for (let guard = 0; guard < 20; guard += 1) {
                if (document.querySelectorAll('.picker .pick-row[aria-pressed="true"]').length >= 4) break;
                const next = [...document.querySelectorAll('.picker .pick-row')]
                  .find((b) => b.getAttribute('aria-pressed') !== 'true' && !b.disabled);
                if (!next) break;
                next.click();
              }
              const on = document.querySelectorAll('.picker .pick-row[aria-pressed="true"]').length;
              const off = [...document.querySelectorAll('.picker .pick-row')].filter((b) => b.disabled).length;
              const lines = document.querySelectorAll('svg.one-chart path.line').length;
              return { on, off, lines, rows: document.querySelectorAll('.picker .pick-row').length };
            })()`
          })
          m.capOn = capRes.value.on
          m.pickerCapped = capRes.value.off
          m.oneLines = capRes.value.lines
          m.pickerRows = capRes.value.rows
        }
        const consoleErrs = c.events.filter((e) => e.method === 'Runtime.exceptionThrown'
          || (e.method === 'Log.entryAdded' && e.params.entry.level === 'error')
          || (e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error'))

        const issues = []
        if (m.overflowX) issues.push(`横向溢出 scrollW=${m.scrollW}>${m.innerW}`)
        if (m.squeezedCount > 0) issues.push(`竖排单字 ${m.squeezedCount} 处（例：${m.squeezed[0]}）`)
        if (!m.versionVisible) issues.push(`首屏版本号不可见（chip=${m.versionText || 'null'}）`)
        if (m.navCount !== 10) issues.push(`一级导航 ${m.navCount} 项 ≠ 10`)
        if (m.subCount !== 3) issues.push(`二级 tab ${m.subCount} 个 ≠ 3`)
        if (!m.h1) issues.push('页面没有 h1')
        if (consoleErrs.length) issues.push(`控制台错误 ${consoleErrs.length} 条：${JSON.stringify(consoleErrs[0].params).slice(0, 150)}`)
        /* 语义 slug：地址栏写的 slug 必须就是被选中的那个 tab（P0-4） */
        if (m.activeSub !== expectedSlug) issues.push(`语义二级名落错页：URL=${expectedSlug} 实际选中=${m.activeSub}`)
        /* 指标卡三铁律 */
        if (m.cardCount > 0) {
          if (m.cardHeights.length !== 1 || m.cardHeights[0] !== 276) issues.push(`指标卡高 ${JSON.stringify(m.cardHeights)} ≠ [276]`)
          if (!m.card3d) issues.push('指标卡不是真 3D（缺 preserve-3d / perspective / backface-visibility / 绝对定位面）')
          if (!m.cardTracks) issues.push('指标卡缺轨道眉题（没分系列）')
        }
        /* 一图秀 */
        if (view === 'metrics' && sub === 1) {
          if (!m.hasPicker) issues.push('一图秀缺指标选择窗口')
          if (!m.pickerScrollable) issues.push('指标选择列表没有独立滚动（max-height + overflow-y:auto）')
          if (m.capOn !== 4) issues.push(`指标选择点不满 4 项（实测 ${m.capOn}）`)
          if (m.pickerCapped === 0 && m.pickerRows > 4) issues.push('指标选择没有 ≤4 上限（选满 4 项后没有置灰项）')
          if (m.oneLines !== 4) issues.push(`一图秀选中 4 项但只画出 ${m.oneLines} 条线`)
          if (m.pickerRows < 5) issues.push(`可选指标只有 ${m.pickerRows} 项（应覆盖全部 10 项）`)
        }
        /* 品牌 / 会话输入 / 整页层 */
        if (!m.brandIsButton) issues.push('品牌不是回首页按钮')
        if (m.agentInputs < 1) issues.push('AI 会话区没有输入框')
        if (m.pvHidden !== true) issues.push('整页视图层默认应该是隐藏的')
        if (m.pvScrims !== 1) issues.push(`整页视图遮罩层 ${m.pvScrims} 个 ≠ 1（只允许单层遮罩）`)

        rows.push({ width, view, sub, bytes: m.scrollW, footerBottom: m.footerBottom, svgCharts: m.svgCharts, ok: issues.length === 0, issues })
        if (issues.length) fails.push({ width, view, sub, issues })

        if (SHOTS) {
          const { data } = await c.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
          await writeFile(join(resolve(SHOTS), `${width}-${view}-${sub}.png`), Buffer.from(data, 'base64'))
        }
      }
    }
  }

  c.close(); proc.kill(); srv.close()

  /* ---------- 报告 ---------- */
  const total = rows.length
  const pass = rows.filter((r) => r.ok).length
  console.log(`\n原型无头走查：${pass}/${total} 页通过（${WIDTHS.join(' / ')} px × 30 个 (view, sub)）\n`)
  const byWidth = {}
  for (const r of rows) { byWidth[r.width] = byWidth[r.width] || { p: 0, t: 0 }; byWidth[r.width].t += 1; if (r.ok) byWidth[r.width].p += 1 }
  for (const [w, v] of Object.entries(byWidth)) console.log(`  ${w}px：${v.p}/${v.t}`)
  if (fails.length) {
    console.log('\n不通过的页：')
    for (const f of fails) console.log(`  ${f.width}px ${f.view}/${f.sub} — ${f.issues.join('；')}`)
  }
  const withChart = rows.filter((r) => r.svgCharts > 0)
  console.log(`\nsvg.chart 出现的页：${withChart.length}/${rows.length}`)
  if (withChart.length) console.log('  ' + [...new Set(withChart.map((r) => `${r.view}/${r.sub}`))].join(' '))
  console.log(fails.length ? `\n结果：FAIL（${fails.length} 个问题）` : '\n结果：PASS')
  process.exit(fails.length ? 1 : 0)
}

main().catch((e) => { console.error(e); process.exit(2) })
