/* 本文件由 scripts/build-client.mjs 从 src/client.js 生成，请勿手改。
 * 改客户端源码请改 src/client.js 后运行 npm run build:client。
 * 包名 @snoozepal-dsh/narcolepsy-workbench · 仓库 https://github.com/xyb-openharness-dsh-plugins/narcolepsy-workbench
 * 面板 customFrame=true · 业务 left 0.65
 * AI 会话可拖宽度 0.25–0.45（默认 0.35，步进 0.02）
 */
/* 客户端入口源码。
 *
 * **不要直接改 lib/client.js**：那是 `npm run build:client` 从本文件生成的产物。
 * 官方要求客户端必须是「已构建好的单文件」，Desktop 不会替我们打包，
 * 所以这里用零依赖的字符串替换把常量注入进去：
 * 包名与仓库取自 package.json，面板参数取自 lib/layout.js，接口前缀取自 dsh/routes.js。
 * 生成而不是手抄，是为了避免两边漂移（LESSONS「版本簿记」与「占位客户端上线」两条）。
 *
 * ## 面板形态：customFrame
 *
 * 要"可拖 + 可收起"只能走 customFrame：宿主把**原生会话节点**作为 `conversation` prop
 * 交给我们排版，于是
 *
 * - 顶栏有明确的「AI 对话 / 打开 AI 对话 / 收起 AI 对话」按钮（不藏在面板内部）；
 * - 中间 splitter 可鼠标拖、可键盘调（←/→ 步进，Home/End 到边界），区间 25%–45%，
 *   带 `role="separator"` 与 aria-valuenow；
 * - 收起只隐藏面板，**不结束、不删除会话**；再点回同一会话；
 * - 宽度存 localStorage，读回时过一遍 clamp（本地存过 90% 也不会真的开出 90%）；
 * - 容器窄于 760px 改覆盖式抽屉，业务区不让位，splitter 不出现。
 *
 * 三条硬约束：
 * 1. 根节点首个子元素必须是语义 `<header>`，并用 `--dsh-frame-leading-clearance` 避让
 *    macOS 左上角窗口按钮；
 * 2. 原生会话**始终挂载**（只用 display 控制显隐）——卸载会丢掉输入框与草稿；
 * 3. 无会话时业务面板照常可用，依赖会话的操作在按钮处引导，不阻断业务。
 */

;(function () {
  // 没有模块加载器就静静退出：这个文件也会被静态检查脚本扫到，不该在那时抛错。
  if (typeof window === 'undefined' || typeof window.__ModuleLoader__?.load !== 'function') return

  window.__ModuleLoader__.load({
    id: '@snoozepal-dsh/narcolepsy-workbench',
    factory: (require) => {
      const React = require('react')
      const h = React.createElement

      const UI_ENTRY = '/api/narcolepsy/ui/'
      const API_PREFIX = '/api/narcolepsy'
      const VERSION = '0.1.2'
      const TITLE = '小睡宝 SnoozePal'
      const PANEL_TITLE = '小睡宝发作性睡病工作台'
      const SUBTITLE = '本机数据 · 记录不是诊断'
      const DESCRIPTION = '把散落的嗜睡发作、ESS 量表、夜间睡眠事件、用药与检查整理成可核对、可回溯的资料，并攒成复诊能带着走的问题清单。'

      /* ---- 面板参数（由 scripts/build-client.mjs 从 lib/layout.js 注入） ---- */
      const BUSINESS_SIDE = 'left'
      const BUSINESS_WIDTH = Number('0.65')
      /* 注入的是**裸布尔**（true/false），不是字符串比较：宿主 register() 只认 boolean，
         而 check-host-contract 取的是第一处 `CUSTOM_FRAME =` 的值，写成 `'true' === 'true'`
         它读到的是表达式，会判成"不是字面量"。 */
      const CUSTOM_FRAME = true
      const AGENT_DEFAULT = Number('0.35')
      const AGENT_MIN = Number('0.25')
      const AGENT_MAX = Number('0.45')
      const AGENT_STEP = Number('0.02')
      const NARROW_BELOW = Number('760')
      const DRAWER_MAX = Number('420')
      const WIDTH_KEY = 'snooze.pal.narcolepsy.agent-pane.v1'
      const DRAFT_QUEUE_KEY = 'snooze.pal.narcolepsy.initial-drafts.v1'

      const clampWidth = (value) => {
        const n = Number(value)
        if (!Number.isFinite(n)) return AGENT_DEFAULT
        return Math.min(AGENT_MAX, Math.max(AGENT_MIN, n))
      }
      /** 对齐到步进：键盘与鼠标落在同一组取值上 */
      const snapWidth = (value) => clampWidth(Math.round(value / AGENT_STEP) * AGENT_STEP)
      const round4 = (n) => Math.round(n * 10000) / 10000

      function loadWidth() {
        try {
          const saved = JSON.parse(localStorage.getItem(WIDTH_KEY) || 'null')
          // 读回来必须再过一遍 clamp：本地存过 0.9 也不该真的开出 90%
          return Number.isFinite(Number(saved?.width)) ? clampWidth(saved.width) : AGENT_DEFAULT
        } catch { return AGENT_DEFAULT }
      }
      function saveWidth(width) {
        try { localStorage.setItem(WIDTH_KEY, JSON.stringify({ width: round4(width) })) } catch { /* 隐私模式忽略 */ }
      }

      /* ---------------- 样式（小睡宝主色 #5B67D8，配中性冷灰蓝） ---------------- */

      const rootStyle = {
        display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, minWidth: 0,
        width: '100%', maxWidth: '100%', boxSizing: 'border-box',
        background: '#f7f8fc', fontFamily: '-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif',
      }
      // 首个子元素必须是语义 <header>
      const headerStyle = {
        display: 'flex', alignItems: 'center', gap: 10, flex: '0 0 auto', flexWrap: 'wrap',
        padding: '6px 12px', paddingInlineStart: 'var(--dsh-frame-leading-clearance, 12px)',
        borderBottom: '1px solid #e3e8f2', background: '#f2f4fb', fontSize: 12,
      }
      const brandStyle = {
        display: 'flex', alignItems: 'center', gap: 7, fontWeight: 700, color: '#3b45a0',
        whiteSpace: 'nowrap', fontSize: 12.5,
      }
      const verStyle = {
        fontWeight: 500, fontSize: 11, color: '#6b7690', background: '#e8ebf5',
        borderRadius: 999, padding: '1px 8px', whiteSpace: 'nowrap',
      }
      const hintStyle = { flex: 1, minWidth: 200, color: '#8e96a8', fontSize: 11.5 }
      const headerActionsStyle = { display: 'flex', alignItems: 'center', gap: 6, flex: '0 0 auto', marginLeft: 'auto' }
      const bodyStyle = { position: 'relative', display: 'flex', flex: 1, minHeight: 0, minWidth: 0, overflow: 'hidden' }
      const businessStyle = { flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }
      const frameStyle = { flex: '1 1 auto', width: '100%', minHeight: 0, border: 0, display: 'block' }
      const paneStyle = {
        display: 'flex', flexDirection: 'column', flex: '0 0 auto', minWidth: 0, minHeight: 0,
        borderLeft: '1px solid #e3e8f2', background: '#fff', overflow: 'hidden',
      }
      const drawerStyle = {
        position: 'absolute', top: 0, right: 0, bottom: 0, zIndex: 3,
        boxShadow: '-8px 0 24px rgba(59, 69, 160, 0.14)',
      }
      const splitterStyle = {
        position: 'absolute', top: 0, bottom: 0, width: 1, marginRight: -0.5,
        zIndex: 2, background: '#E4DFEA', cursor: 'col-resize', touchAction: 'none',
        transition: 'background .15s ease, box-shadow .15s ease',
      }

      /* 分隔线（全家族统一行为）：悬停显示本工作台同色系增亮色 + 拖动把手；按住左右拖动调 AI 面板宽度 */
      const SPLITTER_BRAND = '#3b45a0'
      const splitterMix = (hex, ratio) => {
        const n = parseInt(String(hex).replace('#', ''), 16)
        const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
        const mix = (c) => Math.round(c + (255 - c) * ratio)
        return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`
      }
      const splitterRgba = (hex, alpha) => {
        const n = parseInt(String(hex).replace('#', ''), 16)
        return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
      }
      const splitterHoverStyle = {
        ...splitterStyle,
        background: SPLITTER_BRAND,
        boxShadow: `0 0 6px ${splitterRgba(SPLITTER_BRAND, 0.55)}`,
      }
      const splitterDragStyle = {
        ...splitterHoverStyle,
        boxShadow: `0 0 10px ${splitterRgba(SPLITTER_BRAND, 0.8)}`,
      }
      const splitterHitStyle = {
        position: 'absolute', top: 0, bottom: 0, left: -5, width: 11,
        background: 'transparent', cursor: 'col-resize',
      }
      const splitterGripStyle = {
        position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        width: 14, height: 22, borderRadius: 4, background: SPLITTER_BRAND,
        color: '#fff', fontSize: 11, lineHeight: '22px', letterSpacing: '-1px', textAlign: 'center',
        opacity: 0.95, pointerEvents: 'none', userSelect: 'none',
        boxShadow: '0 1px 4px rgba(0, 0, 0, 0.18)',
      }
      const splitterFocusStyle = {
        ...splitterStyle, background: SPLITTER_BRAND,
        boxShadow: `0 0 0 1px ${splitterRgba(SPLITTER_BRAND, 0.5)}`,
      }
      const dragShieldStyle = {
        position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 4,
        cursor: 'col-resize', background: 'transparent', touchAction: 'none',
      }
      const fallbackStyle = { padding: 24, color: '#3b45a0', fontSize: 14, lineHeight: 1.7 }
      const buttonStyle = {
        border: 0, borderRadius: 999, padding: '5px 14px', whiteSpace: 'nowrap',
        background: '#5b67d8', color: '#fff', font: 'inherit', fontWeight: 600, cursor: 'pointer',
      }
      const ghostStyle = { ...buttonStyle, background: 'transparent', color: '#5b67d8', border: '1px solid #d7dcef' }
      const padStyle = {
        display: 'flex', flexDirection: 'column', gap: 8, justifyContent: 'center',
        padding: 20, color: '#5a6480', fontSize: 12.5, lineHeight: 1.75,
      }

      function Fallback({ onRetry }) {
        return h('div', { style: fallbackStyle },
          h('p', null, `页面没能加载（v${VERSION} · ${UI_ENTRY}）。常见原因是 Harness 刚重启、插件还没加载完。`),
          h('p', null, '本工作台的数据只存在你选择的本机目录里，不会因为这个提示丢失。'),
          h('button', { type: 'button', style: buttonStyle, onClick: onRetry }, '重新加载'),
        )
      }

      /* ---------------- 会话判定 ---------------- */

      let bridge = null
      function currentSession() {
        const service = bridge?.desktopWorkbenches
        if (typeof service?.currentSession === 'function') return service.currentSession() || null
        const snapshot = bridge?.sessions?.list?.getSnapshot?.()
        return snapshot?.current || Object.keys(snapshot?.byId || {}).find((id) =>
          (snapshot.byId[id]?.retainedBy?.mainView ?? 0) > 0) || null
      }
      function workbenchOwnsSession(sessionId) {
        if (!sessionId) return false
        const service = bridge?.desktopWorkbenches
        if (typeof service?.ownsSession === 'function') return service.ownsSession(sessionId)
        return false
      }
      function ownedSession() {
        const id = currentSession()
        return workbenchOwnsSession(id) ? id : null
      }

      /* ---------------- 原生草稿：只填入，不发送 ---------------- */

      function fillDraft(sessionId, prompt) {
        if (!sessionId || ownedSession() !== sessionId) throw new Error('会话已切换，请回到本工作台再操作')
        const actx = bridge.sessions.scope?.(sessionId)
        const conversation = actx?.get?.('conversation')
        if (!conversation) throw new Error('对话输入不可用')
        const input = conversation.input.for(actx)
        const snapshot = input.state.getSnapshot()
        if (snapshot.occurrences?.length || (snapshot.phase && snapshot.phase !== 'plain')) {
          throw new Error('当前草稿含引用或特殊输入，请先在原生会话里处理，再交给小睡宝')
        }
        const current = snapshot.draft || ''
        input.setDraft(current.trim() ? `${current}\n\n${prompt}` : prompt)
      }

      let pendingDraft = null
      try {
        const saved = JSON.parse(localStorage.getItem(DRAFT_QUEUE_KEY) || 'null')
        if (saved?.sessionId && saved?.prompt) pendingDraft = saved
      } catch { /* 隐私模式忽略 */ }
      function rememberDraft(entry) {
        pendingDraft = entry
        try {
          if (entry) localStorage.setItem(DRAFT_QUEUE_KEY, JSON.stringify(entry))
          else localStorage.removeItem(DRAFT_QUEUE_KEY)
        } catch { /* 隐私模式忽略 */ }
      }
      function flushDraft() {
        if (!pendingDraft) return false
        try {
          fillDraft(pendingDraft.sessionId, pendingDraft.prompt)
          rememberDraft(null)
          return true
        } catch { return false /* composer 未就绪就留给下一轮 */ }
      }

      function onboardingPrompt(dir) {
        return [
          '你正在协助我使用「小睡宝 SnoozePal 发作性睡病工作台」。它只做本机资料整理，不提供诊疗建议。',
          `资料目录：${dir || '（首次打开时在面板里选择）'}`,
          '里面是我的嗜睡发作记录、ESS 量表、夜间睡眠事件、用药与耐受、检查指标、就诊问题清单。',
          '分工：你帮我汇总、找缺漏、把记录整理成复诊能带走的对照表；判断和决定由我和医生做。',
          '几条边界请一起遵守：不要替我估 ESS 分数、不要改写我写的"看法"、不要根据记录建议加药减药、不要判断我能不能开车。',
        ].join('\n')
      }

      /* ---------------- 面板（customFrame） ---------------- */

      function Panel({ conversation }) {
        const [generation, setGeneration] = React.useState(0)
        const [broken, setBroken] = React.useState(false)
        const [note, setNote] = React.useState('')
        const [width, setWidth] = React.useState(loadWidth)
        const [paneOpen, setPaneOpen] = React.useState(true)
        const [connecting, setConnecting] = React.useState(false)
        const [narrow, setNarrow] = React.useState(false)
        const [dragging, setDragging] = React.useState(false)
        const [hovering, setHovering] = React.useState(false)

        const brokenTimer = React.useRef(null)
        const shellRef = React.useRef(null)
        const dragHostRef = React.useRef(null)
        const frameRef = React.useRef(null)

        const hasConversation = Boolean(conversation)
        const canOpenSession = typeof bridge?.desktopWorkbenches?.ensureSession === 'function'

        // 8 秒内没有 onLoad 就当没起来：宁可给一个能重试的提示，也不留一块白板。
        // onLoad 成功后必须清掉定时器 —— 否则加载完 8 秒后面板会被换成兜底页。
        React.useEffect(() => {
          setBroken(false)
          brokenTimer.current = setTimeout(() => setBroken(true), 8000)
          return () => clearTimeout(brokenTimer.current)
        }, [generation])

        React.useEffect(() => {
          const timer = setInterval(() => { if (flushDraft()) setNote('草稿已填入会话，按回车发送') }, 500)
          const unsubscribe = bridge?.desktopWorkbenches?.subscribe?.(() => setNote(''))
          return () => { clearInterval(timer); unsubscribe?.() }
        }, [])

        // 窄屏判定用**容器宽度**而不是 window.innerWidth：业务区宽度不等于窗口宽度。
        React.useEffect(() => {
          const host = shellRef.current
          if (!host || typeof ResizeObserver !== 'function') return undefined
          const observer = new ResizeObserver((entries) => {
            const w = entries[0]?.contentRect?.width ?? 0
            setNarrow(w > 0 && w < NARROW_BELOW)
          })
          observer.observe(host)
          return () => observer.disconnect()
        }, [])

        const applyWidth = React.useCallback((next) => {
          const snapped = round4(snapWidth(next))
          setWidth(snapped)
          saveWidth(snapped)
        }, [])

        const stopDrag = React.useCallback(() => {
          dragHostRef.current = null
          setDragging(false)
        }, [])

        React.useEffect(() => {
          if (!dragging) return undefined
          const onMove = (event) => {
            const host = dragHostRef.current
            if (!host) return
            // 按**容器 rect** 夹取，不按窗口宽度
            const rect = host.getBoundingClientRect()
            if (!rect.width) return
            applyWidth((rect.right - event.clientX) / rect.width)
          }
          document.addEventListener('pointermove', onMove)
          document.addEventListener('pointerup', stopDrag)
          document.addEventListener('pointercancel', stopDrag)
          return () => {
            document.removeEventListener('pointermove', onMove)
            document.removeEventListener('pointerup', stopDrag)
            document.removeEventListener('pointercancel', stopDrag)
          }
        }, [dragging, applyWidth, stopDrag])

        const onSplitterPointerDown = (event) => {
          event.preventDefault()
          try { event.currentTarget.setPointerCapture(event.pointerId) } catch { /* 旧宿主无指针捕获：document 监听仍可拖动 */ }
          dragHostRef.current = shellRef.current
          setDragging(true)
        }

        const onSplitterKeyDown = (event) => {
          const delta = { ArrowLeft: AGENT_STEP, ArrowRight: -AGENT_STEP }[event.key] // 会话在右：← 变宽
          if (delta !== undefined) { event.preventDefault(); applyWidth(width + delta); return }
          if (event.key === 'Home') { event.preventDefault(); applyWidth(AGENT_MAX); return }
          if (event.key === 'End') { event.preventDefault(); applyWidth(AGENT_MIN) }
        }

        async function openAgent(prompt = null) {
          setNote('')
          if (!canOpenSession) {
            setNote('当前 Desktop 版本不支持从面板调起会话；请从左侧会话列表新建会话')
            return
          }
          setConnecting(true)
          try {
            let dir = null
            try {
              const res = await fetch(`${API_PREFIX}/health`)
              dir = (await res.json())?.dir || null
            } catch { /* 拿不到目录也照样调起 */ }
            const id = await bridge.desktopWorkbenches.ensureSession({ folder: dir })
            rememberDraft({ sessionId: id, prompt: prompt || onboardingPrompt(dir) })
            flushDraft()
            setPaneOpen(true)
            setNote('会话已就绪：草稿已填入右侧输入框，按回车发送')
          } catch (error) {
            setNote(`没能调起会话：${error?.message ?? error}`)
          } finally {
            setConnecting(false)
          }
        }

        // 收起只是隐藏，不是关闭/删除会话
        function onAgentClick() {
          if (!hasConversation) { void openAgent(); return }
          setPaneOpen((open) => !open)
          setNote('')
        }

        async function deliverContext(prompt) {
          const id = ownedSession()
          if (id) {
            rememberDraft({ sessionId: id, prompt })
            setPaneOpen(true)
            setNote(flushDraft()
              ? '已把这一页的内容填入会话草稿，按回车发送'
              : '会话输入框还没就绪；草稿已暂存，就绪后自动填入')
            return
          }
          setNote('正在为你调起 AI 会话…')
          await openAgent(prompt)
        }

        // handler 每轮换成最新闭包，effect 只注册一次：直接在 effect 里闭包会拿到首帧 state
        const deliverRef = React.useRef(null)
        React.useEffect(() => { deliverRef.current = deliverContext })
        React.useEffect(() => {
          function onMessage(event) {
            const data = event.data
            if (!data || typeof data !== 'object' || data.type !== 'narco:agent-draft') return
            const frame = frameRef.current
            // 不认"谁都能发"的消息：必须来自我们自己的 iframe，且同源
            if (!frame || event.source !== frame.contentWindow) return
            if (event.origin !== window.location.origin) return
            const prompt = typeof data.prompt === 'string' ? data.prompt.trim() : ''
            if (!prompt) return
            void deliverRef.current?.(prompt.slice(0, 8000))
          }
          window.addEventListener('message', onMessage)
          return () => window.removeEventListener('message', onMessage)
        }, [])

        const agentLabel = !canOpenSession
          ? 'AI 对话暂不可用'
          : connecting ? '正在连接…'
            : !hasConversation ? 'AI 对话'
              : paneOpen ? '收起 AI 对话' : '打开 AI 对话'

        if (broken) return h(Fallback, { onRetry: () => setGeneration((n) => n + 1) })

        const percent = Math.round(width * 100)
        const paneVisible = paneOpen && (hasConversation || connecting)

        return h('div', { style: rootStyle },
          h('header', { style: headerStyle },
            h('span', { style: brandStyle }, `🌙 ${TITLE}`),
            h('span', { style: verStyle }, `v${VERSION}`),
            h('span', { style: hintStyle },
              hasConversation
                ? '右侧是 DSH 原生会话：可拖中间分隔边调宽度（25%–45%），收起不会结束会话。'
                : '还没有会话。点右侧「AI 对话」调起原生会话，开场白只填进草稿，不自动发送。'),
            h('div', { style: headerActionsStyle },
              h('button', {
                type: 'button',
                style: buttonStyle,
                onClick: onAgentClick,
                disabled: connecting || !canOpenSession,
                'aria-label': `AI 对话：${agentLabel}`,
              }, agentLabel),
              // 已绑定时给一个明确的收起控件，不把关闭藏在面板内部
              hasConversation && paneOpen && h('button', {
                type: 'button', style: ghostStyle, onClick: () => setPaneOpen(false),
                'aria-label': '收起 AI 对话面板',
              }, '×'),
              note && h('span', { style: { color: '#4550c0', fontWeight: 600 } }, note),
            ),
          ),
          h('div', { ref: shellRef, style: bodyStyle },
            h('div', { style: businessStyle },
              h('iframe', {
                key: generation,
                ref: frameRef,
                src: UI_ENTRY,
                title: `${TITLE} · ${SUBTITLE}`,
                style: frameStyle,
                sandbox: 'allow-scripts allow-same-origin allow-forms allow-downloads',
                onLoad: () => { setBroken(false); clearTimeout(brokenTimer.current) },
              }),
            ),
            // splitter 只在宽屏出现：窄屏是覆盖式抽屉，拖宽没有意义
            !narrow && paneVisible && h('div', {
              role: 'separator',
              'aria-orientation': 'vertical',
              'aria-label': '调整 AI 对话面板宽度',
              'aria-valuemin': Math.round(AGENT_MIN * 100),
              'aria-valuemax': Math.round(AGENT_MAX * 100),
              'aria-valuenow': percent,
              tabIndex: 0,
              style: {
                ...(dragging ? splitterDragStyle : hovering ? splitterHoverStyle : splitterStyle),
                right: `${percent}%`,
              },
              onPointerDown: onSplitterPointerDown,
              onPointerEnter: () => setHovering(true),
              onPointerLeave: () => setHovering(false),
              onKeyDown: onSplitterKeyDown,
            }, h('span', { style: splitterHitStyle, 'aria-hidden': 'true' }),
              (hovering || dragging) ? h('span', { style: splitterGripStyle, 'aria-hidden': 'true' }, '⠿') : null),
            dragging && !narrow && h('div', { 'aria-hidden': 'true', style: dragShieldStyle }),
            // 原生会话**始终挂载**：隐藏走 display，不卸载组件
            h('aside', {
              style: {
                ...paneStyle,
                ...(narrow ? drawerStyle : null),
                width: narrow ? `min(92%, ${DRAWER_MAX}px)` : `${percent}%`,
                display: paneVisible ? 'flex' : 'none',
              },
              'aria-label': 'AI 对话',
              'aria-hidden': paneVisible ? undefined : 'true',
            }, conversation ?? h('div', { style: padStyle },
              h('b', null, 'AI 对话还没开始'),
              h('span', null, '点顶栏「AI 对话」调起 DSH 原生会话后，它会固定出现在这一侧。'),
              h('span', null, '没有会话也不影响记录：左侧的看板、嗜睡发作、ESS、一图秀照常可用。'),
            )),
          ),
        )
      }

      function apply(ctx) {
        bridge = ctx
        ctx.effect(() => ctx.desktopWorkbenches.register({
          title: TITLE,
          panelTitle: PANEL_TITLE,
          icon: '🌙',
          repository: 'https://github.com/xyb-openharness-dsh-plugins/narcolepsy-workbench',
          description: DESCRIPTION,
          audience: '发作性睡病患者本人与家长/照护者',
          requirements: '本机数据整理；不做诊断与处置建议，判断由用户与医生做出。',
          initialization: 'empty',
          embedded: true,
          version: VERSION,
          author: '小睡宝 SnoozePal 社区贡献者',
          // 三个值由 scripts/build-client.mjs 从 lib/layout.js 注入，不在这里手写第二份
          layout: { businessSide: BUSINESS_SIDE, businessWidth: BUSINESS_WIDTH },
          customFrame: CUSTOM_FRAME,
        }, Panel))
      }

      return { apply, inject: ['desktopWorkbenches', 'sessions'] }
    },
  })
})()
