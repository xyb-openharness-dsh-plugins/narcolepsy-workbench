# SCHEMA · 小睡宝 v0.1（M3 冻结前的设计说明）

> 契约正文在 `schema/0001_initial.sql`；冻结哈希在 `schema/freeze-contract.md`（M3 产出）。
> 本文解释"为什么这么建"，SQL 是唯一事实。

## 1. 四契约

| 契约 | 落地方式 |
| --- | --- |
| 看法恒不为结论 | 无 `is_conclusion` / `diagnosis` / `risk_level` / `severity` 列；用户判断存 `viewpoints.body` 且界面标"我的看法" |
| 四点位 | 仅用于 SpO2（静息/活动/夜间/最低）；缺测不生成差值（NULL ≠ 0） |
| 更正只新增版本 | 用药换药、诊断更正：新增行 + `supersedes_id`，旧行保留 |
| 事实四层不合并 | `documents`→`candidates`→`records`/`metrics` 三跳，候选未核对不入记录 |
| 多档案 | 自 `0002` 起每张业务表都有 `profile_key`（`meta` 除外），读模型一律带 `WHERE profile_key = ?` |

## 2. 表

| 表 | 用途 | 关键列 |
| --- | --- | --- |
| `profile` | 档案级（**一行一个档案**，主键 `profile_key`） | `profile_key`, `display_name`, `born_year`, `dx_text`（医生原文诊断名）, `cataplexy`（有/无/未记录）, `onset_date`, `ord` |
| `naps` | 嗜睡发作事件 | `at`, `context`, `duration_min`, `prodrome`, `note`, `proxy`（是否代记） |
| `ess_sessions` | ESS 整次 | `at`, `q1..q8`, `total`, `proxy` |
| `night_events` | 夜间事件 | `at`, `kind ∈ {awakening,sleep_paralysis,hallucination,vivid_dream}`, `duration_min`, `note` |
| `meds` | 用药 | `name`, `dose_text`, `start_date`, `end_date`, `controlled`（管制药 0/1）, `supersedes_id` |
| `med_tolerance` | 耐受 | `at`, `med_id`, `item`, `value`, `unit`, `note` |
| `metrics` | 指标（通用） | `code`, `at`, `value_num`, `value_text`, `unit`, `kind ∈ {numeric,grade,qual}`, `dec`, `ref_low`, `ref_high`, `section_title` |
| `documents` | 原文 | `title`, `kind`, `body_text`, `added_at` |
| `candidates` | 候选 | `document_id`, `field`, `value_text`, `status ∈ {pending,accepted,rejected}` |
| `questions` | 问题清单 | `body`, `for_visit`, `asked_at`, `in_use`（**不写 `using`**） |
| `viewpoints` | 我的看法 | `body`, `at`, `private` |
| `events` | 时间线事件（一图秀） | `at`, `label`, `kind ∈ {med,visit,exam,crisis,other}`, `private`, `ord` |

## 3. 关键约束（都要有单测）

1. `naps.duration_min`：`REAL`，允许 NULL；写入层拒绝 `Number(null)===0` 的静默转换。
2. `ess_sessions.total`：由 `q1..q8` 求和派生，服务端算，前端只显示。
3. `metrics.kind='numeric'` 时才允许 `value_num` 非空；`grade`/`qual` 必须 `dec IS NULL` 且 `value_num IS NULL`。
4. `section_title`：分节查询返回 `{title, rows}` 依赖该列，缺列即报错。
5. 复合主键表裸 `SELECT` 必须 `ORDER BY rowid`（`naps`/`night_events`/`med_tolerance`）。
6. 手写顺序数组用 `ord`，**不叠 `DESC`**（`meds` 历史由前端按 `ord` 反转）。
7. `ref_low/ref_high`：写入前 `null/undefined/''` 先挡再 `Number()`；`ref_high < ref_low` 报错。
8. **多档案隔离**：每张业务表带 `profile_key`（非空 CHECK），`profile` 主键是 `profile_key`；所有读模型查询必须带 `WHERE profile_key = ?`，裸 SELECT 会跨档案串数据且**不报错**。断言落点 `scripts/check-schema.mjs` 与 `test/data-contract.test.mjs`。

## 2.1 迁移历史

| 文件 | 做了什么 | 为什么 |
| --- | --- | --- |
| `0001_initial.sql` | 13 张表 + 6 索引，**单档案**设计 | 第一版 |
| `0002_multi_profile.sql` | 13 张表全部补 `profile_key`；`profile` 主键从 `CHECK(id = 1)` 改成 `profile_key` 并加 `ord`；索引按 `(profile_key, …)` 重建 | 0001 把"本机优先"读成了"单用户单档案"，而原型有 A/B 两档案 + 顶栏切换器。SQLite 无法把新列加进主键，复合主键表只能整表重建 |

## 4. 迁移策略

`0001_initial.sql` 冻结后只增不改；后续 `0002_*.sql` 追加。`scripts/check-schema.mjs` 执行**全部** `schema/00*.sql` 再比对列清单。
