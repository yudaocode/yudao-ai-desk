import './index.scss'
/* 对话工作区：消息流、草稿、项目选择、终端与右侧任务面板。 */
import { Fragment, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Dropdown, Modal, message } from 'antd'
import { DownOutlined, FolderOutlined } from '@ant-design/icons'
import MessageItem from '@renderer/modules/chat/components/MessageItem'
import ChatComposer, { type ChatComposerHandle } from '@renderer/modules/chat/components/ChatComposer'
import EmptyState from '@renderer/components/EmptyState'
import TerminalPanel from '@renderer/modules/workspace/components/TerminalPanel'
import RightPanel from '@renderer/modules/workspace/components/RightPanel'
import { useChatStore } from '@renderer/stores/chat'
import { useSettingsStore } from '@renderer/stores/settings'
import { useLayoutStore } from '@renderer/stores/layout'
import { useProjectStore } from '@renderer/stores/project'
import { usePanelResize } from '@renderer/composables/usePanelResize'
import { t } from '@renderer/i18n'
import type { ChatMode } from '@shared/ipc'
export default function ChatPage() {
  const navigate = useNavigate(),
    chat = useChatStore(),
    settings = useSettingsStore(),
    layout = useLayoutStore(),
    project = useProjectStore()
  const scrollRef = useRef<HTMLDivElement>(null),
    composerRef = useRef<ChatComposerHandle>(null),
    scrollFrame = useRef(0),
    nearBottomRef = useRef(true)
  const [nearBottom, setNearBottom] = useState(true),
    [terminalOpened, setTerminalOpened] = useState(layout.terminalVisible)
  const currentSession = chat.sessions.find((item) => item.id === chat.currentId),
    streaming = Boolean(chat.streamingIds[chat.currentId])
  const hasMessages = chat.messages.length > 0,
    canChat = settings.providers.some((item) => item.enabled && item.models.length > 0)
  const terminalProject = project.projects.find(
    (item) => item.id === (currentSession?.projectId || project.currentId)
  )
  function scrollToBottom(force = false): void {
    if ((!force && !nearBottomRef.current) || scrollFrame.current) return
    scrollFrame.current = requestAnimationFrame(() => {
      scrollFrame.current = 0
      if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    })
  }
  const last = chat.messages[chat.messages.length - 1],
    lastPart = last?.parts[last.parts.length - 1]
  const streamSignature = last
    ? `${chat.messages.length}|${last.parts.length}|${last.content.length}|${lastPart ? (lastPart.type === 'tool' ? (lastPart.tool.result?.length ?? 0) : lastPart.text.length) : 0}`
    : '0'
  useEffect(() => scrollToBottom(true), [chat.messages.length])
  useEffect(() => scrollToBottom(), [streamSignature])
  useEffect(() => {
    nearBottomRef.current = true
    setNearBottom(true)
    scrollToBottom(true)
  }, [chat.currentId])
  useEffect(() => {
    if (layout.terminalVisible) setTerminalOpened(true)
  }, [layout.terminalVisible])
  useEffect(
    () => () => {
      cancelAnimationFrame(scrollFrame.current)
    },
    []
  )
  async function onProjectChange(value: string): Promise<void> {
    if (value === '__new__') {
      try {
        await project.createProject()
      } catch (error) {
        message.error((error as Error).message)
      }
    } else project.selectProject(value)
  }
  async function onSend(text: string, mode: ChatMode = 'build'): Promise<void> {
    if (!canChat) {
      message.warning(t('chat.noModel'))
      navigate('/settings')
      return
    }
    if (!chat.currentId && !project.currentId) {
      message.warning(t('project.needProject'))
      return
    }
    await chat.send(text, mode)
  }
  function onRemoveMessage(target: { id: string }): void {
    Modal.confirm({
      title: t('chat.deleteMessage'),
      content: t('chat.deleteMessageConfirm'),
      okText: t('common.delete'),
      cancelText: t('common.cancel'),
      onOk: async () => {
        await chat.removeMessages([target.id])
        message.success(t('common.deleted'))
      }
    })
  }
  /* 拖拽右侧栏左边缘调整宽度（统一复用 usePanelResize） */
  const { startResize: startPanelResize } = usePanelResize({
    getWidth: () => useLayoutStore.getState().rightPanelWidth,
    setWidth: layout.setRightPanelWidth,
    edge: 'right'
  })
  const examples = ['chat.suggestion1', 'chat.suggestion2', 'chat.suggestion3']
  return (
    <div className="chat-page">
      <div className="chat-workspace">
        <div
          className={`chat-content${!hasMessages ? ' empty' : ''}`}
          style={{
            display: layout.rightPanelVisible && layout.rightPanelMaximized ? 'none' : undefined
          }}
        >
          {!hasMessages ? (
            <div className="chat-body empty">
              <EmptyState />
            </div>
          ) : (
            <div
              ref={scrollRef}
              className="chat-body"
              onScroll={() => {
                const el = scrollRef.current
                if (el) {
                  const near = el.scrollHeight - el.scrollTop - el.clientHeight < 80
                  nearBottomRef.current = near
                  setNearBottom(near)
                }
              }}
            >
              <div className="chat-inner">
                {chat.messages.map((item) => (
                  <MessageItem
                    key={item.id}
                    message={item}
                    onEdit={(content) => composerRef.current?.editText(content)}
                    onRemove={() => onRemoveMessage(item)}
                  />
                ))}
              </div>
            </div>
          )}
          {hasMessages && !nearBottom && (
            <button
              className="scroll-to-bottom"
              title={t('chat.scrollToBottom')}
              onClick={() => {
                nearBottomRef.current = true
                setNearBottom(true)
                scrollToBottom(true)
              }}
            >
              <DownOutlined />
            </button>
          )}
          <ChatComposer
            ref={composerRef}
            streaming={streaming}
            disabled={!canChat}
            onSubmit={(text, mode) => {
              void onSend(text, mode)
            }}
            onStop={() => {
              void chat.abort()
            }}
          />
          {!hasMessages && (
            <>
              <div className="empty-project">
                <div className="empty-project-inner">
                  <Dropdown
                    trigger={['click']}
                    menu={{
                      items: [
                        { key: '__new__', label: '+ ' + t('project.new') },
                        ...project.projects.map((item) => ({ key: item.id, label: item.name }))
                      ],
                      onClick: ({ key }) => {
                        void onProjectChange(key)
                      }
                    }}
                  >
                    <span className="project-trigger" title={t('project.label')}>
                      <FolderOutlined className="project-icon" />
                      <span className="project-name">
                        {project.projects.find((item) => item.id === project.currentId)?.name ||
                          t('project.selectProject')}
                      </span>
                      <DownOutlined className="project-arrow" />
                    </span>
                  </Dropdown>
                </div>
              </div>
              <div className="empty-examples">
                <span className="examples-label">{t('chat.examplesLabel')}</span>
                {examples.map((key, index) => (
                  <Fragment key={key}>
                    {index > 0 && <span className="examples-sep">{t('chat.examplesSep')}</span>}
                    <a
                      className="example-link"
                      onClick={() => {
                        void onSend(t(key))
                      }}
                    >
                      {t(key)}
                    </a>
                  </Fragment>
                ))}
              </div>
            </>
          )}
        </div>
        <aside
          className={`chat-side-panel${layout.rightPanelMaximized ? ' maximized' : ''}`}
          style={{
            display: layout.rightPanelVisible ? undefined : 'none',
            width: layout.rightPanelMaximized ? undefined : layout.rightPanelWidth
          }}
        >
          {/* 左边缘拖拽手柄：拖拽调整侧栏宽度，双击恢复默认宽度（放大态下不可拖拽） */}
          {!layout.rightPanelMaximized && (
            <div
              className="side-panel-resizer"
              title={t('layout.resetPanelWidth')}
              onMouseDown={startPanelResize}
              onDoubleClick={layout.resetRightPanelWidth}
            />
          )}
          <RightPanel root={terminalProject?.path} projectName={terminalProject?.name} />
        </aside>
      </div>
      {terminalOpened && (
        <TerminalPanel
          cwd={terminalProject?.path}
          title={terminalProject?.name || t('chat.terminal')}
          visible={layout.terminalVisible}
          onClose={layout.toggleTerminal}
        />
      )}
    </div>
  )
}
