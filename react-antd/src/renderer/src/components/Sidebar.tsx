import './Sidebar.scss'
/* 左侧会话栏：项目分组、排序、搜索命令面板与会话管理。 */
import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { Button, Dropdown, Empty, Input, Modal, message } from 'antd'
import {
  SearchOutlined,
  EditOutlined,
  MoreOutlined,
  CheckOutlined,
  PlusOutlined,
  FolderOpenOutlined,
  FolderOutlined,
  DeleteOutlined,
  SettingOutlined,
  MessageOutlined,
  CodeOutlined,
  GlobalOutlined
} from '@ant-design/icons'
import { useChatStore } from '../stores/chat'
import { useSettingsStore } from '../stores/settings'
import { useProjectStore } from '../stores/project'
import { useLayoutStore } from '../stores/layout'
import { useQuickAction } from '../composables/useQuickAction'
import { t } from '../i18n'
import { formatShortcut } from '../utils/shortcut'
import logo from '../assets/icon.png'
import type { ProjectDTO, QuickAction, SessionDTO } from '../../../shared/ipc'
export default function Sidebar() {
  const navigate = useNavigate(),
    chat = useChatStore(),
    settings = useSettingsStore(),
    project = useProjectStore(),
    layout = useLayoutStore(),
    runQuickAction = useQuickAction()
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [searchVisible, setSearchVisible] = useState(false),
    [searchKeyword, setSearchKeyword] = useState(''),
    [sortBy, setSortBy] = useState<'time' | 'name'>('name')
  const paletteInputRef = useRef<HTMLInputElement>(null)
  const resizeCleanup = useRef<(() => void) | null>(null)
  useEffect(() => {
    if (project.currentId) setExpanded((state) => ({ ...state, [project.currentId]: true }))
  }, [project.currentId])
  useEffect(() => {
    if (searchVisible) paletteInputRef.current?.focus()
  }, [searchVisible])
  useEffect(() => () => resizeCleanup.current?.(), [])
  function sortedSessionsOf(projectId: string): SessionDTO[] {
    return chat.sessions
      .filter((item) => item.projectId === projectId)
      .sort((a, b) =>
        sortBy === 'name'
          ? (a.title || '').localeCompare(b.title || '', 'zh')
          : b.updateTime.localeCompare(a.updateTime)
      )
  }
  const sortedProjects = [...project.projects].sort((a, b) =>
    sortBy === 'name'
      ? a.name.localeCompare(b.name, 'zh')
      : b.updateTime.localeCompare(a.updateTime)
  )
  const key = searchKeyword.trim().toLowerCase(),
    hasKeyword = key.length > 0
  const matchedSessions = key
    ? chat.sessions.filter((item) => (item.title || '').toLowerCase().includes(key)).slice(0, 50)
    : []
  const visibleSessions = hasKeyword ? matchedSessions : chat.sessions.slice(0, 5)
  const revealLabel = t(
    settings.platform === 'darwin'
      ? 'project.revealMac'
      : settings.platform === 'win32'
        ? 'project.revealWin'
        : 'project.revealLinux'
  )
  async function onCreateProject(): Promise<void> {
    try {
      const created = await project.createProject()
      if (created) setExpanded((state) => ({ ...state, [created.id]: true }))
    } catch (error) {
      message.error((error as Error).message)
    }
  }
  function onRenameProject(target: ProjectDTO): void {
    let inputName = target.name
    Modal.confirm({
      title: t('project.rename'),
      content: (
        <Input
          defaultValue={inputName}
          onChange={(event) => {
            inputName = event.target.value
          }}
        />
      ),
      okText: t('common.confirm'),
      cancelText: t('common.cancel'),
      onOk: async () => {
        const name = inputName.trim()
        if (name && name !== target.name) {
          await project.renameProject(target.id, name)
          message.success(t('project.renamed'))
        }
      }
    })
  }
  function onDeleteProject(target: ProjectDTO): void {
    Modal.confirm({
      title: t('project.delete'),
      content: t('project.deleteConfirm', [target.name]),
      okText: t('common.delete'),
      cancelText: t('common.cancel'),
      onOk: async () => {
        await project.removeProject(target.id)
        await chat.reloadSessions()
        message.success(t('project.deleted'))
      }
    })
  }
  function onProjectCommand(command: string, target: ProjectDTO): void {
    if (command === 'rename') onRenameProject(target)
    else if (command === 'reveal') void project.revealProject(target.id)
    else if (command === 'delete') onDeleteProject(target)
  }
  function onNew(): void {
    chat.startNewChat()
    navigate('/')
  }
  async function onSelect(id: string): Promise<void> {
    await chat.selectSession(id)
    navigate('/')
  }
  function onRename(id: string, title: string): void {
    let value = title
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
      onOk: () => chat.renameSession(id, value || title)
    })
  }
  function onDelete(id: string): void {
    Modal.confirm({
      title: t('chat.deleteSession'),
      content: t('chat.deleteConfirm'),
      okText: t('common.delete'),
      cancelText: t('common.cancel'),
      onOk: async () => {
        await chat.removeSession(id)
        message.success(t('common.deleted'))
      }
    })
  }
  function startResize(event: MouseEvent): void {
    event.preventDefault()
    resizeCleanup.current?.()
    const startX = event.clientX,
      startWidth = layout.sidebarWidth
    const onMove = (e: globalThis.MouseEvent) =>
      layout.setSidebarWidth(startWidth + e.clientX - startX)
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
  const quickActions: { action: QuickAction; label: string; icon: typeof EditOutlined }[] = [
    { action: 'newChat', label: 'chat.newChatAction', icon: EditOutlined },
    { action: 'settings', label: 'settings.title', icon: SettingOutlined },
    { action: 'terminal', label: 'chat.terminal', icon: CodeOutlined },
    { action: 'files', label: 'panel.files', icon: FolderOutlined },
    { action: 'browser', label: 'panel.browser', icon: GlobalOutlined }
  ]
  return (
    <aside
      className={`desk-sidebar${layout.sidebarCollapsed ? ' collapsed' : ''}`}
      style={{ width: layout.sidebarCollapsed ? 0 : layout.sidebarWidth }}
    >
      {!layout.sidebarCollapsed && <div className="sidebar-resizer" onMouseDown={startResize} />}
      <div className={`sidebar-head${settings.platform === 'darwin' ? ' mac' : ''}`}>
        <div className="brand">
          <img className="brand-logo" src={logo} alt="logo" />
          <div className="brand-text">
            <div className="brand-name">{settings.settings.appName || t('app.name')}</div>
          </div>
          <SearchOutlined
            className="brand-search"
            title={t('common.search')}
            onClick={() => {
              setSearchKeyword('')
              setSearchVisible(true)
            }}
          />
        </div>
        <div className="new-btn" onClick={onNew}>
          <EditOutlined className="new-icon" />
          <span className="new-btn-label">{t('chat.newChatAction')}</span>
        </div>
      </div>
      <div className="project-head">
        <span className="project-label">{t('project.label')}:</span>
        <span className="project-head-actions">
          <Dropdown
            trigger={['click']}
            menu={{
              items: [
                { key: 'label', disabled: true, label: t('project.sortBy') },
                {
                  key: 'name',
                  label: (
                    <>
                      {t('project.sortName')}
                      {sortBy === 'name' && <CheckOutlined className="sort-check" />}
                    </>
                  )
                },
                {
                  key: 'time',
                  label: (
                    <>
                      {t('project.sortTime')}
                      {sortBy === 'time' && <CheckOutlined className="sort-check" />}
                    </>
                  )
                }
              ],
              onClick: ({ key }) => {
                if (key === 'name' || key === 'time') setSortBy(key)
              }
            }}
          >
            <MoreOutlined className="project-icon-btn" title={t('common.actions')} />
          </Dropdown>
          <PlusOutlined
            className="project-icon-btn"
            title={t('project.new')}
            onClick={() => {
              void onCreateProject()
            }}
          />
        </span>
      </div>
      <div className="sidebar-list desk-scroll">
        {sortedProjects.map((item) => {
          const sessions = sortedSessionsOf(item.id)
          return (
            <div key={item.id} className="project-group">
              <div
                className={`project-item${item.id === project.currentId ? ' active' : ''}`}
                onClick={() => {
                  project.selectProject(item.id)
                  setExpanded((state) => ({ ...state, [item.id]: !state[item.id] }))
                }}
              >
                {expanded[item.id] ? (
                  <FolderOpenOutlined className="project-icon" />
                ) : (
                  <FolderOutlined className="project-icon" />
                )}
                <span className="project-name" title={item.path}>
                  {item.name}
                </span>
                <span className="project-actions" onClick={(event) => event.stopPropagation()}>
                  <Dropdown
                    trigger={['click']}
                    menu={{
                      items: [
                        { key: 'rename', icon: <EditOutlined />, label: t('project.rename') },
                        { key: 'reveal', icon: <FolderOpenOutlined />, label: revealLabel },
                        { type: 'divider' },
                        { key: 'delete', icon: <DeleteOutlined />, label: t('project.delete') }
                      ],
                      onClick: ({ key }) => onProjectCommand(key, item)
                    }}
                  >
                    <MoreOutlined className="op" title={t('common.actions')} />
                  </Dropdown>
                  <EditOutlined
                    className="op"
                    title={t('project.rename')}
                    onClick={() => onRenameProject(item)}
                  />
                </span>
              </div>
              {expanded[item.id] && (
                <div className="project-sessions">
                  {sessions.map((session) => (
                    <div
                      key={session.id}
                      className={`session-item${session.id === chat.currentId ? ' active' : ''}`}
                      onClick={() => {
                        void onSelect(session.id)
                      }}
                    >
                      <span className="session-title">{session.title || t('chat.newChat')}</span>
                      <span
                        className="session-actions"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <EditOutlined
                          className="op"
                          onClick={() => onRename(session.id, session.title)}
                        />
                        <DeleteOutlined className="op" onClick={() => onDelete(session.id)} />
                      </span>
                    </div>
                  ))}
                  {!sessions.length && (
                    <div className="session-empty">{t('project.noSession')}</div>
                  )}
                </div>
              )}
            </div>
          )
        })}
        {!sortedProjects.length && <Empty description={t('project.empty')} />}
      </div>
      <div className="sidebar-foot">
        <Button
          type="text"
          className="foot-btn"
          title={t('settings.title')}
          icon={<SettingOutlined />}
          onClick={() => navigate('/settings')}
        >
          <span className="foot-label">{t('settings.title')}</span>
        </Button>
      </div>
      {searchVisible &&
        createPortal(
          <div
            className="palette-mask"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setSearchVisible(false)
            }}
          >
            <div className="palette" onMouseDown={(event) => event.stopPropagation()}>
              <div className="palette-input">
                <SearchOutlined className="palette-input-icon" />
                <input
                  ref={paletteInputRef}
                  value={searchKeyword}
                  onChange={(event) => setSearchKeyword(event.target.value)}
                  className="palette-input-field"
                  placeholder={t('project.searchPlaceholder')}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') setSearchVisible(false)
                  }}
                />
              </div>
              <div className="palette-body">
                {!!visibleSessions.length && (
                  <div className="palette-section">
                    {t(hasKeyword ? 'chat.sessions' : 'chat.recentSessions')}
                  </div>
                )}
                {visibleSessions.map((session) => (
                  <div
                    key={session.id}
                    className="palette-item"
                    onClick={() => {
                      void onSelect(session.id)
                      setSearchVisible(false)
                    }}
                  >
                    <MessageOutlined className="palette-item-icon" />
                    <span className="palette-item-title">{session.title || t('chat.newChat')}</span>
                    <span className="palette-item-meta">
                      {project.projects.find((item) => item.id === session.projectId)?.name}
                    </span>
                  </div>
                ))}
                {hasKeyword && !matchedSessions.length && (
                  <div className="palette-empty">{t('common.empty')}</div>
                )}
                <div className="palette-section">{t('project.quickActions')}</div>
                {quickActions.map(({ action, label, icon: Icon }) => (
                  <div
                    key={action}
                    className="palette-item"
                    onClick={() => {
                      runQuickAction(action)
                      setSearchVisible(false)
                    }}
                  >
                    <Icon className="palette-item-icon" />
                    <span className="palette-item-title">{t(label)}</span>
                    <span className="palette-item-meta">
                      {formatShortcut(settings.settings.shortcuts?.[action])}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>,
          document.body
        )}
    </aside>
  )
}
