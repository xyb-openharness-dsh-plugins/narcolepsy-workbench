/* 小睡宝 SnoozePal · 工作台对象
 *
 * 把"库 + 读模型 + 播种"收在一个对象里，宿主层（index.js）与独立启动（dev-server）
 * 共用同一份实现。两边各写一遍是装机后"界面打开是空的"的经典来源。
 */
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'
import { openDatabase, migrate, closeDatabase } from './store.js'
import { seedDemo, hasDemoData } from './demo.js'
import { readBootstrap, readProfile } from './readmodels.js'

export const DB_FILE = 'xyb-narcolepsy.sqlite'

export class Workbench {
  #db
  #workspace
  #seedInfo

  constructor({ db, workspace, seedInfo, info }) {
    this.#db = db
    this.#workspace = workspace
    this.#seedInfo = seedInfo
    this.info = info
  }

  /** 打开（或新建）一个工作台。workspace 为空时用 :memory:（测试与演示）。 */
  static open(workspace, info = {}) {
    const file = workspace ? join(workspace, DB_FILE) : ':memory:'
    if (workspace) mkdirSync(workspace, { recursive: true })

    const db = openDatabase(file)
    migrate(db)
    /* 幂等：已经有档案就整批跳过，绝不覆盖用户改过的记录。 */
    const seedInfo = hasDemoData(db) ? { seeded: false, profiles: 0, wrote: {} } : seedDemo(db)

    return new Workbench({ db, workspace: workspace ?? null, seedInfo, info })
  }

  get db() { return this.#db }
  get workspace() { return this.#workspace }
  get seeded() { return this.#seedInfo }

  bootstrap({ includePrivate = false } = {}) {
    return readBootstrap(this.#db, { ...this.info, includePrivate })
  }

  profile(key, { includePrivate = false } = {}) {
    return readProfile(this.#db, key, { includePrivate })
  }

  close() {
    closeDatabase(this.#db)
  }
}
