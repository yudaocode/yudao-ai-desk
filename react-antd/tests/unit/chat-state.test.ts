/* React 状态适配的行为验证：流式缓存和异步加载不覆盖当前会话。 */
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { ChatEvent, SessionDTO } from '../../src/shared/ipc'
const fixture = vi.hoisted(() => ({ listener: null as ((event: ChatEvent) => void) | null, finish: null as (() => void) | null, off: vi.fn(), messages: vi.fn(), list: vi.fn() }))
vi.mock('../../src/renderer/src/api', () => ({ api: {
  session: { list: fixture.list, messages: fixture.messages, create: vi.fn(), rename: vi.fn(), update: vi.fn(), remove: vi.fn(), removeMessages: vi.fn() },
  chat: { onEvent: (listener) => { fixture.listener = listener; return fixture.off }, send: () => new Promise<void>((resolve) => { fixture.finish = resolve }), abort: vi.fn() }
} }))
vi.mock('antd', () => ({ message: { success: vi.fn(), error: vi.fn() } }))
const session = (id: string): SessionDTO => ({ id, title: id, projectId: 'project', providerId: 'provider', modelId: 'model', mode: 'build', addTime: '', updateTime: '' })
beforeEach(() => { vi.resetModules(); fixture.off.mockClear(); fixture.messages.mockReset().mockResolvedValue([]); fixture.list.mockReset().mockResolvedValue([session('a'), session('b')]); fixture.listener = null; fixture.finish = null })
afterEach(() => { vi.useRealTimers() })
it('publishes immutable snapshots without leaking background session tokens', async () => {
  vi.useFakeTimers()
  const { useChatStore } = await import('../../src/renderer/src/stores/chat')
  useChatStore.setState({ sessions: [session('a'), session('b')], currentId: 'a' })
  const chat = useChatStore.getState(); chat.bind(); const sending = chat.send('question')
  fixture.listener!({ sessionId: 'a', type: 'delta', text: 'first' }); await vi.advanceTimersByTimeAsync(90)
  const snapshot = useChatStore.getState().messages
  expect(snapshot.at(-1)?.content).toBe('first')
  await chat.selectSession('b'); fixture.listener!({ sessionId: 'a', type: 'delta', text: ' second' }); await vi.advanceTimersByTimeAsync(90)
  expect(useChatStore.getState().messages).toEqual([]); expect(snapshot.at(-1)?.content).toBe('first')
  await chat.selectSession('a'); expect(useChatStore.getState().messages.at(-1)?.content).toBe('first second')
  fixture.listener!({ sessionId: 'a', type: 'done' }); fixture.finish!(); await sending; chat.unbind()
})
it('a stale asynchronous load cannot overwrite the newer selected session', async () => {
  let finishA!: (messages: unknown[]) => void
  fixture.messages.mockImplementation((id) => id === 'a' ? new Promise((resolve) => { finishA = resolve }) : Promise.resolve([]))
  const { useChatStore } = await import('../../src/renderer/src/stores/chat')
  useChatStore.setState({ sessions: [session('a'), session('b')] })
  const chat = useChatStore.getState(), a = chat.selectSession('a'); await chat.selectSession('b')
  finishA([{ id: 'a-message', role: 'user', content: 'belongs to A', data: '{}', addTime: '' }]); await a
  expect(useChatStore.getState().currentId).toBe('b'); expect(useChatStore.getState().messages).toEqual([]); expect(useChatStore.getState().loading).toBe(false)
})
it('bind is idempotent and unbind releases its listener once', async () => {
  const { useChatStore } = await import('../../src/renderer/src/stores/chat')
  const chat = useChatStore.getState(); chat.bind(); chat.bind(); chat.unbind(); chat.unbind()
  expect(fixture.off).toHaveBeenCalledTimes(1)
})

it('history reconstruction retains the full assistant text for copying', async () => {
  fixture.messages.mockResolvedValue([{ id: 'saved', role: 'assistant', content: 'stored reply', data: JSON.stringify({ content: [{ type: 'text', text: 'stored reply' }] }), addTime: '' }])
  const { useChatStore } = await import('../../src/renderer/src/stores/chat')
  useChatStore.setState({ sessions: [session('a')], currentId: 'a' }); const chat = useChatStore.getState()
  await chat.selectSession('a')
  expect(useChatStore.getState().messages.at(-1)?.content).toBe('stored reply')
})
it('finishing the previous round cannot erase a newer stream', async () => {
  vi.useFakeTimers()
  let finishHistory!: (messages: unknown[]) => void
  fixture.messages.mockImplementationOnce(() => new Promise((resolve) => { finishHistory = resolve }))
  const { useChatStore } = await import('../../src/renderer/src/stores/chat')
  useChatStore.setState({ sessions: [session('a')], currentId: 'a' }); const chat = useChatStore.getState()
  chat.bind()
  const first = chat.send('first')
  fixture.finish!()
  await vi.advanceTimersByTimeAsync(0)
  expect(finishHistory).toBeTypeOf('function')
  const second = chat.send('second')
  const finishSecond = fixture.finish!
  fixture.listener!({ sessionId: 'a', type: 'delta', text: 'new round' })
  await vi.advanceTimersByTimeAsync(90)
  finishHistory([])
  await first
  fixture.listener!({ sessionId: 'a', type: 'delta', text: ' continues' })
  await vi.advanceTimersByTimeAsync(90)
  expect(useChatStore.getState().messages.at(-1)?.content).toBe('new round continues')
  finishSecond()
  await second
})
