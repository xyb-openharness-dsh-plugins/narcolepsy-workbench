// 面板参数唯一来源。客户端与构建产物都从这里取值，别在别处写第二份 0.65 / 0.35。
//
// 宿主 register() 的硬校验（来源：app.asar → dsh-desktop-workbenches/client.js）：
//   businessSide ∈ left|right · businessWidth ∈ 0.25–0.7 · 越界直接 throw → 插件激活失败。
// 家族统一：业务区在左、原生会话在最右；businessWidth 与 AGENT_PANE.default 互补。
export const PANEL = Object.freeze({
  customFrame: true,
  businessSide: 'left',
  businessWidth: 0.65,
})

export const AGENT_PANE = Object.freeze({
  default: 0.35,
  min: 0.25,
  max: 0.45,
  step: 0.02,
  storageKey: 'xyb.narcolepsy.agentPane.width',
  compactMaxWidth: 760,
  drawerWidth: 420,
})

export function clampAgentWidth(value) {
  const width = Number(value)
  if (!Number.isFinite(width)) return AGENT_PANE.default
  return Math.min(AGENT_PANE.max, Math.max(AGENT_PANE.min, width))
}

export function assertPanelConfig() {
  const sum = PANEL.businessWidth + AGENT_PANE.default
  if (Math.abs(sum - 1) > 1e-9) throw new Error('businessWidth 与 AGENT_PANE.default 必须互补：' + sum)
  if (!(PANEL.businessSide === 'left' || PANEL.businessSide === 'right')) throw new Error('businessSide 只能是 left 或 right')
  if (PANEL.businessWidth < 0.25 || PANEL.businessWidth > 0.7) throw new Error('businessWidth 必须在 0.25–0.7（宿主 register 硬校验）')
  if (AGENT_PANE.min < 0.25 || AGENT_PANE.max > 0.45) throw new Error('会话区宽度必须落在 25%–45%')
  return true
}
