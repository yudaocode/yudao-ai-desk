/* 面板宽度：持久化读取、非法值回落、夹取取整、写回、复位，以及布局 store 的展开/工具宽度 */
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createPersistedWidth } from '../../src/renderer/src/utils/persistedWidth'

/* 内存版 localStorage（vitest 为 node 环境） */
function memoryStorage(initial: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(initial))
  return {
    get length() {
      return data.size
    },
    key: (index: number) => [...data.keys()][index] ?? null,
    getItem: (key: string) => (data.has(key) ? data.get(key)! : null),
    setItem: (key: string, value: string) => {
      data.set(key, String(value))
    },
    removeItem: (key: string) => {
      data.delete(key)
    },
    clear: () => data.clear()
  }
}
const OPTIONS = { default: 240, min: 180, max: 520 }

/* 布局 store 在模块加载时读取 localStorage：每个用例重新加载模块 */
async function loadLayout(storage: Storage) {
  vi.stubGlobal('localStorage', storage)
  const { useLayoutStore } = await import('../../src/renderer/src/stores/layout')
  return useLayoutStore
}

beforeEach(() => vi.resetModules())
afterEach(() => vi.unstubAllGlobals())

it('reads a stored width inside the limits and rounds it', () => {
  vi.stubGlobal('localStorage', memoryStorage({ w: '300.6' }))
  expect(createPersistedWidth('w', OPTIONS).width).toBe(301)
})

it('falls back to the default for missing, non-numeric or out-of-range values', () => {
  for (const stored of [undefined, '', 'abc', '100', '9999', 'Infinity']) {
    vi.stubGlobal('localStorage', memoryStorage(stored === undefined ? {} : { w: stored }))
    expect(createPersistedWidth('w', OPTIONS).width, String(stored)).toBe(240)
  }
})

it('setWidth clamps, rounds and persists; resetWidth restores and persists the default', () => {
  const storage = memoryStorage()
  vi.stubGlobal('localStorage', storage)
  const width = createPersistedWidth('w', OPTIONS)
  expect([width.setWidth(1000), storage.getItem('w')]).toEqual([520, '520'])
  expect([width.setWidth(10), storage.getItem('w')]).toEqual([180, '180'])
  expect([width.setWidth(250.4), storage.getItem('w')]).toEqual([250, '250'])
  expect([width.resetWidth(), storage.getItem('w')]).toEqual([240, '240'])
})

it('layout store keeps both storage keys, limits and defaults for the left and right panels', async () => {
  const storage = memoryStorage({ 'desk-panel-width': '400', 'desk-right-panel-width': '100' })
  const useLayoutStore = await loadLayout(storage)
  const state = () => useLayoutStore.getState()
  expect([state().panelWidth, state().rightPanelWidth]).toEqual([400, 320])
  state().setPanelWidth(600)
  state().setRightPanelWidth(10)
  expect([state().panelWidth, state().rightPanelWidth]).toEqual([520, 240])
  expect([storage.getItem('desk-panel-width'), storage.getItem('desk-right-panel-width')]).toEqual([
    '520',
    '240'
  ])
  state().resetPanelWidth()
  state().resetRightPanelWidth()
  expect([state().panelWidth, state().rightPanelWidth]).toEqual([240, 320])
  expect([storage.getItem('desk-panel-width'), storage.getItem('desk-right-panel-width')]).toEqual([
    '240',
    '320'
  ])
})

it('expandSidebar only ever expands, toggleSidebar flips', async () => {
  const useLayoutStore = await loadLayout(memoryStorage())
  const state = () => useLayoutStore.getState()
  state().toggleSidebar()
  expect(state().sidebarCollapsed).toBe(true)
  state().expandSidebar()
  expect(state().sidebarCollapsed).toBe(false)
  state().expandSidebar()
  expect(state().sidebarCollapsed).toBe(false)
})

it('opening a right panel tool widens to the tool default but keeps a wider user width', async () => {
  const useLayoutStore = await loadLayout(memoryStorage())
  const state = () => useLayoutStore.getState()
  state().openRightPanelTool('browser')
  expect([state().rightPanelVisible, state().rightPanelTool, state().rightPanelWidth]).toEqual([
    true,
    'browser',
    480
  ])
  state().setRightPanelWidth(700)
  state().openRightPanelTool('files')
  expect([state().rightPanelTool, state().rightPanelWidth]).toEqual(['files', 700])
})
