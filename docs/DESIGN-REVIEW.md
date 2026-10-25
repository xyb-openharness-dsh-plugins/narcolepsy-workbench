# DESIGN-REVIEW · 小睡宝（发作性睡病）

## 元信息

| 项 | 值 |
| --- | --- |
| 模型标识 | `deepseek-4.1-flash` |
| 档位 | 默认档（本会话未传入温度 / 上下文档位 / 推理预算参数；无法自证更细档位，按实记） |
| 评审人 | **独立子代理**（不共享开发主线上下文，独立会话、独立取证） |
| 日期 | 2026-10-25 |
| 评审对象 | `git -C /Users/sammini/Downloads/narcolepsy-workbench rev-parse --short HEAD` = **`f4106cd`**（提交信息「M0–M4: 文档九件 + schema 冻结 + M2 原型四件套 + 临床试验四通道 200 条」；评审时 `git status --porcelain` 为空） |
| 评审范围 | 设计（九份 docs + schema）与原型（`prototypes/v0.2/` 四件套）的**一致性**，不是代码质量 |
| 本文件状态 | 覆盖 `docs/DESIGN-REVIEW.md` 原有 10 行占位模板（原「状态：待执行」）。除此之外**未修改仓库任何文件、未 `git add`、未 commit** |
| 取证方式 | ① 复跑构建方走查脚本；② 自建 3 个无头 Chrome 脚本（置于 `/tmp`，只读仓库）独立验证交互；③ 文档与 `schema/0001_initial.sql` 逐行对读 |

### ⚠️ 评审期间工作树发生了并行修改（必读，关系到本报告怎么用）

本报告**全部结论锚定在 `f4106cd` 这一个提交**。取证时该提交是干净的（`git status --porcelain` 输出为空），报告里所有的行号、实测数字、`PASS/FAIL` 判定，都是对 `f4106cd` 的文件内容做的。为保证可回溯，行号核验是在 `git show f4106cd:<path>` 导出的 blob 上逐条 `sed` 比对完成的，不是对工作区文件。

但在撰写过程中，仓库工作树被并行修改了。报告收尾时的现状：

```
$ git status --porcelain
 M docs/CLINICAL-DATA-2026.md
 M docs/DESIGN-REVIEW.md          ← 本报告
 M docs/DEV-REQUIREMENTS-2026-10-25.md
 M docs/DIFF-MATRIX.md
 M docs/PATIENT-FLOW.md
 M docs/SPEC.md
 M docs/USER-RESEARCH.md
 M prototypes/v0.2/app.js          (+1204/-…)
 M prototypes/v0.2/demo-data.js
 M prototypes/v0.2/index.html
 M prototypes/v0.2/style.css
 M scripts/probe-prototype.mjs
?? prototypes/v0.2/demo-trials.js
?? scripts/build-demo-trials.mjs
```

并且这些未提交改动中**已经出现引用本报告 P0 编号的注释**（例：`prototypes/v0.2/app.js` 里「这是评审 P0-7 的根因」、`hashParts()` 里「评审 P0-4 的教训」、`:1157` 的 `msg-note`）。也就是说，开发方正在按本报告修 P0，工作树是**移动目标**。

因此：

- **本报告的 P0 = 8 是对 `f4106cd` 成立的事实，不是对当前工作区成立的事实。**
- 收尾时对工作区做过一次抽查（非完整复评）：`一图秀` 已作为 `metrics` 第三个二级落地（`SUBS.metrics = [['cards','指标卡'],['one','一图秀'],['rule','数据口径']]`）；品牌已改为 `<button class="brand" data-action="home">`；`hashParts()` 已改为 slug 优先；`agent-dock` 已有 `textarea#agent-input` + `agent-send`；S04/S05/S08 三张任务卡已在 `demo-data.js:281-283,290-292`；`style.css:281` 已有 `@media print`。这些是**开发方修完之后的状态**，不构成本报告对 `f4106cd` 判定的反证。
- 但抽查也发现工作区**新增了两处**需要单独处理的问题（不在本报告 P0 计数内，因为它们不属于 `f4106cd`）：见文末「附：工作区漂移抽查」。若要把本轮修改并入 G2，这两条要一起过。

> 建议的用法：把这份报告当作 `f4106cd` 的**缺陷基线**；G2 签认时对照本报告的 8 条 P0 逐条核销，核销依据是**新提交**而不是当前工作树。

---

## 复跑走查（命令 + 实际输出 + 与自报数字核对）

### 命令

```
cd /Users/sammini/Downloads/narcolepsy-workbench && npm run probe:proto
```

### 实际输出（原文照抄，exit code 0）

```
原型无头走查：81/81 页通过（1400 / 1000 / 860 px × 27 个 (view, sub)）

  860px：27/27
  1000px：27/27
  1400px：27/27

svg.chart 出现的页：6/81
  ess/1 metrics/1

结果：PASS
```

### 与开发方自报数字核对

| 自报 | 出处 | 复跑实测 | 核对 |
| --- | --- | --- | --- |
| 81/81 页通过 | `docs/DEV-PLAN.md:10`（M2 行：「四件套+81/81 走查+13 图已出；待独立评审 P0=0」） | 81/81 | **一致 ✅** |

### 同日稍后的第二次复跑（工作树已被并行修改，结果不同，如实记录）

收尾时工作树已漂移（见上方警告），同一条命令再跑一次，输出变了：

```
原型无头走查：90/90 页通过（1400 / 1000 / 860 px × 30 个 (view, sub)）

  860px：30/30
  1000px：30/30
  1400px：30/30

svg.chart 出现的页：12/90
  dashboard/1 naps/1 ess/1 metrics/1

结果：PASS
```

30 个 `(view, sub)` = 新增一级 `trials`「临床试验」的 3 个二级（`SUBS.trials = [['profile','个人建档'],['match','匹配结果'],['library','试验库']]`）。81→90 的差不是修 bug 修出来的，是**范围扩张**（9 一级 → 10 一级）。

两次都是 PASS，两次都与各自时点的自报吻合。本报告的**判定依据是第一次（`f4106cd`）的 81/81**；第二次 90/90 只说明走查脚本在新范围下仍通过，不改变任何一条 P0 判定。

### 但 81/81 的水位要写清楚（重要）

`scripts/probe-prototype.mjs:167-174` 的断言集合只有 7 条：`scrollWidth` 无横向溢出、无竖排单字（`squeezedCount`）、首屏 `.ver-chip` 版本号可见、`#nav [data-nav]` 数量 = 9、`.subnav [role=tab]` 数量 = 3、`#main h1` 非空、控制台 error/exception 计数 = 0。

它**不点击任何按钮、不校验二级页名称、不校验场景入口文案、不校验产物、不校验回首页、不校验私密过滤**（`scripts/probe-prototype.mjs:32-35` 的 `PAGES` 只写每个 view 的二级**个数**，不写名称）。

> 结论：81/81 只证明「27 页 × 3 档宽度能渲染且不崩」。它**不能**作为 IP1–IP10 或 S01–S08 的通过证据。本评审的全部交互结论来自下方自建脚本，不引用 81/81 作为功能证据。

### 自建无头验证（补充取证）

| 脚本 | 覆盖 |
| --- | --- |
| `/tmp/narco-review-probe.mjs` | 每页按钮清单、agent dock 结构、导出预览内容、私密折叠、切档案状态、四类表单字段数、候选拒收副作用、三态渲染、ESS 守门、Esc 行为 |
| `/tmp/narco-review-probe2.mjs` | 语义 sub 名 vs 数字 sub 深链接、私密跨页复位、导出过滤实测、指标默认选中与切档案、ESS 草稿跨档案、看板 4 张任务卡落点、看板产物 |
| `/tmp/narco-review-probe3.mjs` | IP6 每页编辑按钮计数（27 页）、IP7 数字输入属性、IP10 AI 示例、S04/S05/S07 落点、全站红线词扫描 |

三脚本合计执行 **> 130 次页面加载 / 点击 / DOM 断言**，控制台异常 **0**。未验证项在检验单里明确写「未验」。

---

## 检验单 13 项

| # | 检验项 | 结论 | 证据 | 备注 |
| --- | --- | --- | --- | --- |
| 1 | 医生任务冒充患者需要 | **PASS** | `docs/USER-RESEARCH.md:37-47`「医生任务 ≠ 患者需要」表把分型/MSLT 判读/剂量/驾驶四件全部标 ❌ 并写处理方式；`docs/DIFF-MATRIX.md:55-59` 明确不做 5 条；`docs/DEV-REQUIREMENTS-2026-10-25.md:58-59,66` 同口径。原型侧：`prototypes/v0.2/app.js:323`（分型不做推断）、`:335`（检查结果以医生解释为准）、`:511`（管制药不给用量建议） | L2「检查原文（PSG·MSLT）」只存原文数值与单位（`prototypes/v0.2/demo-data.js:97-98` 存「睡眠潜伏期 6 分钟」「平均潜伏期 4.1 分钟」），属**记录**非**判读**。**两文档之间没有自相矛盾**：`DIFF-MATRIX` 的功能清单里没有一条落在医生决策上 |
| 2 | 证据成立性 | **PASS** | `docs/USER-RESEARCH.md:3` 首行「**0 访谈。**…下面的"患者原话"全部是**推导句**，不冒充一手引语」；`:9` E0=0 条；`:13` E4 为本文件主体；`:29-35` 两句引语各自紧跟「推导句 · 非一手引语（0 访谈）」。`docs/DIFF-MATRIX.md:16` 表头也写「患者原话（推导句，0 访谈）」；`docs/SPEC.md:8` 同一句标注。原型顶部常驻声明 `prototypes/v0.2/index.html:13`「全部为模拟资料…本轮尚未采集」；`prototypes/v0.2/app.js:272` 另有演示数据声明 | 原型里唯一带引号的"用户发言"是 `prototypes/v0.2/app.js:359` 的**示例输入句**「刚才三点半开会睡着了，大概二十分钟」，是教用户怎么跟 AI 说话，不是冒充访谈引语。**未发现改写句冒充一手引语** |
| 3 | 解释价值 vs 记录本 | **WARN** | 超出表格形态的只有 6 处：`app.js:285`（单次时长中位数卡片）、`:289`（24 小时时段柱）、`:372`（时段聚合柱）、`:437`（夜间按周柱）、`:475`（ESS 总分折线 `svg.chart`）、`:557`（指标趋势折线）；`app.js:660-663`（「这三个月的变化」三项事实陈述） | 27 个页面里，`naps/0`、`night/0`、`meds/2`、`ess/2`、`metrics/0`、`admin/0`、`visit/0`、`visit/1` **都是纯表格/清单**。`ess/1`、`metrics/1` 有折线但只画点不做解读。这是**有意的"不给判读"取舍**（`docs/METRIC-GRADING.md:13`），但也意味着解释价值目前集中在 1 张卡片 + 2 条折线。**给 WARN 而非 FAIL**：因为有归一化口径说明（`app.js:558`）、「记录密度不是病情曲线」警告（`app.js:373`）、「不写好转/加重」声明（`app.js:663`） |
| 4 | 营养心理照护完整度 | **WARN** | **日间功能：有覆盖** — 情境枚举含「开车」（`demo-data.js:26`）、`app.js:588` 单位/学校材料、`demo-data.js:181` 驾驶问题入问题清单。**情绪/心理：声明不做** — `docs/DIFF-MATRIX.md:29`「少「营养」「心理」（非本仓核心，M6 后按需补）」；原型有 `app.js:327`「我最在意的」+ `demo-data.js:93,113` 的 `psycho` 字段（私密，`app.js:328` 标默认不进导出）。**照护者负担：既没做也没声明** | 全仓 grep「照护」在**项目自己的 9 份文档里 0 命中**（只在继承的家族模板 `docs/07-INTERACTIVE-DESIGN.md`、`docs/21-RESEARCH-PLAYBOOK.md`、`docs/26-CANCER-FEATURE-LINES.md` 里出现）。`docs/DEV-REQUIREMENTS-2026-10-25.md:74` 把「家长代记」只当作**数据录入视角**（`proxy` 标记），不是照护者负担功能；`docs/USER-RESEARCH.md:49-55` 的 5 条缺口清单里也没有这一条。→ **缺一句显式"本轮不做照护者负担"的声明**，与营养/心理的处理方式不一致 |
| 5 | 四核心模块挂载点 | **PASS** | 看板 → `app.js:255-300`（3 个二级全部有内容）；记录 → `naps/night/ess/meds/metrics` 各自都有「手工补一条 / 用 AI 记一条」双通道（`app.js:359,409,510,528,546`）；趋势 → `ess/1`（`app.js:475`）、`metrics/1`（`app.js:557`）、`dashboard/1`（`app.js:289`）、`naps/1`（`app.js:372`）；复诊准备 → `visit` 3 个二级（`app.js:632-676`） | 四个模块**都有页面挂载点**。但复诊准备的**产物**（可打印一页）不存在，见 P0-5。模块挂载点与产物是两件事，本项只判挂载点 |
| 6 | 双主体冲突处理（A/B 档案） | **PASS** | `app.js:867`：`'pick-profile': (node) => { state.profile = node.dataset.p; state.sel = ['weight']; state.privateOpen = false; state.essDraft = {}; … }` — **三样全部重置**，无一遗漏。实测：A 填 2 题 → 切 B 显示「已答 0/8」→ 切回 A 仍「已答 0/8」（无残留）；A 的指标选中 2 个 → 切 B 后只剩 1 个（无串味）；私密区切档案后回到折叠 | **没有串味**。但代价是**A 的草稿被无条件丢弃**（数据丢失，非串味），见 P2-1。`sub` 保留在当前二级页（实测切档案后停在 `#ess/0`），行为合理 |
| 7 | 范围适当性（9 一级 × 3 二级） | **WARN** | 实测 27 个 `(view, sub)` 的二级名与 `docs/INTERACTION-DESIGN.md:9-19` 表格**逐字一致**（walk 27 页取 `.subnav [aria-selected=true]` 全文比对，0 处不符）；27 ≥ 家族下限 20（`docs/DIFF-MATRIX.md:30`） | 范围本身不超。但**文档内部对"二级共几条"自相矛盾**：`docs/DIFF-MATRIX.md:14` 标题写「9 一级 / 26 二级」、`:30` 写「二级 26 ≥ 20」，而 `:16-26` 的表实际列了 **27** 条；`docs/SPEC.md:28` 也写 26；只有 `docs/INTERACTION-DESIGN.md:21` 写 27 并与原型一致 → 见 P1-1 |
| 8 | 医学来源时效 | **PASS** | `docs/CLINICAL-DATA-2026.md:9-13` 四行指南来源分别写「**待核（版本未确认）**/…**原件未取得**」「**未取得**」「**未取得**」「仅目录页」；`:14` 结论「G1 出处层本轮只做到『版本 + 页码登记』，正文摘录全部为「未核实」」；`:33`「**不写"无相关研究"**——没查过就是「未查过」」；`docs/GUIDELINE-BRIDGE.md:14`「四问未全过 → 本轮不接 G1 出处层」；`:26` 界面口径「（未核实 · 原件未取得，本轮不显示具体内容）」 | **没有把"未取得"写成"已取得"** ✔。反而存在**反向滞后**：同一文件 `:24-33` 说四通道「⏳ 未运行」，而仓库里 `data/trials/manifest.json` 实测四通道已跑出 **200 条**（ctv ready 176 / ictrp partial 10 / chictr_online unsupported 0 / chinadrugtrials ready 14）→ 见 P0-8 与 P1-2 |
| 9 | S→F→A 同源一致 | **FAIL** | **页签存在性：过**（27 页全部可达，见第 7 项）。**但三处断链**：① 场景入口卡片缺失 — `docs/INTERACTION-DESIGN.md:62` S04「昨晚睡得怎么样」、`:73` S05「用药有变化吗」、`:106` S08「最近一次检查」三张卡在 `dashboard/0` **实测不存在**（实测只有 4 张：今天记一次发作 / 该填 ESS 了 / 3 天后复诊 / 办事材料，见 `demo-data.js:219-224`）；② 语义 sub 名指向错误二级页 — `app.js:111-118` 的 `hashParts()` 用 `parseInt(s,10)`，非数字一律 fallback 到 0，实测 `#visit/review` 打开「问题清单」（文档 `:42` 说这里是生成可打印页的地方）、`#admin/export` 打开「材料清单」（文档 `:84` 说这是导出）、`#metrics/trend` 打开「指标列表」（文档 `:47` 说这是趋势）；③ 「回首页」无落点 — `index.html:16` 品牌是 `<div class="brand">` 非按钮，全站无 `data-action=back`，另见 IP4 | 见 P0-2 / P0-3 / P0-4 |
| 10 | 假设不冒充事实 | **PASS** | `docs/USER-RESEARCH.md:17` 标题「需求假设 H1–H5（**待验证**）」；`:27`「**H1–H5 全部未验证。** 任何一条被访谈推翻，对应功能线要重排而不是硬保」；`:15`「本文件的所有需求都是 **E4 假设**」；`docs/SPEC.md:10`「真实痛点（**假设** H1–H5，见 USER-RESEARCH）」 | 未发现把 H1–H5 当作已验证证据的表述。H1–H5 每条都带「怎么验（下一轮）」（`USER-RESEARCH.md:21-25`） |
| 11 | 差异化真实性（D1–D6 逐条找落点） | **FAIL** | 见下方逐条表 | **6 条中 D1/D3/D4/D6 有落点，D5 部分，D2 未落地** |
| 12 | 红线 | **PASS（含 2 处 WARN）** | 见下方红线分项表 | 判读字段 / 建议性文案 / 三态 / private 导出 / 候选闭环均守；**private 三出口的"一图秀"与"AI 上下文"两出口无法验**（前者产物不存在，后者无真实 payload） |
| 13 | 交互门槛 IP1–IP10 | **FAIL** | 见下方 IP 逐条表 | IP4 / IP6 / IP10 FAIL，IP2 / IP5 / IP7 / IP8 WARN，IP1 / IP3 / IP9 PASS |

### 第 11 项逐条：DIFF-MATRIX D1–D6 在原型里的落点

| # | 声称（`docs/DIFF-MATRIX.md:36-41`） | 落点 | 判 |
| --- | --- | --- | --- |
| D1 | 时长型数值 `duration_min` + 时段计数（0–23 分桶） | `schema/0001_initial.sql:29`（`duration_min REAL`，NULL 允许）；`app.js:185` `napBuckets()`；`app.js:289` 与 `:372` 两处 24 桶渲染；`app.js:285` 中位数卡（且显式排除 NULL：`filter((n) => n.min != null)`） | **PASS ✅** |
| D2 | **时段柱 + 单次时长线 + ESS 总分线，三视图并列** | 时段柱：有（`app.js:289`，但是 `<div class="bars">` 不是 `svg`）。ESS 总分线：有（`app.js:475` `svg.chart`）。**单次时长线：不存在** — `demo-data.js:166` 的 `nap_duration` 定义为 `points: []`（空数组），`app.js:100` 注释自承「ess_total / nap_duration 是派生口径，在这里没有原始点」。「三视图并列」的容器也不存在 | **FAIL ❌** |
| D3 | ESS 8 题整次入档，总分派生、分项进**整页视图** | 整次入档 ✔ `app.js:437-470`；总分派生 ✔ `essTotal = (rec) => rec.q.reduce(...)`（`app.js:120`）；**分项是表格不是整页视图** — `app.js:487-495` 是 `<table>`，`#page=` 整页视图全站不存在（`grep @media print` = 0，`grep '#page='` = 0） | **WARN ⚠️**（主体成立，形态未落） |
| D4 | 驾驶与操作机械：只记事实，不给结论 | `demo-data.js:26` 情境含「开车」；`demo-data.js:181` 「能不能开车？市区短途算不算？」入问题清单；`app.js:646` `notice('"能不能开车"这类问题，工作台只帮你记住去问，不给结论')`；`app.js:764` 三条红线之一 | **PASS ✅** |
| D5 | 管制类药品：处方来源、换药、查验材料清单 | 管制 flag ✔ `app.js:505` pill「管制类」+ `:511` 说明；处方来源 ✔ `demo-data.js` meds note「处方来源：XX 医院神经内科；处方天数 30 天」；换药 ✔ `app.js:517-520` 时间线；**「查验材料清单」缺** — `app.js:579` 的 5 条材料清单（诊断证明/门诊病历/用药记录/ESS 记录/单位模板）里没有任何一条是管制药查验/开药期限材料 | **WARN ⚠️**（4 分之 3） |
| D6 | 夜间事件三类枚举（睡眠瘫痪/入睡幻觉/夜间觉醒） | `schema/0001_initial.sql:56` `CHECK (kind IN ('awakening','sleep_paralysis','hallucination','vivid_dream'))`；`app.js:414-421` 三个分组渲染；`app.js:797-803` 表单四选一 | **PASS ✅** |

### 第 12 项红线分项

| 红线 | 判 | 证据 |
| --- | --- | --- |
| 判读字段 | **PASS** | `schema/0001_initial.sql` 全文 158 行，`grep -niE "diagnosis\|risk_level\|severity\|is_conclusion\|prognosis"` **只命中 1 处，是第 4 行的注释本身**「无判读列：不存在 diagnosis / risk_level / severity / is_conclusion」。`profile.dx_text` 存医生原文诊断名（`:18`），`cataplexy` 三态（`:19`），`metrics.kind` 只表达画法（`:94` 注释「不表达"严不严重"」）。`docs/USER-RESEARCH.md:41-44` 与 `docs/SPEC.md:36` 同口径 |
| 建议性文案 | **PASS** | `node scripts/check-wording.mjs` → exit 0，`✓ 文案红线通过（扫描 8 个文件，禁词 17 个）`。禁词表含「可以开车 / 不宜驾驶 / 建议加量 / 建议换药 / 确诊为 / 符合诊断标准」（`scripts/check-wording.mjs:24-26`）。另做独立全站文本扫描（`redlineScan`）：`['可以开车','不宜驾驶','建议加量','建议换药','确诊为','符合诊断标准','重度嗜睡','预后','风险等级']` 在 `dashboard/0` 渲染后文本中 **0 命中** |
| 三态（未记录 vs 0 vs 有值） | **PASS** | `app.js:352`：`${n.min == null ? '<span class="muted">没记</span>' : n.min + ' 分'}`，`:354` 副标题明写「时长"没记"与"0 分钟"是两件事，表里分开显示」；`NAPS` 12 行实测含「没记」，prodrome 取值集合 = `{有, 无, 未记录}` 三态并存；`app.js:285` 中位数显式排除 NULL（`filter((n) => n.min != null)`）并显示「N 次没记时长」。`schema/0001_initial.sql:29` 注释「NULL=未记录不是 0」，`:34` 契约「写入层拒绝 `Number(null)===0`」 | 
| private 三出口 | **WARN** | **导出：PASS（实测）** — `admin/1` 预览文本 400 字符，`hasPsycho:false`、`hasNightKind:false`，并显式带「私密条目已排除」（`app.js:593-608`）。**一图秀：无法验** — 该产物在原型里不存在（见 P0-1），`app.js:623` 只有一句声称「导出在代码层过滤私密条目（`viewpoints.private = 1`）」。**AI 上下文：无法验** — `app.js:860` 的 `agent-build` 只弹 toast「已生成"本页要点"提示词（演示）：只包含已核对的事实，不含私密条目」，**不产生任何真实 payload 可供断言**。**默认折叠：PASS** — `app.js:669-675`，实测默认「内容已折叠」，展开后才出现正文，`app.js:837/839/947` 在切页/切二级/切档案时复位 `privateOpen=false`（实测切页后重回折叠） |
| 候选闭环 | **PASS（1 处 WARN）** | `app.js:844-845` 注释即合同「`<实体>:agent-draft` 一律产出候选卡，不直接入库」；`app.js:777` 候选卡含「核对之前不会入库；拒收就什么都不发生」；**实测拒收零副作用**：拒收前后发作计数均 39，未变。确认入库才写 `NAPS`（`app.js:879`）。**WARN**：`app.js:783` 文案写「哪一项不对就点"改一下"」，但**该按钮不存在**（`data-action` 里无 `cand-edit`，实测候选卡 `editable:0`）——候选只能全盘接受或全盘拒收，不能逐项修正 |

### 第 13 项 IP1–IP10 逐条

| # | 红线 | 判 | 复现证据 |
| --- | --- | --- | --- |
| IP1 | 无路径文档不开 HTML | **PASS** | `docs/INTERACTION-DESIGN.md` 存在，S01–S08 八条路径表六要素齐全（`:25-111`） |
| IP2 | 双向覆盖，孤儿页 0 | **WARN** | 27 个 `(view,sub)` 全部可达，二级名与文档逐字一致 → 孤儿页 **0** ✔。但文档要求的验法是「无头脚本穷举 27 个 `(view,sub)` × **S01–S08**，输出未覆盖清单」（`:140`），现走查脚本**不碰场景**，实测有 3 条场景入口找不到挂载点（见 P0-2）→ 覆盖断言未真正建立 |
| IP3 | 入口逐字一致 | **WARN** | 卡片文案字面一致 ✔（实测「今天记一次发作」「该填 ESS 了」「3 天后复诊」「办事材料」四串与 `docs/INTERACTION-DESIGN.md:29,51,40,84` 逐字相同）。**但位置不符**：文档 S02/S03 写入口在 `dashboard/todo`（`:40,51`），而卡片实际同时渲染在 `dashboard/0`=今日概览（`app.js:259`）与 `dashboard/2`=待办与问题（`app.js:303`）两处，`dashboard/todo` 这个 sub 名在原型里不存在（二级名是「待办与问题」） |
| IP4 | 产物可观察 + **一步回首页** | **FAIL** | 产物可观察：部分成立（见下）。**一步回首页：不存在** — `index.html:16` 品牌是 `<div class="brand no-mark">`（无 `data-action`，`brandClickable:false` 实测）；全站无 `data-action=back`、无「返回」按钮（`hasBackBtn:false` 实测）；`app.js` 全文「返回」只在注释与 TTS 无按钮。→ S01–S08 每条的「回首页」要素**全部落空** |
| IP5 | **AI 默认**且候选必核 | **WARN** | 候选必核 ✔（见第 12 项）。**"AI 默认"路径不可走** — `agent-dock` 实测 `inputs:0`，只有 6 个按钮（窄/标准/宽/×/整理本页要点/模拟回复自检，`index.html:38-56`），用户**无法「在会话区说…」**；候选内容由 `app.js:829-832` `draftNapFromText()` 返回**硬编码常量**（`:830` 即 `{ at: '2026-10-25T15:30', context: '开会', min: 20, prodrome: '未记录' }`），与用户说什么无关 |
| IP6 | 每页编辑入口 ≤1，表单 ≤6 字段 | **FAIL** | **字段数达标 ✔**：naps 4 / night 3 / meds 4 / metrics 5（全部 ≤6，且与 `docs/INTERACTION-DESIGN.md:156` 的「本仓最多 5」一致）。**按钮数超标 ❌**（27 页实测，编辑类按钮计数）：`naps/0` = 2（`app.js:359`）、`meds/0` = 3（`app.js:506-510`）、`meds/2` = 1、`metrics/0` = 2（`app.js:546`）、`visit/0` = **5**（3 个「标记已问」+「记一条新问题」+ AI，`app.js:640-641`）、`visit/2` = 2（`app.js:674-675`）、`dashboard/2` = 1。`app.js:360` **自承**「本页显式入口只有这 2 个」——即实现方知道有 2 个。文档要求「手工入口统一卡片『⋯ 更多』」（`:155`），全站实测 `hasMore:false`（27 页无一页出现「⋯」卡片） |
| IP7 | 数字输入用键盘组件 | **WARN** | 有 `type=number` + `inputmode=numeric` ✔：`<input type="number" id="nap-min" min="0" inputmode="numeric">`（`app.js:771`）、夜间 `nt-min`（`:797`）。**但文档 `:31` 写的「时间滑条」未实现** — 时间是 `<input type="datetime-local" id="nap-at">`（`app.js:769`），不是滑条 |
| IP8 | 无裸删除、无「不可恢复」 | **WARN** | 硬红线 **PASS**：`grep -rc "不可恢复" prototypes/` = 0（4 个文件全 0）；`app.js` 无任何「删除」入口，实测对话框只有「取消/保存」「拒收/确认入库」。**但"更正"通道未落地**：文档 `:132`「其余用 `events` 留痕 + 原记录页可查旧值」——`app.js` 全文「改这一条」**0 命中**，`meds` 的 `supersedes_id` 也只存在于 `schema/0001_initial.sql:69` 与 `docs/SCHEMA.md:23`，**原型无对应动作**。这是"红线守住了，正面承诺没做到" |
| IP9 | 双通道同源 | **PASS** | 手工与 AI 确认写入**同一个数组同一个形状**：`app.js:873`（`nap-save`）与 `app.js:879`（`nap-confirm`）都 `NAPS[state.profile].unshift({ ... , proxy: state.profile === 'B' ? 1 : 0 })` 再 `.sort()`，字段集合相同 |
| IP10 | AI 示例不代替发言 | **FAIL** | 文档要求「每个一级页一处示例；点击后**输入框有文案且不发请求**」（`:148`）。实测：**无输入框**（`agent-dock` `inputs:0`，`samples:[]`），示例 chip 数量 **0**，9 个一级页全部没有可点的示例句 |

---

## 问题清单

### P0 · 结构性断链（8 条，修完才能交 G2 签认）

**P0-1 一图秀在三份文档里是核心闭环的一环，原型无任何挂载点**

`docs/SPEC.md:15` 把「一图秀」写进最小闭环（「回来看见（看板聚合 + **一图秀** + 量表序列）」）；`docs/SCHEMA.md:30` 把 `events` 表标注为「时间线事件（**一图秀**）」；`docs/DEV-REQUIREMENTS-2026-10-25.md:20` 给出实现规格（Fritsch–Carlson 单调三次、末点 13px 避让）、`:42` 要求它对私密条目做代码级过滤；`docs/INTERACTION-DESIGN.md:127`、`docs/PATIENT-FLOW.md:37` 均引用。
实测：全站渲染后文本、DOM 均无「一图秀」（`oneChart:false`）；`schema/0001_initial.sql:144-151` 的 `events` 表在原型里没有任何读取或渲染路径。

- 落点：`prototypes/v0.2/app.js`（新增一图秀视图与导航入口）或 `docs/SPEC.md:15`、`docs/DEV-REQUIREMENTS-2026-10-25.md:20,42`、`docs/SCHEMA.md:30`（若本轮确认不做，三处同步降级并写明理由）
- 影响：`events` 表成孤儿表；"回来看见"闭环少一条通道

**P0-2 三条场景的入口卡片在原型里不存在**

`docs/INTERACTION-DESIGN.md:62`（S04 入口「dashboard/today → 卡片「**昨晚睡得怎么样**」→「记一条夜间事件」」）、`:73`（S05 入口「卡片「**用药有变化吗**」」）、`:106`（S08 入口「卡片「**最近一次检查**」」）。
实测 `dashboard/0` 只有 4 张任务卡（`demo-data.js:219-224`：今天记一次发作 / 该填 ESS 了 / 3 天后复诊 / 办事材料），`hasNightTask:false`、`hasMedTask:false`、`hasExamTask:false`。`dashboard/2`（待办与问题）同一批 4 行 + 「去处理」按钮，也没有这三张。

- 落点：`prototypes/v0.2/demo-data.js:218-230`（补 3 张 task）或 `docs/INTERACTION-DESIGN.md:62,73,106`（把入口改到真实存在的挂载点，例如 `naps/0` 式的「记一条」卡）
- 影响：3 / 8 条场景的入口死链

**P0-3 「回首页」在原型里没有任何实现**

`docs/INTERACTION-DESIGN.md:33` 定义「二级页左上「返回」或顶栏品牌 → `dashboard/today`」，S01–S08 **每一条**都有「回首页」要素（`:33,44,55,65,78,90,99,110`）。
实测：`index.html:16` 品牌是 `<div class="brand no-mark">`，无 `data-action`，点击无响应（`brandClickable:false`）；全站无 `[data-action=back]`（`hasBackBtn:false`）；`app.js` 中「返回」只出现在注释里。

- 落点：`prototypes/v0.2/index.html:16`（品牌改为可点并加 `data-action="go-home"`）+ `prototypes/v0.2/app.js:855-870`（补 `go-home` 分支）；或 `docs/INTERACTION-DESIGN.md:33` 及 8 条场景的「回首页」行统一改口径
- 影响：IP4 直接 FAIL；用户进了二级页只能靠浏览器后退

**P0-4 文档里的语义二级名指向错误的二级页**

`app.js:111-118` `hashParts()`：`const n = s == null ? 0 : parseInt(s, 10)`，非数字串一律落到 `sub = 0`。
实测：`#visit/review` → 「问题清单」（文档 `docs/INTERACTION-DESIGN.md:42` 说 `visit/review` 是勾选内容生成一页的地方）；`#admin/export` → 「材料清单」（文档 `:84` 说这是导出）；`#metrics/trend` → 「指标列表」（文档 `:47` 说这是趋势）；`#dashboard/today` → 今日概览（这条**恰好**对，因为 `today` 就是 sub 0）。
而 `docs/INTERACTION-DESIGN.md:9-19`、`docs/PATIENT-FLOW.md:29-42` 通篇用语义名（`dashboard/today`、`visit/review`、`admin/export`、`metrics/trend`、`ess/history`、`night/log`）。

- 落点：`prototypes/v0.2/app.js:111-118`（加语义名 → 索引的映射表，与 `SUBPAGES` 同源）或 `docs/INTERACTION-DESIGN.md:9-19` 全表改用数字 sub 并同步 `PATIENT-FLOW.md`
- 影响：任何按文档深链接的人会看到**错误的页面**；这是"场景引用不存在的页签"的一种变体

**P0-5 复诊准备的核心产物（可打印一页）不存在**

`docs/PATIENT-FLOW.md:18` F2 产物「一页**可打印**的「本次就诊：我的记录 + 我的问题」」；`docs/INTERACTION-DESIGN.md:43`「`visit/review` 生成**可打印页**（含日期、ESS 分数变化、发作次数、当前用药名）；`documents` 记录一条导出记录」。
实测：`grep -rn "print\|window.print" prototypes/v0.2/` = **0 命中**；无 `@media print`；`#page=` 整页视图（`docs/DEV-REQUIREMENTS-2026-10-25.md:43`）**未实现**（`pageView:true` 表示不存在）。`app.js:660-666` 的「这三个月的变化」是三行 `row()`，不是可打印产物。

- 落点：`prototypes/v0.2/style.css`（`@media print`）+ `prototypes/v0.2/app.js:632-676`（`visit/2` 加「生成一页」动作）与 `:612`（复用 `admin-export` / `admin-copy` 的导出通道）；文档侧若本轮不做，改 `docs/PATIENT-FLOW.md:18`、`docs/INTERACTION-DESIGN.md:43`
- 影响：四核心模块之一（复诊准备）有页面无产物

**P0-6 AI 会话区无输入框，S01/S05/S08 的「AI 路径（默认）」不可走**

`docs/INTERACTION-DESIGN.md:30` S01 AI 路径「**在会话区说**「刚才三点半开会时睡着了，大概二十分钟」→ AI 产出候选卡」；`:63` S04、`:74` S05、`:107` S08 同构。
实测：`index.html:38-56` 的 `#agent-dock` 内 `inputs: 0`（无 input / textarea / contenteditable），只有两个动作按钮（`app.js:860-862` 的 `agent-build`、`agent-demo`，都只弹 toast）。候选卡内容来自 `app.js:829-832` `draftNapFromText()` 的**硬编码常量**，与任何输入无关。

- 落点：`prototypes/v0.2/index.html:38-56`（补输入框与示例 chip）+ `prototypes/v0.2/app.js:829-832`（候选从输入解析，至少做到正则提时间/时长）
- 影响：IP5「AI 默认」名存实亡；IP10 直接 FAIL；文档称"默认路径"实为"唯一路径是手工"

**P0-7 差异化 D2 声称的「三视图并列」只落地 1 / 3**

`docs/DIFF-MATRIX.md:37` D2「**时段柱 + 单次时长线 + ESS 总分线**三视图并列」。
实测：时段柱有（`app.js:289`、`:372`，但用 `<div class="bars">` 而非文档 `docs/DEV-REQUIREMENTS-2026-10-25.md:20` 要求的 `svg.chart`）；ESS 总分线有（`app.js:475`）；**单次时长线不存在** —— `demo-data.js:166` `nap_duration` 的 `points: []` 是空数组，`app.js:100` 注释自承「ess_total / nap_duration 是派生口径，在这里没有原始点」。三视图的并列容器也不存在。

- 落点：`prototypes/v0.2/demo-data.js:166`（补 `nap_duration` 的 points，或从 `NAPS` 按发作逐条派生）+ `prototypes/v0.2/app.js:557`（趋势页并列三图）；或把 `docs/DIFF-MATRIX.md:37` 的 D2 改写为实际形态
- 影响：G1 签认所依赖的"刻意不同"证据有 1 条不成立

**P0-8 临床试验的界面口径与仓库里的实际数据相反**

`prototypes/v0.2/app.js:272` 看板 notice：「临床试验线索本轮<b>尚未采集</b>（四通道均未运行，记「未查过」），因此本页不出现试验条数」；`:748` 设置页「2026 临床试验：**尚未采集**。四通道（ictrp / ctv / chictr_online / chinadrugtrials）均未运行」；`:756` 关于页「试验四通道未运行（记「未查过」）」。
实测仓库：`data/trials/manifest.json` 的 `generated_at` = 2026-10-25T05:14:21Z，四通道终态 `ctv: ready 176`、`ictrp: partial 10`、`chictr_online: unsupported 0`、`chinadrugtrials: ready 14`，`totals.records = 200`；`data/trials/trials.jsonl` 实际 200 行；`docs/DEV-PLAN.md:14` 记 M4「✅ 2026-10-25 实测 200 条（176/10/0/14），三处行数一致」。

- 落点：`prototypes/v0.2/app.js:272`、`:748`、`:756`（三处文案改为真实终态，即"已采集 200 条，其中 ictrp 为部分覆盖、chictr_online 不支持"）
- 影响：界面在告诉用户"没查过"，而系统里已经查过 —— 这是最容易被签认人抓住的一类不一致

### P1 · 文档滞后于实现 / 文档内部矛盾（9 条，文档侧改即可）

| # | 问题 | 落点 |
| --- | --- | --- |
| P1-1 | 二级总数 26 vs 27 自相矛盾：`docs/DIFF-MATRIX.md:14` 标题「9 一级 / 26 二级」、`:30`「二级 26 ≥ 20」，但 `:16-26` 表实际 27 条；`docs/SPEC.md:28` 也写 26；只有 `docs/INTERACTION-DESIGN.md:21` 写 27 且与原型一致 | `docs/DIFF-MATRIX.md:14,30`、`docs/SPEC.md:28` |
| P1-2 | 临床试验四通道状态滞后：`docs/CLINICAL-DATA-2026.md:24-33` 全表「⏳ 未运行」，与 `data/trials/manifest.json` 的 200 条矛盾 | `docs/CLINICAL-DATA-2026.md:24-33` |
| P1-3 | S04 失败恢复与数据契约冲突：`docs/INTERACTION-DESIGN.md:67`「存为 **kind 未定**条目并列表标「待确认」」，但 `schema/0001_initial.sql:56` 是 `CHECK (kind IN ('awakening','sleep_paralysis','hallucination','vivid_dream'))`，**没有"未定"取值**；原型用备注文字变通（`app.js:803`「备注里写"待确认"」） | `docs/INTERACTION-DESIGN.md:67`（改为"备注写待确认"）或 `schema/0002_*.sql` 加取值 |
| P1-4 | F1 产物与看板不符：`docs/PATIENT-FLOW.md:10`「首页「本周发作 4 次 / **平均 19 分钟**」」，原型看板只有「近 7 天 N 次发作」计数（实测 5、6 随操作变化），**无平均时长**；`dashboard/1` 给的是「单次时长**中位数**」（`app.js:285`），不是平均 | `docs/PATIENT-FLOW.md:10` 或 `app.js:285` |
| P1-5 | 手工入口收敛规则未实现：`docs/INTERACTION-DESIGN.md:154-155`「每页显式编辑按钮 ≤ 1」「统一卡片「⋯ 更多」」，实测 27 页无一页有「⋯」（`hasMore:false`），`naps/0`=2、`meds/0`=3、`visit/0`=5；`app.js:360` 自承「本页显式入口只有这 2 个」 | `prototypes/v0.2/app.js:359,506-510,546,640-641,674-675`（收进「⋯ 更多」）或 `docs/INTERACTION-DESIGN.md:154-155` |
| P1-6 | 「时间滑条」未实现：`docs/INTERACTION-DESIGN.md:31`「时间**滑条**·情境三态·时长数字键盘·前驱三态」，原型 `app.js:769` 是 `<input type="datetime-local">` | `docs/INTERACTION-DESIGN.md:31` 或 `app.js:771` |
| P1-7 | 「改一下」按钮不存在：`app.js:783` 文案「哪一项不对就点"**改一下**"」，但候选卡只有「拒收 / 确认入库」两个按钮，`data-action` 无候选编辑项 | `prototypes/v0.2/app.js:777-784` |
| P1-8 | 文档声称存在的产物在仓库里不存在：`docs/SPEC.md:30` 的 `FEATURE-INVENTORY.csv`、`:41` 的 `test/ui-parity.test.mjs` 与 `public/`、`docs/DEV-REQUIREMENTS-2026-10-25.md:9` 的 `demo/build-demo-data.mjs`、`:12` 的 `dsh/readmodels.js`、`docs/GUIDELINE-BRIDGE.md:20` 的 `guidebooks/manifest.json` 与 `refs.json` —— 逐个 `test -e` 全部 **MISS**（`lib/layout.js`、`lib/version.js`、`schema/freeze-contract.md` 存在） | 上述文档对应行，或补产物（若本轮确实未做，改为「M2/M3 待产出」） |
| P1-9 | ESS 分项「整页视图」未实现且 `ESS_ITEMS` 逐题三态单选未达：`docs/SPEC.md:26`、`docs/SCHEMA.md` 与 `docs/DIFF-MATRIX.md:38` 都写「分项进**整页视图**（32 号）」，原型 `app.js:487-495` 是普通表格 | `prototypes/v0.2/app.js:487` 或上述三处文档 |

### P2 · 记录不阻塞（5 条）

| # | 问题 | 落点 |
| --- | --- | --- |
| P2-1 | 切档案无条件清空 `essDraft`，A 填到 2/8 切到 B 再切回 A 仍是 0/8 —— 无串味，但**草稿丢失**。建议按档案分槽：`state.essDraft[state.profile]` | `prototypes/v0.2/app.js:867` |
| P2-2 | `demo-data.js:94` 的 `activity`（「上下班坐地铁；开车只在市区短途，犯困就靠边停」）与 `:114` 的对应字段**未被任何视图渲染**（`grep activity app.js` = 0 命中）—— 这是 D4 驾驶事实最直接的一条数据，白白躺在数据文件里 | `prototypes/v0.2/app.js:316-329`（诊断原文页「我最在意的」旁） |
| P2-3 | B 档案的任务卡只有 3 张（`demo-data.js:225-229`，无「办事材料」），与 A 的 4 张不对称；若是有意的（学生档不涉及驾照换证）应在文档说明 | `prototypes/v0.2/demo-data.js:225-229` 或 `docs/DEV-REQUIREMENTS-2026-10-25.md:74` |
| P2-4 | `app.js:466` 有死代码：`pill(essTotal(list[list.length - 1]) >= 11 ? '已记录' : '已记录', 'grey')` —— 三元两支相同。虽未产生判读（两支都是「已记录」），但看起来像是把某个阈值文案删到一半留下的残骸，**极易被后人误改回判读口径** | `prototypes/v0.2/app.js:466` |
| P2-5 | 走查脚本判据偏弱：`scripts/probe-prototype.mjs:167-174` 只断言布局与计数，不点击任何按钮。建议至少加「每页点一次主按钮不报错」与「`#visits/review` 等文档语义名不落回 sub 0」两条 | `scripts/probe-prototype.mjs:167-174` |

---

## 结论

**P0 = 8**

**不可交 G2 签认。**

理由（按严重度）：

1. **场景层断链 3 条**（P0-2 入口卡缺失、P0-3 无回首页、P0-4 语义名指错页）——S01–S08 八条场景里，**没有一条能按 `docs/INTERACTION-DESIGN.md` 写的路径完整走通**；
2. **闭环缺件 2 条**（P0-1 一图秀、P0-5 可打印页）——`docs/SPEC.md:15` 的最小闭环与 `docs/PATIENT-FLOW.md` 的 F1/F2 产物都不成立；
3. **交互门槛 3 项 FAIL**（IP4 / IP6 / IP10），其中 IP6 的「每页编辑入口 ≤1」在 5 个页面上被突破，实现方自己也在 `app.js:360` 承认了；
4. **主张证据 1 条不成立**（P0-7 D2 三视图），G1 用来支撑"不只是改名"的 6 条差异里有 1 条找不到落点；
5. **界面与数据契约相反**（P0-8），仓库里有 200 条试验记录，界面三处说"没查过"。

值得肯定、且**确实做到了**的部分（写进签认记录以免被过度否定）：

- 红线守得很干净：`schema/0001_initial.sql` 全文无判读列；`scripts/check-wording.mjs` 17 个禁词全过；三态在界面上真的分开了（「没记」vs「0 分钟」显式区分，`app.js:352` + `:354`）；候选拒收零副作用；私密默认折叠且导出实测过滤；`privateOpen` 在 5 个切换点全部复位。
- 证据诚实度很高：0 访谈、E0=0、H1–H5 未验证、指南原件未取得、四通道状态，全部如实写在文档里，没有一处把"没查"写成"查过"（唯一的反向错误 P0-8/P1-2 是把查过的写成没查，方向相反，属可修的滞后）。
- 五条拒收文案（分型/检查解读/夜间归因/ESS 估分/管制药）在原型里都是显式 notice，不是靠 UI 藏起来。

修完 8 条 P0 后可申请 G2 签认；P1 九条建议同批处理（都是文档改字，成本远低于 P0）。

---

## 修复合账（本评审之后，2026-10-25 第二轮）

> 本评审的结论**原文一字未改**，它取证的对象是 `f4106cd`，那是历史事实。下面只追加"哪条修了、怎么验的"，避免下一轮读者把已修的 P0 当成活的。

| 编号 | 状态 | 修复落点 | 实测证据 |
| --- | --- | --- | --- |
| P0-1 一图秀无挂载点 | ✅ 已修 | `prototypes/v0.2/app.js` `oneChartSVG()` + `vMetrics()` sub 1；`SUBS.metrics = [['cards','指标卡'],['one','一图秀'],['rule','数据口径']]` | `check:ix`「S08 一图秀选择窗口 9/9」：`.one-chart` 4 条线、`.picker-scroll` 可滚、选到 4 项后其余 `disabled` |
| P0-2 三条场景入口卡缺失 | ✅ 已修 | `prototypes/v0.2/demo-data.js:278-293` 任务卡改 7 条/档，带 `scenario` 徽标 S01/S02/S03/S04/S05/S06/S08 | `check:ix`「场景卡覆盖」实测 `S01,S02,S03,S04,S05,S06,S08` |
| P0-3 回首页无实现 | ✅ 已修 | `index.html` 品牌改 `<button class="brand no-mark" data-action="home">`；`app.js` 委托 `home` → `#dashboard/today` | `check:ix`「导航」断言 `location.hash === '#dashboard/today'` 且 breadcrumb = 看板 |
| P0-4 语义二级名指错页 | ✅ 已修 | `app.js` `hashParts()` 先查 slug 再查数字下标；`hashOf(view,sub)` 输出 `#view/slug` | `check:ix`「语义 slug 与数字下标指向同一个二级页」实测 `one,one`；「三处语义 slug」实测 `review,export,one` |
| P0-5 可打印一页不存在 | ✅ 已修 | `app.js` `pvVisitOnepage()` + `.pv-print`；`style.css` `@media print` 只留 `.pv-print` | `check:ix`「整页视图」12/12 含打印出口与 A1/A2/A4/A7/A9/A10 |
| P0-6 AI 会话区无输入框 | ✅ 已修 | `index.html` 加 `<textarea id="agent-input">` + `[data-action="agent-send"]`；`app.js` `parseNapText()` → `nap-candidate` | `check:ix`「S01 记一次发作 10/10」，含 `#agent-input` 存在与"输入→候选卡→确认入库"全链路 |
| P0-7 D2 三视图只落地 1/3 | ✅ 已修 | `demo-data.js` `makeMetrics()` 派生 `nap_median_min` 单次时长线；时段柱保留 `.bars` | `check:proto` 实测 `svg.chart` 出现在 `dashboard/1 naps/1 ess/1 metrics/1` |
| P0-8 界面口径与数据相反 | ✅ 已修 | `app.js` 三处文案改为引用 `window.DEMO_TRIALS` 实测态（200 条 / 四通道 176·10·0·14） | 页面不再出现"试验尚未采集"；`trials/library` 显示四通道终态 |
| P1-1 二级数 26/27 自相矛盾 | ✅ 已修 | `docs/SPEC.md:28`、`docs/DIFF-MATRIX.md:14,30` 统一 **10 一级 / 30 二级** | `check:proto` 走 30 个 `(view,sub)` × 3 档 = 90/90 |
| P1-2 CLINICAL-DATA 四通道仍写未运行 | ✅ 已修 | `docs/CLINICAL-DATA-2026.md:28-34` 改实测终态 + WAF/405 原因 | 与 `data/trials/manifest.json` `generated_at=2026-10-25T05:14:21Z` 一致 |
| P1-4 平均 19 分钟无依据 | ✅ 已修 | `docs/PATIENT-FLOW.md:10-13` 只留中位数，并注明按 `app.js` 算式实测档案 A **25 分钟** | 与 `demo-data.js` `nap_median_min` 末点 23 的差异已在文档写明口径不同 |
| P1-8 文档声称的产物 MISS | 🔧 部分 | `FEATURE-INVENTORY.csv` 仍缺（清单在 `docs/DEV-REQUIREMENTS` 的"本轮未做"里如实登记） | 未虚报 |
| P1-9 ESS 分项整页视图 | ✅ 已修 | `app.js` `pvEssFill()` + `ess-items-fullpage` | `check:ix`「整页视图」含 `#page=ess-fill` reload 还原 |
| P2-1 切档案清草稿 | ✅ 已修 | `app.js` `state.essDraftByProfile` 按档案分存 | `check:ix`「切档案不清另一个档案的 ESS 草稿」实测 `12.5% \| 0% \| 12.5%` |
| P2-4 死代码三元 | ✅ 已删 | `app.js` | — |

**修完后的实测口径**（可复跑，命令留在 `package.json`）：

```
npm run check        → 27 tests pass · staticPass: true · 文案红线 17 词通过
npm run check:proto  → 原型渲染走查 90/90（10 页 × 3 二级 × 1400/1000/860 px）
npm run check:ix     → 原型交互走查 94/94（S01/S03/S04/S05/S08/L10/整页/组件唯一/导航）
```

> 仍未闭合、不许写成达标的两项：`FEATURE-INVENTORY.csv`（P1-8 部分）、`!panel/会话归属` 与 `!panel/会话区常挂载`（要等 M5 客户端真实现，`npm run audit` 现 30/32 · 2 待人工）。

---

## 附：工作区漂移抽查（不属于 `f4106cd`，不计入上方 P0 计数）

撰写期间工作树被并行修改。为免 G2 签认时把"当前工作区"当成"已评审版本"，这里单独记录抽查到的两处**新增问题**。它们**不计入上文 `P0 = 8`**（那是 `f4106cd` 的基线），但若要并入 G2，必须一并处理。

**漂移-D1 · 文案红线门禁已变为失败态（建议按 P0 处理，但它不是 `f4106cd` 的问题）**

`f4106cd` 上 `node scripts/check-wording.mjs` 是 exit 0（「✓ 文案红线通过（扫描 8 个文件，禁词 17 个）」）。工作区当前跑同一条命令：

```
$ node scripts/check-wording.mjs
✗ 文案红线：1 处
  - prototypes/v0.2/app.js:981 命中「符合诊断标准」
```

命中处是 `prototypes/v0.2/app.js:981` 的一句**否定式** notice：「清单是<b>你要准备的东西</b>，不是"符合某标准的证明"。工作台不生成"符合诊断标准"这类表述。」——语义上完全正当（它正是在声明"不生成"），但**工具是无条件子串匹配，不看上下文**。我另用 `git show f4106cd:scripts/check-wording.mjs` 导出的旧版脚本跑同一文件，结果相同，说明是**新文案撞了旧门禁**，不是脚本退化。

- 两种修法择一，但**必须择一**：① 改文案绕开字面（如「不生成『符合某标准』这类表述」即可覆盖语义）；② 给 `scripts/check-wording.mjs` 加"否定句白名单"并写进它的自述。
- 落点：`prototypes/v0.2/app.js:981` 或 `scripts/check-wording.mjs`（命中判定段）
- 判据：这条之所以要算 P0 级 —— **红线门禁一旦常红，就会训练所有人忽略它**，这比单条文案危险。

**漂移-D2 · 范围扩张后，`docs/INTERACTION-DESIGN.md` 的覆盖性断言已失真（P1 级）**

工作区新增一级 `trials`「临床试验」，`SUBS` 里 10 个一级 × 3 = 30 个 `(view, sub)`，`docs/SPEC.md:28` 也已改成「一级 10 / 二级 30」、`:32` 补了 `trials` 的三条二级说明，`docs/DIFF-MATRIX.md:14` 也改成了「10 一级 / 30 二级」。

但 `docs/INTERACTION-DESIGN.md:21` 仍写「**9 个一级 × 3 个二级 = 27 个 `(view, sub)`**，下方路径表必须全覆盖，孤儿页 = 0（IP2）」，`:140` 的 IP2 验法也仍写「穷举 **27 个** `(view,sub)` × **S01–S08**」。而新的 `trials` 一级**没有任何场景路径**（`grep -n "trials\|试验" docs/INTERACTION-DESIGN.md` 在该文件内只有覆盖性那句能间接涉及，S01–S08 里无一条走临床试验）。

- 后果：IP2「孤儿页 = 0」在文档口径下**必然不成立** —— 按文档只有 27 个页，按实现有 30 个；且 `trials` 的 3 个页面**没有对应场景**，是典型的"有页无路径"。
- 落点：`docs/INTERACTION-DESIGN.md:21` 与 `:140` 改为 30；并补一条 **S09 · 临床试验线索**（入口建议 `dashboard/today` → 卡片「有没有在招的研究」，与实现里 `demo-data.js` 的 trials 任务卡对齐）。若本轮不加 S09，则必须在 IP2 里显式把 `trials` 列为"探索性页面，暂不纳入场景覆盖"。
- 同时 `docs/DEV-PLAN.md:10` 的「81/81」也要更新为 90/90，否则 M2 的验收数字与现状脱节。

**其他漂移（未升格，仅记录）**：工作区新增 `prototypes/v0.2/demo-trials.js`（2848 行）与 `scripts/build-demo-trials.mjs`（120 行），但 `schema/0001_initial.sql` 里**没有任何 trials 相关表**（`grep -n trials schema/*.sql` 无命中），`docs/SCHEMA.md` 也未更新。这意味着新功能的**数据契约尚未冻结**——按 `docs/SCHEMA.md` 自述的"schema 先冻结再造界面"流程，这是一处顺序倒置，建议在 G2 前补 `0002_trials.sql` 或在 SCHEMA.md 写明"trials 本轮走 JSON 快照，不入库"。
