import './MessageItem.scss'
/* 单条消息：用户气泡 / 按发生顺序展示的思考、工具、正文时间线。 */
import { useState } from 'react'
import { Tooltip } from 'antd'
import {
  LoadingOutlined,
  RobotOutlined,
  DownOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  FileOutlined,
  FileAddOutlined,
  FolderOutlined,
  SearchOutlined,
  DesktopOutlined,
  ClockCircleOutlined,
  ToolOutlined
} from '@ant-design/icons'
import { renderMarkdown } from '../composables/useMarkdown'
import { onCodeCopyClick } from '../composables/useCodeCopy'
import { toolArgsText, toolView } from '../composables/useToolView'
import { useNow } from '../composables/useNow'
import { t } from '../i18n'
import type { ToolCallState, UiMessage } from '../types'
const TOOL_ICONS = {
  Document: FileOutlined,
  DocumentAdd: FileAddOutlined,
  EditPen: EditOutlined,
  Folder: FolderOutlined,
  Search: SearchOutlined,
  Monitor: DesktopOutlined,
  Clock: ClockCircleOutlined,
  Tools: ToolOutlined
}
/* 发送时间与耗时格式沿用上游规则。 */
function formatTime(iso: string): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (value: number) => String(value).padStart(2, '0'),
    now = new Date()
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`
  return date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
    ? time
    : `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${time}`
}
function formatDuration(ms: number): string {
  return ms < 1000 ? `${Math.max(0, Math.round(ms))}ms` : `${(ms / 1000).toFixed(1)}s`
}
export default function MessageItem({
  message,
  onEdit,
  onRemove
}: {
  message: UiMessage
  onEdit(content: string): void
  onRemove(): void
}) {
  const now = useNow(Boolean(message.pending))
  const [thinkingOpen, setThinkingOpen] = useState<Record<number, boolean>>({}),
    [toolOpen, setToolOpen] = useState<Record<string, boolean>>({})
  const lastIndex = message.parts.length - 1
  const turnDuration =
    message.startedAt && message.endedAt ? formatDuration(message.endedAt - message.startedAt) : ''
  function toolExpanded(tool: ToolCallState): boolean {
    return toolOpen[tool.id] ?? tool.status === 'running'
  }
  function toolDuration(tool: ToolCallState): string {
    return tool.startedAt ? formatDuration((tool.endedAt ?? now) - tool.startedAt) : ''
  }
  return (
    <div className={`message ${message.role}`}>
      <div className="message-body">
        {message.role === 'user' ? (
          <div className="user-bubble">{message.content}</div>
        ) : (
          <>
            <div className="timeline">
              {message.parts.map((part, index) => {
                const active = message.pending && index === lastIndex
                if (part.type === 'thinking')
                  return (
                    <div key={index} className={`step step-thinking${active ? ' active' : ''}`}>
                      <button
                        className="step-head"
                        onClick={() =>
                          setThinkingOpen((state) => ({ ...state, [index]: !state[index] }))
                        }
                      >
                        {active ? (
                          <LoadingOutlined className="step-icon spin" />
                        ) : (
                          <RobotOutlined className="step-icon" />
                        )}
                        <span className="step-label">
                          {t(active ? 'chat.thinkingActive' : 'chat.thinkingDone')}
                        </span>
                        <DownOutlined
                          className={`step-chevron${thinkingOpen[index] ? ' open' : ''}`}
                        />
                      </button>
                      <div className="thinking-body" hidden={!thinkingOpen[index]}>
                        {part.text}
                      </div>
                    </div>
                  )
                if (part.type === 'tool') {
                  const tool = part.tool,
                    view = toolView(tool),
                    Icon = TOOL_ICONS[view.icon as keyof typeof TOOL_ICONS] ?? ToolOutlined
                  return (
                    <div key={index} className={`step step-tool ${tool.status}`}>
                      <button
                        className="step-head"
                        onClick={() =>
                          setToolOpen((state) => ({ ...state, [tool.id]: !toolExpanded(tool) }))
                        }
                      >
                        <Icon className="step-icon" />
                        <span className="step-label">{view.title}</span>
                        {view.detail && <span className="tool-detail">{view.detail}</span>}
                        <span className="tool-state">
                          {tool.status === 'running' ? (
                            <LoadingOutlined className="spin" />
                          ) : tool.status === 'error' ? (
                            <CloseCircleOutlined />
                          ) : (
                            <CheckCircleOutlined />
                          )}
                        </span>
                        {toolDuration(tool) && (
                          <span className="step-time">{toolDuration(tool)}</span>
                        )}
                        <DownOutlined
                          className={`step-chevron${toolExpanded(tool) ? ' open' : ''}`}
                        />
                      </button>
                      <div className="tool-body" hidden={!toolExpanded(tool)}>
                        {toolArgsText(tool.args) && (
                          <div className="tool-block">
                            <div className="tool-block-title">{t('chat.toolArgs')}</div>
                            <pre className="tool-pre">{toolArgsText(tool.args)}</pre>
                          </div>
                        )}
                        <div className="tool-block">
                          <div className="tool-block-title">{t('chat.toolResult')}</div>
                          <pre className={`tool-pre${tool.status === 'error' ? ' is-error' : ''}`}>
                            {tool.result || t('chat.toolNoOutput')}
                          </pre>
                        </div>
                      </div>
                    </div>
                  )
                }
                return (
                  <div
                    key={index}
                    className={`step step-text markdown-body${message.error && index === lastIndex ? ' is-error' : ''}`}
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(part.text) }}
                    onClick={(event) => {
                      void onCodeCopyClick(event.nativeEvent)
                    }}
                  />
                )
              })}
            </div>
            {message.pending && (
              <div className="generating">
                <span className="generating-dots">
                  <span />
                  <span />
                  <span />
                </span>
                <span className="generating-label">
                  {t(message.parts.length ? 'chat.generating' : 'chat.thinkingPending')}
                </span>
              </div>
            )}
            {turnDuration && !message.pending && (
              <div className="turn-meta">{t('chat.turnElapsed', [turnDuration])}</div>
            )}
          </>
        )}
        {!message.pending && (
          <div className="message-actions">
            <span className="message-time">{formatTime(message.addTime)}</span>
            <Tooltip title={t('common.copy')}>
              <CopyOutlined
                className="action"
                onClick={() => {
                  if (message.content) void navigator.clipboard.writeText(message.content)
                }}
              />
            </Tooltip>
            <Tooltip title={t('common.delete')}>
              <DeleteOutlined className="action" onClick={onRemove} />
            </Tooltip>
            {message.role === 'user' && (
              <Tooltip title={t('common.edit')}>
                <EditOutlined className="action" onClick={() => onEdit(message.content)} />
              </Tooltip>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
