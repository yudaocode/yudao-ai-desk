/* 面板宽度：持久化读取、非法值回落、夹取取整、写回、复位，以及布局 store 的展开/工具宽度 */
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createPersistedWidth } from '../../src/renderer/src/utils/persistedWidth'

/* 内存版 localStorage（vitest 为 node 环境） */
function memoryStorage(initial: Record<string, string> = {}): Storage & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial))
  return {
    data,
    get length() { return data.size },
    key: (index: number) => [...data.keys()][index] ?? null,
    getItem: (key: string) => (data.has(key) ? data.get(key)! : null),
    setItem: (key: string, value: string) => { data.set(key, String(value)) },
    removeItem: (key: string) => { data.delete(key) },
    clear: () => data.clear()
  }
}
const OPTIONS = { default: 240, min: 180, max: 520 }

beforeEach(() => setActivePinia(createPinia()))
afterEach(() => vi.unstubAllGlobals())

it('reads a stored width inside the limits and rounds it', () => {
  vi.stubGlobal('localStorage', memoryStorage({ w: '300.6' }))
  expect(createPersistedWidth('w', OPTIONS).width.value).toBe(301)
})

it('falls back to the default for missing, non-numeric or out-of-range values', () => {
  for (const stored of [undefined, '', 'abc', '100', '9999', 'Infinity']) {
    vi.stubGlobal('localStorage', memoryStorage(stored === undefined ? {} : { w: stored }))
    expect(createPersistedWidth('w', OPTIONS).width.value, String(stored)).toBe(240)
  }
})

it('setWidth clamps, rounds and persists; resetWidth restores and persists the default', () => {
  const storage = memoryStorage()
  vi.stubGlobal('localStorage', storage)
  const width = createPersistedWidth('w', OPTIONS)
  width.setWidth(1000)
  expect([width.width.value, storage.getItem('w')]).toEqual([520, '520'])
  width.setWidth(10)
  expect([width.width.value, storage.getItem('w')]).toEqual([180, '180'])
  width.setWidth(250.4)
  expect([width.width.value, storage.getItem('w')]).toEqual([250, '250'])
  width.resetWidth()
  expect([width.width.value, storage.getItem('w')]).toEqual([240, '240'])
})

it('layout store keeps both storage keys, limits and defaults for the left and right panels', async () => {
  const storage = memoryStorage({ 'desk-panel-width': '400', 'desk-right-panel-width': '100' })
  vi.stubGlobal('localStorage', storage)
  const { useLayoutStore } = await import('../../src/renderer/src/stores/layout')
  const layout = useLayoutStore()
  expect([layout.panelWidth, layout.rightPanelWidth]).toEqual([400, 320])
  layout.setPanelWidth(600)
  layout.setRightPanelWidth(10)
  expect([layout.panelWidth, layout.rightPanelWidth]).toEqual([520, 240])
  expect([storage.getItem('desk-panel-width'), storage.getItem('desk-right-panel-width')]).toEqual(['520', '240'])
  layout.resetPanelWidth()
  layout.resetRightPanelWidth()
  expect([layout.panelWidth, layout.rightPanelWidth]).toEqual([240, 320])
  expect([storage.getItem('desk-panel-width'), storage.getItem('desk-right-panel-width')]).toEqual(['240', '320'])
})

it('expandSidebar only ever expands, toggleSidebar flips', async () => {
  vi.stubGlobal('localStorage', memoryStorage())
  const { useLayoutStore } = await import('../../src/renderer/src/stores/layout')
  const layout = useLayoutStore()
  layout.toggleSidebar()
  expect(layout.sidebarCollapsed).toBe(true)
  layout.expandSidebar()
  expect(layout.sidebarCollapsed).toBe(false)
  layout.expandSidebar()
  expect(layout.sidebarCollapsed).toBe(false)
})

it('opening a right panel tool widens to the tool default but keeps a wider user width', async () => {
  vi.stubGlobal('localStorage', memoryStorage())
  const { useLayoutStore } = await import('../../src/renderer/src/stores/layout')
  const layout = useLayoutStore()
  layout.openRightPanelTool('browser')
  expect([layout.rightPanelVisible, layout.rightPanelTool, layout.rightPanelWidth]).toEqual([true, 'browser', 480])
  layout.setRightPanelWidth(700)
  layout.openRightPanelTool('files')
  expect([layout.rightPanelTool, layout.rightPanelWidth]).toEqual(['files', 700])
})
