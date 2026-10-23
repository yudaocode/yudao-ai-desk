import './ChatTopbarActions.scss'
/*
* 顶栏对话操作：底部终端 / 右侧侧栏（侧边任务）显隐开关
* @author xuxueli 2026-10-18
*/
import { useLayoutStore } from '@renderer/stores/layout'
import { t } from '@renderer/i18n'
export default function ChatTopbarActions() {
  const layout = useLayoutStore()
  return (
    <>
      <button
        className={`sidebar-toggle${layout.terminalVisible ? ' active' : ''}`}
        title={t(layout.terminalVisible ? 'chat.hideTerminal' : 'chat.showTerminal')}
        onClick={layout.toggleTerminal}
      >
        <svg className="desk-svg-icon panel-icon" viewBox="0 0 24 24" aria-hidden="true">
          <rect x="3" y="4.5" width="18" height="15" rx="2.5" />
          <path d="M7.5 10l2.5 2.5-2.5 2.5" />
          <path d="M12.5 15H17" />
        </svg>
      </button>
      <button
        className={`sidebar-toggle${layout.rightPanelVisible ? ' active' : ''}`}
        title={t(layout.rightPanelVisible ? 'chat.hideSidePanel' : 'chat.showSidePanel')}
        onClick={layout.toggleRightPanel}
      >
        <svg className="desk-svg-icon panel-icon" viewBox="0 0 24 24" aria-hidden="true">
          <rect x="3" y="4.5" width="18" height="15" rx="2.5" />
          <path d="M15 4.5v15" />
        </svg>
      </button>
    </>
  )
}
