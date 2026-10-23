import './RightPanel.scss'
/* 右侧侧边任务：首次打开后保留文件与浏览器面板状态。 */
import { useEffect, useState } from 'react'
import {
  LeftOutlined,
  FullscreenOutlined,
  FullscreenExitOutlined,
  CloseOutlined,
  FolderOutlined,
  GlobalOutlined
} from '@ant-design/icons'
import { useLayoutStore } from '@renderer/stores/layout'
import { useSettingsStore } from '@renderer/stores/settings'
import { t } from '@renderer/i18n'
import { formatShortcut } from '@renderer/utils/shortcut'
import FilePanel from './FilePanel'
import BrowserPanel from './BrowserPanel'
export default function RightPanel({ root, projectName }: { root?: string; projectName?: string }) {
  const layout = useLayoutStore(),
    shortcuts = useSettingsStore((state) => state.settings.shortcuts)
  const [filesOpened, setFilesOpened] = useState(layout.rightPanelTool === 'files'),
    [browserOpened, setBrowserOpened] = useState(layout.rightPanelTool === 'browser')
  useEffect(() => {
    if (layout.rightPanelTool === 'files') setFilesOpened(true)
    else if (layout.rightPanelTool === 'browser') setBrowserOpened(true)
  }, [layout.rightPanelTool])
  return (
    <div className="right-panel">
      <div className="rp-header">
        <div className="rp-title-wrap">
          <span className="rp-title">
            {t(
              layout.rightPanelTool === 'files'
                ? 'panel.files'
                : layout.rightPanelTool === 'browser'
                  ? 'panel.browser'
                  : 'panel.title'
            )}
          </span>
        </div>
        <div className="rp-actions">
          {layout.rightPanelTool && (
            <button
              className="sidebar-toggle"
              title={t('panel.backToTools')}
              onClick={() => useLayoutStore.setState({ rightPanelTool: '' })}
            >
              <LeftOutlined />
            </button>
          )}
          <button
            className="sidebar-toggle"
            title={t(layout.rightPanelMaximized ? 'panel.restore' : 'panel.maximize')}
            onClick={layout.toggleRightPanelMaximized}
          >
            {layout.rightPanelMaximized ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
          </button>
          <button
            className="sidebar-toggle"
            title={t('panel.close')}
            onClick={layout.toggleRightPanel}
          >
            <CloseOutlined />
          </button>
        </div>
      </div>
      <div className="rp-body">
        {!layout.rightPanelTool && (
          <div className="rp-menu">
            <button className="rp-menu-item" onClick={() => layout.openRightPanelTool('files')}>
              <FolderOutlined className="rp-menu-icon" />
              <span className="rp-menu-label">{t('panel.files')}</span>
              <span className="rp-menu-key">{formatShortcut(shortcuts?.files)}</span>
            </button>
            <button className="rp-menu-item" onClick={() => layout.openRightPanelTool('browser')}>
              <GlobalOutlined className="rp-menu-icon" />
              <span className="rp-menu-label">{t('panel.browser')}</span>
              <span className="rp-menu-key">{formatShortcut(shortcuts?.browser)}</span>
            </button>
          </div>
        )}
        {filesOpened && (
          <div
            className="rp-tool"
            style={{ display: layout.rightPanelTool === 'files' ? 'contents' : 'none' }}
          >
            <FilePanel root={root} projectName={projectName} />
          </div>
        )}
        {browserOpened && (
          <div
            className="rp-tool"
            style={{ display: layout.rightPanelTool === 'browser' ? 'contents' : 'none' }}
          >
            <BrowserPanel />
          </div>
        )}
      </div>
    </div>
  )
}
