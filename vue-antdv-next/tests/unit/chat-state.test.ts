/* Pinia 对话状态：并发消息加载不能覆盖新选择的会话。 */
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { SessionDTO } from '../../src/shared/ipc'
const fixture = vi.hoisted(() => ({ messages: vi.fn(), listener: null as ((event: unknown) => void) | null, subscriptions: 0, finish: null as (() => void) | null, list: vi.fn() }))
vi.mock('../../src/renderer/src/api', () => ({ api: { session: { messages: fixture.messages, list: fixture.list }, chat: { send: () => new Promise<void>((resolve) => { fixture.finish = resolve }), onEvent: (listener) => { fixture.listener = listener; fixture.subscriptions++; return () => {} } } } }))
vi.mock('antdv-next', () => ({ message: {} }))
const session = (id: string): SessionDTO => ({ id, title: id, projectId: 'project', providerId: 'provider', modelId: 'model', mode: 'build', addTime: '', updateTime: '' })
beforeEach(() => { setActivePinia(createPinia()); fixture.messages.mockReset().mockResolvedValue([]); fixture.subscriptions = 0; fixture.list.mockResolvedValue([session('a')]); fixture.finish = null })
afterEach(() => vi.useRealTimers())
it('a stale asynchronous load cannot overwrite the newer selected session', async () => {
  let finishA!: (messages: unknown[]) => void
  fixture.messages.mockImplementation((id) => id === 'a' ? new Promise((resolve) => { finishA = resolve }) : Promise.resolve([]))
  const { useChatStore } = await import('../../src/renderer/src/stores/chat')
  const chat = useChatStore(); chat.sessions = [session('a'), session('b')]
  const a = chat.selectSession('a'); await chat.selectSession('b')
  finishA([{ id: 'a-message', role: 'user', content: 'belongs to A', data: '{}', addTime: '' }]); await a
  expect(chat.currentId).toBe('b'); expect(chat.messages).toEqual([]); expect(chat.loading).toBe(false)
})
it('bind subscribes only once even when called twice', async () => {
  const { useChatStore } = await import('../../src/renderer/src/stores/chat')
  const chat = useChatStore(); chat.bind(); chat.bind(); expect(fixture.subscriptions).toBe(1)
})

it('history reconstruction retains the full assistant text for copying', async () => {
  fixture.messages.mockResolvedValue([{ id: 'saved', role: 'assistant', content: 'stored reply', data: JSON.stringify({ content: [{ type: 'text', text: 'stored reply' }] }), addTime: '' }])
  const { useChatStore } = await import('../../src/renderer/src/stores/chat')
  const chat = useChatStore(); chat.sessions = [session('a')]; chat.currentId = 'a'
  await chat.selectSession('a')
  expect(chat.messages.at(-1)?.content).toBe('stored reply')
})
it('finishing the previous round cannot erase a newer stream', async () => {
  vi.useFakeTimers()
  let finishHistory!: (messages: unknown[]) => void
  fixture.messages.mockImplementationOnce(() => new Promise((resolve) => { finishHistory = resolve }))
  const { useChatStore } = await import('../../src/renderer/src/stores/chat')
  const chat = useChatStore(); chat.sessions = [session('a')]; chat.currentId = 'a'
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
  expect(chat.messages.at(-1)?.content).toBe('new round continues')
  finishSecond()
  await second
})
