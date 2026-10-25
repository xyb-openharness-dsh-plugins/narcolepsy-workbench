# 发布与回滚记录

版本/tag/commit：... 变更的功能 ID：... 用户授权范围：...
家族一致性：`npm run audit` 结果（xx/xx 通过 · N fail · M warn）；存在 fail 不得发布，warn 逐条给结论：...
源码检查：... 包检查/大小/hash：... 实机证据：...
README/许可证/素材来源/运行依赖/更新说明：...
演示数据清单已清理或明确示例环境：...
数据库迁移与旧包兼容：... 可用备份：...
市场分发来源：npm / Release tarball / 默认分支源码 / 不投稿（选一并说明依据）：...

若任务要求本机更新：最终已安装版本/Profile/打开确认本次修改：...。若仅推送Git：明确此范围，不声称本机已更新。仅安装后仍旧版或异常时附源码→构建物→包→Profile→运行界面的诊断证据，不每次重复整链排查。

| 动作 | 目标 | 真实结果/URL/证据 | 状态 |
| --- | --- | --- | --- |
| 本地安装 | Desktop/profile | `profiles/web`：`file:snoozepal-dsh-narcolepsy-workbench-0.1.0.tgz` + `bundles` 登记；`check:installed` 25/25 | **已装、待重启确认** |
| Git push | 远端/分支/commit | | 未执行 |
| Release/npm | tag/产物/hash | | 未执行 |
| 市场 PR | 官方目录仓库 | | 未执行 |
| 上架 | 公开 catalog | | 未执行 |

市场状态说明：GitHub Release 不会自动成为市场安装来源。核对已有目录条目/开放PR；若未声明 tarball，市场按目录协议使用默认分支源码（或适用的npm来源）。普通代码版本升级不重复创建目录PR；切换安装来源或修改目录元数据时，在原条目PR中更新。市场PR提交、合并、目录可见、Desktop可安装分别记录，不混称“已上架”。

回滚步骤/数据兼容检查/已知限制：...

工作台市场发布另按 docs/10-MARKET-PUBLISHING.md 执行，附 templates/MARKET-ACCEPTANCE.md 的指定版本手工确认。官方指南复核日期/来源：... 最终安装来源：... 用户确认的项目与执行者：... PR URL/最新提交检查实际执行结果：... 市场目录可见与可安装证据：...。未授权投稿时标不适用，不把 Git push 当市场发布。

---

## 2026-10-25 · v0.1.0 首次打包（V1 待签）

命令与实测输出（可复跑；本节只记"跑过的"，没跑的不写）：

| 闸门 | 命令 | 实测 |
| --- | --- | --- |
| 源码检查链 | `npm run check` | 全绿：57 tests pass · `staticPass: true` · 文案红线 23 文件/17 禁词 · README 20 图 · 版本一致 v0.1.0（8 处，原型快照冻结 0.1.0） |
| 家族一致性 | `npm run audit` | **33/33 通过 · 0 失败 · 0 待人工** |
| 原型渲染 | `npm run check:proto` | 90/90 页（10 页 × 3 二级 × 1400/1000/860px） |
| 原型交互 | `npm run check:ix` | 94/94（S01/S03/S04/S05/S08/L10/整页/组件唯一/导航） |
| 开发版界面 | `npm run check:ui` | 17/17（真 HTTP + 真 sqlite + 真 Chrome；`dataSource=api`，不是回退演示数据） |
| 宿主接线 | `npm run check:host` | `customFrame=true · businessSide=left · businessWidth=0.65` · 符合 `register()` |
| 打包 | `npm pack --pack-destination release` | `snoozepal-dsh-narcolepsy-workbench-0.1.0.tgz` · **48 files** · 3,843,429 bytes · sha1 `dc93d2941033ef6aa5f4efc32297048ebcfddc86`（首包 64 files / 7.3 MB：`assets/` 里 3 MB 的 CTCAE PDF 与两张参考 PNG 本仓**不使用**——`docs/METRIC-GRADING.md` 已声明不启用 CTCAE——已从 `files` 白名单移除，`assets/` 仍留在仓库里作参考） |
| 装机 | `corepack pnpm add -w file:snoozepal-dsh-narcolepsy-workbench-0.1.0.tgz`（在 `…/dsh-desktop/harness/profiles/web`） | 已装：`node_modules/@snoozepal-dsh/narcolepsy-workbench` 0.1.0（装前备份 `package.json.bak-<时间戳>`）；`npm run check:install` → 已登记到 Desktop 实际加载的 profile |
| 装机副本自检 | `npm run check:installed` | **25/25**：对**装进去的那一份**跑 `health` / `bootstrap`（A·B 两档案、5 轨道、74 条发作）／默认不含私密正文、`?private=1` 才拿到 ／`ui/index.html` 是业务外壳 ／未知接口 JSON 404 |

装机前四要素（对 **tgz 内容**核对，不是对源码树）：

1. `package.json` 的 `dsh.bundle.patch` + `dsh.client.inject` + `repository` —— ✅ 在包内；
2. `cordis.patch.yml` 的 insert 条目带 `config.root: !!js dshHomePath('narcolepsy-workbench')`，注释全部在条目**之后** —— ✅；
3. 真客户端链路：`lib/client.js` 是 `scripts/build-client.mjs` 的产物（468 行、`customFrame: CUSTOM_FRAME` 且常量为裸布尔），不是 init 占位骨架 —— ✅；
4. 版本簿记：`VERSION` / `package.json` / `lib/version.js` / `public/index.html` 字面量 / `APP_INFO` 五处一致 —— ✅（`check-version` 8 处核对）。

**状态**：V1 未签（`docs/DEV-PLAN.md` 里 M5 仍为 🔧：写接口属 M6+，开发版 10 处写入口如实拦为只读）。
本机安装、真机走查、Release/tag 均**未执行**，不要按"已发布"理解。

已知限制（随包发出，不藏）：

- 本版接口只读（`health` / `bootstrap` / `profile/:key`）；界面写入口给的是"当前版本只读"的如实提示，不假装保存；
- 临床试验匹配指数只用登记库里**确实有**的维度（地区 / 招募状态 / 标题里的分型线索），入排标准、生物标志阈值、年龄区间列为缺口，**不计入分母**；
- 私有条目默认一个字节都不下发，只有显式 `?private=1` 才取正文。
