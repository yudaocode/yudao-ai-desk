import './App.scss'
/* 应用外壳与启动顺序：绑定事件 → 设置 → 项目 → 会话 → 最近会话。 */
import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Button, ConfigProvider, Modal, theme } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import enUS from 'antd/locale/en_US'
import Sidebar from './components/Sidebar'
import ApprovalDialog from './components/ApprovalDialog'
import { useSettingsStore } from './stores/settings'
import { useChatStore } from './stores/chat'
import { useProjectStore } from './stores/project'
import { useQuickAction } from './composables/useQuickAction'
import { matchShortcut } from './utils/shortcut'
import { t } from './i18n'
import type { QuickAction } from '../../shared/ipc'
export default function App() {
  const settings = useSettingsStore(),
    runQuickAction = useQuickAction()
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches
  )
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => {
      setSystemDark(media.matches)
      useSettingsStore.getState().applyTheme()
    }
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])
  useEffect(() => {
    function onGlobalKeydown(event: KeyboardEvent): void {
      if (event.defaultPrevented || event.isComposing) return
      const map = useSettingsStore.getState().settings.shortcuts
      if (!map) return
      for (const [action, binding] of Object.entries(map))
        if (matchShortcut(event, binding)) {
          event.preventDefault()
          runQuickAction(action as QuickAction)
          return
        }
    }
    window.addEventListener('keydown', onGlobalKeydown)
    return () => window.removeEventListener('keydown', onGlobalKeydown)
  }, [runQuickAction])
  useEffect(() => {
    let alive = true,
      updateTimer: ReturnType<typeof setTimeout> | null = null
    const chat = useChatStore.getState(),
      settings = useSettingsStore.getState(),
      project = useProjectStore.getState()
    chat.bind()
    void (async () => {
      await settings.load()
      if (!alive) return
      await project.loadProjects()
      if (!alive) return
      await chat.loadSessions()
      if (!alive) return
      const last = useChatStore.getState().sessions[0]
      if (last) await chat.selectSession(last.id)
      else chat.startNewChat()
      if (alive && useSettingsStore.getState().settings.updateAutoCheck)
        updateTimer = setTimeout(() => {
          void settings.checkUpdate(false)
        }, 5000)
    })()
    return () => {
      alive = false
      chat.unbind()
      if (updateTimer) clearTimeout(updateTimer)
    }
  }, [])
  const dark =
    settings.settings.theme === 'dark' || (settings.settings.theme === 'system' && systemDark)
  return (
    <ConfigProvider
      locale={settings.settings.language === 'zh' ? zhCN : enUS}
      theme={{
        algorithm: dark ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: { colorPrimary: dark ? '#e8e8e8' : '#0d0d0d', borderRadius: 10, fontSize: 15 }
      }}
    >
      <div className="desk-shell">
        <Sidebar />
        <div className="desk-main">
          <Outlet />
        </div>
        <ApprovalDialog />
        <Modal
          open={!!settings.updateInfo?.hasUpdate}
          title={t('update.title')}
          width={520}
          centered
          className="update-dialog"
          onCancel={settings.dismissUpdate}
          footer={
            <>
              <Button onClick={settings.dismissUpdate}>{t('update.later')}</Button>
              <Button
                type="primary"
                onClick={() => {
                  void settings.openUpdate()
                }}
              >
                {t('update.download')}
              </Button>
            </>
          }
        >
          <div className="update-body">
            <div className="update-version">
              {t('update.version', [settings.updateInfo?.latestVersion ?? ''])}
            </div>
            <div className="update-current">
              {t('update.current', [settings.updateInfo?.currentVersion ?? ''])}
            </div>
            {settings.updateInfo?.notes && (
              <pre className="update-notes">{settings.updateInfo.notes}</pre>
            )}
          </div>
        </Modal>
      </div>
    </ConfigProvider>
  )
}
