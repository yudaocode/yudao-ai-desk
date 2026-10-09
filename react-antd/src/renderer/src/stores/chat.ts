/*
 * 对话状态：会话列表、当前会话消息、流式生成与事件订阅
 */

import { create } from 'zustand'
import { api } from '../api'
import { useProjectStore } from './project'
import { useSettingsStore } from './settings'
import type { ChatMode, ChatEvent, SessionDTO, StoredMessage } from '../../../shared/ipc'
import type { MessagePart, ToolCallState, UiMessage } from '../types'

/* 生成 UI 消息 id */
function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

/* 持久化的 Pi 原始消息结构（仅取渲染所需字段） */
interface RawPart {
  type?: string
  text?: string
  thinking?: string
  redacted?: boolean
  id?: string
  name?: string
  arguments?: unknown
}
interface RawMessage {
  role?: string
  content?: RawPart[]
  stopReason?: string
  errorMessage?: string
  toolCallId?: string
  isError?: boolean
}

/* 安全解析持久化的原始消息 JSON */
function parseData(data: string): RawMessage | null {
  try {
    return JSON.parse(data) as RawMessage
  } catch {
    return null
  }
}

/* 向助手消息追加片段：同类相邻文本合并，保持片段发生顺序（思考 → 工具 → 正文 交错） */
function appendPart(message: UiMessage, part: MessagePart): void {
  if (part.type === 'thinking' || part.type === 'text') {
    const last = message.parts[message.parts.length - 1]
    if (last && last.type === part.type) {
      last.text += part.text
      return
    }
  }
  message.parts.push(part)
}

/* 回填助手消息正文：拼接全部正文片段（供复制、列表预览与滚动跟随） */
function refreshContent(message: UiMessage): void {
  message.content = message.parts
    .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
    .map((part) => part.text)
    .join('\n\n')
}

/* 原始文本内容块 → 纯文本（工具结果展示用） */
function contentToPlain(raw: RawMessage | null): string {
  const content = raw?.content
  if (!Array.isArray(content)) {
    return ''
  }
  return content
    .filter((part) => part.type === 'text')
    .map((part) => part.text ?? '')
    .join('\n')
}

/*
 * 持久化消息集合 → UI 消息（按「轮次」折叠，并保留片段发生顺序）。
 *   - 一轮对话中 Agent 会分多次产出 assistant 片段（工具调用轮），并伴随 toolResult；
 *   - 折叠为「一条用户消息 + 一条助手消息」，助手消息内部按顺序记录 思考/正文/工具 片段，
 *     据此还原完整的执行过程，而非把思考、工具堆在一起。
 */
function mapStoredMessages(stored: StoredMessage[]): UiMessage[] {
  const result: UiMessage[] = []
  /* toolCallId → 工具片段引用，供后续 toolResult 回填状态与结果 */
  const toolParts = new Map<string, ToolCallState>()

  for (const record of stored) {
    if (record.role === 'user') {
      result.push({
        id: record.id,
        role: 'user',
        content: record.content,
        parts: [],
        addTime: record.addTime
      })
      continue
    }
    /* 工具结果：回填到对应工具片段 */
    if (record.role === 'toolResult') {
      const raw = parseData(record.data)
      const tool = raw?.toolCallId ? toolParts.get(raw.toolCallId) : undefined
      if (tool) {
        tool.status = raw?.isError ? 'error' : 'done'
        tool.result = contentToPlain(raw)
      }
      continue
    }
    if (record.role !== 'assistant') continue

    const raw = parseData(record.data)
    const parts = Array.isArray(raw?.content) ? raw.content : []
    const failed = raw?.stopReason === 'error'

    /* 合并到本轮已存在的助手消息 */
    let last = result[result.length - 1]
    if (!last || last.role !== 'assistant') {
      last = {
        id: record.id,
        role: 'assistant',
        content: '',
        parts: [],
        addTime: record.addTime,
        error: failed
      }
      result.push(last)
    } else if (failed) {
      last.error = true
    }

    /* 按原始顺序还原片段，并累计本片段的结构化正文 */
    let localText = ''
    for (const part of parts) {
      if (part.type === 'thinking' && !part.redacted && part.thinking) {
        appendPart(last, { type: 'thinking', text: part.thinking })
      } else if (part.type === 'text' && part.text) {
        appendPart(last, { type: 'text', text: part.text })
        localText += part.text
      } else if (part.type === 'toolCall') {
        const tool: ToolCallState = {
          id: part.id ?? uid(),
          name: part.name ?? 'tool',
          status: 'done',
          args: part.arguments,
          startedAt: 0
        }
        last.parts.push({ type: 'tool', tool })
        toolParts.set(tool.id, tool)
      }
    }

    /* 兜底：落库正文比结构化片段多出的部分（失败轮次追加的可读错误提示）补足展示 */
    if (record.content && record.content !== localText) {
      if (record.content.startsWith(localText)) {
        const rest = record.content.slice(localText.length)
        if (rest) {
          appendPart(last, { type: 'text', text: rest })
        }
      } else if (!localText) {
        appendPart(last, { type: 'text', text: record.content })
      }
    }
  }

  /* 历史正文与流式正文保持一致，供整条回复复制。 */
  for (const message of result) {
    if (message.role === 'assistant') refreshContent(message)
  }

  /* 剔除无任何内容的空助手消息（避免空白气泡） */
  return result.filter((message) => message.role !== 'assistant' || message.parts.length > 0)
}

/* 会话与对话状态：缓存继续按会话隔离，发布 React 状态时复制消息快照。 */
interface ChatState {
  sessions: SessionDTO[]
  currentId: string
  messages: UiMessage[]
  loading: boolean
  streamingIds: Record<string, boolean>
  loadSessions(): Promise<void>
  reloadSessions(): Promise<void>
  selectSession(id: string): Promise<void>
  createSession(projectId?: string, mode?: ChatMode): Promise<SessionDTO>
  startNewChat(): void
  removeSession(id: string): Promise<void>
  renameSession(id: string, title: string): Promise<void>
  updateSessionModel(providerId: string, modelId: string): Promise<void>
  updateSessionMode(mode: ChatMode): Promise<void>
  removeMessages(ids: string[]): Promise<void>
  send(text: string, mode?: ChatMode): Promise<void>
  abort(): Promise<void>
  bind(): void
  unbind(): void
}
interface StreamBuffer {
  delta: string
  thinking: string
  timer: ReturnType<typeof setTimeout> | null
}

export const useChatStore = create<ChatState>((set, get) => {
  let unsubscribe: (() => void) | null = null
  const streamTargets = new Map<string, string>()
  const streamBuffers = new Map<string, StreamBuffer>()
  const liveMessages = new Map<string, UiMessage[]>()
  const FLUSH_INTERVAL = 80

  /* 取（或创建）某会话的增量缓冲 */
  function bufferOf(sessionId: string): StreamBuffer {
    let buffer = streamBuffers.get(sessionId)
    if (!buffer) {
      buffer = { delta: '', thinking: '', timer: null }
      streamBuffers.set(sessionId, buffer)
    }
    return buffer
  }

  /* 定位运行时缓存中的流式助手消息，React 展示状态不直接修改 */
  function streamAssistant(sessionId: string): UiMessage | undefined {
    const id = streamTargets.get(sessionId)
    return id ? liveMessages.get(sessionId)?.find((item) => item.id === id) : undefined
  }

  /* 刷新某会话缓冲；后台会话继续累积，切回时还原 */
  function flushBuffers(sessionId: string): void {
    const buffer = streamBuffers.get(sessionId)
    if (!buffer) return
    if (buffer.timer !== null) {
      clearTimeout(buffer.timer)
      buffer.timer = null
    }
    const assistant = streamAssistant(sessionId)
    if (assistant) {
      if (buffer.thinking) appendPart(assistant, { type: 'thinking', text: buffer.thinking })
      if (buffer.delta) appendPart(assistant, { type: 'text', text: buffer.delta })
      refreshContent(assistant)
    }
    buffer.delta = ''
    buffer.thinking = ''
    if (get().currentId === sessionId)
      set({ messages: structuredClone(liveMessages.get(sessionId) ?? []) })
  }

  /* 调度增量刷新，保留上游 80ms 节流 */
  function scheduleFlush(sessionId: string): void {
    const buffer = bufferOf(sessionId)
    if (buffer.timer === null)
      buffer.timer = setTimeout(() => flushBuffers(sessionId), FLUSH_INTERVAL)
  }

  /* 主进程事件按会话路由，思考/工具/正文保留发生顺序 */
  function handleEvent(event: ChatEvent): void {
    const sessionId = event.sessionId
    if (event.type === 'delta' || event.type === 'thinking') {
      const buffer = bufferOf(sessionId)
      if (event.type === 'delta') buffer.delta += event.text ?? ''
      else buffer.thinking += event.text ?? ''
      scheduleFlush(sessionId)
      return
    }
    if (event.type === 'tool_start') {
      flushBuffers(sessionId)
      const assistant = streamAssistant(sessionId)
      if (assistant)
        assistant.parts.push({
          type: 'tool',
          tool: {
            id: event.toolCallId ?? uid(),
            name: event.toolName ?? 'tool',
            status: 'running',
            args: event.args,
            startedAt: Date.now()
          }
        })
    } else if (event.type === 'tool_end') {
      const part = streamAssistant(sessionId)?.parts.find(
        (item) => item.type === 'tool' && item.tool.id === event.toolCallId
      )
      if (part?.type === 'tool') {
        part.tool.status = event.isError ? 'error' : 'done'
        part.tool.result = event.result ?? part.tool.result
        part.tool.endedAt = Date.now()
      }
    } else if (event.type === 'error' || event.type === 'done') {
      flushBuffers(sessionId)
      const assistant = streamAssistant(sessionId)
      if (assistant) {
        if (event.type === 'error' && !assistant.error) {
          const tip = event.message ?? '请求失败'
          appendPart(assistant, { type: 'text', text: assistant.content ? `\n\n${tip}` : tip })
          refreshContent(assistant)
          assistant.error = true
        }
        assistant.pending = false
        assistant.endedAt = Date.now()
      }
      set((state) => {
        const streamingIds = { ...state.streamingIds }
        delete streamingIds[sessionId]
        return { streamingIds }
      })
    }
    if (get().currentId === sessionId && liveMessages.has(sessionId)) {
      set({ messages: structuredClone(liveMessages.get(sessionId)!) })
    }
  }

  let selectionSequence = 0

  return {
    sessions: [],
    currentId: '',
    messages: [],
    loading: false,
    streamingIds: {},
    loadSessions: async () => set({ sessions: await api.session.list() }),
    reloadSessions: async () => {
      await get().loadSessions()
      const state = get()
      if (state.currentId && !state.sessions.some((item) => item.id === state.currentId))
        set({ currentId: '', messages: [] })
    },
    /* 选择会话；后台仍在生成时直接显示缓存 */
    selectSession: async (id) => {
      const sequence = ++selectionSequence
      set({ currentId: id, loading: true })
      const target = get().sessions.find((item) => item.id === id)
      if (target) useProjectStore.getState().selectProject(target.projectId)
      try {
        const live = liveMessages.get(id)
        if (get().streamingIds[id] && live) {
          set({ messages: structuredClone(live) })
          return
        }
        const stored = await api.session.messages(id)
        const list = mapStoredMessages(stored)
        const targetId = streamTargets.get(id)
        if (get().streamingIds[id] && targetId && !list.some((item) => item.id === targetId)) {
          list.push({
            id: targetId,
            role: 'assistant',
            content: '',
            parts: [],
            addTime: new Date().toISOString(),
            startedAt: Date.now(),
            pending: true
          })
          liveMessages.set(id, list)
        }
        /* 异步加载期间切换会话后不覆盖另一会话 */
        if (get().currentId === id && selectionSequence === sequence) set({ messages: structuredClone(list) })
      } finally {
        if (get().currentId === id && selectionSequence === sequence) set({ loading: false })
      }
    },
    createSession: async (projectId, mode = 'build') => {
      const settings = useSettingsStore.getState()
      const project = useProjectStore.getState()
      const session = await api.session.create({
        title: '新对话',
        projectId: projectId || project.currentId,
        providerId: settings.settings.providerId,
        modelId: settings.settings.modelId,
        mode
      })
      set((state) => ({
        sessions: [session, ...state.sessions],
        currentId: session.id,
        messages: []
      }))
      return session
    },
    /* 草稿不立即落库，首次发送才创建会话 */
    startNewChat: () => set({ currentId: '', messages: [] }),
    removeSession: async (id) => {
      await api.session.remove(id)
      const buffer = streamBuffers.get(id)
      if (buffer?.timer) clearTimeout(buffer.timer)
      liveMessages.delete(id)
      streamTargets.delete(id)
      streamBuffers.delete(id)
      const wasCurrent = get().currentId === id
      set((state) => {
        const streamingIds = { ...state.streamingIds }
        delete streamingIds[id]
        return {
          sessions: state.sessions.filter((item) => item.id !== id),
          streamingIds,
          ...(wasCurrent ? { currentId: '', messages: [] } : {})
        }
      })
      if (wasCurrent) {
        const next = get().sessions.find((item) => item.projectId)
        if (next) await get().selectSession(next.id)
      }
    },
    renameSession: async (id, title) => {
      await api.session.rename(id, title)
      set((state) => ({
        sessions: state.sessions.map((item) => (item.id === id ? { ...item, title } : item))
      }))
    },
    updateSessionModel: async (providerId, modelId) => {
      const currentId = get().currentId
      if (!currentId) return
      const updated = await api.session.update(currentId, { providerId, modelId })
      set((state) => ({
        sessions: state.sessions.map((item) =>
          item.id === updated.id
            ? { ...item, providerId: updated.providerId, modelId: updated.modelId }
            : item
        )
      }))
    },
    updateSessionMode: async (mode) => {
      const currentId = get().currentId
      if (!currentId) return
      const updated = await api.session.update(currentId, { mode })
      set((state) => ({
        sessions: state.sessions.map((item) =>
          item.id === updated.id ? { ...item, mode: updated.mode } : item
        )
      }))
    },
    bind: () => {
      if (!unsubscribe) unsubscribe = api.chat.onEvent(handleEvent)
    },
    /* React 外壳卸载时回收订阅与计时器 */
    unbind: () => {
      unsubscribe?.()
      unsubscribe = null
      for (const buffer of streamBuffers.values()) if (buffer.timer) clearTimeout(buffer.timer)
    },
    send: async (text, mode = 'build') => {
      const content = text.trim()
      const state = get()
      if (!content || state.streamingIds[state.currentId]) return
      if (!state.currentId) {
        if (!useProjectStore.getState().currentId) return
        await get().createSession(undefined, mode)
      }
      const sessionId = get().currentId
      set((state) => ({
        sessions: state.sessions.map((item) =>
          item.id === sessionId && (item.title === '新对话' || !item.title)
            ? { ...item, title: content.slice(0, 24) }
            : item
        )
      }))
      const assistantMessage: UiMessage = {
        id: uid(),
        role: 'assistant',
        content: '',
        parts: [],
        addTime: new Date().toISOString(),
        startedAt: Date.now(),
        pending: true
      }
      streamTargets.set(sessionId, assistantMessage.id)
      const buffer = bufferOf(sessionId)
      buffer.delta = ''
      buffer.thinking = ''
      const messages = [
        ...structuredClone(get().messages),
        { id: uid(), role: 'user' as const, content, parts: [], addTime: new Date().toISOString() },
        assistantMessage
      ]
      liveMessages.set(sessionId, messages)
      set((state) => ({
        messages: structuredClone(messages),
        streamingIds: { ...state.streamingIds, [sessionId]: true }
      }))
      try {
        await api.chat.send({ sessionId, text: content })
      } finally {
        const active = streamTargets.get(sessionId) === assistantMessage.id
        if (active) {
          flushBuffers(sessionId)
          set((state) => {
            const streamingIds = { ...state.streamingIds }
            delete streamingIds[sessionId]
            return { streamingIds }
          })
        }
        if (active) {
          if (get().currentId === sessionId) {
            const assistant = streamAssistant(sessionId)
            if (assistant) assistant.pending = false
            const stored = await api.session.messages(sessionId)
            if (
              get().currentId === sessionId &&
              streamTargets.get(sessionId) === assistantMessage.id
            )
              set({ messages: mapStoredMessages(stored) })
          }
          /* 回读期间可能已开始下一轮，只清理仍属于本轮的缓存。 */
          if (streamTargets.get(sessionId) === assistantMessage.id) {
            streamTargets.delete(sessionId)
            streamBuffers.delete(sessionId)
            liveMessages.delete(sessionId)
          }
        }
        await get().loadSessions()
      }
    },
    removeMessages: async (ids) => {
      const currentId = get().currentId
      if (!currentId || !ids.length) return
      await api.session.removeMessages(currentId, ids)
      const removed = new Set(ids)
      if (get().currentId === currentId)
        set((state) => ({ messages: state.messages.filter((item) => !removed.has(item.id)) }))
    },
    abort: async () => {
      if (get().currentId) await api.chat.abort(get().currentId)
    }
  }
})
