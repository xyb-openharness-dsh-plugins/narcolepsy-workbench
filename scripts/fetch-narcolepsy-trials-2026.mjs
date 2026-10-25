#!/usr/bin/env node
/**
 * M4 临床试验信息采集（narcolepsy · 2026）
 *
 * 为什么要有这个脚本：工作台要给患者看"当前有哪些发作性睡病相关登记试验"，
 * 但这个信息的可信度完全取决于"每个来源到底查没查通"。所以本脚本的第一产出
 * 不是条数，而是**每个通道的终态**——跑不通就如实写 timeout/unsupported/error，
 * 绝不因为"看起来应该是 0 条"就把通道标成 ready。
 *
 * 四条通道的运行现实（2026-10-25 实测，详见 docs/TRIALS-SOURCES.md）：
 *   ctv            ClinicalTrials.gov API v2 —— 唯一有稳定公开 JSON API 的通道
 *   ictrp          WHO ICTRP —— ASP.NET 表单，首屏 10 行可读，翻页被 WAF 拦
 *   chictr_online  ChiCTR    —— 检索页对非浏览器客户端返回 405（阿里云 WAF）
 *   chinadrugtrials CDE      —— 需要先"暖"一个 JS 反爬 cookie，之后表单可 POST
 *
 * 用法：
 *   node scripts/fetch-narcolepsy-trials-2026.mjs            正常运行并写库
 *   node scripts/fetch-narcolepsy-trials-2026.mjs --dry-run  只打印每通道终态，不写库
 *
 * 硬约束（脚本自己在 exit 前校验，不一致就 exit 1）：
 *   manifest.totals.records === trials.jsonl 行数 === sqlite trials 表行数
 */
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const OUT_DIR = 'data/trials'
const DISEASE = 'narcolepsy'
const DRY_RUN = process.argv.includes('--dry-run')

// ---------------------------------------------------------------------------
// 终态枚举
//
// 之所以要枚举而不是布尔值：患者看到"0 条"时必须能区分"确实没有登记"和
// "我们根本没查通"。把这两种情况压成一个 int/bool 就是在虚报。
// ---------------------------------------------------------------------------
const STATUS = Object.freeze({
  READY: 'ready', // 通道跑通，且该来源声称的总量已全部拿到
  PARTIAL: 'partial', // 跑通但只拿到一部分（被分页/反爬/WAF 截断在中途）
  TRUNCATED: 'truncated', // 跑通但超过本脚本自设的上限，主动停在明确边界
  TIMEOUT: 'timeout', // 超时
  UNSUPPORTED: 'unsupported', // 该站点没有可用的公开机读接口，且网页抓取被明确阻断
  NOT_CONFIGURED: 'not_configured', // 需要凭据/配置但本轮没有
  ERROR: 'error', // 其他失败
})
const STATUS_ENUM = Object.values(STATUS)

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

// 单个请求超时。CDE 的详情页比较慢，给宽一点；列表页用默认值。
const TIMEOUT_MS = 30_000

// CTV 分页上限：ClinicalTrials.gov 的 narcolepsy 命中量在 200 以内，
// 留 20 页余量足够；超过就记 truncated 而不是无限翻。
const CTV_MAX_PAGES = 20

// ---------------------------------------------------------------------------
// 通用工具
// ---------------------------------------------------------------------------

/** 把 timeout 与其它网络错误分开，because 终态枚举里它们是两个不同的东西。 */
function classifyError(error) {
  const name = error?.name ?? ''
  if (name === 'TimeoutError' || name === 'AbortError') return STATUS.TIMEOUT
  return STATUS.ERROR
}

async function request(url, options = {}, timeoutMs = TIMEOUT_MS) {
  const res = await fetch(url, { ...options, signal: AbortSignal.timeout(timeoutMs) })
  const buffer = Buffer.from(await res.arrayBuffer())
  return { status: res.status, headers: res.headers, buffer, text: buffer.toString('utf8') }
}

/**
 * 极简 cookie 罐。
 *
 * 为什么需要：CDE 的检索接口靠一个由 JS 种下的 FSSBBIl1UgzbN7N80S cookie 判断
 * "这是不是真浏览器"。Node 的 fetch 没有 cookie 管理，不带罐就会一直拿到挑战页。
 */
function createJar() {
  const jar = new Map()
  const header = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ')
  const absorb = (res) => {
    for (const line of res.headers.getSetCookie?.() ?? []) {
      const pair = line.split(';')[0]
      const eq = pair.indexOf('=')
      if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim())
    }
  }
  return { jar, header, absorb }
}

/** 从 ASP.NET 页面里抠 hidden 字段（__VIEWSTATE 之类），回发时要原样带回。 */
function aspnetHiddenFields(html) {
  const out = {}
  for (const match of html.matchAll(/<input[^>]*type="hidden"[^>]*>/gi)) {
    const tag = match[0]
    const name = /name="([^"]+)"/i.exec(tag)?.[1]
    const value = /value="([^"]*)"/i.exec(tag)?.[1] ?? ''
    if (name) out[name] = value
  }
  return out
}

/** 去掉标签只留文本。CDE 详情页没有机读接口，只能这样读。 */
function stripTags(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, '\n')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

/**
 * 去重键的"跨来源合并"规则。
 *
 * (source, registry_id) 决定"这一行是不是重复的同一来源记录"；
 * trial_key 决定"这是不是同一个试验"。同一个 NCT 号在 CTV 和 ICTRP 各出现一次时，
 * 两行都保留（来源不同、可用字段不同），但 trial_key 相同，界面才能并成一条。
 */
function trialKeyFor(source, registryId) {
  const id = String(registryId).trim()
  if (/^NCT\d{8}$/i.test(id)) return `nct:${id.toUpperCase()}`
  if (/^ChiCTR[\w-]+$/i.test(id)) return `chictr:${id.toUpperCase()}`
  if (/^CTR\d{8}$/i.test(id)) return `cde:${id.toUpperCase()}`
  if (/^ACTRN\d+$/i.test(id)) return `actrn:${id.toUpperCase()}`
  if (/^DRKS\d+$/i.test(id)) return `drks:${id.toUpperCase()}`
  if (/^JPRN-/i.test(id)) return `jprn:${id.toUpperCase()}`
  if (/^ISRCTN\d+$/i.test(id)) return `isrctn:${id.toUpperCase()}`
  if (/^EUCTR/i.test(id)) return `euctr:${id.toUpperCase()}`
  // 认不出的号就按来源隔离，避免把两个互不相干的登记号错并成一个试验。
  return `${source}:${id}`
}

/** 空串/占位符统一成 null。null ≠ 0 ≠ "" 是本仓的既有约定。 */
function nullIfBlank(value) {
  if (value === undefined || value === null) return null
  const text = String(value).replace(/\s+/g, ' ').trim()
  if (!text) return null
  // CDE 的未填写占位带国别前缀，例如"国内：登记人暂未填写该信息；"，
  // 只剥掉占位本身、不剥真实国家的值——所以按"整行就是占位"判断，不做模糊包含。
  if (/^(?:国内|国外)?[:：]?\s*(?:登记人暂未填写该信息|未填写|暂无)[；;]?$/i.test(text)) return null
  return text
}

/**
 * 入组人数必须是"一个数"。
 *
 * 踩过的坑：有的登记人把入组数写成散文——"共328例，发作性睡病和OSAHS导致的
 * 白天过度嗜睡（EDS）分别为144例和184例，试验组与对照组比例为1:1。"
 * 早先的实现把所有数字拼起来，得到 32814418411 这种荒唐值。
 * 数字拼接出来的"人数"比 null 危险得多，所以解析不出单一数字就记 null，
 * 原文留在 raw_json 里可追溯。
 */
function toIntOrNull(value) {
  if (value === undefined || value === null) return null
  const text = String(value).replace(/\s+/g, ' ').trim()
  // 允许 "国内: 30 ；" / "30" / "第 1 页" 之外的形式一律不认。
  const strict = /^(?:国内|国际)?\s*[:：]?\s*(\d+)\s*[；;]?$/.exec(text)
  return strict ? Number(strict[1]) : null
}

// ---------------------------------------------------------------------------
// 通道 1：ClinicalTrials.gov API v2
// ---------------------------------------------------------------------------
const CTV_FIELDS = [
  'NCTId',
  'BriefTitle',
  'OverallStatus',
  'Phase',
  'EnrollmentCount',
  'StartDate',
  'CompletionDate',
  'LeadSponsorName',
  'LocationCountry',
].join(',')

async function fetchCtv() {
  const records = []
  const seen = new Set()
  let pageToken = null
  let totalCount = null
  let note = ''
  let pages = 0

  for (;;) {
    const params = new URLSearchParams({
      'query.cond': DISEASE,
      pageSize: '100',
      countTotal: 'true',
      fields: CTV_FIELDS,
    })
    if (pageToken) params.set('pageToken', pageToken)
    const url = `https://clinicaltrials.gov/api/v2/studies?${params.toString()}`

    const res = await request(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } })
    if (res.status !== 200) {
      return {
        status: pages > 0 ? STATUS.PARTIAL : STATUS.ERROR,
        records,
        note: `HTTP ${res.status}；${pages > 0 ? `已取 ${pages} 页后中断` : '第 1 页即失败'}`,
      }
    }
    const body = JSON.parse(res.text)
    totalCount ??= body.totalCount ?? null
    pages += 1

    for (const study of body.studies ?? []) {
      const section = study.protocolSection ?? {}
      const registryId = section.identificationModule?.nctId
      if (!registryId || seen.has(registryId)) continue
      seen.add(registryId)
      const countries = [
        ...new Set((section.contactsLocationsModule?.locations ?? []).map((l) => l.country).filter(Boolean)),
      ]
      records.push({
        source: 'ctv',
        registry_id: registryId,
        title: nullIfBlank(section.identificationModule?.briefTitle),
        status: nullIfBlank(section.statusModule?.overallStatus),
        phase: nullIfBlank((section.designModule?.phases ?? []).join(' / ')),
        enrollment: section.designModule?.enrollmentInfo?.count ?? null,
        start_date: nullIfBlank(section.statusModule?.startDateStruct?.date),
        completion_date: nullIfBlank(section.statusModule?.completionDateStruct?.date),
        sponsor: nullIfBlank(section.sponsorCollaboratorsModule?.leadSponsor?.name),
        country: countries.length ? countries.join(' / ') : null,
        raw_json: {
          // 只留关键字段快照：整页 protocolSection 会让库膨胀十倍，且没有校验价值。
          nctId: registryId,
          overallStatus: section.statusModule?.overallStatus ?? null,
          phases: section.designModule?.phases ?? [],
          enrollmentCount: section.designModule?.enrollmentInfo?.count ?? null,
          startDate: section.statusModule?.startDateStruct?.date ?? null,
          completionDate: section.statusModule?.completionDateStruct?.date ?? null,
          leadSponsor: section.sponsorCollaboratorsModule?.leadSponsor?.name ?? null,
          countries,
        },
      })
    }

    pageToken = body.nextPageToken ?? null
    if (!pageToken) break
    if (pages >= CTV_MAX_PAGES) {
      note = `已达自设上限 ${CTV_MAX_PAGES} 页，未继续翻页`
      break
    }
  }

  const total = totalCount ?? records.length
  if (records.length < total) {
    return {
      status: STATUS.PARTIAL,
      records,
      note: `上游 totalCount=${total}，实取 ${records.length} 条（第 ${pages} 页后无 pageToken）`,
    }
  }
  return {
    status: STATUS.READY,
    records,
    note: note || `totalCount=${total}，${pages} 页全部取回`,
  }
}

// ---------------------------------------------------------------------------
// 通道 2：WHO ICTRP
//
// 只走检索页的 POST（TextBox1 + Button1）。注意 GET ?SearchTerm= 的语义不一样：
// 它只命中"试验标题含该词"的 3 条，而 POST 表单是全文/同义词检索的 397 条。
// 两者不是同一个查询，混用会低估覆盖，所以这里只认 POST 结果并写明总量。
// ---------------------------------------------------------------------------
const ICTRP_BASE = 'https://trialsearch.who.int/'

function parseIctrpRows(html) {
  const rows = []
  for (const match of html.matchAll(/<tr valign="top"[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const block = match[1]
    const registryId = /GridView1_ctl\d+_Label1">([^<]+)</.exec(block)?.[1]?.trim()
    if (!registryId) continue
    const title = /HyperLink2"[^>]*>([^<]*)</.exec(block)?.[1]?.trim() ?? null
    const cells = [...block.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) =>
      m[1].replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim(),
    )
    rows.push({
      registry_id: registryId,
      title: nullIfBlank(title),
      status: nullIfBlank(cells[0]),
      // 最后一列是"Date of Registration"，倒数第二列是 Results available。
      registration_date: cells.length >= 2 ? nullIfBlank(cells[cells.length - 2]) : null,
    })
  }
  return rows
}

async function fetchIctrp() {
  const jar = createJar()
  const landing = await request(ICTRP_BASE, { headers: { 'User-Agent': UA } })
  jar.absorb(landing)
  if (landing.status !== 200) {
    return { status: STATUS.ERROR, records: [], note: `检索首页 HTTP ${landing.status}` }
  }

  const form = aspnetHiddenFields(landing.text)
  form.TextBox1 = DISEASE
  form.Button1 = 'Search'

  const search = await request(ICTRP_BASE, {
    method: 'POST',
    headers: {
      'User-Agent': UA,
      Cookie: jar.header(),
      'Content-Type': 'application/x-www-form-urlencoded',
      Referer: ICTRP_BASE,
    },
    body: new URLSearchParams(form).toString(),
  })
  jar.absorb(search)
  if (search.status !== 200) {
    return { status: STATUS.ERROR, records: [], note: `检索 POST HTTP ${search.status}` }
  }

  // 被 WAF 拦到 NoAccess.aspx 时页面还是 200，只能靠内容判断。
  if (search.text.includes('NoAccess.aspx')) {
    return { status: STATUS.UNSUPPORTED, records: [], note: '检索请求被重定向到 NoAccess.aspx（WAF 拦截）' }
  }

  const totalMatch = /(\d+) records for (\d+) trials found/.exec(search.text)
  const totalRecords = totalMatch ? Number(totalMatch[1]) : null
  const totalTrials = totalMatch ? Number(totalMatch[2]) : null
  const rows = parseIctrpRows(search.text)

  const records = rows.map((row) => ({
    source: 'ictrp',
    registry_id: row.registry_id,
    title: row.title,
    status: row.status,
    phase: null, // 列表页不给分期，详情页需要另一套会话，本轮不取 → 留 null 而不是猜
    enrollment: null,
    start_date: null,
    completion_date: null,
    sponsor: null,
    country: null,
    raw_json: { ...row, list_page_only: true },
  }))

  if (!totalTrials) {
    return {
      status: records.length ? STATUS.PARTIAL : STATUS.ERROR,
      records,
      note: `检索页未给出命中总数标签，只解析到 ${records.length} 行`,
    }
  }

  if (records.length >= totalTrials) {
    return { status: STATUS.READY, records, note: `上游 ${totalRecords} 条/${totalTrials} 个试验，已全部取回` }
  }

  return {
    status: STATUS.PARTIAL,
    records,
    note:
      `上游检索页自称 ${totalRecords} records / ${totalTrials} trials，` +
      `但 ASP.NET 回发翻页（__EVENTTARGET=GridView1）与 Export to CSV/XML 都被 WAF 重定向到 NoAccess.aspx，` +
      `只能落到第 1 页的 ${records.length} 行`,
  }
}

// ---------------------------------------------------------------------------
// 通道 3：中国临床试验注册中心（ChiCTR）
//
// 实测三条路都断：searchproj.html 对非浏览器 UA 直接 405（阿里云 WAF 页），
// SPA 的公开检索接口 /bin/chictr/website/searchProject 返回
// {"code":40000,"message":"非法访问"}，服务端还校验 x-hyd-uuid 会话令牌。
// 所以本通道记 unsupported，并且必须带上覆盖声明——0 条是"没查通"，不是"没有"。
// ---------------------------------------------------------------------------
const CHICTR_PROBE_URLS = [
  'https://www.chictr.org.cn/searchproj.html',
  'https://www.chictr.org.cn/bin/chictr/website/searchProject',
]

async function fetchChictr() {
  const observations = []
  let sawBlock = false

  for (const url of CHICTR_PROBE_URLS) {
    try {
      const isApi = url.endsWith('/searchProject')
      const res = await request(url, {
        method: isApi ? 'POST' : 'GET',
        headers: {
          'User-Agent': UA,
          Accept: isApi ? 'application/json, text/plain, */*' : 'text/html',
          'Accept-Language': 'zh-CN,zh;q=0.9',
          ...(isApi ? { 'Content-Type': 'application/json;charset=utf-8' } : {}),
          Referer: 'https://www.chictr.org.cn/index.html',
        },
        ...(isApi ? { body: JSON.stringify({ title: DISEASE, paging: { page: 1, size: 10 } }) } : {}),
      })
      if (res.status === 405) sawBlock = true
      const blockedBody = isApi && /非法访问|非法请求/.test(res.text)
      if (blockedBody) sawBlock = true
      // 光记 HTTP 200 会误导：明明是被"非法访问"报文挡掉的，note 里必须写出这句话，
      // 否则下一个人会以为这个接口可用、只是解析没写。
      observations.push(
        `${url.replace('https://www.chictr.org.cn', '')} → HTTP ${res.status}${blockedBody ? '（返回 非法访问 报文）' : ''}`,
      )
    } catch (error) {
      observations.push(`${url.replace('https://www.chictr.org.cn', '')} → ${error.name}: ${error.message}`)
    }
  }

  return {
    // 站点明确拒绝机读访问（405 / 非法访问）记 unsupported；
    // 若是纯网络错误则应算 error，不能让"网断了"伪装成"这个库不给查"。
    status: sawBlock ? STATUS.UNSUPPORTED : STATUS.ERROR,
    records: [],
    note:
      `无可用的公开机读检索接口：${observations.join('；')}。` +
      '0 条不代表无相关研究——该库以中文注册为主，本通道本轮未查通（未查过）。',
  }
}

// ---------------------------------------------------------------------------
// 通道 4：药物临床试验登记与信息公示平台（CDE / NMPA）
//
// 需要三步：①GET 首页拿到 JS 反爬 cookie（FSSBBIl1UgzbN7N80S）；
// ②GET 检索页刷新会话；③POST clinicaltrials.searchlist.dhtml 拿列表。
// 少了前两步会一直拿到挑战页（页面 200 但内容是混淆脚本）。
// ---------------------------------------------------------------------------
const CDE_BASE = 'https://www.chinadrugtrials.org.cn/'

function parseCdeRows(html) {
  const rows = []
  for (const match of html.matchAll(/<tr style=" color:#535353">([\s\S]*?)<\/tr>/gi)) {
    const block = match[1]
    const cells = [...block.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) =>
      m[1].replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim(),
    )
    const registryId = cells.find((c) => /^CTR\d{8}$/.test(c))
    if (!registryId) continue

    // 详情锚点有两种形态：新记录是裸 32 位 hex，2013~2014 年的老记录带 "_p" 后缀
    // （甚至退化成 "1200_p"）。只匹配裸 hex 会让老试验静默丢掉详情字段，
    // 而"静默丢字段"比"报错"危险得多——所以这里放宽到任意 id，只要求形式非空。
    const anchor = /getDetail\(this\.id\)"\s+id="([^"]+)"\s+name="([^"]*)"/.exec(block)
    rows.push({
      detail_id: anchor?.[1] ?? null,
      // getDetail() 会把 name 写进 ckm_index，回发详情时必须带同一个值。
      ckm_index: anchor?.[2] ?? '1',
      registry_id: registryId,
      status: cells[2] ?? null, // 登记号列之后是"试验状态"
      drug: cells[3] ?? null,
      indication: cells[4] ?? null,
      title: cells[5] ?? null,
    })
  }
  return rows
}

/**
 * 页面里"标签"会出现多次：先是大标题卡片里的同名标签（那一格常常是空的），
 * 然后才是正文"二、申请人信息""三、临床试验信息"里真正带值的那一处。
 * 实测 CTR20130816：第一个"申请人名称"后面跟的是卡片标题"公示的试验信息"，
 * 第二个"申请人名称"后面跟的是另一个字段名"联系人姓名"（该字段本来就是空的）。
 * 所以既要跳过分区标题，也要跳过"值本身又是一个字段名"的情形——否则会把
 * 字段名当企业名存进库，这比存 null 危险得多。
 */
const CDE_LABELS = new Set([
  '公示的试验信息',
  '申请人联系人',
  '申请人名称',
  '联系人姓名',
  '联系人座机',
  '联系人手机号',
  '联系人Email',
  '联系人邮政地址',
  '联系人邮编',
  '首次公示信息日期',
  '登记号',
  '相关登记号',
  '药物名称',
  '药物类型',
  '临床申请受理号',
  '适应症',
  '试验专业题目',
  '试验通俗题目',
  '试验方案编号',
  '方案最新版本号',
  '方案是否为联合用药',
  '试验分期',
  '设计类型',
  '目标入组人数',
  '已入组人数',
  '第一例受试者签署知情同意书日期',
  '第一例受试者入组日期',
  '试验完成日期',
  '试验终止日期',
  '版本日期:',
])

function isSectionHeading(text) {
  return /^[一二三四五六七八九十]+、/.test(text) || CDE_LABELS.has(text)
}

/** CDE 详情页没有机读接口，只能把文本行拉平后按标签取"下一行"。 */
function pickAfter(lines, label, offset = 1) {
  for (let index = lines.indexOf(label); index >= 0; index = lines.indexOf(label, index + 1)) {
    const value = nullIfBlank(lines[index + offset])
    if (value && !isSectionHeading(value)) return value
  }
  return null
}

/**
 * 申办者只在页面顶部的"信息卡"里取，也就是第一个"一、题目和背景信息"之前的行。
 *
 * 踩过的坑：全页找"申请人名称"会拿到两个都不是企业名的东西——
 *   CTR20264022 正文分区里是 ["申请人名称","1","联系人姓名"]（公司名在序号下面，表格竖排）；
 *   CTR20130816 分区里更是 ["申请人名称","联系人姓名","何胜旭"]（这栏本来就空着），
 *   顺着往下取就会把联系人何胜旭当成企业名。
 * 信息卡里那一格才是"申请人名称：<企业>"的单行形态，所以把搜索范围钉死在卡片区。
 * 卡片里也取不到（该试验没填）就记 null —— null 表示未填，不是"没有申办者"。
 */
const SPONSOR_REJECT = /^(?:\d+|[A-Za-z ]*)$/

function pickSponsor(lines) {
  const cardEnd = lines.indexOf('一、题目和背景信息')
  const card = cardEnd > 0 ? lines.slice(0, cardEnd) : lines
  for (let index = card.indexOf('申请人名称'); index >= 0; index = card.indexOf('申请人名称', index + 1)) {
    const value = nullIfBlank(card[index + 1])
    if (!value || isSectionHeading(value) || SPONSOR_REJECT.test(value)) continue
    if (value.length < 3) continue
    return value
  }
  return null
}

/**
 * 取标签之后的第一个真日期。
 *
 * 为什么不能只取"下一行"：CDE 的日期字段按国别分两行，未填写时那两行是
 * "国内：登记人暂未填写该信息；" 这种占位文本，真正的 YYYY-MM-DD 可能在后面
 * 几行，也可能压根没有。所以往下扫最多 4 行找日期，找不到就是 null
 * （null = 登记人未填/未取到，不是"没有这个日期"）。
 */
function pickDateAfter(lines, label, scan = 4) {
  const index = lines.indexOf(label)
  if (index < 0) return null
  for (let i = index + 1; i <= index + scan && i < lines.length; i += 1) {
    if (isSectionHeading(lines[i])) break
    const hit = /\b(\d{4}-\d{2}-\d{2})\b/.exec(lines[i])
    if (hit) return hit[1]
  }
  return null
}

async function fetchChinaDrugTrials() {
  const jar = createJar()
  const landing = await request(CDE_BASE, { headers: { 'User-Agent': UA } })
  jar.absorb(landing)
  if (landing.status !== 200) {
    return { status: STATUS.ERROR, records: [], note: `首页 HTTP ${landing.status}` }
  }

  // 这一步既是刷 cookie 也是确认"会话已经过了反爬"。
  const listPage = await request(`${CDE_BASE}clinicaltrials.searchlist.dhtml`, {
    headers: { 'User-Agent': UA, Cookie: jar.header(), Referer: CDE_BASE },
  })
  jar.absorb(listPage)
  if (listPage.status !== 200) {
    return { status: STATUS.ERROR, records: [], note: `检索页 HTTP ${listPage.status}` }
  }

  const searchUrl = `${CDE_BASE}clinicaltrials.searchlist.dhtml`
  const search = await request(searchUrl, {
    method: 'POST',
    headers: {
      'User-Agent': UA,
      Cookie: jar.header(),
      Referer: searchUrl,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: `keywords=${encodeURIComponent('发作性睡病')}`,
  })
  jar.absorb(search)
  if (search.status !== 200) {
    return { status: STATUS.ERROR, records: [], note: `检索 POST HTTP ${search.status}` }
  }

  const rows = parseCdeRows(search.text)
  const totalText = /共\s*<i>(\d+)<\/i>\s*条记录/.exec(search.text)?.[1]
  const total = totalText ? Number(totalText) : null

  // 页面 200 但一条 CTR 号都没有 → 大概率又被反爬挑战页接走了，如实记 error。
  if (!rows.length && total !== 0) {
    return {
      status: STATUS.ERROR,
      records: [],
      note: `检索页返回 200 但解析不出任何 CTR 登记号（疑似反爬挑战页），页面长度 ${search.text.length}`,
    }
  }

  // 列表行只有适应症/药物/题目；分期、申办者、目标入组、日期都在详情页。
  // 逐条取详情是为了让 phase/sponsor/enrollment 是真值而不是猜的 null。
  const records = []
  for (const row of rows) {
    let detail = {
      phase: null,
      sponsor: null,
      enrollment: null,
      start_date: null,
      completion_date: null,
      title: row.title,
      indication: row.indication,
      drug: row.drug,
    }

    if (row.detail_id) {
      try {
        const body = new URLSearchParams({
          id: row.detail_id,
          ckm_index: row.ckm_index,
          sort: 'desc',
          sort2: '',
          rule: 'CTR',
          secondLevel: '0',
          currentpage: '1',
        }).toString()
        const res = await request(`${CDE_BASE}clinicaltrials.searchlistdetail.dhtml`, {
          method: 'POST',
          headers: {
            'User-Agent': UA,
            Cookie: jar.header(),
            Referer: searchUrl,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body,
        })
        jar.absorb(res)
        const lines = stripTags(res.text)
        detail = {
          ...detail,
          title: pickAfter(lines, '试验通俗题目') ?? detail.title,
          phase: pickAfter(lines, '试验分期'),
          sponsor: pickSponsor(lines),
          // "目标入组人数" 的下一行形如 "国内: 30 ；"，也可能两国都未填。
          enrollment: toIntOrNull(pickAfter(lines, '目标入组人数')),
          // 实测的真实标签（不是猜的）：签署知情同意书日期 / 入组日期 / 试验完成日期。
          // 中国大陆登记多数填的是"入组日期"，所以两者都试，先到先得。
          start_date:
            pickDateAfter(lines, '第一例受试者签署知情同意书日期') ?? pickDateAfter(lines, '第一例受试者入组日期'),
          completion_date: pickDateAfter(lines, '试验完成日期'),
          indication: pickAfter(lines, '适应症') ?? detail.indication,
        }
      } catch (error) {
        // 详情页失败不拖累整条记录：列表行本身已经是真实公开数据，
        // 只是分期/申办者等字段留 null（null 表示"未取到"，不表示"没有"）。
        detail = { ...detail, detail_error: `${error.name}: ${error.message}` }
      }
    }

    records.push({
      source: 'chinadrugtrials',
      registry_id: row.registry_id,
      title: detail.title,
      status: row.status,
      phase: detail.phase,
      enrollment: detail.enrollment,
      start_date: detail.start_date,
      completion_date: detail.completion_date,
      sponsor: detail.sponsor,
      country: '中国',
      raw_json: {
        registry_id: row.registry_id,
        list_status: row.status,
        drug: detail.drug,
        indication: detail.indication,
        detail_error: detail.detail_error ?? null,
      },
    })
    // 站点没有公开频率说明，主动限速，避免把患者工作台变成压测工具。
    await new Promise((resolve) => setTimeout(resolve, 350))
  }

  if (total !== null && records.length < total) {
    return {
      status: STATUS.PARTIAL,
      records,
      note: `页面自称共 ${total} 条，实解析 ${records.length} 条（同页 20 条分页，未继续翻页）`,
    }
  }
  return { status: STATUS.READY, records, note: `页面自称共 ${total ?? records.length} 条，已全部解析` }
}

// ---------------------------------------------------------------------------
// 落库与自检
// ---------------------------------------------------------------------------
function writeOutputs(results) {
  mkdirSync(OUT_DIR, { recursive: true })

  // 通道有先后，但最终行序按 (source, registry_id) 固定，便于 diff 出"这次变了什么"。
  const all = results
    .flatMap((result) => result.records)
    .sort((a, b) => a.source.localeCompare(b.source) || a.registry_id.localeCompare(b.registry_id))

  const fetchedAt = new Date().toISOString()
  const dedup = new Set()
  const rows = []
  for (const record of all) {
    const key = `${record.source}\u0000${record.registry_id}`
    if (dedup.has(key)) continue
    dedup.add(key)
    rows.push({
      trial_key: trialKeyFor(record.source, record.registry_id),
      ...record,
      raw_json: JSON.stringify(record.raw_json ?? null),
      fetched_at: fetchedAt,
    })
  }

  const channels = results.map((result) => ({
    id: result.id,
    status: result.status,
    count: result.records.length,
    note: result.note,
    fetched_at: fetchedAt,
  }))

  const manifest = {
    generated_at: fetchedAt,
    disease: DISEASE,
    query: {
      // 每个通道的查询式单独记录：同一个词在四个库里的检索语义并不一样。
      ctv: `query.cond=${DISEASE}&pageSize=100&fields=${CTV_FIELDS}`,
      ictrp: `POST ${ICTRP_BASE} TextBox1=${DISEASE} + Button1=Search`,
      chictr_online: `GET ${CHICTR_PROBE_URLS[0]}（被 405 阻断）`,
      chinadrugtrials: `POST ${CDE_BASE}clinicaltrials.searchlist.dhtml keywords=发作性睡病`,
    },
    channels,
    totals: { records: rows.length },
  }

  const jsonlPath = join(OUT_DIR, 'trials.jsonl')
  const sqlitePath = join(OUT_DIR, 'trials.sqlite')
  const manifestPath = join(OUT_DIR, 'manifest.json')

  writeFileSync(jsonlPath, rows.map((row) => JSON.stringify(row)).join('\n') + (rows.length ? '\n' : ''))
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')

  // 重跑要幂等：先删库再建，避免上一轮的残留行把一致性自检撑成"看起来对"。
  rmSync(sqlitePath, { force: true })
  rmSync(`${sqlitePath}-wal`, { force: true })
  rmSync(`${sqlitePath}-shm`, { force: true })

  const db = new DatabaseSync(sqlitePath)
  db.exec(`
    CREATE TABLE trials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trial_key TEXT NOT NULL,
      source TEXT NOT NULL,
      registry_id TEXT NOT NULL,
      title TEXT,
      status TEXT,
      phase TEXT,
      enrollment INTEGER,
      start_date TEXT,
      completion_date TEXT,
      sponsor TEXT,
      country TEXT,
      raw_json TEXT,
      fetched_at TEXT NOT NULL,
      UNIQUE (source, registry_id)
    );
    CREATE INDEX idx_trials_trial_key ON trials (trial_key);
    CREATE TABLE channels (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      count INTEGER NOT NULL,
      note TEXT,
      fetched_at TEXT NOT NULL
    );
  `)

  const insertTrial = db.prepare(`
    INSERT INTO trials (trial_key, source, registry_id, title, status, phase, enrollment,
                        start_date, completion_date, sponsor, country, raw_json, fetched_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  for (const row of rows) {
    insertTrial.run(
      row.trial_key,
      row.source,
      row.registry_id,
      row.title,
      row.status,
      row.phase,
      row.enrollment,
      row.start_date,
      row.completion_date,
      row.sponsor,
      row.country,
      row.raw_json,
      row.fetched_at,
    )
  }

  const insertChannel = db.prepare('INSERT INTO channels (id, status, count, note, fetched_at) VALUES (?, ?, ?, ?, ?)')
  for (const channel of channels) {
    insertChannel.run(channel.id, channel.status, channel.count, channel.note, channel.fetched_at)
  }

  const sqliteCount = db.prepare('SELECT COUNT(*) AS n FROM trials').get().n
  const channelSum = db.prepare('SELECT SUM(count) AS n FROM channels').get().n
  db.close()

  return { rows, channels, manifest, jsonlPath, sqlitePath, manifestPath, sqliteCount, channelSum }
}

/**
 * 一致性自检。
 *
 * 为什么必须硬失败：manifest 说 176 条、库里有 174 条时，任何"看着差不多"的
 * 人工判断都会在患者那边变成一条查不到的试验。三处数字对齐是这套产出唯一
 * 能被机器信任的前提，所以不一致就 exit 1，不写"已通过"。
 */
function selfCheck({ jsonlPath, sqliteCount, manifest }) {
  const jsonlLines = readNonEmptyLines(jsonlPath).length
  const problems = []
  if (manifest.totals.records !== jsonlLines) {
    problems.push(`manifest.totals.records=${manifest.totals.records} ≠ jsonl 行数=${jsonlLines}`)
  }
  if (manifest.totals.records !== sqliteCount) {
    problems.push(`manifest.totals.records=${manifest.totals.records} ≠ sqlite trials 行数=${sqliteCount}`)
  }
  if (jsonlLines !== sqliteCount) {
    problems.push(`jsonl 行数=${jsonlLines} ≠ sqlite trials 行数=${sqliteCount}`)
  }
  return { jsonlLines, sqliteCount, problems }
}

function readNonEmptyLines(path) {
  return readFileSync(path, 'utf8').split('\n').filter((line) => line.trim().length > 0)
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------
const CHANNELS = [
  { id: 'ctv', label: 'ClinicalTrials.gov API v2', run: fetchCtv },
  { id: 'ictrp', label: 'WHO ICTRP', run: fetchIctrp },
  { id: 'chictr_online', label: '中国临床试验注册中心 ChiCTR', run: fetchChictr },
  { id: 'chinadrugtrials', label: '药物临床试验登记与信息公示平台 CDE', run: fetchChinaDrugTrials },
]

const results = []
for (const channel of CHANNELS) {
  process.stderr.write(`… ${channel.id} `)
  try {
    const outcome = await channel.run()
    // 通道自报的终态必须是枚举里的值，否则说明代码里写错了状态名。
    const status = STATUS_ENUM.includes(outcome.status) ? outcome.status : STATUS.ERROR
    results.push({ id: channel.id, label: channel.label, status, records: outcome.records ?? [], note: outcome.note ?? '' })
    process.stderr.write(`${status} (${(outcome.records ?? []).length})\n`)
  } catch (error) {
    const status = classifyError(error)
    results.push({
      id: channel.id,
      label: channel.label,
      status,
      records: [],
      note: `${error.name}: ${error.message}`,
    })
    process.stderr.write(`${status} (0) — ${error.name}: ${error.message}\n`)
  }
}

if (DRY_RUN) {
  console.log('\n# dry-run：只打印通道终态，不写库')
  console.log('channel           status     count  note')
  for (const result of results) {
    console.log(`${result.id.padEnd(17)} ${result.status.padEnd(10)} ${String(result.records.length).padStart(5)}  ${result.note}`)
  }
  const total = new Set(results.flatMap((r) => r.records.map((x) => `${x.source}\u0000${x.registry_id}`))).size
  console.log(`\n合计（去重后）: ${total} 条`)
  process.exit(0)
}

const written = writeOutputs(results)
const check = selfCheck(written)

console.log('\n# M4 临床试验采集完成')
console.log('channel           status     count')
for (const channel of written.channels) {
  console.log(`${channel.id.padEnd(17)} ${channel.status.padEnd(10)} ${String(channel.count).padStart(5)}`)
}
console.log(`\n合计 trials: ${written.manifest.totals.records} 条 → ${OUT_DIR}/`)

if (check.problems.length) {
  console.error('\n✗ 一致性自检失败：')
  for (const problem of check.problems) console.error('  - ' + problem)
  process.exit(1)
}
console.log(
  `✓ 一致性自检通过：manifest ${written.manifest.totals.records} == jsonl ${check.jsonlLines} == sqlite ${check.sqliteCount}`,
)
