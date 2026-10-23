import './SubmenuMenu.scss'
/*
* 通用子菜单列表：插件 / 系统设置 等板块的二级列表（数据来自 config/nav）
* @author xuxueli 2026-10-18
*/
import {
  ApiOutlined,
  InfoCircleFilled,
  RobotOutlined,
  SettingOutlined,
  ThunderboltOutlined,
  UserOutlined
} from '@ant-design/icons'
import { t } from '@renderer/i18n'
import type { NavItem } from '@renderer/config/nav'

/* config/nav 中的图标名（上游全局注册名）→ @ant-design/icons 组件 */
const NAV_ICONS: Record<string, typeof SettingOutlined> = {
  Connection: ApiOutlined,
  MagicStick: ThunderboltOutlined,
  Setting: SettingOutlined,
  User: UserOutlined,
  Cpu: RobotOutlined,
  InfoFilled: InfoCircleFilled
}

/* bold：子菜单名是否加粗（插件板块为 true，系统设置板块为 false） */
export default function SubmenuMenu({
  titleKey,
  items,
  activeKey,
  bold,
  onSelect
}: {
  titleKey: string
  items: NavItem[]
  activeKey: string
  bold?: boolean
  onSelect: (item: NavItem) => void
}) {
  return (
    <>
      <div className="panel-head">
        <div className="panel-title">{t(titleKey)}</div>
      </div>
      <div className="sidebar-list desk-scroll">
        {items.map((item) => {
          const Icon = item.icon ? NAV_ICONS[item.icon] : undefined
          return (
            <div
              key={item.key}
              className={`menu-item${item.key === activeKey ? ' active' : ''}${bold ? ' is-bold' : ''}`}
              onClick={() => onSelect(item)}
            >
              {Icon && <Icon className="menu-icon" />}
              <span className="menu-label">{t(item.labelKey)}</span>
            </div>
          )
        })}
      </div>
    </>
  )
}
