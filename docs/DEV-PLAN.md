# DEV-PLAN · 小睡宝（发作性睡病）里程碑

> 里程碑只认这一份。状态标记：✅ 实测通过 / 🔧 骨架或部分 / ⏳ 未实现。

| 阶段 | 产物 | 出口判据 | 状态 |
| --- | --- | --- | --- |
| M0 骨架 | init + 9 件文档 + 基线 check | `npm run check` → `staticPass: true` | ✅ 2026-10-25 check 绿（27 tests） |
| M1 调研/SPEC | DIFF-MATRIX / SPEC / USER-RESEARCH / INTERACTION-DESIGN | 一级重名率 ≤70% 实测 + 三路证据分层 | 🔧 文档已出，待 G1 签 |
| G1 | 业务流程与范围签认 | 留痕（确认人/原话/日期） | ⏳ 待签 |
| M2 原型 | demo 唯一源 + 四件套 + 32 号折叠卡 + 30 号窄宽 + HVT X1–X4 + 独立评审 + 截图 | P0=0；X1–X4 全过；`file://` 直开 0 error | ✅ 2026-10-25 P0=0（8 条全修，合账见 DESIGN-REVIEW）；`check:proto` 90/90 + `check:ix` 94/94；20 图；提交 `187cee2` |
| G2 | 原型版本与模块范围签认 | 原型 hash + 截图 ≥4 张 | ⏳ |
| M3 数据模型 | `schema/0001_initial.sql` + `freeze-contract.md`(sha256) + 判读列断言 | 无 `diagnosis/risk_level/severity` 列；列一致性检查绿 | 🔧 schema 已冻结（sha `0721ec15…`），待 G3 签 |
| G3 | 数据契约签认 | 冻结合同 + 列断言 | ⏳ |
| M4 临床库 | `scripts/fetch-narcolepsy-trials-2026.mjs` + 四件套 | manifest=jsonl=sqlite 行数一致；FAILED 记「未查过」 | ✅ 2026-10-25 实测 200 条（176/10/0/14），三处行数一致 |
| M5 开发版 | 七步移植 + apiBase 契约 + 五套测试 + check 全绿 + HVT 一致性 | `npm run check` 全绿 + parity >98% | 🔧 2026-10-25 移植完成：`check` 全绿（57 tests / staticPass / 文案 23 文件 / README 20 图）；`audit` 33/33；`check:ui` 17/17（真 HTTP + 真 sqlite + 真浏览器，`dataSource=api`）；`check:proto` 90/90、`check:ix` 94/94。**未闭合**：写接口属 M6+，开发版 10 处写入口统一如实拦（只读），所以 HVT X3「CRUD 双通道一致」这一项还没到能签的程度 |
| V1 | 检查链通过 | 证据写 docs/RELEASE.md | ⏳ |
| M6 装机 | 升版 → pack → 四要素对照 → 装 profile → bundles 登记 → 重启后新建会话 → 真机走查 | 四要素齐；真机截图 | ⏳ |
| V2/V3 | 装机 + 真机业务闭环 | 用户实机确认 | ⏳ |
| M7 发布 | tag + Release（tgz + sha256）+ CHANGELOG | 三者同版本 | ⏳ |
| M8 回填 | BACKLOG 状态列（31 号）| 只改状态列；走 PR | ⏳ |
| M9 回流 | 项目 DEV-REQUIREMENTS 追补 / starter LESSONS / 编号文档 / 检查器 / CHANGELOG | 至少 1 条可断言回流 + starter 测试绿 | ⏳ |

## 闸口纪律

- G1/G2/G3 不跳、不停在"看起来过了"。未签认的模块不记为开发完成。
- 任何"通过"必须有命令输出或截图；没有就写「未验证」。
