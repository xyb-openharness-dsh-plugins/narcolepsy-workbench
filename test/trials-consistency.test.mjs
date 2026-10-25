// M4 临床试验产出的三方一致性验收：manifest / jsonl / sqlite 必须说同一个数。
//
// 为什么这组断言值得单独一个文件：`data/trials` 是可重跑的产物，不是源码。
// 干净 checkout 上它不存在是正常的，所以缺文件时 **skip 而不是 fail** ——
// 否则没跑过采集的人会看到一片红，久了就开始无视这组测试。
// 而一旦文件存在，数字不一致就是真事故：manifest 说 176、库里有 174 时，
// 患者那边就是"一条查不到的试验"，所以这里不允许任何"差不多"。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'

const DIR = 'data/trials'
const MANIFEST = `${DIR}/manifest.json`
const JSONL = `${DIR}/trials.jsonl`
const SQLITE = `${DIR}/trials.sqlite`

const STATUS_ENUM = new Set([
  'ready',
  'partial',
  'truncated',
  'timeout',
  'unsupported',
  'not_configured',
  'error',
])

const present = existsSync(MANIFEST) && existsSync(JSONL) && existsSync(SQLITE)
const skip = present ? false : `${DIR} 尚未生成（先跑 npm run fetch:trials）——按约定 skip 而非 fail`

function load() {
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'))
  const lines = readFileSync(JSONL, 'utf8')
    .split('\n')
    .filter((line) => line.trim().length > 0)
  const rows = lines.map((line, index) => {
    try {
      return JSON.parse(line)
    } catch (error) {
      throw new Error(`trials.jsonl 第 ${index + 1} 行不是合法 JSON：${error.message}`)
    }
  })
  return { manifest, rows, lineCount: lines.length }
}

test('manifest / jsonl / sqlite 三处行数一致', { skip }, () => {
  const { manifest, lineCount } = load()
  const db = new DatabaseSync(SQLITE, { readOnly: true })
  const sqliteCount = db.prepare('SELECT COUNT(*) AS n FROM trials').get().n
  db.close()

  assert.equal(typeof manifest.totals.records, 'number', 'manifest.totals.records 必须是数字')
  assert.equal(manifest.totals.records, lineCount, `manifest ${manifest.totals.records} ≠ jsonl ${lineCount}`)
  assert.equal(manifest.totals.records, sqliteCount, `manifest ${manifest.totals.records} ≠ sqlite ${sqliteCount}`)
  assert.equal(lineCount, sqliteCount, `jsonl ${lineCount} ≠ sqlite ${sqliteCount}`)
})

test('每条记录都有非空 source 与 registry_id', { skip }, () => {
  const { rows } = load()
  assert.ok(rows.length > 0, '记录数为 0 时本测试无意义——请确认通道终态是否都是 0')

  const allowedSources = new Set(['ctv', 'ictrp', 'chictr_online', 'chinadrugtrials'])
  rows.forEach((row, index) => {
    assert.ok(
      typeof row.source === 'string' && row.source.trim().length > 0,
      `第 ${index + 1} 行缺 source`,
    )
    assert.ok(
      typeof row.registry_id === 'string' && row.registry_id.trim().length > 0,
      `第 ${index + 1} 行缺 registry_id`,
    )
    assert.ok(allowedSources.has(row.source), `第 ${index + 1} 行 source 不在四通道内：${row.source}`)
    // trial_key 是跨来源合并键，缺了就没法与别的来源并成一条试验。
    assert.ok(typeof row.trial_key === 'string' && row.trial_key.length > 0, `第 ${index + 1} 行缺 trial_key`)
  })
})

test('(source, registry_id) 无重复', { skip }, () => {
  const { rows } = load()
  const seen = new Set()
  for (const row of rows) {
    const key = `${row.source}\u0000${row.registry_id}`
    assert.ok(!seen.has(key), `重复记录：${row.source} / ${row.registry_id}`)
    seen.add(key)
  }
})

test('channels 的 status 都在枚举内，且 count 与 manifest 总数自洽', { skip }, () => {
  const { manifest, rows } = load()
  assert.ok(Array.isArray(manifest.channels) && manifest.channels.length > 0, 'manifest.channels 不能为空')

  for (const channel of manifest.channels) {
    assert.ok(STATUS_ENUM.has(channel.status), `通道 ${channel.id} 的终态 ${channel.status} 不在枚举内`)
    assert.equal(typeof channel.count, 'number', `通道 ${channel.id} 的 count 必须是数字`)
    assert.equal(typeof channel.note, 'string', `通道 ${channel.id} 缺 note（终态必须有说明）`)
    assert.ok(
      typeof channel.fetched_at === 'string' && channel.fetched_at.length > 0,
      `通道 ${channel.id} 缺 fetched_at`,
    )
  }

  // 通道 count 之和应等于记录总数：这是"每条记录都能追溯到某个通道"的机器版。
  const sum = manifest.channels.reduce((acc, channel) => acc + channel.count, 0)
  assert.equal(sum, rows.length, `channels count 之和 ${sum} ≠ 记录数 ${rows.length}`)
})

test('0 条结果的通道必须带覆盖声明', { skip }, () => {
  const { manifest } = load()
  for (const channel of manifest.channels) {
    if (channel.count !== 0) continue
    // 0 条不是"无相关研究"，必须说明这个来源的覆盖范围/为什么没查到。
    const note = channel.note ?? ''
    assert.ok(
      /未查通|未查过|覆盖|不代表|0 条/.test(note),
      `通道 ${channel.id} 为 0 条但 note 没有覆盖声明：${note}`,
    )
  }
})

test('sqlite 的 channels 表与 manifest 一致', { skip }, () => {
  const { manifest } = load()
  const db = new DatabaseSync(SQLITE, { readOnly: true })
  const rows = db.prepare('SELECT id, status, count, note, fetched_at FROM channels ORDER BY id').all()
  db.close()

  assert.equal(rows.length, manifest.channels.length, 'channels 表行数与 manifest 不一致')
  const byId = new Map(manifest.channels.map((channel) => [channel.id, channel]))
  for (const row of rows) {
    const expected = byId.get(row.id)
    assert.ok(expected, `channels 表里多出 manifest 没有的通道 ${row.id}`)
    assert.equal(row.status, expected.status, `通道 ${row.id} 终态不一致`)
    assert.equal(row.count, expected.count, `通道 ${row.id} 条数不一致`)
  }
})
