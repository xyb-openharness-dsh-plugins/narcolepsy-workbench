# 小睡宝 SnoozePal · 发作性睡病工作台

给发作性睡病患者和照护者用的本机工作台：记录白天的嗜睡发作、夜间睡眠事件、ESS 量表序列、用药与耐受，复诊前整理成一页。**不诊断、不建议、不判断能不能开车。**

这是接入骨架：`prototypes/v0.2/` 是可打开确认的 HTML 原型（唯一视觉基准），业务功能尚在移植。需求见 [BRIEF](docs/BRIEF.md)，规格见 [SPEC](docs/SPEC.md)，任务见 [TASKS](docs/TASKS.md)；先读 [AGENTS](AGENTS.md)。

## 关键功能

### 看板 —— 我现在该做什么
![看板](docs/screenshots/readme-dashboard-0.1.0.png)

近 7 天发作几次、上次 ESS 多少分、现在在用什么药，一眼看完；下面四件事点进去就是原始记录，不用翻表格找。

### 嗜睡发作 —— 一次一行，没记和 0 分钟是两件事
![嗜睡发作](docs/screenshots/readme-naps-0.1.0.png)

我睡着这件事按**次**记，不是按"每天 24 格"记。时长忘了就留空，工作台不会替我填 0。

### 时段聚合 —— 看得见记了多少，不给"该避开哪段"
![时段聚合](docs/screenshots/readme-naps-bucket-0.1.0.png)

按小时数我记下的发作。空着的时段可能是没睡着，也可能是我忘了记，这里分不出来，所以只给计数不给结论。

### 候选卡 —— AI 先整理，我核对过才算数
![候选卡](docs/screenshots/readme-nap-candidate-0.1.0.png)

我说"刚才三点半开会睡着了大概二十分钟"，它给我一张卡：时间、情境、时长、前驱，四行我逐行核对，点确认才写进我的记录；不对就拒收，什么都不会发生。

### ESS 分项 —— 8 题我自己选，AI 不估分
![ESS 分项](docs/screenshots/readme-ess-partial-0.1.0.png)

量表是**整次**填的：8 项选完才算一次，总分自动算出来不能手改。AI 不许替我选，也不许替我等分。

### ESS 历史 —— 每次一个点
![ESS 历史](docs/screenshots/readme-ess-history-0.1.0.png)

一个点就是那一次填的总分，不是每天的分。分数怎么读，等门诊问医生。

### 检查与指标 —— 没有参考上限就说没有
![指标趋势](docs/screenshots/readme-metrics-trend-0.1.0.png)

我只存测到的值和这一项自己的参考范围。报告上没写上限就显示**需参考上限**，不拿别人的标准往上套。分类记录（比如夜间事件类型）不进趋势图——连线会让人以为有大小之分。

### 夜间事件 —— 只记事实，不猜原因
![夜间事件](docs/screenshots/readme-night-events-0.1.0.png)

睡眠瘫痪、入睡幻觉、生动梦境各记一条，时间 + 类型 + 大概多久三样就够。它不判断"这算不算典型"，也不因此建议我加药。

### 用药与耐受 —— 换药是加一行，不是改一行
![用药](docs/screenshots/readme-meds-0.1.0.png)

剂量只存处方上写的原话，不替我换算。管制类药品只打标记（提醒开药期限、出行带药），**不给**吃多少、加不加、停不停任何建议。耐受那几个分数是我自己的主观打分，不是分级。

### 私密内容 · 收起态
![私密折叠](docs/screenshots/readme-private-collapsed-0.1.0.png)

### 私密内容 · 展开态
![私密展开](docs/screenshots/readme-private-expanded-0.1.0.png)

「我的看法」默认是折起来的，也默认不进口述导出——过滤做在代码里，不是界面上藏一下。

### 窄宽 —— 860px 也不挤成一列字
![窄宽](docs/screenshots/readme-narrow860-0.1.0.png)

业务区按面板自己的宽度排版，不是按窗口宽度。窗口和 AI 面板一起挤的时候，字也不会变成竖着的单字。

### AI 面板 —— 可拖可收，会话区 25%–45%
![AI 面板](docs/screenshots/readme-agent-open-0.1.0.png)

会话区可在 25%–45% 之间拖，业务区始终占 55%–75%；`×` 只是收起面板，不是结束这段对话。

## 怎么用

**现在就能看原型**：直接双击打开 `prototypes/v0.2/index.html`，不需要构建、不需要联网、不需要装东西。

```bash
open prototypes/v0.2/index.html
```

深链接支持 `#<一级>/<二级下标>`，例如 `#dashboard/0`、`#naps/1`、`#ess/1`、`#visit/2`。原型是唯一视觉基准，开发版必须逐字符对齐它。

**装进 DSH**（M5 移植完成后才可用）：当前 `dsh/` 只有注册与健康接口，装上没有业务页。装到目标 profile 后需要重启 DSH，重启后**先新建一个会话**再看面板。

## 数据与口径

- **本机优先**：数据存在本机 SQLite，不出机器；私密内容有代码级出口过滤。
- **演示数据全部是构造的模拟数据**，不是真实病例；固定种子（`20261025` / `771102`），每次打开结果一致。
- **临床试验线索**：`data/trials/` 是 2026-10-25 真跑出来的四个通道结果，共 200 条（ClinicalTrials.gov 176 · ICTRP 10 部分 · ChiCTR 0 未查通 · CDE 14）。**登记状态均未核实**，不能当招募信息用。ChiCTR 的 0 条不代表没有相关研究——该通道本轮未查通。
- **指南桥接**：指南原件全部未取得，只做登记不做摘录（[GUIDELINE-BRIDGE](docs/GUIDELINE-BRIDGE.md)）。
- **本仓不启用 CTCAE 分级**（[METRIC-GRADING](docs/METRIC-GRADING.md) 给了三条理由）。
- 版本 `0.1.0` · 通道 `beta`。

## 开发

需要 Node.js 22+、Git、包管理器和可用 DSH Desktop；采用 SQLite 时另核验 node:sqlite 版本条件。宿主 peers 的范围仅是模板基线，请与目标 Desktop 实际依赖核对。

```bash
npm install
npm run check          # 语法 + 版本一致 + schema 冻结 + 文案红线 + 单测 + 装包合同 + 宿主契约
npm run audit          # 家族一致性：版本三处一致 / layout 单一来源 / 检查链完整 / 文档与密钥卫生
npm run probe:proto    # 原型无头走查：27 个 (view, sub) × 3 档宽度，出数字
npm run fetch:trials   # 四通道临床试验采集（需要网络）
npm pack
```

`check` 只保证"能装"（语法 + 装包合同），第一天就该是绿的。`audit` 管"还是不是家族里的一员"，**只看代码与文件，不看文档自述**；新项目刚生成时 audit 必然有 fail，那是待办清单，交付/发布前必须清零（`npm run release:check` 一次跑完两者）。`probe:proto` 会真开 Chrome 量横向溢出、竖排单字、首屏版本号、导航项数，任一不达标退出码非 0。

跑的时间点：**每次改完**跑 `check`；**G2 原型确认后、写业务代码前**先跑一次 `audit`；**交付/装机前**必须跑 `release:check`；**发布或投稿前**把 `npm run audit --json` 的 `xx/xx 通过 · N 失败 · M 待人工` 抄进 `docs/RELEASE.md` 的「家族一致性」一行。`✗` 是结构缺口（补齐，或在 `docs/DEV-REQUIREMENTS-<日期>.md` 写明偏离理由并由用户确认），`!` 是需人工判断的项（逐条给「已人工确认 / 确实没有」）。

`npm install` 可能按 npm 策略解析 peer；勿为消警告重复打包宿主 runtime。客户端本身是单文件；引入 TS/组件库后需添加构建步骤并保留单文件导出。

本地安装入口以当前 Desktop/CLI 帮助为准。安装后按 [06-VALIDATION-AND-RELEASE](docs/06-VALIDATION-AND-RELEASE.md) 与官方自测完成真实 UI 验收，并填写 [ACCEPTANCE](docs/ACCEPTANCE.md)。静态检查不代表已加载。

文档索引见 [DEV-PLAN](docs/DEV-PLAN.md)：需求 [DEV-REQUIREMENTS](docs/DEV-REQUIREMENTS-2026-10-25.md) · 规格 [SPEC](docs/SPEC.md) · 差异化 [DIFF-MATRIX](docs/DIFF-MATRIX.md) · 交互路径 [INTERACTION-DESIGN](docs/INTERACTION-DESIGN.md) · 工艺 [19 号](docs/19-PROTOTYPE-CRAFT.md) · 窄宽 [30 号](docs/30-RESPONSIVE-RULES.md) · HVT [15 号](docs/15-HVT-REVIEW.md) · 截图 [33 号](docs/33-README-SCREENSHOTS.md)。

## HTML 先行与数据演进

业务开发前先交付 HTML 交互工作台原型、实际预览并由用户确认版本/hash 和范围。数据设计先区分领域事实、流程状态和页面读模型，走查前端/流程变化、兼容与迁移；原型对象不直接作为表。见[规范](docs/14-HTML-AND-DATA-CONTRACT.md)。

Logo 来源与使用限制见 assets/README.md。许可证、作者、仓库/发布策略由本项目维护者确认后填写；本项目为 private/UNLICENSED。

感谢小x宝社区、DataElement 社区，以及 sam / hhx / 繁华的 ❤️ 贡献。

初始化来源记录见 `.dsh-wb-starter.json`。更新社区脚手架不会覆盖本项目；需要升级时先用相同确认配置在临时目录生成，再审阅差异。CLI 用法见 [docs/CLI-GIT.md](docs/CLI-GIT.md)。
