/* 导航配置：板块 / 入口路径 / 子菜单顺序与路由归属（纯配置，无 DOM） */
import { expect, it } from 'vitest'
import { NAV_SECTIONS, SECTION_ENTRY, pluginItemKey, sectionOfPath } from '../../src/renderer/src/config/nav'

it('plugin and settings submenus keep the upstream order, labels and targets', () => {
  expect(NAV_SECTIONS.plugin).toMatchObject({ key: 'plugin', titleKey: 'plugin.title', entryPath: '/plugin/mcp' })
  expect(NAV_SECTIONS.plugin.items.map((item) => [item.key, item.labelKey, item.icon, item.path])).toEqual([
    ['mcp', 'plugin.mcp', 'Connection', '/plugin/mcp'],
    ['skill', 'plugin.skill', 'MagicStick', '/plugin/skill']
  ])
  expect(NAV_SECTIONS.settings).toMatchObject({ key: 'settings', titleKey: 'settings.title', entryPath: '/settings' })
  expect(NAV_SECTIONS.settings.items.map((item) => [item.key, item.labelKey, item.icon, item.tab])).toEqual([
    ['general', 'settings.general', 'Setting', 'general'],
    ['personalization', 'settings.personalization', 'User', 'personalization'],
    ['providers', 'settings.providers', 'Cpu', 'providers'],
    ['about', 'settings.about', 'InfoFilled', 'about']
  ])
  /* 设置子菜单只切换分类，不携带路由；插件子菜单只走路由，不携带分类 */
  expect(NAV_SECTIONS.settings.items.every((item) => !item.path)).toBe(true)
  expect(NAV_SECTIONS.plugin.items.every((item) => !item.tab)).toBe(true)
})

it('section entries point at home, the first plugin page and settings', () => {
  expect(SECTION_ENTRY).toEqual({ home: '/', plugin: '/plugin/mcp', settings: '/settings' })
})

it('route paths resolve to their section and unknown paths fall back to home', () => {
  expect(sectionOfPath('/')).toBe('home')
  expect(sectionOfPath('/settings')).toBe('settings')
  expect(sectionOfPath('/plugin/mcp')).toBe('plugin')
  expect(sectionOfPath('/plugin/skill')).toBe('plugin')
  expect(sectionOfPath('/missing/page')).toBe('home')
})

it('plugin item key follows the route and falls back to the first item', () => {
  expect(pluginItemKey('/plugin/mcp')).toBe('mcp')
  expect(pluginItemKey('/plugin/skill')).toBe('skill')
  expect(pluginItemKey('/plugin/unknown')).toBe('mcp')
})
