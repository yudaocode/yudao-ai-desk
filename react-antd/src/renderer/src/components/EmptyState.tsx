import './EmptyState.scss'
/* 空态欢迎页：Logo + 标题（项目选择位于输入框下方）。 */
import { t } from '../i18n'
import { useSettingsStore } from '../stores/settings'
import logo from '../assets/icon.png'
export default function EmptyState() {
  const slogan = useSettingsStore((state) => state.settings.slogan)
  return (
    <div className="empty-state">
      <img className="empty-logo" src={logo} alt="logo" />
      <h1 className="empty-title">{slogan || t('chat.emptyTitle')}</h1>
    </div>
  )
}
