# 临床试验信息来源（M4）

本文件记录 `scripts/fetch-narcolepsy-trials-2026.mjs` **实际做了什么**，不是设计意图。
所有终态、条数、报错文本都来自 2026-10-25（Asia/Shanghai）在本机的一次真实运行。

```bash
node scripts/fetch-narcolepsy-trials-2026.mjs            # 真跑并写 data/trials/
node scripts/fetch-narcolepsy-trials-2026.mjs --dry-run  # 只打印通道终态，不写库
```

产出：`data/trials/manifest.json`、`data/trials/trials.jsonl`、`data/trials/trials.sqlite`。

---

## 一、终态枚举

终态存在的唯一理由：患者看到"0 条"时必须能区分**这个库确实没有登记**和**我们根本没查通**。
把两者压成一个是虚报，所以下面每个值都是硬边界。

| 终态 | 含义 | 什么时候出现 |
| --- | --- | --- |
| `ready` | 通道跑通，且该来源声称的总量已全部取到 | `records.length >= 上游自报总数` |
| `partial` | 跑通但只拿到一部分 | 上游给了总数，但只解析到第一页 |
| `truncated` | 跑通但撞上本脚本自设上限 | 例：CTV 超过 `CTV_MAX_PAGES=20` 页 |
| `timeout` | 请求超时（`AbortSignal.timeout`，30s） | `error.name in {TimeoutError, AbortError}` |
| `unsupported` | 站点没有可用的公开机读接口，且明确拒绝机读访问 | ChiCTR 的 405 / `非法访问` |
| `not_configured` | 需要凭据或配置，本轮没有 | 当前四通道均未触发 |
| `error` | 其他失败（HTTP 非 200、解析不出结构、反爬挑战页） | 见下 |

`timeout` 与 `unsupported` 必须分开：**网断了**不能让站点背"不给查"的锅，反过来也一样。

---

## 二、四个通道

### 1. `ctv` — ClinicalTrials.gov API v2 · 终态 `ready` · **176 条**

- URL：`https://clinicaltrials.gov/api/v2/studies`
- 查询式：
  ```
  ?query.cond=narcolepsy&pageSize=100&countTotal=true
  &fields=NCTId,BriefTitle,OverallStatus,Phase,EnrollmentCount,StartDate,CompletionDate,LeadSponsorName,LocationCountry
  ```
- 分页：用响应里的 `nextPageToken` 循环，自设上限 20 页。
- 本次结果：`totalCount=176`，2 页全部取回，无截断。
- 字段映射：

  | 本仓字段 | API 路径 |
  | --- | --- |
  | `registry_id` | `protocolSection.identificationModule.nctId` |
  | `title` | `protocolSection.identificationModule.briefTitle` |
  | `status` | `protocolSection.statusModule.overallStatus` |
  | `phase` | `protocolSection.designModule.phases[]`（多期用 ` / ` 连接） |
  | `enrollment` | `protocolSection.designModule.enrollmentInfo.count` |
  | `start_date` | `protocolSection.statusModule.startDateStruct.date` |
  | `completion_date` | `protocolSection.statusModule.completionDateStruct.date` |
  | `sponsor` | `protocolSection.sponsorCollaboratorsModule.leadSponsor.name` |
  | `country` | `protocolSection.contactsLocationsModule.locations[].country`（去重后 ` / ` 连接） |

  **注意**：确实存在 `protocolSection` 为空的 study（纯结果记录），脚本会跳过并记入
  `seen` 去重集合；这也是为什么 `records.length` 与 `totalCount` 要显式比较而不是假定相等。
- 已知限制：单期字段（`Phase` 返回数组）。`raw_json` 只存关键字段快照，不存整个
  `protocolSection`——整页存会让库膨胀十倍且没有校验价值。

### 2. `ictrp` — WHO ICTRP · 终态 `partial` · **10 条**

- 站点：`https://trialsearch.who.int/`（ASP.NET WebForms）
- 查询式：`POST https://trialsearch.who.int/`，表单字段 `TextBox1=narcolepsy` + `Button1=Search`，
  回发时带上首页拿到的 `__VIEWSTATE` 等 hidden 字段与 cookie。
- 本次结果：检索页自称 **397 records / 279 trials**，实际只解析到**第 1 页的 10 行**。
- 为什么只有 10 条（实测，非推测）：
  - 回发翻页（`__EVENTTARGET=GridView1`）被 WAF 重定向到 `NoAccess.aspx`；
  - `Export to CSV` / `Export to XML` 同样被重定向到 `NoAccess.aspx`。
  - 所以终态是 `partial`，不是 `ready`。
- **GET 与 POST 不是同一个查询**：`GET ?SearchTerm=narcolepsy` 只命中"标题含该词"的 3 条，
  `POST` 表单是全文/同义词检索的 397 条。混用会严重低估覆盖，脚本只认 POST 结果。
- 字段映射（列表页正则解析 `<tr valign="top">`）：

  | 本仓字段 | 来源 |
  | --- | --- |
  | `registry_id` | `GridView1_ctlNN_Label1` 单元格文本 |
  | `title` | `HyperLink2` 锚文本 |
  | `status` | 第一个 `<td>` |
  | `registration_date`（存 `raw_json`） | 倒数第二列 "Date of Registration" |

- 已知限制：列表页不给分期/入组数/申办者；详情页需要另一套会话，本轮未取。
  这些字段一律 `null`——`null` 表示"未取到"，不表示"没有"。
  `raw_json.list_page_only = true` 标记该记录只有列表字段。

### 3. `chictr_online` — 中国临床试验注册中心 · 终态 `unsupported` · **0 条**

- 试过的两条路，都断了（终态来自这两次探测本身）：

  | URL | 结果 |
  | --- | --- |
  | `https://www.chictr.org.cn/searchproj.html` | `HTTP 405`（阿里云 WAF 拦截页） |
  | `https://www.chictr.org.cn/bin/chictr/website/searchProject` | `HTTP 200` 但返回 `{"code":40000,"message":"非法访问"}` |

- 服务端还校验 `x-hyd-uuid` 会话令牌，纯 `fetch` 无法完成这个握手。
- **覆盖声明（必须随 0 条一起展示）**：该库以中文注册为主，0 条不代表无相关研究——
  本通道本轮**未查通（未查过）**。
- 该声明写在 `manifest.json` 的 `channels[chictr_online].note` 与 `channels` 表的 `note` 列里，
  由脚本自动写入，不依赖人工记得补。

### 4. `chinadrugtrials` — 药物临床试验登记与信息公示平台 · 终态 `ready` · **14 条**

- 站点：`https://www.chinadrugtrials.org.cn/`（CDE / NMPA）
- 需要三步，缺一步就拿到反爬挑战页（HTTP 200 但内容是混淆脚本）：
  1. `GET https://www.chinadrugtrials.org.cn/` → 拿 JS 种下的 cookie（`FSSBBIl1UgzbN7N80S` 等）；
  2. `GET clinicaltrials.searchlist.dhtml` → 刷新会话；
  3. `POST clinicaltrials.searchlist.dhtml`，body `keywords=发作性睡病` → 列表。
- 本次结果：页面自称**共 14 条**，14 条全部解析并逐条取详情页，终态 `ready`。
- 详情页：`POST clinicaltrials.searchlistdetail.dhtml`，body 需带
  `id`、`ckm_index`、`sort`、`sort2`、`rule=CTR`、`secondLevel`、`currentpage`。
- 字段映射：

  | 本仓字段 | 列表页 | 详情页标签 |
  | --- | --- | --- |
  | `registry_id` | 形如 `CTR\d{8}` 的单元格 | — |
  | `status` | 第 3 列"试验状态" | — |
  | `title` | 第 6 列"试验通俗题目" | `试验通俗题目` |
  | `phase` | — | `试验分期` |
  | `sponsor` | — | `申请人名称`（**仅取页面顶部信息卡**，见下） |
  | `enrollment` | — | `目标入组人数` |
  | `start_date` | — | `第一例受试者签署知情同意书日期`，取不到再退 `第一例受试者入组日期` |
  | `completion_date` | — | `试验完成日期` |
  | `country` | 固定 `中国` | — |

- **踩坑记录（这些是本次真实调试出来的，不是预设）**：
  1. 详情锚点 `id` 有两种形态：新记录是裸 32 位 hex，2013–2014 年的老记录带 `_p` 后缀
     （甚至退化成 `1200_p`）。只匹配裸 hex 会让 `CTR20130816` / `CTR20132491` 两条**静默丢掉**
     全部详情字段——静默丢字段比报错危险，所以正则放宽到任意非空 id。
  2. `ckm_index` 必须取自行锚点的 `name` 属性（`getDetail()` 就是把 `name` 写进它），
     写死成 `1` 会取到错行。
  3. 日期标签**不是** `试验完成日期` 之外的猜测值；实际用的是
     `第一例受试者签署知情同意书日期` / `第一例受试者入组日期` / `试验完成日期`。
     未填写时页面是 `国内：登记人暂未填写该信息；` 占位行，脚本按"整行是占位"判定为 `null`。
  4. `目标入组人数` 有的登记人写成散文：
     "共328例，发作性睡病和OSAHS导致的白天过度嗜睡（EDS）分别为144例和184例，试验组与对照组比例为1:1。"
     早期实现把所有数字拼起来得到 `32814418411`——拼接出来的"人数"比 `null` 危险得多，
     所以现在只接受 `^(国内|国际)?[:：]?\s*(\d+)\s*[；;]?$` 这种单值形态，否则记 `null`，
     原文留在 `raw_json` 里可追溯。
  5. `申请人名称` 标签一页出现 2~3 次：信息卡里那一格是"企业名"，而
     `二、申请人信息` 分区里下一行可能是序号 `1`（竖排表格）或直接是下一个字段名
     `联系人姓名`。顺着往下取会把**联系人姓名当企业名**写进患者可见字段。
     现在只在第一个 `一、题目和背景信息` 之前的信息卡区里取，取不到就 `null`。
- 已知限制：`CTR20130816` 的入组人数是散文、日期三国别全未填，所以该条 `enrollment` /
  `start_date` / `completion_date` 均为 `null`；`CTR20132491` 申办者栏未填 → `null`。
  这些是**登记人未填**，不是脚本失败。

---

## 三、去重与合并

- **行级去重键**：`(source, registry_id)`。同一试验在多个来源出现时，**每个来源各保留一行**
  （字段覆盖不同，删掉就等于丢掉可用信息）。
- **试验级合并键**：`trial_key`，按登记号前缀归一化：

  | 登记号形态 | `trial_key` |
  | --- | --- |
  | `NCT\d{8}` | `nct:NCT…` |
  | `ChiCTR…` | `chictr:CHICTR…` |
  | `CTR\d{8}` | `cde:CTR…` |
  | `ACTRN…` / `DRKS…` / `JPRN-…` / `ISRCTN…` / `EUCTR…` | 对应前缀 |
  | 认不出的号 | `<source>:<id>`（按来源隔离，避免错并） |

  界面上同一 `trial_key` 的多行应并成一条、展示"来源：CTV + ICTRP"。

---

## 四、一致性硬约束

`manifest.totals.records` == `trials.jsonl` 行数 == sqlite `trials` 表行数。

脚本结束前自检（`selfCheck()`），任一不等即 `process.exit(1)`，**不写"已通过"**。
本次运行结果：

```
✓ 一致性自检通过：manifest 200 == jsonl 200 == sqlite 200
```

`test/trials-consistency.test.mjs` 会把同一组断言再跑一遍；`data/trials` 不存在时**skip 而非 fail**
（数据是可重跑的产物，不该让没跑过采集的干净 checkout 变红）。

---

## 五、复跑方法

```bash
# 只看通道终态，不写库（排查"今天哪个源挂了"用这个）
node scripts/fetch-narcolepsy-trials-2026.mjs --dry-run

# 正式采集（幂等：每次先删 trials.sqlite 再重建，避免上一轮残留行把自检撑成"看起来对"）
npm run fetch:trials

# 一致性验收
node --test test/trials-consistency.test.mjs
```

单通道临时排查可以直接改 `CHANNELS` 数组只留一个。脚本没有第三方依赖，只用全局 `fetch`
与 `node:sqlite`，Node 22 下无需 `npm install`。

---

## 六、隐私边界

`data/trials/` 只存**公开注册信息**（登记号、题目、分期、状态、申办者、国家、日期）。
不存、也不应存任何患者个人信息；`trials.sqlite` 与工作台的患者数据（`schema/` 下的表）完全分离。
