# DEV-REQUIREMENTS · 2026-10-25（小睡宝 SnoozePal）

> 强约束文档。每条都能被某条命令或某张截图验证；写不出验证方式的，删掉。
> 体例沿 v1.2（ZERO-TO-DEV §0.2），内容为本癌种原创。

## 一、范围（交付物 × 落点 × 怎么验）

- [ ] 原型四件套 `prototypes/v0.2/{index.html,style.css,app.js,demo-data.js}`，`file://` 直开 → 验：无构建打开、控制台 0 error
- [ ] 演示数据唯一源 `demo/build-demo-data.mjs` → 同时产出 `demo/demo-data.sqlite` 与 `prototypes/v0.2/demo-data.js` → 验：重跑两次产物字节一致（除时间戳）
- [ ] 数据契约 `schema/0001_initial.sql` + `freeze-contract.md`（sha256）→ 验：`npm run check` 的冻结合同断言
- [ ] 开发版 `public/` 与原型逐字符一致（仅字号三处 + `[hidden]` + shell）→ 验：`test/ui-parity.test.mjs`
- [ ] 读模型 `dsh/readmodels.js` 还原 demo 同形状 → 验：`test/store.test.mjs` 的 parity
- [ ] 试验检索脚本 `scripts/fetch-narcolepsy-trials-2026.mjs`（--dry-run）→ 验：dry-run 打印通道终态，未查到写「未查过」
- [ ] 装机产物 `release/*.tgz` + 证据 `docs/RELEASE.md` → 验：四要素对照（tgz 条目 / profile bundles / state.json / harness.log）

## 二、照抄样板的产品要求（不许按比例缩减）

- 顶栏三段式（品牌 · 版本/状态 · 字号与 AI 五态），AI 入口只在顶栏。
- 面板默认在右、25%–45% 可拖、可收起；`customFrame: true`；`businessSide: 'left'`；`businessWidth + AGENT_PANE.default = 1`。
- 一图秀：SVG 根 `class="chart"`，`smoothPath` 用 Fritsch–Carlson 单调三次（不过冲），末点 13px 避让，分类序列只画节点不连线。
- 3D 卡：整卡 180°，背面迷你折线，分类记录不翻不连线。
- 页脚贴底：`min-height: calc(100vh - 32px)` + `flex: 1`；`[hidden]{display:none!important}`；字号基线 12.5–15px。

## 三、硬约束（每条带错误来源）

### 数据层

1. 复合主键表裸 `SELECT` 必须 `ORDER BY rowid`。错误来源：家族多仓 parity 红（行序不稳定）。
2. 手写倒序数组只 `ORDER BY ord`，不叠 `DESC`。错误来源：cervical v0.1.1 时间线倒序重复。
3. 可选字段显式写 `null`，读模型按 `=== null` 分支。错误来源：GBM 空值被当 0 画点。
4. `using` 是 SQLite 保留字 → 列名 `in_use`。错误来源：家族统一教训（docs/04-DATA.md）。
5. 每节 `{title, rows}` 必须有 `*_title` 列。错误来源：HCC 分节标题丢失。
6. 分类指标 `dec IS NULL` 且 `kind ∈ {grade,qual}`；分类不进趋势。错误来源：16 号一图秀规范。
7. **时长型指标**（`duration_min`）单位固定为分钟，写入前 `Number.isFinite` 校验；空值走 `null` 而不是 0。错误来源：本轮新增形态（睡眠时长），`Number(null)===0` 家族坑在此复现风险最高。
8. 演示数据唯一来源：`demo/build-demo-data.mjs`；readmodels 不许自造演示值。

### 前端

9. 页脚贴底；`[hidden]` 强制 `display:none!important`；字号 12.5–15px（大字 15px）。
10. 二级页签按 `state.sub` 分流且穷举测试（禁止"抓到按钮再点"，`render()` 重建 DOM）。
11. 内联 svg 必须给宽高；图标 key 走别名兜底。
12. private 三出口代码级过滤：一图秀 / 摘要 / 导出；私密内容只写"记录存在 + 已过滤"。
13. 整页视图（32 号）：返回与关闭双入口、Esc 只退一层、`#page=` 可直达、关掉回原滚动位置。
14. AI 按钮走 `narcolepsy:agent-draft`，一键携带提示词 + 病情上下文（只带计数与日期，不带原文）。

### 工程

15. 改包必升版；`lib/version.js` 是生成物，`commit` 行比对时忽略 + `merge-base --is-ancestor` 核真实性。
16. `apiBase` 不含 `/api`；页面统一拼 `${API_BASE}/api/xxx`；交界守卫只禁 `/(^|/)api$/`，**不许 `includes('/api')` 一刀切**；启动期校验失败渲染错误横幅，**禁止裸 throw 白屏**。
17. 迁移只增不改；INSERT 写显式列名 + 显式问号数。
18. 面板参数唯一来源 `lib/layout.js`；客户端不写第二份 `0.35`。

### 医学口径

19. 分级只用「对照」措辞，不写"偏高/偏低/严重"，不推断因果、不给处置。
20. ×ULN 型必须用本次化验单自带 `ref_high`，缺了返回 `needsUln`；**下限可以借，上限不能借**。
21. 指南只做「出处 + 节奏 + 并列口径」；处置推荐只折叠原文，不改写成产品语句；原件未取得写「未核实」。
22. **不做分型判断**（1 型/2 型）：界面只显示医生原文诊断名 + 猝倒"有/无/未记录"，不推导分型。
23. **不给驾驶/操作机械结论**：只提供"我的记录 + 想问医生的问题"，界面不出现"可以开车/不宜驾驶"。
24. **试验登记库没有入排标准与生物标志字段**（本轮实测：CTV / ICTRP / ChiCTR / CDE 四通道的返回结构里只有状态、分期、国家、入组人数、起止日期、申办者，**没有** 入排标准、HLA、脑脊液食欲素）。因此任何"匹配指数"只能对**已登记字段**归一化，入排与生物标志维度必须**单独列出为缺口**；**禁止把缺口算成 0 分**（否则等于替登记库编造入排）。错误来源：把"库里有这个试验"读成"你符合这个试验"，患者会拿着分数去挂号。
25. **ICTRP / ChiCTR 在线抓取存在 WAF / 非法访问拦截**（实测：ICTRP 回发翻页与 Export 被重定向 `NoAccess.aspx`；ChiCTR `searchproj.html`→405、`searchProject`→`{"code":40000,"message":"非法访问"}`）。脚本必须把 `partial` 与 `unsupported` **分开记**，**不允许降级成 `ready`**；`unsupported` 的 0 条必须随附覆盖声明"未查通 ≠ 没有"。错误来源：把"没查通"写成 0 条，等于告诉罕见病患者"没有研究在招"。
26. **凡是原型带档案切换器的，`schema` 第一版就必须带 `profile_key`**（本轮踩了：0001 把"本机优先"读成"单用户单档案"，`profile` 用 `CHECK (id = 1)`，其余 12 张表没有 `profile_key`，而 M2 原型有 A/B 两个档案 + 顶栏切换器）。0001 冻结后只能发 `0002` 做**整表重建**（rename → create → copy → drop → rename），因为 SQLite 无法把新列加进主键，而 `naps` / `night_events` / `med_tolerance` 是复合主键表。代价：13 张表各写一遍、索引全重建、老数据统一归到 `profile_key='A'`。错误来源：切换档案时把 A 的发作算进 B 的看板，**不报错**，只是数字悄悄错。判定：原型里有 `#profile-btn` 或多档案数据，schema 就必须带 `profile_key`。
27. **多档案的数据隔离要在三处同时成立**：① 每张业务表带 `profile_key` 且有非空 CHECK；② 所有读模型查询都带 `WHERE profile_key = ?`（裸 SELECT 会跨档案串数据）；③ 归档/导出必须显式带档案标识，不允许把两个档案混进一个文件。断言落点：`scripts/check-schema.mjs` 的"每张业务表都带 profile_key"与 `test/data-contract.test.mjs` 的"多档案隔离"两条。

28. **静态层 SPA 兜底只对"页面请求"生效**（无扩展名或 `.html`）；要 `.js/.css` 的 404 必须真 404。
   写路径穿越断言时，`..` 必须**编码**（`%2e%2e%2f`）：`fetch` 会先按 URL 标准把裸 `..` 归一化掉，
   请求根本没到服务端。错误来源：本轮 `test/server.test.mjs` 第三次假绿 —— `public/index.html` 一存在，
   `/public/../../../../etc/passwd` 被客户端归一化成 `/etc/passwd`，服务端按 SPA 规则回首页 200，
   而断言写的是"必须 403/404"，两条用例自相矛盾（另一条明确要求 `/etc/passwd` 回外壳 200）。
29. **检查器的正则必须跑在剥掉注释的源码上**。错误来源：`scripts/check-host-contract.mjs` 取"第一处
   `customFrame`"取到了 `lib/client.js` 生成物头部注释里的 `* 面板 customFrame=true · 业务 left 0.65`，
   判成"不是 true/false 字面量"，代码本身是对的 —— 检查器自己读错，比不检查更坏（会教人改对的地方）。
30. **注入型常量必须是裸字面量**：`const CUSTOM_FRAME = __CUSTOM_FRAME__` → `true`，
   **不要**写成 `'__CUSTOM_FRAME__' === 'true'`。宿主 `register()` 只认 boolean，
   静态检查取的是第一处赋值，表达式永远不是字面量。错误来源：同上一条，同一次踩到。
31. **只读版本必须如实拦写入口**：不许假装成功，也不许把按钮藏起来。错误来源：开发版接口本轮只有 GET，
   8 处写操作若照抄原型 `push` 内存，患者会以为"存上了"（刷新即丢）—— 属于评审清单里的"静默丢数据"。
   落点：`public/app.js` 的 `writeBlocked()` + `scripts/probe-ui.mjs` 的"只读写入闸门"三条断言。
32. **开发版的"今天"取数据里最近的日期**，不取系统日期。错误来源：演示数据锚定固定种子日期，
   用系统日期会让"3 天前 / 近 7 天 / 本周"随真实时间漂移，半年后整页都在说错事；
   本机库的真记录本来就在今天附近，两者几乎一致。
33. **装进 iframe 时给 `body` 加 `hosted` 类**，把宿主已经画过的外壳（顶栏 / 版本条 / 会话面板）隐藏；
   这类"只在宿主里成立"的样式只能放 `public/shell.css`，**不许写进 `style.css`**（后者必须与原型逐字节相同）。
34. **让患者的记录显示得出来，优先于"只显示目录里的指标"**：读模型遇到目录外的 code 要读出来、
   排到目录项之后，不许静默丢弃。错误来源：原型允许手工加一条指标（`code: 'm'+Date.now()`），
   而 `readMetrics` 只输出目录内 10 项 —— 写进去的记录在界面上凭空消失，不报错。

## 四、本轮明确未做（不许在验收里算通过）

- 未做患者访谈（0 访谈）；未取得指南原件；未做真实病例验证。
- 未做 DSH Desktop 真机走查（若无宿主运行）：只写「已安装，待重启确认」，不写"装机通过"。
- 未做市场投稿（未授权）；未做多用户/云同步（本机优先，永不做静默上传）。
- 未做 1 型/2 型分型、未做 MSLT 判读、未做药物剂量建议。
- **未查通 ICTRP 全量与 ChiCTR 在线**：`ictrp` 只有第 1 页 10 条（`partial`，397 条里只拿到 10 条），`chictr_online` 为 `unsupported`（0 条）。验收时不许把这两条算作"试验检索已完成"。
- **未做试验匹配指数的排名字段校验**：分子分母取哪些已登记字段、缺几项时怎么展示，本轮只定约束未实现，属 M4+。

## 五、我替你定的默认值（默认执行、可回退）

本轮按"用户未答即取推荐项"处理，四条均可在 G1 签认时一句话回退：

| # | 问题 | 采用默认值 | 理由 / 回退方式 |
| --- | --- | --- | --- |
| 1 | 服务主体 | **患者本人为主，青少年档允许家长代记**（同一账号双视角，代记条目标 `proxy`） | R2 罕见病线以成人为多数；青少年起病是本病特征，代记不加会漏掉学生群体。回退：去掉代理开关 |
| 2 | 病程覆盖 | **确诊后全程**：确诊档案 → 用药与耐受 → 复诊量表 → 检查原文 → 办事材料；**不含**儿童起病专门流程 | 单轮可交付；儿童/青少年专属流程（学校沟通、生长发育）留 M6 后。回退：增线不删线 |
| 3 | MinerU | **不接**（本轮无 PDF 解析需求，文档只做手工登记 + 原文粘贴） | 六部件接入成本高、本轮无资料目录；接口层预留 `documents` 四层。回退：M5 后按 18 号补 |
| 4 | 品牌占位名 | **小睡宝 · SnoozePal**（占位，可换） | 与家族"小 X 宝"一致；"睡"直指核心症状且不污名化。回退：只改 3 个品牌变量 + 标题文案 |
