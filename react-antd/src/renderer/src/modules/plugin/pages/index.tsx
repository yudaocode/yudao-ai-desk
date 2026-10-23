import './index.scss'
/*
* 插件模块：MCP插件 / SKILL技能 的正文区（功能建设中占位）
* @author xuxueli 2026-10-18
*/
import { useLocation } from 'react-router-dom'
import { t } from '@renderer/i18n'
export default function PluginPage() {
  const location = useLocation()
  /* 当前插件子菜单标题：按路由区分 MCP插件 / SKILL技能 */
  const title = location.pathname.endsWith('/skill') ? t('plugin.skill') : t('plugin.mcp')
  return (
    <div className="plugin-page">
      <div className="plugin-placeholder">
        <div className="plugin-name">{title}</div>
        <div className="plugin-wip">{t('plugin.wip')}</div>
      </div>
    </div>
  )
}
