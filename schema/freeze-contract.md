# schema 冻结合同

本文件锁定 `schema/0001_initial.sql` 的内容边界。**冻结后只增不改**：任何结构变更新增 `0002_*.sql`，
不改 0001。发布前发现漏列也走 ALTER 追加。

## 冻结记录

| 项 | 值 |
| --- | --- |
| 文件 | `schema/0001_initial.sql` |
| 行数 | 158 |
| 字节 | 见 `wc -c` 输出 |
| sha256 | `0721ec15b12d726ec05389ec8dc3b6cd9d59d2c93f544d4cf0682df469eb3737` |
| 冻结日期 | 2026-10-25 |
| 冻结人 | 本轮开发者（G3 待用户签认） |

## 内容边界（这版包含什么）

13 张表：`meta` `profile` `naps` `ess_sessions` `night_events` `meds` `med_tolerance` `metrics`
`documents` `candidates` `questions` `viewpoints` `events`。6 个索引。

**明确不含**：任何判读列（`diagnosis` / `risk_level` / `severity` / `is_conclusion`）；
任何外推到其他 ILD/癫痫/抑郁的字段；任何云端同步表。

## 断言（`npm run check` 内执行）

1. `sha256(schema/0001_initial.sql)` 与本文件记录一致 —— 改了 0001 却没更新合同会红。
2. 表清单包含上述 13 张，且列清单与 `docs/SCHEMA.md` §2 一致。
3. `PRAGMA table_info(metrics)` 不含 `diagnosis|risk_level|severity|is_conclusion`（判读列断言）。
4. `questions` 用 `in_use` 而不是 SQLite 保留字 `using`。
5. 全部 `schema/00*.sql` 顺序执行可在 `:memory:` 建库成功。
6. **每张业务表都带 `profile_key`**（`meta` 除外），且 `profile` 的主键是 `profile_key`
   而不是 `CHECK(id = 1)`（0002 起生效）。

## 已追加迁移

| 文件 | 内容 | 日期 | 为什么必须重建表 |
| --- | --- | --- | --- |
| `0002_multi_profile.sql` | 13 张表全部补 `profile_key`；`profile` 主键改成 `profile_key` 并加 `ord`；索引按 `(profile_key, …)` 重建 | 2026-10-25 | SQLite 无法把新列加进主键，`naps`/`night_events`/`med_tolerance` 是复合主键表，加 `profile_key` 必须改主键 → 只能 rename→create→copy→drop→rename |

`0002` 把 0001 里存在的那一份数据统一写成 `profile_key = 'A'`：0001 只可能存过一份档案，
把它当 A 是唯一不丢数据的选择。实测迁移前后 12 张表的行数逐一相等（见
`test/store.test.mjs「0002 迁移不丢行」`）。

**这条错误的性质**：0001 把"本机优先"读成了"单用户单档案"，而原型有档案切换器。
教训已写进 `docs/DEV-REQUIREMENTS-2026-10-25.md` §三：**凡是原型带档案切换器的，
数据模型第一版就必须带 `profile_key`**，冻结之后补只能付一次表重建的代价。

## 变更流程

新增 `0002_xxx.sql` → 跑 `npm run check`（它执行全部迁移）→ 更新本文件的"已追加迁移"清单 →
`VERSION` 升位。**0001 的 sha256 行永不修改。**
