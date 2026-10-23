/* 对话编排服务：校验运行时目标、失败轮次落库、成功落库与异常兜底；运行时进程与数据服务均为替身，不访问模型与数据库。 */
import { beforeEach, expect, it, vi } from 'vitest'

const fixture = vi.hoisted(() => ({
  getSettings: vi.fn(),
  getProvider: vi.fn(),
  getSession: vi.fn(),
  listMessages: vi.fn(),
  replaceMessages: vi.fn(),
  updateSession: vi.fn(),
  getProject: vi.fn(),
  runAgent: vi.fn(),
  abortAgent: vi.fn(),
  evictAgent: vi.fn(),
  resolveApproval: vi.fn()
}))
vi.mock('electron', () => ({ app: { getPath: () => '/home/desk' } }))
vi.mock('../../src/main/services/settingsService', () => ({ getSettings: fixture.getSettings }))
vi.mock('../../src/main/services/providerService', () => ({ getProvider: fixture.getProvider }))
vi.mock('../../src/main/services/sessionService', () => ({
  getSession: fixture.getSession,
  listMessages: fixture.listMessages,
  replaceMessages: fixture.replaceMessages,
  updateSession: fixture.updateSession
}))
vi.mock('../../src/main/services/projectService', () => ({ getProject: fixture.getProject }))
vi.mock('../../src/main/services/envService', () => ({ buildRuntimePath: () => '/runtime/bin' }))
vi.mock('../../src/main/agent/host/runtimeHost', () => ({
  runAgent: fixture.runAgent,
  abortAgent: fixture.abortAgent,
  evictAgent: fixture.evictAgent
}))
vi.mock('../../src/main/agent/host/approval', () => ({ resolveApproval: fixture.resolveApproval }))

import { abortChat, respondApproval, sendChat } from '../../src/main/services/chatService'

const session = (patch = {}) => ({
  id: 's1',
  title: '已有标题',
  projectId: 'project',
  providerId: 'p1',
  modelId: 'm1',
  mode: 'build',
  addTime: '',
  updateTime: '',
  ...patch
})
const provider = (patch = {}) => ({
  id: 'p1',
  name: 'Demo',
  baseUrl: 'http://127.0.0.1:1/v1',
  apiKey: 'key',
  headers: {},
  models: ['m1'],
  enabled: true,
  ...patch
})
const stored = { role: 'user', content: 'earlier', data: JSON.stringify({ role: 'user', content: 'earlier' }) }
const failureRound = (tip: string) => [
  stored,
  { role: 'user', content: 'hello', data: JSON.stringify({ role: 'user', content: 'hello' }) },
  { role: 'assistant', content: tip, data: JSON.stringify({ role: 'assistant', stopReason: 'error', errorMessage: tip }) }
]

beforeEach(() => {
  Object.values(fixture).forEach((mock) => mock.mockReset())
  fixture.getSettings.mockReturnValue({ systemPrompt: 'SYSTEM', providerId: '', modelId: '' })
  fixture.getProvider.mockReturnValue(provider())
  fixture.getSession.mockReturnValue(session())
  fixture.getProject.mockReturnValue({ id: 'project', path: '/work/demo' })
  fixture.listMessages.mockReturnValue([{ id: 'x', sessionId: 's1', seq: 1, addTime: '', ...stored }])
})

it('missing session only emits an error and persists nothing', async () => {
  fixture.getSession.mockReturnValue(null)
  const emit = vi.fn()
  await sendChat({ sessionId: 's1', text: 'hello' }, emit)
  expect(emit).toHaveBeenCalledExactlyOnceWith({ sessionId: 's1', type: 'error', message: '会话不存在' })
  expect(fixture.replaceMessages).not.toHaveBeenCalled()
  expect(fixture.runAgent).not.toHaveBeenCalled()
})

it.each([
  ['disabled provider', () => fixture.getProvider.mockReturnValue(provider({ enabled: false })), '供应商「Demo」已停用，请在会话中重新选择模型'],
  ['removed model', () => fixture.getSession.mockReturnValue(session({ modelId: 'gone' })), '模型「gone」不存在或已被删除，请在会话中重新选择模型']
])('%s persists a failure round and emits the tip', async (_name, arrange, tip) => {
  arrange()
  const emit = vi.fn()
  await sendChat({ sessionId: 's1', text: 'hello' }, emit)
  expect(fixture.runAgent).not.toHaveBeenCalled()
  expect(fixture.replaceMessages).toHaveBeenCalledExactlyOnceWith('s1', failureRound(tip))
  expect(emit).toHaveBeenCalledExactlyOnceWith({ sessionId: 's1', type: 'error', message: tip })
})

it('runtime failure persists a failure round with provider and model context', async () => {
  fixture.runAgent.mockResolvedValue({ ok: false, message: 'boom' })
  const emit = vi.fn()
  await sendChat({ sessionId: 's1', text: 'hello' }, emit)
  const tip = '模型「m1」（供应商「Demo」）调用失败：boom'
  expect(fixture.replaceMessages).toHaveBeenCalledExactlyOnceWith('s1', failureRound(tip))
  /* 上游既有行为：上下文就绪后下发的错误会再经 describeError 包装一次，此处只断言包含落库提示 */
  expect(emit).toHaveBeenLastCalledWith({ sessionId: 's1', type: 'error', message: expect.stringContaining(tip) })
})

it('success drops system messages, appends a readable tip to failed assistant messages and forwards events', async () => {
  fixture.getSession.mockReturnValue(session({ title: '新对话' }))
  fixture.listMessages.mockReturnValue([
    { id: 'sys', sessionId: 's1', seq: 0, role: 'system', content: 'old', data: JSON.stringify({ role: 'system', content: 'old' }), addTime: '' },
    { id: 'x', sessionId: 's1', seq: 1, addTime: '', ...stored }
  ])
  const assistant = { role: 'assistant', content: [{ type: 'text', text: 'partial' }], stopReason: 'error', errorMessage: 'No API key' }
  fixture.runAgent.mockImplementation(async (_input, onEvent) => {
    onEvent({ type: 'delta', text: 'partial' })
    onEvent({ type: 'error', message: 'No API key' })
    return { ok: true, messages: [{ role: 'system', content: 'SYSTEM' }, { role: 'user', content: 'hello' }, assistant] }
  })
  const emit = vi.fn()
  await sendChat({ sessionId: 's1', text: 'hello' }, emit)

  expect(fixture.updateSession).toHaveBeenCalledWith('s1', { title: 'hello' })
  const [input] = fixture.runAgent.mock.calls[0]
  expect(input).toMatchObject({ sessionId: 's1', modelId: 'm1', mode: 'build', rootDir: '/work/demo', runtimePath: '/runtime/bin', text: 'hello' })
  expect(input.systemPrompt.startsWith('SYSTEM')).toBe(true)
  expect(input.messages).toEqual([{ role: 'user', content: 'earlier' }])

  const tip = '供应商「Demo」未配置 API Key，无法调用模型「m1」，请在「设置」中补全后重试'
  expect(emit.mock.calls.map(([payload]) => payload)).toEqual([
    { sessionId: 's1', type: 'delta', text: 'partial' },
    { sessionId: 's1', type: 'error', message: tip }
  ])
  expect(fixture.replaceMessages).toHaveBeenCalledExactlyOnceWith('s1', [
    { role: 'user', content: 'hello', data: JSON.stringify({ role: 'user', content: 'hello' }) },
    { role: 'assistant', content: `partial\n\n${tip}`, data: JSON.stringify(assistant) }
  ])
})

it('unexpected errors evict the runtime and persist a failure round', async () => {
  fixture.runAgent.mockResolvedValue({ ok: true, messages: [{ role: 'user', content: 'hello' }] })
  fixture.replaceMessages.mockImplementationOnce(() => {
    throw new Error('disk full')
  })
  const emit = vi.fn()
  await sendChat({ sessionId: 's1', text: 'hello' }, emit)
  const tip = '模型「m1」（供应商「Demo」）调用失败：disk full'
  expect(fixture.evictAgent).toHaveBeenCalledWith('s1')
  expect(fixture.replaceMessages).toHaveBeenLastCalledWith('s1', failureRound(tip))
  expect(emit).toHaveBeenLastCalledWith({ sessionId: 's1', type: 'error', message: expect.stringContaining(tip) })
})

it('abort and approval delegate to the runtime host', async () => {
  await abortChat('s1')
  respondApproval('r1', 'once')
  expect(fixture.abortAgent).toHaveBeenCalledWith('s1')
  expect(fixture.resolveApproval).toHaveBeenCalledWith('r1', 'once')
})
