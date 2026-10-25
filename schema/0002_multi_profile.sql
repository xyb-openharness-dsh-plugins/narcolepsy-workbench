-- 小睡宝 SnoozePal · schema/0002_multi_profile.sql
--
-- 为什么必须有这一版：0001 是按**单档案**设计的（`profile` 表 CHECK(id = 1)，其余表没有 profile_key），
-- 而 M2 原型有两个档案（A 陈默 / B 李知远 家长代记）并且顶栏有档案切换按钮。
-- 0001 已冻结（sha256 见 freeze-contract.md），所以按章程新增 0002，**不改 0001**。
-- 这不是"漏列补列"，是 M3 的口径错误：把"本机优先"读成了"单用户单档案"。
-- 教训已写进 docs/DEV-REQUIREMENTS-2026-10-25.md §三：凡是原型有档案切换器的，
-- 数据模型第一版就必须带 profile_key，否则冻结之后只能发一次表重建。
--
-- 迁移形态：重建表（rename → create → copy → drop → rename）。
-- 为什么不 ALTER TABLE ADD COLUMN：SQLite 无法把新列加进主键，`naps` / `night_events` /
-- `med_tolerance` 都是复合主键表，加 profile_key 必须改主键，只能重建。
-- 复制时统一写 `profile_key = 'A'`：0001 只可能存过一份档案，把它当 A 是唯一不丢数据的选择。
--
-- 三条不动的口径：
-- ① 无判读列（diagnosis / risk_level / severity / is_conclusion 仍然禁止）；
-- ② 复合主键表裸 SELECT 仍必须 ORDER BY rowid（主键改成 (profile_key, rowid_key) 之后
--    索引顺序仍然不是插入顺序）；
-- ③ metrics.kind 只表达"怎么画"，不表达"严不严重"。

PRAGMA foreign_keys = OFF;

BEGIN;

-- ① 档案级：一行一个档案，主键从 CHECK(id=1) 改成 profile_key
CREATE TABLE profile_new (
  profile_key   TEXT    PRIMARY KEY,
  display_name  TEXT    NOT NULL,
  born_year     INTEGER,
  dx_text       TEXT,
  cataplexy     TEXT,
  onset_date    TEXT,
  note          TEXT,
  updated_at    TEXT    NOT NULL,
  ord           INTEGER NOT NULL DEFAULT 0
);
INSERT INTO profile_new (profile_key, display_name, born_year, dx_text, cataplexy, onset_date, note, updated_at, ord)
  SELECT 'A', display_name, born_year, dx_text, cataplexy, onset_date, note, updated_at, 0 FROM profile;
DROP TABLE profile;
ALTER TABLE profile_new RENAME TO profile;

-- ② 嗜睡发作：复合主键加 profile_key
CREATE TABLE naps_new (
  profile_key  TEXT    NOT NULL,
  at           TEXT    NOT NULL,
  context      TEXT    NOT NULL,
  duration_min REAL,
  prodrome     TEXT,
  note         TEXT,
  proxy        INTEGER NOT NULL DEFAULT 0,
  rowid_key    INTEGER PRIMARY KEY,
  CHECK (profile_key <> '')
);
INSERT INTO naps_new (profile_key, at, context, duration_min, prodrome, note, proxy)
  SELECT 'A', at, context, duration_min, prodrome, note, proxy FROM naps ORDER BY rowid;
DROP TABLE naps;
ALTER TABLE naps_new RENAME TO naps;

-- ③ ESS 整次：q1..q8 同一时点同源，total 仍是派生值（写库前校验，不设触发器）
CREATE TABLE ess_sessions_new (
  profile_key TEXT    NOT NULL,
  id          INTEGER PRIMARY KEY,
  at          TEXT    NOT NULL,
  q1 INTEGER NOT NULL CHECK (q1 BETWEEN 0 AND 3),
  q2 INTEGER NOT NULL CHECK (q2 BETWEEN 0 AND 3),
  q3 INTEGER NOT NULL CHECK (q3 BETWEEN 0 AND 3),
  q4 INTEGER NOT NULL CHECK (q4 BETWEEN 0 AND 3),
  q5 INTEGER NOT NULL CHECK (q5 BETWEEN 0 AND 3),
  q6 INTEGER NOT NULL CHECK (q6 BETWEEN 0 AND 3),
  q7 INTEGER NOT NULL CHECK (q7 BETWEEN 0 AND 3),
  q8 INTEGER NOT NULL CHECK (q8 BETWEEN 0 AND 3),
  total       INTEGER NOT NULL,
  proxy       INTEGER NOT NULL DEFAULT 0,
  note        TEXT,
  CHECK (profile_key <> '')
);
INSERT INTO ess_sessions_new (profile_key, id, at, q1, q2, q3, q4, q5, q6, q7, q8, total, proxy, note)
  SELECT 'A', id, at, q1, q2, q3, q4, q5, q6, q7, q8, total, proxy, note FROM ess_sessions ORDER BY rowid;
DROP TABLE ess_sessions;
ALTER TABLE ess_sessions_new RENAME TO ess_sessions;

-- ④ 夜间事件：kind 仍是四枚举 + 不推断病因
CREATE TABLE night_events_new (
  profile_key  TEXT NOT NULL,
  at           TEXT NOT NULL,
  kind         TEXT NOT NULL CHECK (kind IN ('awakening','sleep_paralysis','hallucination','vivid_dream')),
  duration_min REAL,
  note         TEXT,
  rowid_key    INTEGER PRIMARY KEY,
  CHECK (profile_key <> '')
);
INSERT INTO night_events_new (profile_key, at, kind, duration_min, note)
  SELECT 'A', at, kind, duration_min, note FROM night_events ORDER BY rowid;
DROP TABLE night_events;
ALTER TABLE night_events_new RENAME TO night_events;

-- ⑤ 用药：换药新增行 + supersedes_id 指回旧行；剂量只存原文串
CREATE TABLE meds_new (
  profile_key   TEXT    NOT NULL,
  id            INTEGER PRIMARY KEY,
  name          TEXT    NOT NULL,
  dose_text     TEXT,
  start_date    TEXT,
  end_date      TEXT,
  controlled    INTEGER NOT NULL DEFAULT 0,
  supersedes_id INTEGER,
  ord           INTEGER NOT NULL,
  note          TEXT,
  CHECK (profile_key <> ''),
  FOREIGN KEY (supersedes_id) REFERENCES meds_new(id)
);
INSERT INTO meds_new (profile_key, id, name, dose_text, start_date, end_date, controlled, supersedes_id, ord, note)
  SELECT 'A', id, name, dose_text, start_date, end_date, controlled, supersedes_id, ord, note FROM meds ORDER BY rowid;
DROP TABLE meds;
ALTER TABLE meds_new RENAME TO meds;

-- ⑥ 用药耐受：不判"严重/轻微"，只记 item + value
CREATE TABLE med_tolerance_new (
  profile_key TEXT    NOT NULL,
  at          TEXT    NOT NULL,
  med_id      INTEGER NOT NULL,
  item        TEXT    NOT NULL,
  value       REAL,
  unit        TEXT,
  note        TEXT,
  rowid_key   INTEGER PRIMARY KEY,
  CHECK (profile_key <> '')
);
INSERT INTO med_tolerance_new (profile_key, at, med_id, item, value, unit, note)
  SELECT 'A', at, med_id, item, value, unit, note FROM med_tolerance ORDER BY rowid;
DROP TABLE med_tolerance;
ALTER TABLE med_tolerance_new RENAME TO med_tolerance;

-- ⑦ 指标：kind 只表达怎么画；分类指标 dec 必须 NULL
CREATE TABLE metrics_new (
  profile_key   TEXT    NOT NULL,
  id            INTEGER PRIMARY KEY,
  code          TEXT    NOT NULL,
  at            TEXT    NOT NULL,
  value_num     REAL,
  value_text    TEXT,
  unit          TEXT,
  kind          TEXT    NOT NULL CHECK (kind IN ('numeric','grade','qual')),
  dec           INTEGER,
  ref_low       REAL,
  ref_high      REAL,
  section_title TEXT    NOT NULL DEFAULT '',
  note          TEXT,
  CHECK (profile_key <> ''),
  CHECK (
    (kind = 'numeric' AND value_num IS NOT NULL)
    OR (kind IN ('grade','qual') AND dec IS NULL AND value_num IS NULL)
  )
);
INSERT INTO metrics_new (profile_key, id, code, at, value_num, value_text, unit, kind, dec, ref_low, ref_high, section_title, note)
  SELECT 'A', id, code, at, value_num, value_text, unit, kind, dec, ref_low, ref_high, section_title, note FROM metrics ORDER BY rowid;
DROP TABLE metrics;
ALTER TABLE metrics_new RENAME TO metrics;

-- ⑧ 原文 / 候选：事实四层不合并（原文永不被改写）
CREATE TABLE documents_new (
  profile_key TEXT    NOT NULL,
  id          INTEGER PRIMARY KEY,
  title       TEXT    NOT NULL,
  kind        TEXT    NOT NULL,
  body_text   TEXT    NOT NULL DEFAULT '',
  added_at    TEXT    NOT NULL,
  CHECK (profile_key <> '')
);
INSERT INTO documents_new (profile_key, id, title, kind, body_text, added_at)
  SELECT 'A', id, title, kind, body_text, added_at FROM documents ORDER BY rowid;
DROP TABLE documents;
ALTER TABLE documents_new RENAME TO documents;

CREATE TABLE candidates_new (
  profile_key TEXT    NOT NULL,
  id          INTEGER PRIMARY KEY,
  document_id INTEGER NOT NULL REFERENCES documents_new(id),
  field       TEXT    NOT NULL,
  value_text  TEXT    NOT NULL,
  status      TEXT    NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected')),
  created_at  TEXT    NOT NULL,
  CHECK (profile_key <> '')
);
INSERT INTO candidates_new (profile_key, id, document_id, field, value_text, status, created_at)
  SELECT 'A', id, document_id, field, value_text, status, created_at FROM candidates ORDER BY rowid;
DROP TABLE candidates;
ALTER TABLE candidates_new RENAME TO candidates;

-- ⑨ 问题清单：列名 in_use（using 是保留字）
CREATE TABLE questions_new (
  profile_key TEXT    NOT NULL,
  id          INTEGER PRIMARY KEY,
  body        TEXT    NOT NULL,
  for_visit   TEXT,
  asked_at    TEXT,
  in_use      INTEGER NOT NULL DEFAULT 1,
  ord         INTEGER NOT NULL,
  created_at  TEXT    NOT NULL,
  CHECK (profile_key <> '')
);
INSERT INTO questions_new (profile_key, id, body, for_visit, asked_at, in_use, ord, created_at)
  SELECT 'A', id, body, for_visit, asked_at, in_use, ord, created_at FROM questions ORDER BY rowid;
DROP TABLE questions;
ALTER TABLE questions_new RENAME TO questions;

-- ⑩ 我的看法：恒不为结论；private=1 不进一图秀/摘要/导出
CREATE TABLE viewpoints_new (
  profile_key TEXT    NOT NULL,
  id          INTEGER PRIMARY KEY,
  body        TEXT    NOT NULL,
  at          TEXT    NOT NULL,
  private     INTEGER NOT NULL DEFAULT 1,
  CHECK (profile_key <> '')
);
INSERT INTO viewpoints_new (profile_key, id, body, at, private)
  SELECT 'A', id, body, at, private FROM viewpoints ORDER BY rowid;
DROP TABLE viewpoints;
ALTER TABLE viewpoints_new RENAME TO viewpoints;

-- ⑪ 时间线事件：一图秀用；分类序列只画节点不连线
CREATE TABLE events_new (
  profile_key TEXT    NOT NULL,
  id          INTEGER PRIMARY KEY,
  at          TEXT    NOT NULL,
  label       TEXT    NOT NULL,
  kind        TEXT    NOT NULL CHECK (kind IN ('med','visit','exam','crisis','other')),
  private     INTEGER NOT NULL DEFAULT 0,
  ord         INTEGER NOT NULL DEFAULT 0,
  CHECK (profile_key <> '')
);
INSERT INTO events_new (profile_key, id, at, label, kind, private, ord)
  SELECT 'A', id, at, label, kind, private, ord FROM events ORDER BY rowid;
DROP TABLE events;
ALTER TABLE events_new RENAME TO events;

-- 索引：0001 的旧索引随 DROP TABLE 一起消失，这里按 (profile_key, …) 重建
CREATE INDEX IF NOT EXISTS idx_naps_profile_at    ON naps(profile_key, at);
CREATE INDEX IF NOT EXISTS idx_night_profile_at   ON night_events(profile_key, at);
CREATE INDEX IF NOT EXISTS idx_metrics_profile    ON metrics(profile_key, code, at);
CREATE INDEX IF NOT EXISTS idx_metrics_section    ON metrics(section_title, at);
CREATE INDEX IF NOT EXISTS idx_events_profile_at  ON events(profile_key, at);
CREATE INDEX IF NOT EXISTS idx_candidates_doc     ON candidates(document_id, status);
CREATE INDEX IF NOT EXISTS idx_questions_profile  ON questions(profile_key, ord);
CREATE INDEX IF NOT EXISTS idx_meds_profile       ON meds(profile_key, ord);

COMMIT;

PRAGMA foreign_keys = ON;
