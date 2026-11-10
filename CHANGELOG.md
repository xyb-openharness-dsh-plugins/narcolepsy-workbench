## 0.1.4（2026-11-11，AI 对话面板激活修复）

- 会话判定改用宿主归属 `ownedSession()`（`ownsSession(currentSession())`），不再用 `Boolean(conversation)`（customFrame 下没会话也会传隐藏容器 → 判断恒为真 → 点了没反应）。
- 创建路径改 `service.newSession(workspaceId)`，工作区取 `service.defaultWorkspace?.()?.workspaceId`；无可用工作区时由宿主提示选目录；不再用 `ensureSession({})`。
- 取消目录选择不留空会话并提示可重试；创建失败在工作台内显示原因；订阅会话变化触发重渲染；草稿仍只填不发。
- 版本与生成物同步 0.1.4；新增 `scripts/check-agent-pane-contract.mjs` 入 check 链。
- **界面加载与真机点击待人工**（需退出重开 DSH Desktop 后新建会话走查）。

## 0.1.2 — 2026-10-27

- 分隔线交互统一：AI 面板分隔线加宽抓取区，悬停显示本工作台同色系增亮色与拖动把手（⠿）；拖动改用指针捕获，越过业务 iframe 不再丢事件。

# 变更记录

只增不删；每条写清"改了什么 + 为什么 + 用户可见结果"。版本号与 VERSION、package.json 三处必须一致。

## 0.1.1 — 2026-10-27

- 36 号 v2 引入（指南可点 + 状态卡）：活动原型与装机层 `public/` 同步 `primer.js/.css/primer-data.js`，顶栏新增「?」入口，四段固定为 definition → evidence → landscape → trend。
- 看板首卡新增病程状态卡：eyebrow（D+N · 距下次复诊）、锚点派生天数、现状与下次复诊、主/副出口按钮；无锚点时显示「待初始化」+ 三步引导。
- evidence 表 5 行全部可点：已取得原件 1 项（中华神经科杂志 2015 年全文页）；未取得原件/官方入口 4 项（2022 版指南题录、ICSD-3-TR、AASM 实践参数、86 个罕见病病种诊疗指南 2025 年版通知页），均带 note。
- 新增 `scripts/check-primer-links.mjs` 并接入 `npm run check`；新增 `scripts/probe-disease-primer.mjs`（活动原型与 public 各 10/10）。

## 0.1.0 — 2026-10-25

- 由社区脚手架 dsh-wb-cli@1.5.4 (1541b8a) 初始化，仅有注册骨架与健康接口，无业务功能。
