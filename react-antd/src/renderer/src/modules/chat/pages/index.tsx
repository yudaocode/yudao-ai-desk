import './index.scss'
/* 对话工作区：消息流、草稿、项目选择、终端与右侧任务面板。 */
import { Fragment, useEffect, useRef, useState, type MouseEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Dropdown, Input, Modal, message } from 'antd'
import {
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  MoreOutlined,
  EditOutlined,
  DeleteOutlined,
  DownOutlined,
  FolderOutlined,
  CodeOutlined,
  LayoutOutlined
} from '@ant-design/icons'
import MessageItem from '../../../components/MessageItem'
import ChatComposer, { type ChatComposerHandle } from '../../../components/ChatComposer'
import EmptyState from '../../../components/EmptyState'
import TerminalPanel from '../../../components/TerminalPanel'
import RightPanel from '../../../components/panel/RightPanel'
import { useChatStore } from '../../../stores/chat'
import { useSettingsStore } from '../../../stores/settings'
import { useLayoutStore } from '../../../stores/layout'
import { useProjectStore } from '../../../stores/project'
import { t } from '../../../i18n'
import type { ChatMode } from '../../../../../shared/ipc'
export default function ChatPage() {
  const navigate = useNavigate(),
    chat = useChatStore(),
    settings = useSettingsStore(),
    layout = useLayoutStore(),
    project = useProjectStore()
  const scrollRef = useRef<HTMLDivElement>(null),
    composerRef = useRef<ChatComposerHandle>(null),
    scrollFrame = useRef(0),
    nearBottomRef = useRef(true),
    resizeCleanup = useRef<(() => void) | null>(null)
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
      resizeCleanup.current?.()
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
  function onRenameCurrent(): void {
    if (!currentSession) return
    let value = currentSession.title
    Modal.confirm({
      title: t('chat.renameSession'),
      content: (
        <Input
          defaultValue={value}
          onChange={(event) => {
            value = event.target.value
          }}
        />
      ),
      okText: t('common.confirm'),
      cancelText: t('common.cancel'),
      onOk: () => chat.renameSession(currentSession.id, value || currentSession.title)
    })
  }
  function onDeleteCurrent(): void {
    if (!currentSession) return
    Modal.confirm({
      title: t('chat.deleteSession'),
      content: t('chat.deleteConfirm'),
      okText: t('common.delete'),
      cancelText: t('common.cancel'),
      onOk: async () => {
        await chat.removeSession(currentSession.id)
        message.success(t('common.deleted'))
      }
    })
  }
  function startPanelResize(event: MouseEvent): void {
    event.preventDefault()
    resizeCleanup.current?.()
    const startX = event.clientX,
      startWidth = layout.rightPanelWidth
    const onMove = (e: globalThis.MouseEvent) =>
      layout.setRightPanelWidth(startWidth - e.clientX + startX)
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      document.body.classList.remove('resizing')
      resizeCleanup.current = null
    }
    resizeCleanup.current = onUp
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    document.body.classList.add('resizing')
  }
  const examples = ['chat.suggestion1', 'chat.suggestion2', 'chat.suggestion3']
  return (
    <div className="chat-page">
      <header
        className={`chat-header${settings.platform === 'darwin' && layout.sidebarCollapsed ? ' mac-collapsed' : ''}`}
      >
        <div className="chat-header-left">
          <button
            className="sidebar-toggle"
            title={t(layout.sidebarCollapsed ? 'chat.expandSidebar' : 'chat.collapseSidebar')}
            onClick={layout.toggleSidebar}
          >
            {layout.sidebarCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
          </button>
          <div className="chat-title-wrap">
            <div className="chat-title">{currentSession?.title || t('chat.newChat')}</div>
            {chat.currentId && (
              <Dropdown
                trigger={['click']}
                menu={{
                  items: [
                    { key: 'rename', icon: <EditOutlined />, label: t('chat.renameSession') },
                    { type: 'divider' },
                    { key: 'delete', icon: <DeleteOutlined />, label: t('chat.deleteSession') }
                  ],
                  onClick: ({ key }) => {
                    if (key === 'rename') onRenameCurrent()
                    else onDeleteCurrent()
                  }
                }}
              >
                <MoreOutlined className="chat-title-more" title={t('common.actions')} />
              </Dropdown>
            )}
          </div>
        </div>
        <div className="chat-header-right">
          <button
            className={`sidebar-toggle${layout.terminalVisible ? ' active' : ''}`}
            title={t(layout.terminalVisible ? 'chat.hideTerminal' : 'chat.showTerminal')}
            onClick={layout.toggleTerminal}
          >
            <CodeOutlined className="panel-icon" />
          </button>
          <button
            className={`sidebar-toggle${layout.rightPanelVisible ? ' active' : ''}`}
            title={t(layout.rightPanelVisible ? 'chat.hideSidePanel' : 'chat.showSidePanel')}
            onClick={layout.toggleRightPanel}
          >
            <LayoutOutlined className="panel-icon" />
          </button>
        </div>
      </header>
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
          {!layout.rightPanelMaximized && (
            <div className="side-panel-resizer" onMouseDown={startPanelResize} />
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
