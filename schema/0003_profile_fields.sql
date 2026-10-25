-- 0003：profile 补字段 + 确诊检查清单表
--
-- 为什么现在才加：0001/0002 的 profile 表只存了"身份与诊断"，读模型还原不出原型
-- 已有的几项患者数据（性别、职业、患者自己最担心什么、日常活动与驾驶事实、
-- 是否家长代记），以及确诊时的检查清单（名称/日期/机构/原文摘要）。
--
-- 这些都是**患者数据**，不是界面文案：
--   · activity_text 是 D4 差异点「驾驶只记事实」的唯一落点 —— 不落库就等于没记；
--   · worry_text 是患者原话，界面只能引用不能改写；
--   · proxied 决定每条记录要不要带「家长代记」标记，落不到库就无法在多端一致。
--
-- ALTER TABLE ADD COLUMN 只对 profile 这种单列主键表安全；
-- profile_exam 是新增表，带 profile_key 外键，与 0002 的多档案口径一致。
--
-- 事务与外键开关由 dsh/store.js 的 migrate() 统一负责，本文件只写 DDL。

ALTER TABLE profile ADD COLUMN sex TEXT;
ALTER TABLE profile ADD COLUMN occupation TEXT;
ALTER TABLE profile ADD COLUMN worry_text TEXT;
ALTER TABLE profile ADD COLUMN activity_text TEXT;
ALTER TABLE profile ADD COLUMN proxied INTEGER NOT NULL DEFAULT 0;

CREATE TABLE profile_exam (
  profile_key TEXT NOT NULL REFERENCES profile(profile_key) ON DELETE CASCADE,
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  at          TEXT,
  place       TEXT,
  note        TEXT,
  ord         INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_profile_exam ON profile_exam(profile_key, ord, id);
