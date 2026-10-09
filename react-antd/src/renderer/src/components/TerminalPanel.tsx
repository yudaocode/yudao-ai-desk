import './TerminalPanel.scss'
/* 多标签本地终端：PTY 生命周期与 xterm 实例逐一对应。 */
import { useEffect, useRef, useState } from 'react'
import { message } from 'antd'
import { CloseOutlined, PlusOutlined, CodeOutlined } from '@ant-design/icons'
import { Terminal, type ITheme } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { api } from '../api'
import { t } from '../i18n'
interface TerminalTab {
  id: string
  title: string
}
interface TerminalRuntime {
  term: Terminal
  fit: FitAddon
  observer: ResizeObserver
  offData: { dispose(): void }
}
function xtermTheme(): ITheme {
  return document.documentElement.classList.contains('dark')
    ? {
        background: '#1e1e1e',
        foreground: '#ececec',
        cursor: '#ececec',
        selectionBackground: '#3a3a3a'
      }
    : {
        background: '#ffffff',
        foreground: '#0d0d0d',
        cursor: '#0d0d0d',
        selectionBackground: '#d8d8d8'
      }
}
function folderName(dir: string): string {
  const parts = dir.split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] || dir
}
export default function TerminalPanel({
  cwd,
  title,
  visible,
  onClose
}: {
  cwd?: string
  title?: string
  visible?: boolean
  onClose(): void
}) {
  const [tabs, setTabs] = useState<TerminalTab[]>([]),
    [activeId, setActiveId] = useState('')
  const tabsRef = useRef(tabs),
    activeRef = useRef(activeId),
    mounted = useRef(false),
    opening = useRef(false)
  tabsRef.current = tabs
  activeRef.current = activeId
  const containers = useRef(new Map<string, HTMLDivElement>()),
    runtimes = useRef(new Map<string, TerminalRuntime>())
  const earlyOutput = useRef(new Map<string, string[]>())
  function fitTerminal(id: string): void {
    const runtime = runtimes.current.get(id),
      el = containers.current.get(id)
    if (!runtime || !el || !el.clientWidth || !el.clientHeight) return
    try {
      runtime.fit.fit()
      void api.terminal.resize(id, runtime.term.cols, runtime.term.rows)
    } catch {
      /* 尺寸异常忽略 */
    }
  }
  function mountTerminal(id: string): void {
    const el = containers.current.get(id)
    if (!el || runtimes.current.has(id)) return
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: "'SFMono-Regular', ui-monospace, Menlo, Consolas, monospace",
      scrollback: 3000,
      theme: xtermTheme()
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(el)
    const offData = term.onData((data) => {
      void api.terminal.write(id, data)
    })
    const observer = new ResizeObserver(() => fitTerminal(id))
    observer.observe(el)
    runtimes.current.set(id, { term, fit, observer, offData })
    for (const text of earlyOutput.current.get(id) ?? []) term.write(text)
    earlyOutput.current.delete(id)
    fitTerminal(id)
    term.focus()
  }
  async function openTerminal(): Promise<void> {
    if (opening.current) return
    opening.current = true
    try {
      const dto = await api.terminal.create({ cwd })
      if (!mounted.current) {
        await api.terminal.dispose(dto.id)
        return
      }
      const next = [
        ...tabsRef.current,
        { id: dto.id, title: folderName(dto.cwd) || title || t('chat.terminal') }
      ]
      tabsRef.current = next
      setTabs(next)
      setActiveId(dto.id)
    } catch (error) {
      message.error((error as Error).message)
    } finally {
      opening.current = false
    }
  }
  function disposeTab(id: string): void {
    const runtime = runtimes.current.get(id)
    runtime?.observer.disconnect()
    runtime?.offData.dispose()
    runtime?.term.dispose()
    runtimes.current.delete(id)
    containers.current.delete(id)
    earlyOutput.current.delete(id)
    void api.terminal.dispose(id)
    const next = tabsRef.current.filter((tab) => tab.id !== id)
    tabsRef.current = next
    setTabs(next)
    if (activeRef.current === id) setActiveId(next[next.length - 1]?.id ?? '')
  }
  useEffect(() => {
    mounted.current = true
    const offEvent = api.terminal.onEvent((event) => {
      const text =
        event.type === 'data'
          ? event.data
          : event.type === 'exit'
            ? `\r\n${t('chat.terminalExited', [String(event.exitCode ?? 0)])}\r\n`
            : ''
      if (!text) return
      const runtime = runtimes.current.get(event.id)
      if (runtime) runtime.term.write(text)
      else if (opening.current || tabsRef.current.some((tab) => tab.id === event.id))
        earlyOutput.current.set(event.id, [...(earlyOutput.current.get(event.id) ?? []), text])
    })
    void openTerminal()
    return () => {
      mounted.current = false
      offEvent()
      for (const id of [...runtimes.current.keys()]) {
        const runtime = runtimes.current.get(id)
        runtime?.observer.disconnect()
        runtime?.offData.dispose()
        runtime?.term.dispose()
        void api.terminal.dispose(id)
      }
      runtimes.current.clear()
      containers.current.clear()
      earlyOutput.current.clear()
    }
  }, [])
  useEffect(() => {
    if (visible) {
      fitTerminal(activeId)
      runtimes.current.get(activeId)?.term.focus()
    }
  }, [visible, activeId])
  return (
    <div className="chat-terminal" style={{ display: visible === false ? 'none' : undefined }}>
      <div className="terminal-header">
        <div className="terminal-tabs">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={`terminal-tab${tab.id === activeId ? ' active' : ''}`}
              title={tab.title}
              onClick={() => setActiveId(tab.id)}
            >
              <CodeOutlined className="panel-icon" />
              <span className="terminal-tab-name">{tab.title}</span>
              <CloseOutlined
                className="terminal-tab-close"
                onClick={(event) => {
                  event.stopPropagation()
                  disposeTab(tab.id)
                }}
              />
            </button>
          ))}
        </div>
        <div className="terminal-actions">
          <button
            className="sidebar-toggle"
            title={t('chat.newTerminal')}
            onClick={() => {
              void openTerminal()
            }}
          >
            <PlusOutlined />
          </button>
          <button className="sidebar-toggle" title={t('chat.hideTerminal')} onClick={onClose}>
            <CloseOutlined />
          </button>
        </div>
      </div>
      <div className="terminal-body">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className="terminal-xterm"
            style={{ display: tab.id === activeId ? undefined : 'none' }}
            ref={(el) => {
              if (el) {
                containers.current.set(tab.id, el)
                mountTerminal(tab.id)
              } else containers.current.delete(tab.id)
            }}
          />
        ))}
      </div>
    </div>
  )
}
