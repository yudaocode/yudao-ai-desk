/* 布局状态：左侧栏折叠/宽度、底部终端、右侧侧栏（侧边任务） */

import { create } from 'zustand'
import { createPersistedWidth } from '@renderer/utils/persistedWidth'

interface LayoutState {
  sidebarCollapsed: boolean
  panelWidth: number
  terminalVisible: boolean
  rightPanelVisible: boolean
  rightPanelTool: '' | 'files' | 'browser'
  rightPanelMaximized: boolean
  rightPanelWidth: number
  setPanelWidth(width: number): void
  resetPanelWidth(): void
  resetRightPanelWidth(): void
  toggleSidebar(): void
  expandSidebar(): void
  toggleTerminal(): void
  openTerminal(): void
  toggleRightPanel(): void
  openRightPanelTool(tool: 'files' | 'browser'): void
  toggleRightPanelMaximized(): void
  setRightPanelWidth(width: number): void
}

/* 左侧子菜单栏宽度：三板块共用（拖拽调整、持久化、双击复位） */
const panel = createPersistedWidth('desk-panel-width', { default: 240, min: 180, max: 520 })

/* 各工具的默认面板宽度（首次打开时套用，之后沿用用户拖拽宽度） */
const RIGHT_PANEL_TOOL_WIDTH: Record<'files' | 'browser', number> = {
  files: 560,
  browser: 480
}

/* 右侧侧栏宽度（拖拽调整、持久化） */
const rightPanel = createPersistedWidth('desk-right-panel-width', {
  default: 320,
  min: 240,
  max: 720
})

export const useLayoutStore = create<LayoutState>((set, get) => ({
  /* 左侧栏是否折叠（折叠后仅保留图标栏，内容区铺满） */
  sidebarCollapsed: false,
  panelWidth: panel.width,
  /* 底部终端面板是否展示（默认隐藏） */
  terminalVisible: false,
  /* 右侧侧栏（侧边任务）是否展示（默认隐藏） */
  rightPanelVisible: false,
  /* 右侧侧栏当前工具：'' 表示未选择（展示工具菜单），files/browser 为具体面板 */
  rightPanelTool: '',
  /* 右侧侧栏是否放大占满正文区 */
  rightPanelMaximized: false,
  rightPanelWidth: rightPanel.width,
  setPanelWidth: (width) => set({ panelWidth: panel.setWidth(width) }),
  resetPanelWidth: () => set({ panelWidth: panel.resetWidth() }),
  resetRightPanelWidth: () => set({ rightPanelWidth: rightPanel.resetWidth() }),
  /* 切换侧栏折叠状态 */
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  /* 展开侧栏（图标栏点击入口时还原完整子菜单栏） */
  expandSidebar: () => set({ sidebarCollapsed: false }),
  /* 切换底部终端面板显隐 */
  toggleTerminal: () => set((state) => ({ terminalVisible: !state.terminalVisible })),
  /* 打开底部终端面板（已打开则保持） */
  openTerminal: () => set({ terminalVisible: true }),
  /* 切换右侧侧栏显隐（保留放大态，重新打开时维持全屏） */
  toggleRightPanel: () => set((state) => ({ rightPanelVisible: !state.rightPanelVisible })),
  /* 打开右侧侧栏并定位到指定工具（宽度不足时套用该工具默认宽度） */
  openRightPanelTool: (tool) => {
    const state = get()
    const defaultWidth = RIGHT_PANEL_TOOL_WIDTH[tool]
    if (!state.rightPanelVisible || state.rightPanelWidth < defaultWidth) {
      state.setRightPanelWidth(defaultWidth)
    }
    set({ rightPanelTool: tool, rightPanelVisible: true })
  },
  /* 切换右侧侧栏放大态（放大后占满正文区） */
  toggleRightPanelMaximized: () =>
    set((state) => ({ rightPanelMaximized: !state.rightPanelMaximized })),
  setRightPanelWidth: (width) => set({ rightPanelWidth: rightPanel.setWidth(width) })
}))
