/*
* 导航配置：板块（section）→ 入口路径 / 顶栏标题 / 子菜单项 的唯一定义
* @author xuxueli 2026-10-18
*/

/* 一级板块标识 */
export type SectionKey = 'home' | 'plugin' | 'settings'

/* 子菜单项：icon 为已全局注册的图标组件名；path 用于路由跳转；tab 用于设置分类切换 */
export interface NavItem {
  key: string
  labelKey: string
  icon?: string
  path?: string
  tab?: string
}

/* 板块子菜单定义（首页为自定义面板，不在此列） */
export interface NavSection {
  key: SectionKey
  titleKey: string
  entryPath: string
  items: NavItem[]
}

/* 插件 / 系统设置 两个板块的子菜单 */
export const NAV_SECTIONS: Record<'plugin' | 'settings', NavSection> = {
  plugin: {
    key: 'plugin',
    titleKey: 'plugin.title',
    entryPath: '/plugin/mcp',
    items: [
      { key: 'mcp', labelKey: 'plugin.mcp', icon: 'Connection', path: '/plugin/mcp' },
      { key: 'skill', labelKey: 'plugin.skill', icon: 'MagicStick', path: '/plugin/skill' }
    ]
  },
  settings: {
    key: 'settings',
    titleKey: 'settings.title',
    entryPath: '/settings',
    items: [
      { key: 'general', labelKey: 'settings.general', icon: 'Setting', tab: 'general' },
      {
        key: 'personalization',
        labelKey: 'settings.personalization',
        icon: 'User',
        tab: 'personalization'
      },
      { key: 'providers', labelKey: 'settings.providers', icon: 'Cpu', tab: 'providers' },
      { key: 'about', labelKey: 'settings.about', icon: 'InfoFilled', tab: 'about' }
    ]
  }
}

/* 各板块入口路径（图标栏切换用） */
export const SECTION_ENTRY: Record<SectionKey, string> = {
  home: '/',
  plugin: NAV_SECTIONS.plugin.entryPath,
  settings: NAV_SECTIONS.settings.entryPath
}

/* 由路由路径解析所属一级板块 */
export function sectionOfPath(path: string): SectionKey {
  if (path.startsWith('/plugin')) {
    return 'plugin'
  }
  if (path.startsWith('/settings')) {
    return 'settings'
  }
  return 'home'
}

/* 由插件路由路径解析当前子菜单 key（未匹配时回落首项） */
export function pluginItemKey(path: string): string {
  const item = NAV_SECTIONS.plugin.items.find((one) => one.path === path)
  return item?.key ?? NAV_SECTIONS.plugin.items[0].key
}
