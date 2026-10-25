#!/usr/bin/env node
/**
 * 32 号整页视图 · A1–A10 验收探针
 *
 * 对象：examples/page-view.html（脚手架自带的参考实现演示）
 * 判据：docs/32-FULL-PAGE-VIEW.md §7，每条都要能 FAIL——只报绿不报红的闸门等于没有闸门。
 *
 * 用法：
 *   node scripts/probe-page-view.mjs
 *   node scripts/probe-page-view.mjs --url http://127.0.0.1:8123/examples/page-view.html
 *   node scripts/probe-page-view.mjs --self-test     # 注入两个已知缺陷，闸门必须报 FAIL
 *
 * 依赖：puppeteer-core（家族 workspace 已装）+ 本机 Chrome。
 */
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const argOf = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null }
const SELF_TEST = args.includes('--self-test')
const PORT = Number(argOf('--port') || 8123)

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' }

function serve() {
  return new Promise(res => {
    const server = createServer(async (req, rsp) => {
      const path = decodeURIComponent((req.url || '/').split('?')[0])
      if (path === '/favicon.ico') { rsp.writeHead(204).end(); return }
      const file = join(ROOT, normalize(path).replace(/^([/\\])+/, ''))
      if (!file.startsWith(ROOT)) { rsp.writeHead(403).end(); return }
      try {
        const body = await readFile(file)
        rsp.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' }).end(body)
      } catch { rsp.writeHead(404).end('not found') }
    })
    server.listen(PORT, '127.0.0.1', () => res(server))
  })
}

function findChrome() {
  const cands = [
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium'
  ].filter(Boolean)
  return cands.find(p => existsSync(p)) || null
}

const results = []
const check = (id, name, ok, detail = '') => {
  results.push({ id, name, ok: !!ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${name}${detail ? '  — ' + detail : ''}`)
}

async function main() {
  const chrome = findChrome()
  if (!chrome) { console.log('找不到 Chrome：设置 CHROME_PATH 后重试。跳过等于没有这条闸门。'); process.exit(2) }
  let puppeteer
  try {
    const require = createRequire('/Users/qinxiaoqiang/.workbuddy/binaries/node/workspace/')
    puppeteer = require('puppeteer-core')
  } catch {
    console.log('缺少 puppeteer-core（家族 workspace 未装，或本机路径不同）。跳过等于没有这条闸门。')
    process.exit(2)
  }

  const server = await serve()
  const base = argOf('--url') || `http://127.0.0.1:${PORT}/examples/page-view.html`
  const browser = await puppeteer.launch({
    executablePath: chrome,
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--proxy-server=' + (process.env.http_proxy || 'http://127.0.0.1:7890')]
  })

  try {
    const page = await browser.newPage()
    const errors = []
    page.on('pageerror', e => errors.push(String(e.message)))
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
    await page.setViewport({ width: 1280, height: 860 })
    await page.goto(base, { waitUntil: 'networkidle0' })

    if (SELF_TEST) await injectDefects(page)

    // 记下主页初始滚动位置，用于 A5
    await page.evaluate(() => window.scrollTo(0, 260))
    const homeScrollBefore = await page.evaluate(() => window.scrollY)

    // 打开第一层。用程序化 click：puppeteer 的 page.click 会先 scrollIntoViewIfNeeded，
    // 那会把主页滚回顶部，A5 就永远测不出真问题（2026-10-25 实测踩到）。
    const clickSel = sel => page.evaluate(s => document.querySelector(s)?.click(), sel)
    await clickSel('[data-open="pathology"]')
    await page.waitForSelector('.pv-overlay:not([hidden])', { timeout: 3000 })
    await page.waitForFunction(() => document.querySelector('.pv-title')?.textContent?.includes('病理报告'), { timeout: 3000 }).catch(() => {})

    // A1 宿主 body 不滚，滚的是 .pv-body
    const a1 = await page.evaluate(() => {
      const docOverflow = document.documentElement.scrollHeight > document.documentElement.clientHeight + 1
      const bodyOverflow = document.body.scrollHeight > document.body.clientHeight + 1
      const pv = document.querySelector('.pv-body')
      const style = getComputedStyle(pv)
      return { docOverflow, bodyOverflow, scrollable: /auto|scroll/.test(style.overflowY) }
    })
    check('A1', '只有 .pv-body 内滚，宿主不出现滚动条', a1.scrollable && !a1.bodyOverflow, JSON.stringify(a1))

    // A9 标题非空且与内容匹配
    const a9 = await page.evaluate(() => {
      const t = document.querySelector('.pv-title')?.textContent?.trim() || ''
      return { title: t, ok: t.length > 1 && t !== '未命名页' }
    })
    check('A9', '顶栏标题为实际页名', a9.ok, a9.title)

    // A10 返回与关闭两个入口
    const a10 = await page.evaluate(() => {
      const all = [...document.querySelectorAll('.pv-head-actions button')]
      const shown = all.filter(b => b.offsetParent !== null)
      return { all: all.length, shown: shown.length, labels: shown.map(b => b.textContent.trim()) }
    })
    check('A10', '返回与关闭两个入口都在且都可见', a10.shown >= 2, a10.labels.join(' | '))

    // A4 焦点在层内
    const a4open = await page.evaluate(() => !!document.querySelector('.pv-panel')?.contains(document.activeElement))
    check('A4a', '打开后焦点进入层内（不留在 body）', a4open)

    // 进第二层（病理报告 → 报告原文）
    await page.evaluate(() => [...document.querySelectorAll('.pv-body .pv-btn')].find(b => b.textContent.includes('原文'))?.click())
    await page.waitForFunction(() => document.querySelector('.pv-title')?.textContent?.includes('原文'), { timeout: 3000 }).catch(() => {})
    const depth3 = await page.evaluate(() => document.querySelectorAll('.pv-crumb').length)
    check('L3', '可以往下长到第三层（三级路径可读）', depth3 === 1)

    // A2 Esc 一层一退（第三层 → 第二层，不是全关）
    await page.keyboard.press('Escape')
    await page.waitForFunction(() => !document.querySelector('.pv-title')?.textContent?.includes('原文') && !document.querySelector('.pv-overlay')?.hidden, { timeout: 3000 }).catch(() => {})
    const afterEsc = await page.evaluate(() => ({
      open: !document.querySelector('.pv-overlay')?.hidden,
      title: document.querySelector('.pv-title')?.textContent?.trim()
    }))
    check('A2', 'Esc 只退一层（三层 → 二层，浮层仍开）', afterEsc.open && afterEsc.title === '病理报告', JSON.stringify(afterEsc))

    // A3 浏览器返回键等价 back()
    await page.goBack()
    await page.waitForFunction(() => document.querySelector('.pv-overlay')?.hidden === true, { timeout: 3000 }).catch(() => {})
    const afterPop = await page.evaluate(() => ({ open: !document.querySelector('.pv-overlay')?.hidden }))
    check('A3', '浏览器返回键退到上一状态（此处回主页）', !afterPop.open, JSON.stringify(afterPop))

    // A5 回主页后滚动位置与打开前一致
    const homeScrollAfter = await page.evaluate(() => window.scrollY)
    check('A5', '关掉后主页停在原来的滚动位置', Math.abs(homeScrollAfter - homeScrollBefore) <= 2, `${homeScrollBefore} → ${homeScrollAfter}`)

    // A4b 关闭后焦点回到触发元素（必须走"点卡片打开"这条正常路径；
    // 深链直接打开时本来就没有触发者，拿它测 A4b 是错的对象）
    // 这一条要用真鼠标点（程序化 click 不产生 pointerdown、也不给焦点，
    // 拿它测"焦点是否回到触发者"是错的对象）。
    await page.goto('about:blank')
    await page.goto(base, { waitUntil: 'networkidle0' })
    const center = async sel => page.evaluate(s => {
      const r = document.querySelector(s).getBoundingClientRect()
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
    }, sel)
    const cardPt = await center('[data-open="chart"]')
    await page.mouse.click(cardPt.x, cardPt.y)
    await page.waitForSelector('.pv-overlay:not([hidden])', { timeout: 3000 })
    const closePt = await center('.pv-head-actions button:last-child')
    await page.mouse.click(closePt.x, closePt.y)
    await page.waitForFunction(() => document.querySelector('.pv-overlay')?.hidden === true, { timeout: 3000 }).catch(() => {})
    const a4b = await page.evaluate(() => {
      const el = document.activeElement
      return { tag: el?.tagName, isTrigger: el?.dataset?.open === 'chart' }
    })
    check('A4b', '关闭后焦点回到触发元素（不是 body）', a4b.isTrigger === true, JSON.stringify(a4b))

    // A7 深链。带 hash 的 goto 属于同文档导航、模块不会重跑，必须换一次文档再进。
    await page.goto('about:blank')
    await page.goto(base + '#page=labs', { waitUntil: 'networkidle0' })
    await page.waitForSelector('.pv-overlay:not([hidden])', { timeout: 3000 }).catch(() => {})
    const a7 = await page.evaluate(() => ({
      open: !document.querySelector('.pv-overlay')?.hidden,
      title: document.querySelector('.pv-title')?.textContent?.trim()
    }))
    check('A7', '带 #page= 的地址刷新后直达该页', a7.open && a7.title === '化验记录', JSON.stringify(a7))

    // A6 390 宽无横向溢出
    await page.setViewport({ width: 390, height: 844 })
    await page.goto(base, { waitUntil: 'networkidle0' })
    await page.evaluate(() => document.querySelector('[data-open="labs"]')?.click())
    await page.waitForSelector('.pv-overlay:not([hidden])', { timeout: 3000 })
    // 三处都要查：只量 .pv-body 会漏掉"内容区自己被撑宽、溢出发生在面板上"的情况
    const a6 = await page.evaluate(() => {
      const box = sel => { const el = document.querySelector(sel); return { w: el.scrollWidth, c: el.clientWidth } }
      return { body: box('.pv-body'), panel: box('.pv-panel'), doc: box('html') }
    })
    const a6ok = ['body', 'panel', 'doc'].every(k => a6[k].w <= a6[k].c + 1)
    check('A6', '390 宽不横向溢出（内容区/面板/文档三处）', a6ok, JSON.stringify(a6))

    // A8 减少动效下终态可见
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }])
    await page.goto(base, { waitUntil: 'networkidle0' })
    await page.evaluate(() => document.querySelector('[data-open="chart"]')?.click())
    await page.waitForSelector('.pv-overlay:not([hidden])', { timeout: 3000 })
    await new Promise(r => setTimeout(r, 120))
    const a8 = await page.evaluate(() => {
      const p = document.querySelector('.pv-panel')
      const s = getComputedStyle(p)
      return { opacity: Number(s.opacity), anim: s.animationName, visible: p.getBoundingClientRect().height > 200 }
    })
    check('A8', '减少动效下终态完全可见', a8.opacity > 0.95 && a8.visible, JSON.stringify(a8))

    // 0 未捕获异常
    check('E0', '全程 0 未捕获异常', errors.length === 0, errors.slice(0, 3).join(' / '))
  } finally {
    await browser.close()
    server.close()
  }

  const failed = results.filter(r => !r.ok)
  console.log(`\n${failed.length ? 'FAIL' : 'PASS'}  ${results.length - failed.length}/${results.length}`)
  if (SELF_TEST) {
    // 自测模式：必须至少 2 条 FAIL，否则说明闸门对注入缺陷不敏感
    if (failed.length >= 2) { console.log('自测通过：注入的缺陷被闸门抓到'); process.exit(0) }
    console.log('自测失败：注入缺陷后闸门仍然全绿，等于没有闸门'); process.exit(1)
  }
  process.exit(failed.length ? 1 : 0)
}

/** 注入两个已知缺陷：① 顶栏改成空标题（A9 必须响）② 关闭后不还原滚动（A5 必须响） */
async function injectDefects(page) {
  await page.evaluate(() => {
    // 缺陷①：顶栏标题被抹空（A9 必须响）
    const obs = new MutationObserver(() => {
      const t = document.querySelector('.pv-title')
      if (!t || t.textContent === ' ') return
      obs.disconnect()                       // 立刻断开，否则改文本又触发自己 → 死循环把页面挂死
      t.textContent = ' '
      // 之后新增的层再抹一次（多层场景），但每次只改一次就断开
      setTimeout(() => obs.observe(document.body, { childList: true, subtree: true, characterData: true }), 50)
    })
    obs.observe(document.body, { childList: true, subtree: true, characterData: true })
    // 缺陷②：把关闭入口藏掉（A10 必须响）。注意必须选"同一份文档里就能看见"的缺陷——
    // 注入的 CSS 会被后续 page.goto 冲掉，拿它测靠后的 A6 是测不到的（2026-10-25 实测踩到）。
    const style = document.createElement('style')
    style.textContent = '.pv-head-actions .pv-btn:last-child{display:none!important}'
    document.head.append(style)
  })
  console.log('（自测：已注入「空标题 + 藏掉关闭入口」两个缺陷）\n')
}

main().catch(e => { console.error('探针自身出错：', e); process.exit(2) })
