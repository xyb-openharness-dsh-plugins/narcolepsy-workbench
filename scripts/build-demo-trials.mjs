#!/usr/bin/env node
/**
 * 从 `data/trials/trials.jsonl` 生成原型的试验数据 `prototypes/v0.2/demo-trials.js`。
 *
 * 为什么要有这一步：原型的硬规则是「数据只有一个来源」。试验条目的唯一来源是
 * `data/trials/`（由 `scripts/fetch-narcolepsy-trials-2026.mjs` 真跑采集），
 * 不许在原型里手抄一份数字——手抄的数字没有 `generated_at`，三个月后没人知道它是什么时候的。
 *
 * 所以原型里的试验条目是**生成物**，每次重跑采集后重新生成本文件即可。
 * 生成物头部写明来源、生成时间、条数与缺口（哪些字段登记库里根本没有）。
 *
 * 用法：node scripts/build-demo-trials.mjs [--check]
 *   --check  只校验生成物与源数据一致，不写文件（进 npm run check 链）
 */
import { readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'data/trials/trials.jsonl')
const OUT = join(ROOT, 'prototypes/v0.2/demo-trials.js')
const OUT_PUBLIC = join(ROOT, 'public/demo-trials.js')
const checkOnly = process.argv.includes('--check')

if (!existsSync(SRC)) {
  console.error(`✗ 找不到 ${SRC}。先跑 npm run fetch:trials 采集，再生成原型数据。`)
  process.exit(1)
}

const lines = (await readFile(SRC, 'utf8')).split('\n').filter((l) => l.trim())
const records = lines.map((l) => JSON.parse(l))

/** 从 raw_json 的中文散文里取「适应症」「药物名」；取不到就是 null，不猜。 */
function fromRaw(r) {
  let raw = {}
  try { raw = JSON.parse(r.raw_json ?? '{}') } catch { /* 原文不是 JSON 就放弃，留 null */ }
  return {
    indication: raw.indication ?? raw.condition ?? null,
    drug: raw.drug ?? null,
    listStatus: raw.list_status ?? null
  }
}

/* 分型线索：只认标题/适应症里**明写**的「1型 / 2型 / 伴猝倒 / with cataplexy / type 1」，
   不做推断（工作台不替患者判断自己是哪一型）。null = 登记库里没说。 */
function subtypeHint(text) {
  const t = String(text || '')
  if (/1\s*型|type\s*1|伴猝倒|with\s+cataplexy|cataplexy/i.test(t) && !/2\s*型|type\s*2/i.test(t)) return 'type1'
  if (/2\s*型|type\s*2/i.test(t) && !/1\s*型|type\s*1/i.test(t)) return 'type2'
  if (/1\s*型或\s*2\s*型|type\s*1\s*(or|\/)\s*type\s*2|伴或不伴猝倒/i.test(t)) return 'both'
  return null
}

const trimmed = records.map((r) => {
  const extra = fromRaw(r)
  const hint = subtypeHint(`${r.title} ${extra.indication ?? ''}`)
  return {
    key: r.trial_key,
    source: r.source,
    id: r.registry_id,
    title: r.title,
    status: r.status ?? null,
    phase: r.phase ?? null,
    enrollment: r.enrollment ?? null,
    country: r.country ?? null,
    start: r.start_date ?? null,
    /* 下面三个来自 raw_json：登记库主要字段缺失，只能从散文里取 */
    indication: extra.indication,
    drug: extra.drug,
    subtype: hint
  }
})

/* 生成物里的「能力声明」必须写死：登记库到底有没有这些字段，是匹配指数能不能算的前提。
   实测（2026-10-25，200 条）：trials 表列里没有 eligibility / criteria / biomarker / age 任何一项。 */
const CAPABILITY = {
  hasEligibilityCriteria: false,
  hasBiomarkerFields: false,
  hasAgeRange: false,
  note: '登记库导出字段里没有入排标准、没有生物标志、没有年龄区间。匹配指数只能对「已登记字段」归一化，缺口维度单列，不许当 0 分。'
}

const manifestPath = join(ROOT, 'data/trials/manifest.json')
const manifest = existsSync(manifestPath) ? JSON.parse(await readFile(manifestPath, 'utf8')) : null

const payload = {
  generatedAt: manifest?.generated_at ?? null,
  sourceFile: 'data/trials/trials.jsonl',
  generator: 'scripts/build-demo-trials.mjs',
  total: trimmed.length,
  channels: (manifest?.channels ?? []).map((c) => ({ id: c.id, status: c.status, count: c.count })),
  capability: CAPABILITY,
  trials: trimmed
}

const header = `/* 小睡宝 SnoozePal · 试验条目（生成物，勿手改）
 *
 * 来源：${payload.sourceFile}（采集时间 ${payload.generatedAt}，共 ${payload.total} 条）
 * 生成：node scripts/build-demo-trials.mjs
 *
 * 四通道终态：${payload.channels.map((c) => `${c.id}=${c.status}(${c.count})`).join(' · ')}
 *
 * 缺口（写进数据本身，免得页面假装能匹配）：
 *   ${CAPABILITY.note}
 */
`
const body = `(function () {\nwindow.DEMO_TRIALS = ${JSON.stringify(payload, null, 1)};\n})();\n`
const text = header + body

if (checkOnly) {
  for (const target of [OUT, OUT_PUBLIC]) {
    const cur = existsSync(target) ? await readFile(target, 'utf8') : ''
    if (cur !== text) {
      console.error(`✗ ${target.slice(ROOT.length + 1)} 与 data/trials/trials.jsonl 不一致。重新跑 node scripts/build-demo-trials.mjs`)
      process.exit(1)
    }
  }
  console.log(`✓ 原型与开发版的试验数据都与源数据一致：${payload.total} 条 · 采集于 ${payload.generatedAt}`)
} else {
  await writeFile(OUT, text, 'utf8')
  await writeFile(OUT_PUBLIC, text, 'utf8')
  console.log(`✓ 已生成 prototypes/v0.2/demo-trials.js + public/demo-trials.js：${payload.total} 条 · 采集于 ${payload.generatedAt}`)
}
