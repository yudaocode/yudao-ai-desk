import './Sidebar.scss'
/*
* 左侧栏外壳：常驻图标栏 + 子菜单栏（首页 / 插件 / 系统设置 按板块切换）
* @author xuxueli 2026-10-18
*/
import { useLocation, useNavigate } from 'react-router-dom'
import ActivityRail from '@renderer/components/ActivityRail'
import SubmenuMenu from '@renderer/components/SubmenuMenu'
import SidebarHomePanel from '@renderer/modules/chat/components/SidebarHomePanel'
import { useLayoutStore } from '@renderer/stores/layout'
import { useSettingsStore } from '@renderer/stores/settings'
import { usePanelResize } from '@renderer/composables/usePanelResize'
import { NAV_SECTIONS, pluginItemKey, sectionOfPath, type NavItem } from '@renderer/config/nav'
import { t } from '@renderer/i18n'
export default function Sidebar() {
  const location = useLocation(),
    navigate = useNavigate(),
    layout = useLayoutStore(),
    settings = useSettingsStore()
  /* 当前所属板块 */
  const section = sectionOfPath(location.pathname)
  /* 非首页板块的子菜单定义（插件 / 系统设置）；首页为自定义面板 */
  const submenu = section === 'home' ? null : NAV_SECTIONS[section]
  /* 当前子菜单选中项：插件按路由、系统设置按设置分类 */
  const activeKey = section === 'plugin' ? pluginItemKey(location.pathname) : settings.activeTab
  /* 拖拽右边缘调整子菜单栏宽度（统一复用 usePanelResize） */
  const { startResize } = usePanelResize({
    getWidth: () => useLayoutStore.getState().panelWidth,
    setWidth: layout.setPanelWidth,
    edge: 'left'
  })
  /* 双击拖拽手柄：恢复子菜单栏默认宽度 */
  function resetPanelWidth(): void {
    layout.resetPanelWidth()
  }
  /* 子菜单项点击：插件跳路由；系统设置切分类并进入设置页 */
  function onSubmenuSelect(item: NavItem): void {
    if (item.tab) {
      settings.setActiveTab(item.tab)
      if (location.pathname !== NAV_SECTIONS.settings.entryPath) {
        navigate(NAV_SECTIONS.settings.entryPath)
      }
      return
    }
    if (item.path && location.pathname !== item.path) navigate(item.path)
  }
  return (
    <aside
      className={`desk-sidebar${layout.sidebarCollapsed ? ' collapsed' : ''}`}
      style={{
        width: layout.sidebarCollapsed
          ? 'var(--desk-rail-width)'
          : `calc(var(--desk-rail-width) + ${layout.panelWidth}px)`
      }}
    >
      <ActivityRail />
      {/* 子菜单栏：折叠时隐藏，仅保留左侧图标栏 */}
      <div
        className="sidebar-panel"
        style={{ display: layout.sidebarCollapsed ? 'none' : undefined }}
      >
        {/* 右边缘拖拽手柄：拖拽调整面板宽度，双击恢复默认宽度 */}
        <div
          className="sidebar-resizer"
          title={t('layout.resetPanelWidth')}
          onMouseDown={startResize}
          onDoubleClick={resetPanelWidth}
        />
        {!submenu ? (
          <SidebarHomePanel />
        ) : (
          <SubmenuMenu
            titleKey={submenu.titleKey}
            items={submenu.items}
            activeKey={activeKey}
            bold={section === 'plugin'}
            onSelect={onSubmenuSelect}
          />
        )}
      </div>
    </aside>
  )
}
