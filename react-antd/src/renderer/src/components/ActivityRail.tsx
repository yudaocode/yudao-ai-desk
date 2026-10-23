import './ActivityRail.scss'
/*
* 左侧常驻图标栏（活动栏）：首页 / 插件 / 底部系统设置，切换一级板块
* @author xuxueli 2026-10-18
*/
import { useLocation, useNavigate } from 'react-router-dom'
import { HomeFilled, SettingOutlined } from '@ant-design/icons'
import { useLayoutStore } from '@renderer/stores/layout'
import { SECTION_ENTRY, sectionOfPath, type SectionKey } from '@renderer/config/nav'
import { t } from '@renderer/i18n'
export default function ActivityRail() {
  const location = useLocation(),
    navigate = useNavigate(),
    layout = useLayoutStore()
  /* 当前所属板块（高亮对应入口） */
  const section = sectionOfPath(location.pathname)
  /* 切换板块：展开子菜单栏并跳转到板块入口 */
  function go(key: SectionKey): void {
    layout.expandSidebar()
    if (section !== key) navigate(SECTION_ENTRY[key])
  }
  return (
    <nav className="sidebar-rail">
      <div className="rail-group">
        <button
          className={`rail-btn${section === 'home' ? ' active' : ''}`}
          title={t('layout.home')}
          onClick={() => go('home')}
        >
          <HomeFilled />
        </button>
        <button
          className={`rail-btn${section === 'plugin' ? ' active' : ''}`}
          title={t('plugin.title')}
          onClick={() => go('plugin')}
        >
          {/* 插件：带插头的图标 */}
          <svg className="desk-svg-icon rail-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 22v-5" />
            <path d="M9 8V2" />
            <path d="M15 8V2" />
            <path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z" />
          </svg>
        </button>
      </div>
      <div className="rail-group">
        <button
          className={`rail-btn${section === 'settings' ? ' active' : ''}`}
          title={t('settings.title')}
          onClick={() => go('settings')}
        >
          <SettingOutlined />
        </button>
      </div>
    </nav>
  )
}
