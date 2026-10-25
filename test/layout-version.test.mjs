// 面板与版本契约的单测：这些数字越界不是"风格问题"，是宿主 register() 直接 throw。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PANEL, AGENT_PANE, clampAgentWidth, assertPanelConfig } from '../lib/layout.js'
import { version, channel, channelLabel, displayVersion, APP_INFO } from '../lib/version.js'
import { readFileSync } from 'node:fs'

test('业务区与会话区互补为 1', () => {
  assert.ok(Math.abs(PANEL.businessWidth + AGENT_PANE.default - 1) < 1e-9)
})

test('businessWidth 在宿主硬上限 0.7 之内', () => {
  assert.ok(PANEL.businessWidth > 0.55 && PANEL.businessWidth <= 0.7)
})

test('会话区可拖区间落在家族口径 25%–45%', () => {
  assert.equal(AGENT_PANE.min, 0.25)
  assert.equal(AGENT_PANE.max, 0.45)
  assert.ok(AGENT_PANE.default >= AGENT_PANE.min && AGENT_PANE.default <= AGENT_PANE.max)
})

test('clampAgentWidth 夹紧越界值并兜住 NaN', () => {
  assert.equal(clampAgentWidth(0.9), 0.45)
  assert.equal(clampAgentWidth(0.1), 0.25)
  assert.equal(clampAgentWidth('0.3'), 0.3)
  assert.equal(clampAgentWidth(undefined), AGENT_PANE.default)
  assert.equal(clampAgentWidth('abc'), AGENT_PANE.default)
})

test('assertPanelConfig 对合法配置返回 true', () => {
  assert.equal(assertPanelConfig(), true)
})

test('customFrame 必须开启（否则顶栏无 AI 按钮）', () => {
  assert.equal(PANEL.customFrame, true)
})

test('版本三处一致：VERSION / package.json / lib/version.js', () => {
  const file = readFileSync(new URL('../VERSION', import.meta.url), 'utf8').trim()
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  assert.equal(version, file)
  assert.equal(pkg.version, file)
  assert.equal(APP_INFO.version, file)
})

test('渠道标签与渠道一一对应', () => {
  assert.ok(['prototype', 'beta', 'stable'].includes(channel))
  assert.ok(channelLabel.length > 0)
  assert.equal(displayVersion, `v${version}`)
})
