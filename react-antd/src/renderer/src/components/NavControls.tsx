import './NavControls.scss'
/*
* 顶部导航控件：后退 / 前进 / 侧栏折叠，置于各页标题栏左侧固定位置
* @author xuxueli 2026-10-18
*/
import { useNavigate } from 'react-router-dom'
import { LeftOutlined, RightOutlined } from '@ant-design/icons'
import { useLayoutStore } from '@renderer/stores/layout'
import { useNavHistory } from '@renderer/composables/useNavHistory'
import { t } from '@renderer/i18n'
export default function NavControls() {
  const navigate = useNavigate(),
    layout = useLayoutStore()
  /* 能否后退/前进（决定箭头可用态） */
  const { canBack, canForward } = useNavHistory()
  /* 后退到上一页 */
  function goBack(): void {
    if (canBack) navigate(-1)
  }
  /* 前进到下一页 */
  function goForward(): void {
    if (canForward) navigate(1)
  }
  return (
    <div className="nav-controls">
      <button className="sidebar-toggle" disabled={!canBack} title={t('layout.back')} onClick={goBack}>
        <LeftOutlined />
      </button>
      <button
        className="sidebar-toggle"
        disabled={!canForward}
        title={t('layout.forward')}
        onClick={goForward}
      >
        <RightOutlined />
      </button>
      <button
        className="sidebar-toggle"
        title={t(layout.sidebarCollapsed ? 'layout.expandSidebar' : 'layout.collapseSidebar')}
        onClick={layout.toggleSidebar}
      >
        {/* 侧栏面板图标：圆角矩形 + 左侧竖线，表示左侧栏的收起/展开 */}
        <svg className="desk-svg-icon panel-toggle-icon" viewBox="0 0 24 24" aria-hidden="true">
          <rect x="3" y="4.5" width="18" height="15" rx="2.5" />
          <path d="M9 4.5v15" />
        </svg>
      </button>
    </div>
  )
}
