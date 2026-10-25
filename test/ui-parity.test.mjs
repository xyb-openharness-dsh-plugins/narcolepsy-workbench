/* 逐视图 parity：`public/` 与 `prototypes/v0.2/` 必须是「同一份渲染代码，只换数据来源」。
 *
 * 为什么要有这一条：原型签认（G2）签的是那套视图，开发版如果另写一套，
 * 后面每改一个卡片就要改两处，原型再也不能当验收基准。所以这里钉五件事：
 *   ① 原型里的每个函数，开发版都存在（不许删视图、不许删交互）；
 *   ② 开发版新增的函数只能是**数据层 / 启动 / 宿主桥**这一组（白名单），不许偷偷另写视图；
 *   ③ 导航常量（PAGES / SUBS / SUBPAGES / SUBTITLES）两边逐字相同；
 *   ④ style.css 逐字节相同，index.html 只差标题、版本号、「开发版」那两段文案与 shell.css 一行；
 *   ⑤ 数据层必须真的从 API 拿（`apiBase()` + bootstrap 字面量 + 三态 DATA_SOURCE），
 *      而不是"复制了一份数据进来"。
 *
 * 只比结构与常量，不比数据：`public/demo-data.js` 是离线回退，由生成器一次写两处，
 * 所以它是生成物、两边必须同一份（由 demo/build-demo-data.mjs --check 管）。
 */
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

const ROOT = new URL('..', import.meta.url).pathname
const read = (p) => readFileSync(join(ROOT, p), 'utf8')

const proto = read('prototypes/v0.2/app.js')
const shipped = read('public/app.js')

/** 源码里 `function X(` 的函数名集合（含 `function X ()` 与 `async function X(`）。 */
const fnNames = (src) => [...src.matchAll(/(?:^|\s)(?:async )?function ([A-Za-z_$][\w$]*)\s*\(/gm)].map((m) => m[1]).sort()

/** 抠一个 `const X = ...;` 到下一个空行为止的常量块（两边同形，够用）。 */
function block(src, name) {
  const start = src.indexOf(`const ${name} = `)
  assert.notEqual(start, -1, `找不到常量 ${name}`)
  return src.slice(start, src.indexOf('\n\n', start) + 2)
}

test('① 视图函数：原型里的每个函数开发版都有（一个都不许丢）', () => {
  const shippedSet = new Set(fnNames(shipped))
  const missing = fnNames(proto).filter((n) => !shippedSet.has(n))
  assert.deepEqual(missing, [], `开发版缺少这些函数：${missing.join(', ')}`)
})

test('② 新增函数只能是数据层 / 启动 / 宿主桥（防止偷偷另写一套视图）', () => {
  const ALLOWED = new Set([
    /* 数据层与启动 */
    'apiBase', 'applyData', 'loadBootstrap', 'loadPrivate', 'init', 'mapProfile', 'latestDate',
    /* 宿主桥：把整理请求投进宿主会话的草稿（customFrame=true 时唯一的 AI 入口） */
    'postDraft', 'draftPrompt',
    /* 写操作闸门（本版接口只读，见 docs/DEV-PLAN.md M5） */
    'writeBlocked'
  ])
  const protoSet = new Set(fnNames(proto))
  const extra = fnNames(shipped).filter((n) => !protoSet.has(n) && !ALLOWED.has(n))
  assert.deepEqual(extra, [], `开发版多出未登记的函数：${extra.join(', ')}（要加先想清楚是不是在另写视图）`)
})

test('③ 10 个一级页 / 30 个二级页：两边常量逐字相同', () => {
  for (const name of ['PAGES', 'SUBS', 'SUBPAGES', 'SUBTITLES']) {
    assert.equal(block(shipped, name), block(proto, name), `${name} 与原型不一致`)
  }
  const pages = [...proto.matchAll(/\['([a-z]+)', '[^']+', '[a-z]+'\]/g)].map((m) => m[1])
  assert.equal(new Set(pages).size, 10, '一级页 10 个（INTERACTION-DESIGN §1）')
  /* 30 个二级页 = 10 个一级页各 3 个。数 SUBS 里的 slug 对，不数页签按钮。 */
  const slugPairs = [...block(proto, 'SUBS').matchAll(/\['[a-z]+', '[^']+'\]/g)].length
  assert.equal(slugPairs, 30, `二级页应该是 30 个（10 × 3），实际 ${slugPairs}`)
})

test('④ 样式表逐字节相同；index.html 只允许四处差异', () => {
  assert.equal(read('public/style.css'), read('prototypes/v0.2/style.css'),
    'style.css 必须与原型逐字节一致；只在宿主里成立的东西放 shell.css')

  /* index.html 的允许差异（写在这里就是给评审看的）：
       1. <title> 去掉"原型"并把版本号前移；
       2. prototype-bar 换成"开发版"文案（原型那句"未接入 DSH"在开发版里是假话）；
       3. ver-chip 多一个 id（开发版启动时会写真实版本号）；
       4. 多一行 <link rel="stylesheet" href="shell.css">。
     其余骨架、容器 id、favicon、脚本标签必须逐字节相同。 */
  const strip = (html) => html
    .replace(/<title>[\s\S]*?<\/title>/g, '')
    .replace(/^\s*<div class="prototype-bar">.*$/gm, '')
    .replace(/(<button class="ver-chip") id="ver-chip"/g, '$1')
    .replace(/\n<link rel="stylesheet" href="shell\.css">/g, '')
    .replace(/^<!-- 开发版页面不进任何索引[^\n]*-->\n<meta name="robots" content="noindex,nofollow">\n/gm, '')
    .replace(/v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?/g, 'vX.Y.Z')
    .trim()
  assert.equal(strip(read('public/index.html')), strip(read('prototypes/v0.2/index.html')),
    'index.html 与原型不一致；确需改骨架，先改原型再同步')
})

test('⑤ 数据层确实从 API 取：apiBase + bootstrap + 三态 DATA_SOURCE', () => {
  assert.match(shipped, /\/api\/narcolepsy\/bootstrap/, 'bootstrap 路径必须显式写出来（唯一来源）')
  assert.match(shipped, /function apiBase\(\)/, '必须从 location.pathname 反推挂载前缀，dev 与 Desktop 共用一份')
  assert.match(shipped, /replace\(\/\\\/api\\\/narcolepsy\$\/, ''\)/, 'apiBase 必须剥掉 /api/narcolepsy 只留挂载前缀')
  assert.match(shipped, /let DATA_SOURCE = 'pending'/, '必须有三态数据来源标记')
  assert.match(shipped, /DATA_SOURCE === 'api'/, '必须区分"接口通了"与"离线演示"')
  /* 反向断言：不许把演示数据直接当默认值（那会让空库显示成"有数据"） */
  assert.doesNotMatch(shipped, /const PROFILES = window\.DEMO_DATA/, '不许把 DEMO_DATA 直接当数据源')
})

test('⑥ 离线回退与原型数据是同一份（生成器一次写两处）', () => {
  const p2 = join(ROOT, 'prototypes/v0.2/demo-data.js')
  const pub = join(ROOT, 'public/demo-data.js')
  assert.ok(existsSync(p2) && existsSync(pub), '两份演示数据都要在（生成器写）')
  assert.equal(read('public/demo-data.js'), read('prototypes/v0.2/demo-data.js'),
    '离线回退数据必须与原型那份逐字节相同；改数据请改生成器重跑')
  assert.equal(read('public/demo-trials.js'), read('prototypes/v0.2/demo-trials.js'),
    '试验条目同理（data/trials/ → 生成器 → 两处）')
})
