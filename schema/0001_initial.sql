-- 小睡宝 SnoozePal · schema/0001_initial.sql
-- 冻结后只增不改；结构变更一律新增 0002_*.sql。sha256 见 schema/freeze-contract.md。
-- 四契约：①看法恒不为结论 ②四点位（SpO2）③更正只新增版本 ④事实四层不合并。
-- 无判读列：不存在 diagnosis / risk_level / severity / is_conclusion。

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- ① 档案级（单行）
CREATE TABLE IF NOT EXISTS profile (
  id            INTEGER PRIMARY KEY CHECK (id = 1),
  display_name  TEXT    NOT NULL,
  born_year     INTEGER,
  dx_text       TEXT,              -- 医生原文诊断名，不改写、不推导分型
  cataplexy     TEXT,              -- 有 / 无 / 未记录（枚举三元，不做分型判断）
  onset_date    TEXT,              -- YYYY-MM-DD
  note          TEXT,
  updated_at    TEXT    NOT NULL
);

-- ② 嗜睡发作事件（复合主键表——裸 SELECT 必须 ORDER BY rowid）
CREATE TABLE IF NOT EXISTS naps (
  at           TEXT    NOT NULL,   -- ISO 本地时间 YYYY-MM-DDTHH:MM
  context      TEXT    NOT NULL,   -- 开会 / 开车 / 吃饭 / 静坐 / 阅读 / 通勤 / 其他
  duration_min REAL,               -- 发作持续分钟；NULL = 未记录（不是 0）
  prodrome     TEXT,               -- 有 / 无 / 未记录
  note         TEXT,
  proxy        INTEGER NOT NULL DEFAULT 0,  -- 0 本人 / 1 家长代记
  rowid_key    INTEGER PRIMARY KEY
);

-- ③ ESS 整次（q1..q8 同一时点同源；total 由服务端派生）
CREATE TABLE IF NOT EXISTS ess_sessions (
  id     INTEGER PRIMARY KEY,
  at     TEXT    NOT NULL,
  q1     INTEGER NOT NULL CHECK (q1 BETWEEN 0 AND 3),
  q2     INTEGER NOT NULL CHECK (q2 BETWEEN 0 AND 3),
  q3     INTEGER NOT NULL CHECK (q3 BETWEEN 0 AND 3),
  q4     INTEGER NOT NULL CHECK (q4 BETWEEN 0 AND 3),
  q5     INTEGER NOT NULL CHECK (q5 BETWEEN 0 AND 3),
  q6     INTEGER NOT NULL CHECK (q6 BETWEEN 0 AND 3),
  q7     INTEGER NOT NULL CHECK (q7 BETWEEN 0 AND 3),
  q8     INTEGER NOT NULL CHECK (q8 BETWEEN 0 AND 3),
  total  INTEGER NOT NULL,         -- = q1+..+q8，写库前校验
  proxy  INTEGER NOT NULL DEFAULT 0,
  note   TEXT
);

-- ④ 夜间事件（复合主键表）
CREATE TABLE IF NOT EXISTS night_events (
  at           TEXT NOT NULL,
  kind         TEXT NOT NULL CHECK (kind IN ('awakening','sleep_paralysis','hallucination','vivid_dream')),
  duration_min REAL,
  note         TEXT,
  rowid_key    INTEGER PRIMARY KEY
);

-- ⑤ 用药（换药新增行，supersedes_id 指回旧行；旧行永不覆盖）
CREATE TABLE IF NOT EXISTS meds (
  id           INTEGER PRIMARY KEY,
  name         TEXT    NOT NULL,
  dose_text    TEXT,               -- 原文剂量串，不解析成数字（解析即判读风险）
  start_date   TEXT,
  end_date     TEXT,
  controlled   INTEGER NOT NULL DEFAULT 0,  -- 1 = 管制类药品
  supersedes_id INTEGER REFERENCES meds(id),
  ord          INTEGER NOT NULL,   -- 手写顺序；读时只 ORDER BY ord，不叠 DESC
  note         TEXT
);

-- ⑥ 用药耐受（复合主键表）
CREATE TABLE IF NOT EXISTS med_tolerance (
  at      TEXT NOT NULL,
  med_id  INTEGER NOT NULL REFERENCES meds(id),
  item    TEXT NOT NULL,           -- 恶心 / 腹泻 / 食欲 / 口干 / 心悸 / 其他
  value   REAL,
  unit    TEXT,
  note    TEXT,
  rowid_key INTEGER PRIMARY KEY
);

-- ⑦ 指标（通用；kind 只表达"怎么画"，不表达"严不严重"）
CREATE TABLE IF NOT EXISTS metrics (
  id            INTEGER PRIMARY KEY,
  code          TEXT    NOT NULL,  -- ess_total / nap_duration / awakening_count / spo2_rest / weight ...
  at            TEXT    NOT NULL,
  value_num     REAL,
  value_text    TEXT,
  unit          TEXT,
  kind          TEXT    NOT NULL CHECK (kind IN ('numeric','grade','qual')),
  dec           INTEGER,           -- 仅 numeric 可非空；grade/qual 必须 NULL
  ref_low       REAL,              -- 参考下限（可空）
  ref_high      REAL,              -- 参考上限（可空；×ULN 型缺它就返回 needsUln）
  section_title TEXT    NOT NULL DEFAULT '',  -- 分节读模型依赖这一列
  note          TEXT,
  CHECK (
    (kind = 'numeric' AND value_num IS NOT NULL)
    OR (kind IN ('grade','qual') AND dec IS NULL AND value_num IS NULL)
  )
);

-- ⑧ 原文 / 候选 / 记录：事实四层不合并
CREATE TABLE IF NOT EXISTS documents (
  id        INTEGER PRIMARY KEY,
  title     TEXT NOT NULL,
  kind      TEXT NOT NULL,         -- psg / mslt / discharge / prescription / other
  body_text TEXT NOT NULL DEFAULT '',  -- 原文粘贴；只折叠展示，不改写
  added_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS candidates (
  id          INTEGER PRIMARY KEY,
  document_id INTEGER NOT NULL REFERENCES documents(id),
  field       TEXT NOT NULL,
  value_text  TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected')),
  created_at  TEXT NOT NULL
);

-- ⑨ 问题清单（列名 in_use，不写保留字 using）
CREATE TABLE IF NOT EXISTS questions (
  id        INTEGER PRIMARY KEY,
  body      TEXT NOT NULL,
  for_visit TEXT,                  -- 打算在哪次门诊问
  asked_at  TEXT,                  -- 问过的时间；NULL = 还没问
  in_use    INTEGER NOT NULL DEFAULT 1,
  ord       INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

-- ⑩ 我的看法（恒不为结论；private=1 不进一图秀/摘要/导出）
CREATE TABLE IF NOT EXISTS viewpoints (
  id        INTEGER PRIMARY KEY,
  body      TEXT NOT NULL,
  at        TEXT NOT NULL,
  private   INTEGER NOT NULL DEFAULT 1
);

-- ⑪ 时间线事件（一图秀用；分类序列只画节点不连线）
CREATE TABLE IF NOT EXISTS events (
  id        INTEGER PRIMARY KEY,
  at        TEXT NOT NULL,
  label     TEXT NOT NULL,
  kind      TEXT NOT NULL CHECK (kind IN ('med','visit','exam','crisis','other')),
  private   INTEGER NOT NULL DEFAULT 0,
  ord       INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_naps_at         ON naps(at);
CREATE INDEX IF NOT EXISTS idx_night_at        ON night_events(at);
CREATE INDEX IF NOT EXISTS idx_metrics_code_at ON metrics(code, at);
CREATE INDEX IF NOT EXISTS idx_metrics_section ON metrics(section_title, at);
CREATE INDEX IF NOT EXISTS idx_events_at       ON events(at);
CREATE INDEX IF NOT EXISTS idx_candidates_doc  ON candidates(document_id, status);
