/* 小睡宝 SnoozePal · 把演示档案写进本机库
 *
 * 三条硬要求（ZERO-TO-DEV 阶段 2 第 2 步）：
 *   ① **幂等**：已经有档案就整批跳过。用户第二次打开工作台，不能把自己改过的记录
 *      再被演示数据覆盖一遍 —— 那是"越用越乱"，比没有演示数据严重得多。
 *   ② **单事务**：要么全写进去，要么一条都不写。写一半的库会让界面上出现
 *      "有发作记录但没有档案"这种无法解释的状态。
 *   ③ **失败整体回滚**：异常往上抛，由调用方决定要不要继续启动（本仓的做法是
 *      启动失败就报错横幅，不静默降级成空库）。
 *
 * 数据来源是 demo/build-demo-data.mjs 的 buildDemoData()：**同一份纯数据**，
 * 不在这里再抄一遍 —— 抄一遍就等于有了第二个数据源（14 号）。
 */
import { buildDemoData } from '../demo/build-demo-data.mjs'

const nowStamp = () => new Date().toISOString()

/** 库里已经有档案了吗（幂等判据）。 */
export function hasDemoData(db) {
  const row = db.prepare('SELECT COUNT(*) AS c FROM profile').get()
  return Number(row?.c ?? 0) > 0
}

/**
 * 把演示数据写进库。已有档案时直接返回 {seeded:false}，一个字都不改。
 * @returns {{seeded: boolean, profiles: number, wrote: object}}
 */
export function seedDemo(db, data = buildDemoData()) {
  if (hasDemoData(db)) {
    return { seeded: false, profiles: 0, wrote: {} }
  }

  const wrote = {
    profile: 0, profile_exam: 0, naps: 0, ess_sessions: 0, night_events: 0,
    meds: 0, med_tolerance: 0, metrics: 0, documents: 0, questions: 0, viewpoints: 0, events: 0
  }
  const stamp = nowStamp()

  db.exec('BEGIN')
  try {
    const insProfile = db.prepare(`INSERT INTO profile
      (profile_key, display_name, born_year, dx_text, cataplexy, onset_date, note, updated_at, ord,
       sex, occupation, worry_text, activity_text, proxied)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    const insExam = db.prepare('INSERT INTO profile_exam (profile_key, name, at, place, note, ord) VALUES (?,?,?,?,?,?)')
    const insNap = db.prepare('INSERT INTO naps (profile_key, at, context, duration_min, prodrome, note, proxy) VALUES (?,?,?,?,?,?,?)')
    const insEss = db.prepare(`INSERT INTO ess_sessions
      (profile_key, at, q1,q2,q3,q4,q5,q6,q7,q8, total, proxy, note) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    const insNight = db.prepare('INSERT INTO night_events (profile_key, at, kind, duration_min, note) VALUES (?,?,?,?,?)')
    const insMed = db.prepare(`INSERT INTO meds
      (profile_key, name, dose_text, start_date, end_date, controlled, supersedes_id, ord, note) VALUES (?,?,?,?,?,?,?,?,?)`)
    const insTol = db.prepare('INSERT INTO med_tolerance (profile_key, at, med_id, item, value, unit, note) VALUES (?,?,?,?,?,?,?)')
    const insMetric = db.prepare(`INSERT INTO metrics
      (profile_key, code, at, value_num, value_text, unit, kind, dec, ref_low, ref_high, section_title, note)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
    const insDoc = db.prepare('INSERT INTO documents (profile_key, title, kind, body_text, added_at) VALUES (?,?,?,?,?)')
    const insQ = db.prepare('INSERT INTO questions (profile_key, body, for_visit, asked_at, in_use, ord, created_at) VALUES (?,?,?,?,?,?,?)')
    const insVp = db.prepare('INSERT INTO viewpoints (profile_key, body, at, private) VALUES (?,?,?,?)')
    const insEv = db.prepare('INSERT INTO events (profile_key, at, label, kind, private, ord) VALUES (?,?,?,?,?,?)')

    for (const [key, p] of Object.entries(data.profiles)) {
      insProfile.run(
        key, p.name, p.bornYear ?? null, p.dx ?? null, p.cataplexy ?? null, p.onset ?? null,
        p.psycho ?? null, stamp, key === 'A' ? 0 : 1,
        p.sex ?? null, p.occupation ?? null, p.psycho ?? null, p.activity ?? null, p.proxied ? 1 : 0
      )
      wrote.profile += 1

      for (const [i, e] of (p.exam ?? []).entries()) {
        insExam.run(key, e.name, e.date ?? null, e.place ?? null, e.note ?? null, i * 10)
        wrote.profile_exam += 1
      }

      for (const n of data.naps[key]) {
        insNap.run(key, n.at, n.context, n.min ?? null, n.prodrome ?? null, n.note || null, n.proxy ? 1 : 0)
        wrote.naps += 1
      }

      for (const r of data.ess[key]) {
        const total = r.q.reduce((a, b) => a + b, 0)  // 派生，不手抄
        insEss.run(key, r.at, ...r.q, total, r.proxy ? 1 : 0, r.note || null)
        wrote.ess_sessions += 1
      }

      for (const n of data.nights[key]) {
        insNight.run(key, n.at, n.kind, n.min ?? null, n.note || null)
        wrote.night_events += 1
      }

      /* 用药：supersedes_id 只在"真的换掉上一行"时写，追加用药留 NULL。 */
      const medIds = []
      for (const m of data.meds[key]) {
        const prev = medIds.length ? medIds[medIds.length - 1] : null
        const supersedes = m.replaces === true ? prev : null
        const info = insMed.run(key, m.name, m.dose ?? null, m.start ?? null, m.end ?? null,
          m.controlled ? 1 : 0, supersedes, m.ord, m.note || null)
        medIds.push(Number(info.lastInsertRowid))
        wrote.meds += 1
      }

      for (const t of data.tolerance[key]) {
        const idx = data.meds[key].findIndex((m) => m.name === t.med)
        const medId = idx >= 0 ? medIds[idx] : (medIds[0] ?? null)
        insTol.run(key, t.at, medId, t.item, t.value ?? null, t.unit ?? null, null)
        wrote.med_tolerance += 1
      }

      for (const m of data.metrics[key]) {
        const isNum = m.kind === 'numeric'
        for (const pt of m.points) {
          insMetric.run(
            key, m.code, pt.d,
            isNum ? pt.v : null,
            isNum ? null : String(pt.v),
            isNum ? (m.unit || null) : null,
            m.kind,
            isNum ? (m.dec ?? null) : null,
            isNum ? (m.refLow ?? null) : null,
            isNum ? (m.refHigh ?? null) : null,
            m.source.split(' · ')[0],
            m.note || null
          )
          wrote.metrics += 1
        }
      }

      for (const d of data.documents[key]) {
        insDoc.run(key, d.title, d.kind, d.body, d.added)
        wrote.documents += 1
      }
      for (const [i, q] of data.questions[key].entries()) {
        insQ.run(key, q.body, q.forVisit ?? null, q.asked ?? null, 1, (i + 1) * 10, stamp)
        wrote.questions += 1
      }
      for (const v of data.viewpoints[key]) {
        insVp.run(key, v.body, v.at, v.private ? 1 : 0)
        wrote.viewpoints += 1
      }
      for (const [i, e] of data.events[key].entries()) {
        insEv.run(key, e.at, e.label, e.kind, e.private ? 1 : 0, i * 10)
        wrote.events += 1
      }
    }
    db.exec('COMMIT')
  } catch (error) {
    try { db.exec('ROLLBACK') } catch { /* 回滚失败不掩盖原始错误 */ }
    throw error
  }

  return { seeded: true, profiles: Object.keys(data.profiles).length, wrote }
}
