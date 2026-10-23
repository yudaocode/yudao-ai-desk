/* 布局状态：左侧栏折叠/宽度、底部终端、右侧侧栏（侧边任务） */

import { defineStore } from 'pinia'
import { ref } from 'vue'
import { createPersistedWidth } from '@renderer/utils/persistedWidth'

export const useLayoutStore = defineStore('layout', () => {
  /* 左侧子菜单栏宽度：三板块共用（拖拽调整、持久化、双击复位） */
  const panel = createPersistedWidth('desk-panel-width', { default: 240, min: 180, max: 520 })

  /* 左侧栏是否折叠（折叠后仅保留图标栏，内容区铺满） */
  const sidebarCollapsed = ref(false)

  /* 底部终端面板是否展示（默认隐藏） */
  const terminalVisible = ref(false)

  /* 右侧侧栏（侧边任务）是否展示（默认隐藏） */
  const rightPanelVisible = ref(false)

  /* 右侧侧栏当前工具：'' 表示未选择（展示工具菜单），files/browser 为具体面板 */
  const rightPanelTool = ref<'' | 'files' | 'browser'>('')

  /* 右侧侧栏是否放大占满正文区 */
  const rightPanelMaximized = ref(false)

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

  /* 切换侧栏折叠状态 */
  function toggleSidebar(): void {
    sidebarCollapsed.value = !sidebarCollapsed.value
  }

  /* 展开侧栏（图标栏点击入口时还原完整子菜单栏） */
  function expandSidebar(): void {
    sidebarCollapsed.value = false
  }

  /* 切换底部终端面板显隐 */
  function toggleTerminal(): void {
    terminalVisible.value = !terminalVisible.value
  }

  /* 打开底部终端面板（已打开则保持） */
  function openTerminal(): void {
    terminalVisible.value = true
  }

  /* 切换右侧侧栏显隐（保留放大态，重新打开时维持全屏） */
  function toggleRightPanel(): void {
    rightPanelVisible.value = !rightPanelVisible.value
  }

  /* 打开右侧侧栏并定位到指定工具（宽度不足时套用该工具默认宽度） */
  function openRightPanelTool(tool: 'files' | 'browser'): void {
    const defaultWidth = RIGHT_PANEL_TOOL_WIDTH[tool]
    if (!rightPanelVisible.value || rightPanel.width.value < defaultWidth) {
      rightPanel.setWidth(defaultWidth)
    }
    rightPanelTool.value = tool
    rightPanelVisible.value = true
  }

  /* 切换右侧侧栏放大态（放大后占满正文区） */
  function toggleRightPanelMaximized(): void {
    rightPanelMaximized.value = !rightPanelMaximized.value
  }

  return {
    sidebarCollapsed,
    panelWidth: panel.width,
    setPanelWidth: panel.setWidth,
    resetPanelWidth: panel.resetWidth,
    terminalVisible,
    rightPanelVisible,
    rightPanelTool,
    rightPanelMaximized,
    rightPanelWidth: rightPanel.width,
    resetRightPanelWidth: rightPanel.resetWidth,
    toggleSidebar,
    expandSidebar,
    toggleTerminal,
    openTerminal,
    toggleRightPanel,
    openRightPanelTool,
    toggleRightPanelMaximized,
    setRightPanelWidth: rightPanel.setWidth
  }
})
