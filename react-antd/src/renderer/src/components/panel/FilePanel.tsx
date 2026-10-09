import './FilePanel.scss'
/* 文件面板：目录懒加载/监听、代码编辑、图片/Markdown 预览与打开方式。 */
import { Fragment, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Dropdown, Input, Modal, message } from 'antd'
import {
  CheckOutlined,
  FileOutlined,
  FileAddOutlined,
  FolderOpenOutlined,
  CopyOutlined,
  DesktopOutlined,
  DownOutlined,
  LoadingOutlined,
  SearchOutlined
} from '@ant-design/icons'
import { api } from '../../api'
import { t } from '../../i18n'
import { renderMarkdown } from '../../composables/useMarkdown'
import { onCodeCopyClick } from '../../composables/useCodeCopy'
import { escapeHtml, highlightCode, languageOf } from '../../composables/useHighlight'
import FileTreeNode from './FileTreeNode'
import type { FileContent, FsEntry, OpenWithApp } from '../../../../shared/ipc'
const MAX_EDITOR_HIGHLIGHT = 100000
const IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg']
function norm(path: string): string {
  return path.replace(/\\/g, '/')
}
function parentDir(file: string): string {
  const normalized = norm(file),
    index = normalized.lastIndexOf('/')
  return index < 0 ? '' : normalized.slice(0, index)
}
function extOf(name: string): string {
  const index = name.lastIndexOf('.')
  return index >= 0 ? name.slice(index).toLowerCase() : ''
}
function isImageName(name: string): boolean {
  return IMAGE_EXTS.includes(extOf(name))
}
export default function FilePanel({ root, projectName }: { root?: string; projectName?: string }) {
  const [childrenMap, setChildrenMap] = useState<Record<string, FsEntry[]>>({}),
    [expandedMap, setExpandedMap] = useState<Record<string, boolean>>({}),
    [loadingMap, setLoadingMap] = useState<Record<string, boolean>>({})
  const [keyword, setKeyword] = useState(''),
    [selected, setSelected] = useState<FsEntry | null>(null),
    [file, setFile] = useState<FileContent | null>(null),
    [fileLoading, setFileLoading] = useState(false),
    [fileError, setFileError] = useState(''),
    [preview, setPreview] = useState(false)
  const [original, setOriginal] = useState(''),
    [draft, setDraft] = useState(''),
    [saving, setSaving] = useState(false),
    [openApps, setOpenApps] = useState<OpenWithApp[]>([])
  const editorRef = useRef<HTMLTextAreaElement>(null),
    gutterRef = useRef<HTMLDivElement>(null),
    highlightRef = useRef<HTMLPreElement>(null)
  const watchedDirs = useRef(new Set<string>()),
    reloading = useRef(new Set<string>()),
    loadingDirs = useRef(new Set<string>()),
    epoch = useRef(0),
    readSequence = useRef(0)
  const current = useRef({ root, childrenMap, selected, file, original, draft })
  current.current = { root, childrenMap, selected, file, original, draft }
  const rootChildren = root ? (childrenMap[root] ?? []) : []
  const isImage = !!file && isImageName(file.name),
    isMarkdown = !!file && ['.md', '.markdown'].includes(extOf(file.name))
  const canPreview = isImage || isMarkdown,
    showPreview = preview && canPreview
  const editable = !!file && !file.binary && !file.truncated,
    dirty = editable && draft !== original
  function matchNode(entry: FsEntry, word: string): boolean {
    return (
      entry.name.toLowerCase().includes(word) ||
      Boolean(childrenMap[entry.path]?.some((child) => matchNode(child, word)))
    )
  }
  const word = keyword.trim().toLowerCase(),
    visibleRoot = word ? rootChildren.filter((entry) => matchNode(entry, word)) : rootChildren
  function registerWatch(dir: string): void {
    if (!watchedDirs.current.has(dir)) {
      watchedDirs.current.add(dir)
      void api.fs.watch(dir).catch(() => watchedDirs.current.delete(dir))
    }
  }
  function unwatch(dir: string): void {
    if (watchedDirs.current.delete(dir)) void api.fs.unwatch(dir)
  }
  function cleanupChildren(dir: string, entries: FsEntry[]): void {
    const present = new Set(entries.map((entry) => norm(entry.path)))
    for (const watched of [...watchedDirs.current])
      if (norm(parentDir(watched)) === norm(dir) && !present.has(norm(watched))) {
        unwatch(watched)
        setChildrenMap((state) => {
          const next = { ...state }
          delete next[watched]
          return next
        })
        setExpandedMap((state) => ({ ...state, [watched]: false }))
      }
  }
  async function loadDir(path: string, force = false): Promise<void> {
    const root = current.current.root,
      generation = epoch.current
    if (!root || (!force && (current.current.childrenMap[path] || loadingDirs.current.has(path))))
      return
    loadingDirs.current.add(path)
    setLoadingMap((state) => ({ ...state, [path]: true }))
    try {
      const entries = await api.fs.list(root, path)
      if (generation !== epoch.current) return
      setChildrenMap((state) => ({ ...state, [path]: entries }))
      registerWatch(path)
      cleanupChildren(path, entries)
    } catch (error) {
      if (generation !== epoch.current) return
      setChildrenMap((state) => ({ ...state, [path]: [] }))
      unwatch(path)
      if (!force) message.error((error as Error).message)
    } finally {
      if (generation === epoch.current) {
        loadingDirs.current.delete(path)
        setLoadingMap((state) => ({ ...state, [path]: false }))
      }
    }
  }
  async function refreshSelected(): Promise<void> {
    const { root, selected: entry, file, original, draft } = current.current
    if (!root || !entry || (!!file && !file.binary && !file.truncated && draft !== original)) return
    const generation = epoch.current,
      sequence = readSequence.current
    try {
      const loaded = await api.fs.read(root, entry.path)
      if (
        generation !== epoch.current ||
        sequence !== readSequence.current ||
        current.current.draft !== current.current.original
      )
        return
      setFile(loaded)
      setOriginal(loaded.content)
      setDraft(loaded.content)
    } catch {
      if (generation === epoch.current && sequence === readSequence.current) {
        setSelected(null)
        setFile(null)
        setFileError('')
        setOriginal('')
        setDraft('')
      }
    }
  }
  async function reloadDir(dir: string): Promise<void> {
    if (reloading.current.has(dir)) return
    reloading.current.add(dir)
    try {
      await loadDir(dir, true)
      if (current.current.selected && parentDir(current.current.selected.path) === norm(dir))
        await refreshSelected()
    } finally {
      reloading.current.delete(dir)
    }
  }
  useEffect(() => {
    const offFsChange = api.fs.onChange((dir) => {
      const target = Object.keys(current.current.childrenMap).find((key) => norm(key) === norm(dir))
      if (target !== undefined) void reloadDir(target)
    })
    let alive = true
    void api.shell.openWithApps().then(
      (apps) => {
        if (alive) setOpenApps(apps)
      },
      () => {
        if (alive) setOpenApps([])
      }
    )
    return () => {
      alive = false
      epoch.current++
      offFsChange()
      for (const dir of [...watchedDirs.current]) unwatch(dir)
    }
  }, [])
  useEffect(() => {
    epoch.current++
    readSequence.current++
    for (const dir of [...watchedDirs.current]) unwatch(dir)
    loadingDirs.current.clear()
    reloading.current.clear()
    setChildrenMap({})
    current.current.childrenMap = {}
    setExpandedMap({})
    setLoadingMap({})
    setSelected(null)
    setFile(null)
    setFileError('')
    setFileLoading(false)
    setPreview(false)
    setOriginal('')
    setDraft('')
    setKeyword('')
    if (root) void loadDir(root)
  }, [root])
  useEffect(() => {
    if (keyword.trim()) for (const entry of rootChildren) if (entry.isDir) void loadDir(entry.path)
  }, [keyword, childrenMap, root])
  function toggle(entry: FsEntry): void {
    const open = !expandedMap[entry.path]
    setExpandedMap((state) => ({ ...state, [entry.path]: open }))
    if (open) void loadDir(entry.path)
  }
  async function select(entry: FsEntry): Promise<void> {
    const root = current.current.root
    if (!root) return
    if (dirty) {
      try {
        await new Promise<void>((resolve, reject) =>
          Modal.confirm({
            title: t('panel.unsavedTitle'),
            content: t('panel.unsavedConfirm'),
            okText: t('common.confirm'),
            cancelText: t('common.cancel'),
            onOk: () => resolve(),
            onCancel: () => reject()
          })
        )
      } catch {
        return
      }
    }
    const sequence = ++readSequence.current,
      generation = epoch.current
    setSelected(entry)
    setFileLoading(true)
    setFileError('')
    setPreview(false)
    setOriginal('')
    setDraft('')
    try {
      const loaded = await api.fs.read(root, entry.path)
      if (sequence !== readSequence.current || generation !== epoch.current) return
      setFile(loaded)
      setOriginal(loaded.content)
      setDraft(loaded.content)
      setPreview(isImageName(loaded.name) && Boolean(loaded.dataUrl))
    } catch (error) {
      if (sequence === readSequence.current && generation === epoch.current) {
        setFile(null)
        setFileError((error as Error).message || t('panel.loadFail'))
      }
    } finally {
      if (sequence === readSequence.current && generation === epoch.current) setFileLoading(false)
    }
  }
  async function save(): Promise<void> {
    if (!root || !file || !editable || saving || !dirty) return
    const generation = epoch.current,
      path = file.path,
      savedDraft = draft
    setSaving(true)
    try {
      await api.fs.write(root, path, savedDraft)
      if (generation === epoch.current && current.current.file?.path === path) {
        setFile((state) =>
          state ? { ...state, content: savedDraft, size: new Blob([savedDraft]).size } : state
        )
        setOriginal(savedDraft)
      }
      message.success(t('common.saved'))
    } catch (error) {
      message.error((error as Error).message)
    } finally {
      setSaving(false)
    }
  }
  function onEditorKeydown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
      event.preventDefault()
      void save()
      return
    }
    if (event.key === 'Tab') {
      event.preventDefault()
      const el = editorRef.current
      if (!el) return
      const { selectionStart, selectionEnd } = el
      setDraft(`${draft.slice(0, selectionStart)}  ${draft.slice(selectionEnd)}`)
      requestAnimationFrame(() => {
        el.selectionStart = el.selectionEnd = selectionStart + 2
      })
    }
  }
  function syncGutter(): void {
    const editor = editorRef.current
    if (!editor) return
    if (gutterRef.current) gutterRef.current.scrollTop = editor.scrollTop
    if (highlightRef.current) {
      highlightRef.current.scrollTop = editor.scrollTop
      highlightRef.current.scrollLeft = editor.scrollLeft
    }
  }
  const breadcrumb = projectName ? [projectName] : []
  if (root && file) {
    const normalizedRoot = norm(root).replace(/\/$/, ''),
      full = norm(file.path)
    breadcrumb.push(
      ...(full.startsWith(normalizedRoot) ? full.slice(normalizedRoot.length + 1) : full)
        .split('/')
        .filter(Boolean)
    )
  }
  const lineCount = file ? (editable ? draft : file.content).split('\n').length : 0
  const highlightedDraft = file
    ? `${draft.length > MAX_EDITOR_HIGHLIGHT ? escapeHtml(draft) : highlightCode(draft, languageOf(file.name))}\n`
    : ''
  function revealFolder(): void {
    const target = file?.path ?? root
    if (target) void api.shell.reveal(target)
  }
  async function copyPath(): Promise<void> {
    if (file) {
      await navigator.clipboard.writeText(file.path)
      message.success(t('panel.copied'))
    }
  }
  function onOpenCommand(command: string): void {
    if (!file) return
    if (command === 'default') void api.shell.openPath(file.path)
    else if (command === 'folder') revealFolder()
    else if (command === 'copy') void copyPath()
    else if (command.startsWith('app:')) void api.shell.openWith(command.slice(4), file.path)
  }
  const lines = Array.from({ length: lineCount }, (_, index) => (
    <span key={index}>{index + 1}</span>
  ))
  return (
    <div className="file-panel">
      <div className="file-toolbar">
        <div className="file-breadcrumb">
          {breadcrumb.map((seg, index) => (
            <Fragment key={index}>
              {index > 0 && <span className="crumb-sep">›</span>}
              <span className={`crumb${index === breadcrumb.length - 1 ? ' current' : ''}`}>
                {seg}
              </span>
            </Fragment>
          ))}
        </div>
        <div className="file-actions">
          {editable && (
            <button
              className={`panel-btn${dirty ? ' active' : ''}`}
              disabled={!dirty || saving}
              title={t('panel.saveHint')}
              onClick={() => {
                void save()
              }}
            >
              <CheckOutlined />
              <span>{t('panel.save')}</span>
            </button>
          )}
          {canPreview && (
            <button
              className={`panel-btn${showPreview ? ' active' : ''}`}
              title={t(showPreview ? 'panel.code' : 'panel.preview')}
              onClick={() => setPreview(!preview)}
            >
              <FileOutlined />
              <span>{t(showPreview ? 'panel.code' : 'panel.preview')}</span>
            </button>
          )}
          <button
            className="panel-btn"
            disabled={!file && !root}
            title={t(file ? 'panel.openFolder' : 'panel.openProjectFolder')}
            onClick={revealFolder}
          >
            <FolderOpenOutlined />
          </button>
          <Dropdown
            trigger={['click']}
            disabled={!file}
            menu={{
              items: [
                { key: 'default', icon: <FileOutlined />, label: t('panel.openDefault') },
                ...openApps.map((app) => ({
                  key: `app:${app.path}`,
                  icon: <DesktopOutlined />,
                  label: app.name
                })),
                { type: 'divider' },
                { key: 'folder', icon: <FolderOpenOutlined />, label: t('panel.openFolder') },
                { type: 'divider' },
                { key: 'copy', icon: <CopyOutlined />, label: t('panel.copyPath') }
              ],
              onClick: ({ key }) => onOpenCommand(key)
            }}
          >
            <button className="panel-btn" disabled={!file}>
              <FileAddOutlined />
              <span>{t('panel.open')}</span>
              <DownOutlined className="chevron" />
            </button>
          </Dropdown>
        </div>
      </div>
      <div className="file-main">
        <div className="file-viewer">
          {!root ? (
            <div className="viewer-empty">{t('panel.needProject')}</div>
          ) : fileLoading ? (
            <div className="viewer-empty">
              <LoadingOutlined className="spin" />
            </div>
          ) : fileError ? (
            <div className="viewer-empty error">{fileError}</div>
          ) : !file ? (
            <div className="viewer-empty">{t('panel.noSelection')}</div>
          ) : (
            <>
              {file.truncated && <div className="viewer-banner">{t('panel.truncated')}</div>}
              {showPreview && isImage && file.dataUrl ? (
                <div className="viewer-image">
                  <img src={file.dataUrl} alt={file.name} />
                </div>
              ) : showPreview && isMarkdown ? (
                <div
                  className="viewer-markdown markdown-body"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(file.content) }}
                  onClick={(event) => {
                    void onCodeCopyClick(event.nativeEvent)
                  }}
                />
              ) : file.binary ? (
                <div className="viewer-empty">{t('panel.binary')}</div>
              ) : editable ? (
                <div className="editor">
                  <div ref={gutterRef} className="editor-gutter">
                    {lines}
                  </div>
                  <div className="editor-code">
                    <pre ref={highlightRef} className="editor-highlight hljs" aria-hidden="true">
                      <code dangerouslySetInnerHTML={{ __html: highlightedDraft }} />
                    </pre>
                    <textarea
                      ref={editorRef}
                      value={draft}
                      onChange={(event) => {
                        current.current.draft = event.target.value
                        setDraft(event.target.value)
                      }}
                      className="editor-input"
                      wrap="off"
                      spellCheck={false}
                      onScroll={syncGutter}
                      onKeyDown={onEditorKeydown}
                    />
                  </div>
                </div>
              ) : (
                <div className="code-scroll">
                  <div className="code-inner">
                    <div className="code-gutter">{lines}</div>
                    <pre className="code-pre">{file.content}</pre>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
        <div className="file-tree">
          <div className="tree-filter">
            <Input
              size="small"
              allowClear
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder={t('panel.filterPlaceholder')}
              prefix={<SearchOutlined />}
            />
          </div>
          <div className="tree-body">
            {!root ? (
              <div className="tree-empty">{t('panel.needProject')}</div>
            ) : (
              <>
                {visibleRoot.map((entry) => (
                  <FileTreeNode
                    key={entry.path}
                    entry={entry}
                    depth={0}
                    childrenMap={childrenMap}
                    expandedMap={expandedMap}
                    loadingMap={loadingMap}
                    selectedPath={selected?.path ?? ''}
                    keyword={keyword}
                    onSelect={(entry) => {
                      void select(entry)
                    }}
                    onToggle={toggle}
                  />
                ))}
                {childrenMap[root] && !visibleRoot.length && (
                  <div className="tree-empty">{t('panel.emptyTree')}</div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
