/*
 * 对话业务服务：一轮对话的编排（校验会话与运行时目标、系统指令与模式拼接、历史装配、
 * 交运行时进程执行、流式事件下发与失败轮次落库）。
 *   - 属业务编排，落 services（business）；底层执行交 agent/host（harness）。
 *   - ipc.ts 仅负责通道注册与事件转发，保持薄网关。
 */

import { app } from 'electron'
import type { ChatMode, AppSettings, ProviderDTO, SessionDTO } from '@shared/ipc'
import type {
  ApprovalChoice,
  HostEvent,
  ProviderModelConfig,
  RunAgentInput
} from '@shared/agentProtocol'
import { getSettings } from './settingsService'
import { getProvider } from './providerService'
import { getSession, listMessages, replaceMessages, updateSession } from './sessionService'
import { getProject } from './projectService'
import { buildRuntimePath } from './envService'
import { abortAgent, evictAgent, runAgent } from '../agent/host/runtimeHost'
import { resolveApproval } from '../agent/host/approval'

/* 下发到渲染层的对话事件负载（携带会话上下文） */
export type ChatEventPayload = { sessionId: string } & HostEvent

/* 将 Agent 消息内容归一化为纯文本（用于列表预览与检索） */
function contentToText(message: unknown): string {
  const content = (message as { content?: unknown })?.content
  if (typeof content === 'string') {
    return content
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') {
          return part
        }
        return (part as { text?: string })?.text ?? ''
      })
      .join('')
  }
  return ''
}

/* 将底层异常翻译为可读提示：明确指向具体供应商与模型 */
function describeError(raw: string, providerName: string, modelId: string): string {
  const message = (raw || '').trim()
  if (/api key/i.test(message)) {
    return `供应商「${providerName}」未配置 API Key，无法调用模型「${modelId}」，请在「设置」中补全后重试`
  }
  const suffix = message ? `：${message}` : ''
  return `模型「${modelId}」（供应商「${providerName}」）调用失败${suffix}`
}

/*
 * 解析会话运行时目标：会话已绑定的供应商/模型若已被删除或停用，
 * 返回明确的错误提示要求用户重新选择（不做静默切换，避免用户不知情地换了模型）。
 * 仅当会话未指定模型时才回退到设置默认模型/供应商首个模型。
 */
function resolveRuntimeTarget(
  session: SessionDTO,
  settings: AppSettings
): { provider: ProviderDTO; model: string } | { error: string } {
  /* 供应商：会话已指定则必须仍存在且启用；未指定时回退设置默认供应商 */
  const providerId = session.providerId || settings.providerId
  const provider = providerId ? getProvider(providerId) : null
  if (!provider) {
    return { error: '模型供应商不存在或已被删除，请在会话中重新选择模型' }
  }
  if (!provider.enabled) {
    return { error: `供应商「${provider.name}」已停用，请在会话中重新选择模型` }
  }
  /* 模型：会话已指定则必须仍在供应商模型列表内，否则提示更换 */
  if (session.modelId) {
    if (!provider.models.includes(session.modelId)) {
      return { error: `模型「${session.modelId}」不存在或已被删除，请在会话中重新选择模型` }
    }
    return { provider, model: session.modelId }
  }
  /* 未指定模型：回退设置默认模型，其次供应商首个模型 */
  const fallback =
    settings.modelId && provider.models.includes(settings.modelId)
      ? settings.modelId
      : (provider.models[0] ?? '')
  if (!fallback) {
    return { error: '请为供应商配置至少一个模型' }
  }
  return { provider, model: fallback }
}

/*
 * 失败轮次落库：保留历史消息并追加「用户提问 + 错误提示助手消息」，
 * 使发送失败在重载页面/切换会话后仍可见（避免前端回读消息时把错误提示覆盖丢失）。
 */
function persistFailureRound(sessionId: string, text: string, tip: string): void {
  const existing = listMessages(sessionId).map((message) => ({
    role: message.role,
    content: message.content,
    data: message.data
  }))
  replaceMessages(sessionId, [
    ...existing,
    { role: 'user', content: text, data: JSON.stringify({ role: 'user', content: text }) },
    {
      role: 'assistant',
      content: tip,
      data: JSON.stringify({ role: 'assistant', stopReason: 'error', errorMessage: tip })
    }
  ])
}

/* 模式说明：拼接到系统指令末尾，引导模型按当前模式行事（Plan 只读规划，Build 读写实施） */
function modeSystemHint(mode: ChatMode): string {
  if (mode === 'plan') {
    return '\n\n当前为 Plan（规划）模式：你处于只读状态，只能读取项目文件进行阅读与分析，不能写入/编辑文件或执行命令。请先给出清晰的方案与计划，待用户切换到 Build 模式后再落地实施。'
  }
  return '\n\n当前为 Build（构建）模式：你可以读取、写入、编辑项目文件并执行命令；文件操作限制在当前项目目录内，越界需用户确认。'
}

/* 供应商 DTO → Pi 运行时配置 */
function toRuntimeConfig(provider: ProviderDTO): ProviderModelConfig {
  return {
    id: provider.id,
    name: provider.name,
    baseUrl: provider.baseUrl,
    apiKey: provider.apiKey,
    headers: provider.headers,
    models: provider.models
  }
}

/*
 * 发送一轮对话：校验运行时目标 → 组装系统指令/历史 → 交运行时进程执行 →
 * 成功后以完整上下文覆盖落库；失败则落库可读提示并下发。
 * 流式事件经 emit 回调交给 ipc.ts 转发渲染层。
 */
export async function sendChat(
  input: { sessionId: string; text: string },
  emit: (payload: ChatEventPayload) => void
): Promise<void> {
  const { sessionId, text } = input
  /* 供应商/模型就绪后，错误提示统一带上「供应商 + 模型」上下文 */
  let providerName = ''
  let modelId = ''
  let contextReady = false
  /* 本轮是否已完整落库；异常兜底据此避免重复追加失败轮次 */
  let committed = false
  const emitEvent = (event: HostEvent): void => {
    const payload =
      event.type === 'error' && contextReady
        ? { ...event, message: describeError(event.message, providerName, modelId) }
        : event
    emit({ sessionId, ...payload })
  }
  /* 失败兜底：把「用户提问 + 可读错误提示」落库并下发，避免重载/切换会话后提示丢失 */
  const fail = (raw: string): void => {
    const tip = contextReady ? describeError(raw, providerName, modelId) : raw
    if (!committed) {
      persistFailureRound(sessionId, text, tip)
    }
    emitEvent({ type: 'error', message: tip })
  }

  try {
    const session = getSession(sessionId)
    if (!session) {
      emitEvent({ type: 'error', message: '会话不存在' })
      return
    }
    /* 首次对话立即以提问作为会话标题并落库：不等到生成结束，避免侧栏长时间停留在「新对话」 */
    if (session.title === '新对话' || !session.title) {
      updateSession(sessionId, { title: text.slice(0, 24) })
    }

    const settings = getSettings()
    /* 会话引用的供应商/模型若已删除或停用，直接提示用户重新选择，不做静默切换 */
    const target = resolveRuntimeTarget(session, settings)
    if ('error' in target) {
      fail(target.error)
      return
    }
    const { provider, model } = target

    providerName = provider.name
    modelId = model
    contextReady = true

    /* 对话模式与文件沙箱边界：默认 Build；根目录取会话所属项目目录（缺失时回退用户主目录） */
    const mode = session.mode === 'plan' ? 'plan' : 'build'
    const project = session.projectId ? getProject(session.projectId) : null
    const rootDir = project?.path || app.getPath('home')

    /* 自定义指令全局生效：统一取当前设置，并附模式说明（个性化变更对旧对话同样生效） */
    const systemPrompt = `${settings.systemPrompt || ''}${modeSystemHint(mode)}`
    /* 历史消息不携带 system 提示：系统指令始终取当前设置，保证旧对话也随设置变更生效 */
    const history = listMessages(sessionId)
      .map((message) => {
        try {
          return JSON.parse(message.data) as { role?: string }
        } catch {
          return null
        }
      })
      .filter((item) => item !== null && item.role !== 'system')

    /* 交运行时进程执行：流式事件回传渲染层，结束后回传完整上下文供落库 */
    const runInput: RunAgentInput = {
      sessionId,
      provider: { ...toRuntimeConfig(provider), sessionId },
      modelId,
      systemPrompt,
      messages: history,
      mode,
      rootDir,
      runtimePath: buildRuntimePath(),
      text
    }
    const result = await runAgent(runInput, emitEvent)
    if (!result.ok) {
      /* 运行时构建/执行异常（如模型未找到）：错误提示落库并由主进程下发 */
      fail(result.message)
      return
    }

    /* 落库：以运行时完整上下文覆盖会话消息，保证下次续聊一致（剔除 system，避免固化旧指令） */
    const serialized = result.messages
      .filter((message) => (message as { role?: string }).role !== 'system')
      .map((message) => {
        const role = (message as { role?: string }).role ?? ''
        const stopReason = (message as { stopReason?: string }).stopReason
        const errorMessage = (message as { errorMessage?: string }).errorMessage
        let content = contentToText(message)
        /* 失败消息追加可读提示落库，避免切换会话后丢失错误信息（保留已生成的部分内容） */
        if (role === 'assistant' && stopReason === 'error') {
          const tip = describeError(errorMessage ?? '', providerName, modelId)
          content = content ? `${content}\n\n${tip}` : tip
        }
        return { role, content, data: JSON.stringify(message) }
      })
    replaceMessages(sessionId, serialized)
    committed = true
  } catch (error) {
    /* 主进程侧异常（读库/落库等）：清理运行时缓存并落库错误提示 */
    evictAgent(sessionId)
    fail((error as Error).message)
  }
}

/* 中止指定会话的当前生成 */
export async function abortChat(sessionId: string): Promise<void> {
  await abortAgent(sessionId)
}

/* 回传越界审批选择（唤醒运行时进程中等待的越界确认） */
export function respondApproval(requestId: string, choice: ApprovalChoice): void {
  resolveApproval(requestId, choice)
}
