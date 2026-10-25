/* 小睡宝 SnoozePal · 数据层（开库 / 迁移 / 关库）
 *
 * 这一层只做三件事，不多做：
 *   ① 打开 sqlite（测试用 :memory:，装机用用户资料目录下的 xyb-narcolepsy.sqlite）；
 *   ② 按顺序跑 schema/00*.sql，记台账 schema_migrations；
 *   ③ 关库。
 *
 * 错误一律是带 code 的具名错误：路由层要靠 code 决定回 500 还是 503，
 * 只抛 `Error('something failed')` 会让上层把所有库错误都当 500，用户看到"内部错误"三字。
 */
import { DatabaseSync } from 'node:sqlite'
import { readFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCHEMA_DIR = fileURLToPath(new URL('../schema/', import.meta.url))

/* 迁移文件名：0001_initial.sql、0002_multi_profile.sql……
   只认四位数字前缀，别的文件（freeze-contract.md、list.txt）不算迁移。 */
const MIGRATION_RE = /^(\d{4})_[a-z0-9_]+\.sql$/

export class StoreError extends Error {
  constructor(code, message, cause) {
    super(message)
    this.name = 'StoreError'
    this.code = code
    if (cause) this.cause = cause
  }
}

export class OpenDatabaseError extends StoreError {
  constructor(message, cause) {
    super('OPEN_FAILED', message, cause)
    this.name = 'OpenDatabaseError'
  }
}

export class MigrationError extends StoreError {
  constructor(message, cause) {
    super('MIGRATE_FAILED', message, cause)
    this.name = 'MigrationError'
  }
}

export class CloseDatabaseError extends StoreError {
  constructor(message, cause) {
    super('CLOSE_FAILED', message, cause)
    this.name = 'CloseDatabaseError'
  }
}

/** 打开库。path 缺省 :memory:（测试用）。 */
export function openDatabase(path = ':memory:') {
  try {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
    const db = new DatabaseSync(path)
    // 外键默认是关的：0002 用 rename→create→copy→drop 重建表，靠显式开关控制时机
    db.exec('PRAGMA foreign_keys = ON')
    return db
  } catch (error) {
    throw new OpenDatabaseError(`打不开数据库：${error.message}`, error)
  }
}

/** 列出可用迁移（按文件名升序 = 按版本号升序，四位数前缀保证字典序等于数字序）。 */
export function listMigrations(dir = SCHEMA_DIR) {
  if (!existsSync(dir)) throw new MigrationError(`迁移目录不存在：${dir}`)
  return readdirSync(dir)
    .filter((f) => MIGRATION_RE.test(f))
    .sort()
    .map((file) => ({ version: Number(file.slice(0, 4)), file, sql: readFileSync(join(dir, file), 'utf8') }))
}

/**
 * 跑迁移。幂等：已记在 schema_migrations 里的版本跳过。
 *
 * 两条由这里统一负责、迁移文件里不许再写的东西：
 *   ① **事务**——每个文件一个事务，失败只回滚这一个文件，不会留下"跑了一半"的库；
 *   ② **外键开关**——表重建型迁移（0002）必须在 FK 关闭时做，而 SQLite 的
 *      `PRAGMA foreign_keys` 在事务内是 no-op，所以只能由 runner 在 BEGIN 之前关、
 *      COMMIT 之后开。迁移文件里自己写 PRAGMA 是无效的（踩过，报
 *      "cannot start a transaction within a transaction"）。
 */
export function migrate(db, { dir = SCHEMA_DIR, now = new Date().toISOString() } = {}) {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version    INTEGER PRIMARY KEY,
    file       TEXT NOT NULL,
    applied_at TEXT NOT NULL
  )`)

  const applied = new Set(db.prepare('SELECT version FROM schema_migrations').all().map((r) => Number(r.version)))
  const out = []

  for (const migration of listMigrations(dir)) {
    if (applied.has(migration.version)) continue
    /* 外键在 BEGIN 之前关掉：0002 是整表重建，FK 关着才能 drop 被引用的表。
       跑完恢复 ON，后面所有读写都受外键约束。 */
    db.exec('PRAGMA foreign_keys = OFF')
    try {
      db.exec('BEGIN')
      db.exec(migration.sql)
      db.prepare('INSERT INTO schema_migrations (version, file, applied_at) VALUES (?,?,?)')
        .run(migration.version, migration.file, now)
      db.exec('COMMIT')
      out.push(migration.version)
    } catch (error) {
      try { db.exec('PRAGMA foreign_keys = ON') } catch { /* 下面继续抛原始错误 */ }
      try { db.exec('ROLLBACK') } catch (rollbackError) {
        throw new MigrationError(
          `迁移 ${migration.file} 失败且回滚也失败：${error.message} / ${rollbackError.message}`,
          error
        )
      }
      throw new MigrationError(`迁移 ${migration.file} 失败：${error.message}`, error)
    } finally {
      db.exec('PRAGMA foreign_keys = ON')
    }
  }
  return out
}

/** 已应用的迁移版本。 */
export function appliedVersions(db) {
  return db.prepare('SELECT version, file FROM schema_migrations ORDER BY version').all().map((r) => ({ ...r }))
}

export function closeDatabase(db) {
  try {
    db.close()
  } catch (error) {
    throw new CloseDatabaseError(`关库失败：${error.message}`, error)
  }
}

export { SCHEMA_DIR }
