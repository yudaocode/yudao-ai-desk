/* 布局状态：左侧会话栏折叠/展开 + 宽度拖拽 */
import { create } from 'zustand'

interface LayoutState {
  sidebarCollapsed: boolean
  sidebarWidth: number
  terminalVisible: boolean
  rightPanelVisible: boolean
  rightPanelTool: '' | 'files' | 'browser'
  rightPanelMaximized: boolean
  rightPanelWidth: number
  toggleSidebar(): void
  toggleTerminal(): void
  openTerminal(): void
  toggleRightPanel(): void
  openRightPanelTool(tool: 'files' | 'browser'): void
  toggleRightPanelMaximized(): void
  setSidebarWidth(width: number): void
  setRightPanelWidth(width: number): void
}

/* 保留上游宽度边界与 localStorage key */
const DEFAULT_WIDTH = 292
const MIN_WIDTH = 220
const MAX_WIDTH = 560
const STORAGE_KEY = 'desk-sidebar-width'
const RIGHT_PANEL_DEFAULT_WIDTH = 320
const RIGHT_PANEL_MIN_WIDTH = 240
const RIGHT_PANEL_MAX_WIDTH = 720
const RIGHT_PANEL_STORAGE_KEY = 'desk-right-panel-width'
const RIGHT_PANEL_TOOL_WIDTH = { files: 560, browser: 480 }
const stored = Number(localStorage.getItem(STORAGE_KEY))
const storedRight = Number(localStorage.getItem(RIGHT_PANEL_STORAGE_KEY))

export const useLayoutStore = create<LayoutState>((set, get) => ({
  sidebarCollapsed: false,
  sidebarWidth:
    Number.isFinite(stored) && stored >= MIN_WIDTH && stored <= MAX_WIDTH ? stored : DEFAULT_WIDTH,
  terminalVisible: false,
  rightPanelVisible: false,
  rightPanelTool: '',
  rightPanelMaximized: false,
  rightPanelWidth:
    Number.isFinite(storedRight) &&
    storedRight >= RIGHT_PANEL_MIN_WIDTH &&
    storedRight <= RIGHT_PANEL_MAX_WIDTH
      ? storedRight
      : RIGHT_PANEL_DEFAULT_WIDTH,
  /* 切换侧栏折叠状态 */
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  /* 切换底部终端面板显隐 */
  toggleTerminal: () => set((state) => ({ terminalVisible: !state.terminalVisible })),
  openTerminal: () => set({ terminalVisible: true }),
  /* 重新打开右侧面板时保留放大态 */
  toggleRightPanel: () => set((state) => ({ rightPanelVisible: !state.rightPanelVisible })),
  openRightPanelTool: (tool) => {
    const state = get()
    if (!state.rightPanelVisible || state.rightPanelWidth < RIGHT_PANEL_TOOL_WIDTH[tool]) {
      state.setRightPanelWidth(RIGHT_PANEL_TOOL_WIDTH[tool])
    }
    set({ rightPanelTool: tool, rightPanelVisible: true })
  },
  toggleRightPanelMaximized: () =>
    set((state) => ({ rightPanelMaximized: !state.rightPanelMaximized })),
  /* 设置宽度：夹取到合理区间并持久化 */
  setSidebarWidth: (width) => {
    const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(width)))
    set({ sidebarWidth: next })
    localStorage.setItem(STORAGE_KEY, String(next))
  },
  setRightPanelWidth: (width) => {
    const next = Math.min(RIGHT_PANEL_MAX_WIDTH, Math.max(RIGHT_PANEL_MIN_WIDTH, Math.round(width)))
    set({ rightPanelWidth: next })
    localStorage.setItem(RIGHT_PANEL_STORAGE_KEY, String(next))
  }
}))
