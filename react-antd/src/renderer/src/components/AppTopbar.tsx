import './AppTopbar.scss'
/*
* 全局顶栏：贯通整窗，固定承载「后退/前进 + 折叠」并展示当前页面标题与操作
* @author xuxueli 2026-10-18
*/
import { useLocation } from 'react-router-dom'
import { Dropdown } from 'antd'
import { DeleteOutlined, EditOutlined, MoreOutlined } from '@ant-design/icons'
import NavControls from '@renderer/components/NavControls'
import ChatTopbarActions from '@renderer/modules/chat/components/ChatTopbarActions'
import { useChatStore } from '@renderer/stores/chat'
import { useSettingsStore } from '@renderer/stores/settings'
import { useSessionActions } from '@renderer/modules/chat/composables/useSessionActions'
import { NAV_SECTIONS, sectionOfPath } from '@renderer/config/nav'
import { t } from '@renderer/i18n'
export default function AppTopbar() {
  const location = useLocation(),
    chat = useChatStore(),
    settings = useSettingsStore()
  /* 会话操作（重命名 / 删除） */
  const { onChatCommand } = useSessionActions()
  /* 当前所属板块 */
  const section = sectionOfPath(location.pathname)
  /* 是否对话页（对话页展示会话标题与终端/侧栏开关） */
  const isChat = section === 'home'
  /* 顶栏标题：对话页取当前会话标题（无会话回落「新对话」）；其余取板块标题 */
  const pageTitle =
    section === 'home'
      ? chat.sessions.find((item) => item.id === chat.currentId)?.title || t('chat.newChat')
      : t(NAV_SECTIONS[section].titleKey)
  /* 是否有标题：仅在有标题时才展示标题前的分隔线 */
  const hasTitle = pageTitle.trim().length > 0
  return (
    <header className={`desk-topbar${settings.platform === 'darwin' ? ' mac' : ''}`}>
      <div className="desk-topbar-left">
        <NavControls />
        {/* 有标题时展示分隔线（｜），分隔导航控件与标题 */}
        {hasTitle && <span className="topbar-sep" aria-hidden="true" />}
        {hasTitle && (
          <div className="desk-topbar-context">
            {isChat ? (
              <div className="chat-title-wrap">
                <div className="chat-title">{pageTitle}</div>
                {/* 会话操作：重命名 / 删除（悬浮标题文案展示） */}
                {chat.currentId && (
                  <Dropdown
                    trigger={['click']}
                    rootClassName="chat-title-dropdown"
                    menu={{
                      items: [
                        { key: 'rename', icon: <EditOutlined />, label: t('chat.renameSession') },
                        { type: 'divider' },
                        { key: 'delete', icon: <DeleteOutlined />, label: t('chat.deleteSession') }
                      ],
                      onClick: ({ key }) => onChatCommand(key)
                    }}
                  >
                    <MoreOutlined className="chat-title-more" title={t('common.actions')} />
                  </Dropdown>
                )}
              </div>
            ) : (
              <div className="topbar-title">{pageTitle}</div>
            )}
          </div>
        )}
      </div>
      {/* 对话页操作：底部终端 / 右侧侧栏（侧边任务）显隐开关 */}
      {isChat && (
        <div className="desk-topbar-actions">
          <ChatTopbarActions />
        </div>
      )}
    </header>
  )
}
