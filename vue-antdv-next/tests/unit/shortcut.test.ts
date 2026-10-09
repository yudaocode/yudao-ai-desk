/* 快捷键：实际平台修饰键映射和精确匹配，防止录制/执行不一致。 */
import { afterEach, describe, expect, it, vi } from 'vitest'
afterEach(() => { vi.unstubAllGlobals(); vi.resetModules() })
describe.each(['Macintosh', 'Windows'])('shortcuts on %s', (platform) => {
  async function shortcuts() { vi.stubGlobal('navigator', { userAgent: platform }); return import('../../src/renderer/src/utils/shortcut') }
  const event = (patch: Partial<KeyboardEvent>) => ({ key: 'k', metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...patch }) as KeyboardEvent
  it('records and matches mod key according to platform', async () => { const api = await shortcuts(), input = event(platform === 'Macintosh' ? { metaKey: true } : { ctrlKey: true }); expect(api.eventToBinding(input)).toBe('mod+k'); expect(api.matchShortcut(input, 'mod+k')).toBe(true) })
  it('does not match an extra modifier', async () => { const api = await shortcuts(), input = event(platform === 'Macintosh' ? { metaKey: true, shiftKey: true } : { ctrlKey: true, shiftKey: true }); expect(api.matchShortcut(input, 'mod+k')).toBe(false); expect(api.matchShortcut(input, 'mod+shift+k')).toBe(true) })
  it('normalizes space and ignores modifier-only recordings', async () => { const api = await shortcuts(); expect(api.eventToBinding(event({ key: ' ' }))).toBe('space'); expect(api.isModifierKey(event({ key: 'Meta' }))).toBe(true); expect(api.matchShortcut(event({ key: 'x' }), '')).toBe(false) })
})
