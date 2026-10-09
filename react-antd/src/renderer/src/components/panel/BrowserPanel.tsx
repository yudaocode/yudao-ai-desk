import './BrowserPanel.scss'
/* 内嵌浏览器：每个标签保留独立 webview、历史与页面状态。 */
import { useEffect, useRef, useState } from 'react'
import { Dropdown } from 'antd'
import {
  LeftOutlined,
  RightOutlined,
  CloseOutlined,
  ReloadOutlined,
  ExportOutlined,
  MoreOutlined,
  PlusOutlined,
  GlobalOutlined
} from '@ant-design/icons'
import { api } from '../../api'
import { t } from '../../i18n'
interface WebviewElement extends HTMLElement {
  loadURL(url: string): Promise<void>
  getURL(): string
  canGoBack(): boolean
  canGoForward(): boolean
  goBack(): void
  goForward(): void
  reload(): void
  stop(): void
}
interface Tab {
  id: string
  input: string
  currentUrl: string
  title: string
  loading: boolean
  hasPage: boolean
  canBack: boolean
  canForward: boolean
}
let seq = 0
function makeTab(url = ''): Tab {
  return {
    id: `tab-${++seq}`,
    input: url,
    currentUrl: '',
    title: '',
    loading: false,
    hasPage: Boolean(url),
    canBack: false,
    canForward: false
  }
}
/* 与上游一致：URL、域名、localhost 和搜索兜底。 */
function normalize(raw: string): string {
  const value = raw.trim()
  if (!value) return ''
  if (/^https?:\/\//i.test(value)) return value
  if (
    /^localhost(:\d+)?(\/.*)?$/i.test(value) ||
    /^\d{1,3}(\.\d{1,3}){3}(:\d+)?(\/.*)?$/.test(value)
  )
    return `http://${value}`
  if (/^[\w-]+(\.[\w-]+)+(:\d+)?(\/.*)?$/.test(value)) return `https://${value}`
  return `https://www.bing.com/search?q=${encodeURIComponent(value)}`
}
function tabLabel(tab: Tab): string {
  if (tab.title) return tab.title
  if (tab.currentUrl) {
    try {
      return new URL(tab.currentUrl).host
    } catch {
      return tab.currentUrl
    }
  }
  return t('panel.untitled')
}
export default function BrowserPanel() {
  const [tabs, setTabs] = useState<Tab[]>(() => [makeTab()]),
    [activeId, setActiveId] = useState('')
  const tabsRef = useRef(tabs),
    activeRef = useRef(activeId),
    inputFocused = useRef(false)
  tabsRef.current = tabs
  activeRef.current = activeId || tabs[0]?.id || ''
  const webviews = useRef(new Map<string, WebviewElement>()),
    containers = useRef(new Map<string, HTMLElement>())
  const readyTabs = useRef(new Set<string>()),
    pendingNav = useRef(new Map<string, string>())
  const activeTab = tabs.find((tab) => tab.id === activeId) ?? tabs[0]
  function patchTab(id: string, patch: Partial<Tab>): void {
    const next = tabsRef.current.map((tab) => (tab.id === id ? { ...tab, ...patch } : tab))
    tabsRef.current = next
    setTabs(next)
  }
  function syncNav(id: string): void {
    const view = webviews.current.get(id)
    if (view && readyTabs.current.has(id))
      patchTab(id, { canBack: view.canGoBack(), canForward: view.canGoForward() })
  }
  function onNavigated(id: string, url?: string): void {
    if (url && url !== 'about:blank')
      patchTab(id, {
        currentUrl: url,
        ...(activeRef.current === id && inputFocused.current ? {} : { input: url })
      })
    syncNav(id)
  }
  async function loadUrl(id: string, url: string): Promise<void> {
    try {
      await webviews.current.get(id)?.loadURL(url)
    } catch {
      /* 页面呈现加载失败 */
    }
  }
  function ensureWebview(id: string): WebviewElement | null {
    const existing = webviews.current.get(id)
    if (existing) return existing
    const container = containers.current.get(id)
    if (!container) return null
    const el = document.createElement('webview') as WebviewElement
    el.setAttribute('allowpopups', '')
    el.setAttribute('style', 'width:100%;height:100%;border:0;display:flex;background:#fff')
    el.setAttribute('src', 'about:blank')
    el.addEventListener('dom-ready', () => {
      readyTabs.current.add(id)
      const queued = pendingNav.current.get(id)
      if (queued) {
        pendingNav.current.delete(id)
        void loadUrl(id, queued)
      }
    })
    el.addEventListener('did-start-loading', () => patchTab(id, { loading: true }))
    el.addEventListener('did-stop-loading', () => {
      patchTab(id, { loading: false })
      syncNav(id)
    })
    el.addEventListener('did-fail-load', (event) => {
      if ((event as Event & { errorCode: number }).errorCode !== -3)
        patchTab(id, { loading: false })
    })
    for (const name of ['did-navigate', 'did-navigate-in-page'])
      el.addEventListener(name, (event) => onNavigated(id, (event as Event & { url: string }).url))
    el.addEventListener('page-title-updated', (event) => {
      const title = (event as Event & { title: string }).title
      if (title) patchTab(id, { title })
    })
    container.appendChild(el)
    webviews.current.set(id, el)
    const tab = tabsRef.current.find((item) => item.id === id)
    if (tab?.hasPage && tab.input) {
      pendingNav.current.set(id, tab.input)
      patchTab(id, { currentUrl: tab.input })
    }
    return el
  }
  async function navigate(id: string, url: string): Promise<void> {
    if (!ensureWebview(id)) return
    patchTab(id, { hasPage: true, currentUrl: url })
    if (readyTabs.current.has(id)) await loadUrl(id, url)
    else pendingNav.current.set(id, url)
  }
  async function go(): Promise<void> {
    if (!activeTab) return
    const url = normalize(activeTab.input)
    if (url) await navigate(activeTab.id, url)
  }
  function addTab(url = ''): void {
    const tab = makeTab(url)
    const next = [...tabsRef.current, tab]
    tabsRef.current = next
    setTabs(next)
    setActiveId(tab.id)
  }
  function selectTab(id: string): void {
    setActiveId(id)
    syncNav(id)
  }
  function closeTab(id: string): void {
    const index = tabsRef.current.findIndex((tab) => tab.id === id)
    if (index < 0) return
    webviews.current.get(id)?.remove()
    webviews.current.delete(id)
    readyTabs.current.delete(id)
    pendingNav.current.delete(id)
    containers.current.delete(id)
    const next = tabsRef.current.filter((tab) => tab.id !== id)
    if (!next.length) next.push(makeTab())
    tabsRef.current = next
    setTabs(next)
    if (activeRef.current === id) setActiveId(next[Math.min(index, next.length - 1)].id)
  }
  function back(): void {
    const view = webviews.current.get(activeRef.current)
    if (view && readyTabs.current.has(activeRef.current) && view.canGoBack()) view.goBack()
  }
  function forward(): void {
    const view = webviews.current.get(activeRef.current)
    if (view && readyTabs.current.has(activeRef.current) && view.canGoForward()) view.goForward()
  }
  function reloadOrStop(): void {
    const view = webviews.current.get(activeRef.current)
    if (!view || !readyTabs.current.has(activeRef.current)) {
      void go()
      return
    }
    if (activeTab?.loading) view.stop()
    else view.reload()
  }
  function openExternal(): void {
    if (activeTab?.currentUrl) void api.shell.openExternal(activeTab.currentUrl)
  }
  useEffect(() => {
    const offOpenTab = api.browser.onOpenTab((url) => addTab(url))
    return () => {
      offOpenTab()
      webviews.current.forEach((view) => view.remove())
      webviews.current.clear()
      containers.current.clear()
      readyTabs.current.clear()
      pendingNav.current.clear()
    }
  }, [])
  return (
    <div className="browser-panel">
      <div className="tab-bar">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`tab${tab.id === activeTab?.id ? ' active' : ''}`}
            title={tabLabel(tab)}
            onClick={() => selectTab(tab.id)}
          >
            <span className="tab-title">{tabLabel(tab)}</span>
            <button
              className="tab-close"
              title={t('panel.closeTab')}
              onClick={(event) => {
                event.stopPropagation()
                closeTab(tab.id)
              }}
            >
              <CloseOutlined />
            </button>
          </div>
        ))}
        <button className="tab-add" title={t('panel.newTab')} onClick={() => addTab()}>
          <PlusOutlined />
        </button>
      </div>
      <div className="browser-toolbar">
        <button
          className="nav-btn"
          disabled={!activeTab?.canBack}
          title={t('panel.goBack')}
          onClick={back}
        >
          <LeftOutlined />
        </button>
        <button
          className="nav-btn"
          disabled={!activeTab?.canForward}
          title={t('panel.goForward')}
          onClick={forward}
        >
          <RightOutlined />
        </button>
        <button
          className="nav-btn"
          title={t(activeTab?.loading ? 'panel.stop' : 'panel.reload')}
          onClick={reloadOrStop}
        >
          {activeTab?.loading ? <CloseOutlined /> : <ReloadOutlined />}
        </button>
        <div className="address">
          <input
            className="address-input"
            value={activeTab?.input ?? ''}
            onChange={(event) => {
              if (activeTab) patchTab(activeTab.id, { input: event.target.value })
            }}
            placeholder={t('panel.browserPlaceholder')}
            spellCheck={false}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void go()
            }}
            onFocus={() => {
              inputFocused.current = true
            }}
            onBlur={() => {
              inputFocused.current = false
            }}
          />
          {activeTab?.hasPage && (
            <button
              className="address-external"
              title={t('panel.openExternal')}
              onClick={openExternal}
            >
              <ExportOutlined />
            </button>
          )}
        </div>
        <Dropdown
          trigger={['click']}
          menu={{
            items: [
              {
                key: 'external',
                disabled: !activeTab?.hasPage,
                icon: <ExportOutlined />,
                label: t('panel.openExternal')
              },
              { key: 'reload', icon: <ReloadOutlined />, label: t('panel.reload') }
            ],
            onClick: ({ key }) => {
              if (key === 'external') openExternal()
              else webviews.current.get(activeRef.current)?.reload()
            }
          }}
        >
          <button className="nav-btn">
            <MoreOutlined />
          </button>
        </Dropdown>
      </div>
      <div className="browser-body">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`webview-slot${tab.id === activeTab?.id ? ' active' : ''}`}
            ref={(el) => {
              if (el) {
                containers.current.set(tab.id, el)
                ensureWebview(tab.id)
              } else containers.current.delete(tab.id)
            }}
          >
            {tab.hasPage && tab.loading && (
              <div className="load-bar">
                <span />
              </div>
            )}
            {!tab.hasPage && (
              <div className="browser-empty">
                <GlobalOutlined className="globe" />
                <div className="empty-title">{t('panel.browserStart')}</div>
                <div className="empty-tip">{t('panel.browserStartTip')}</div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
