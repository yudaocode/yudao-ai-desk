import './index.scss'
/* 设置页：常规、个性化、供应商管理；保留上游字段和业务方法名称。 */
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  AutoComplete,
  Button,
  Empty,
  Form,
  Input,
  Modal,
  Radio,
  Switch,
  Table,
  Tabs,
  Tag,
  Tooltip,
  message
} from 'antd'
import {
  LeftOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  PlusOutlined,
  DeleteOutlined,
  ReloadOutlined
} from '@ant-design/icons'
import { useSettingsStore } from '../../../stores/settings'
import { useLayoutStore } from '../../../stores/layout'
import { t } from '../../../i18n'
import ShortcutInput from '../../../components/ShortcutInput'
import { DEFAULT_SHORTCUTS } from '../../../../../shared/ipc'
import logo from '../../../assets/icon.png'
import type {
  AppSettings,
  ProviderDTO,
  QuickAction,
  RuntimeDetectResult,
  ShortcutMap
} from '../../../../../shared/ipc'
const DEFAULT_SYSTEM_PROMPT = '你是 Yudao AI Desk 智能助手，回答简洁、准确、有条理。'
const quickActions: { id: QuickAction; label: string }[] = [
  { id: 'newChat', label: 'chat.newChatAction' },
  { id: 'settings', label: 'settings.title' },
  { id: 'terminal', label: 'chat.terminal' },
  { id: 'files', label: 'panel.files' },
  { id: 'browser', label: 'panel.browser' }
]
export default function SettingsPage() {
  const navigate = useNavigate(),
    [query] = useSearchParams(),
    settings = useSettingsStore(),
    layout = useLayoutStore()
  const [activeTab, setActiveTab] = useState(query.get('tab') || 'general')
  const [dataDirInput, setDataDirInput] = useState(settings.dataDir),
    [shortcuts, setShortcuts] = useState<ShortcutMap>({
      ...DEFAULT_SHORTCUTS,
      ...settings.settings.shortcuts
    })
  const [appName, setAppName] = useState(settings.settings.appName || t('app.name')),
    [slogan, setSlogan] = useState(settings.settings.slogan || t('chat.emptyTitle')),
    [systemPrompt, setSystemPrompt] = useState(settings.settings.systemPrompt)
  const [nodeMode, setNodeMode] = useState<AppSettings['runtimeNodeMode']>(
      settings.settings.runtimeNodeMode
    ),
    [nodePathInput, setNodePathInput] = useState(settings.settings.runtimeNodePath),
    [pythonPathInput, setPythonPathInput] = useState(settings.settings.runtimePythonPath)
  const [nodeDetect, setNodeDetect] = useState<RuntimeDetectResult | null>(null),
    [pythonDetect, setPythonDetect] = useState<RuntimeDetectResult | null>(null),
    [nodeDetecting, setNodeDetecting] = useState(false),
    [pythonDetecting, setPythonDetecting] = useState(false)
  const [dialogVisible, setDialogVisible] = useState(false),
    [editingId, setEditingId] = useState(''),
    [form, setForm] = useState({ name: '', baseUrl: '', apiKey: '', enabled: true }),
    [modelRows, setModelRows] = useState<string[]>(['']),
    [remoteModels, setRemoteModels] = useState<string[]>([]),
    [remoteLoading, setRemoteLoading] = useState(false),
    [headersText, setHeadersText] = useState('{}')
  useEffect(() => {
    setDataDirInput(settings.dataDir)
    setShortcuts({ ...DEFAULT_SHORTCUTS, ...settings.settings.shortcuts })
    setAppName(settings.settings.appName || t('app.name'))
    setSlogan(settings.settings.slogan || t('chat.emptyTitle'))
    setSystemPrompt(settings.settings.systemPrompt)
    setNodeMode(settings.settings.runtimeNodeMode)
    setNodePathInput(settings.settings.runtimeNodePath)
    setPythonPathInput(settings.settings.runtimePythonPath)
    setNodeDetect(null)
    setPythonDetect(null)
  }, [settings.loaded])
  useEffect(() => {
    setNodeDetect(null)
  }, [nodeMode, nodePathInput])
  useEffect(() => {
    setPythonDetect(null)
  }, [pythonPathInput])
  const nodeStatus = nodeDetect
    ? {
        text: nodeDetect.ok ? `${nodeDetect.version} · ${nodeDetect.path}` : nodeDetect.message,
        tone: nodeDetect.ok ? 'ok' : 'error'
      }
    : {
        text: t(nodeMode === 'builtin' ? 'settings.nodeBuiltinTip' : 'settings.notDetected'),
        tone: 'idle'
      }
  const pythonStatus = pythonDetect
    ? {
        text: pythonDetect.ok
          ? `${pythonDetect.version} · ${pythonDetect.path}`
          : pythonDetect.message,
        tone: pythonDetect.ok ? 'ok' : 'error'
      }
    : {
        text: t(pythonPathInput.trim() ? 'settings.notDetected' : 'settings.pythonAutoTip'),
        tone: 'idle'
      }
  const runtimeDirty =
    nodeMode !== settings.settings.runtimeNodeMode ||
    nodePathInput.trim() !== settings.settings.runtimeNodePath ||
    pythonPathInput.trim() !== settings.settings.runtimePythonPath
  function onShortcutChange(id: QuickAction, binding: string): void {
    const next = { ...shortcuts, [id]: binding }
    setShortcuts(next)
    void settings.saveSettings({ shortcuts: next })
  }
  function resetShortcuts(): void {
    const next = { ...DEFAULT_SHORTCUTS }
    setShortcuts(next)
    void settings.saveSettings({ shortcuts: next })
    message.success(t('common.saved'))
  }
  async function savePersonalization(): Promise<void> {
    await settings.saveSettings({ appName, slogan, systemPrompt })
    message.success(t('common.saved'))
  }
  function restorePersonalization(): void {
    setAppName(t('app.name'))
    setSlogan(t('chat.emptyTitle'))
    setSystemPrompt(DEFAULT_SYSTEM_PROMPT)
  }
  async function browseDataDir(): Promise<void> {
    const dir = await settings.selectDataDir()
    if (dir) setDataDirInput(dir)
  }
  async function saveDataDir(): Promise<void> {
    await settings.saveDataDir(dataDirInput)
    setDataDirInput(useSettingsStore.getState().dataDir)
    message.success(t('settings.dataDirSaved'))
  }
  function onRelaunch(): void {
    if (import.meta.env.DEV)
      Modal.info({
        title: t('settings.relaunch'),
        content: t('settings.relaunchDevTip'),
        okText: t('common.confirm')
      })
    else void settings.relaunch()
  }
  async function browseNodePath(): Promise<void> {
    const path = await settings.selectExecutable(t('settings.nodePath'))
    if (path) setNodePathInput(path)
  }
  async function browsePythonPath(): Promise<void> {
    const path = await settings.selectExecutable(t('settings.pythonPath'))
    if (path) setPythonPathInput(path)
  }
  async function saveRuntime(): Promise<void> {
    await settings.saveSettings({
      runtimeNodeMode: nodeMode,
      runtimeNodePath: nodePathInput.trim(),
      runtimePythonPath: pythonPathInput.trim()
    })
    message.success(t('common.saved'))
  }
  function showDetectResult(result: RuntimeDetectResult): void {
    if (result.ok) message.success(t('settings.detectOk', [result.version]))
    else message.error(result.message || t('settings.detectFail', ['未知错误']))
  }
  async function detectNode(): Promise<void> {
    setNodeDetecting(true)
    try {
      const result = await settings.detectExecutable({
        kind: 'node',
        path: nodeMode === 'custom' ? nodePathInput.trim() : undefined
      })
      setNodeDetect(result)
      showDetectResult(result)
    } catch (error) {
      setNodeDetect(null)
      message.error(t('settings.detectFail', [(error as Error).message]))
    } finally {
      setNodeDetecting(false)
    }
  }
  async function detectPython(): Promise<void> {
    setPythonDetecting(true)
    try {
      const result = await settings.detectExecutable({
        kind: 'python',
        path: pythonPathInput.trim() || undefined
      })
      setPythonDetect(result)
      showDetectResult(result)
    } catch (error) {
      setPythonDetect(null)
      message.error(t('settings.detectFail', [(error as Error).message]))
    } finally {
      setPythonDetecting(false)
    }
  }
  function openAdd(): void {
    setEditingId('')
    setForm({ name: '', baseUrl: '', apiKey: '', enabled: true })
    setModelRows([''])
    setRemoteModels([])
    setHeadersText('{}')
    setDialogVisible(true)
  }
  function openEdit(row: ProviderDTO): void {
    setEditingId(row.id)
    setForm({ name: row.name, baseUrl: row.baseUrl, apiKey: row.apiKey, enabled: row.enabled })
    setModelRows(row.models.length ? [...row.models] : [''])
    setRemoteModels([])
    setHeadersText(JSON.stringify(row.headers ?? {}, null, 2))
    setDialogVisible(true)
  }
  function addModelRow(value = ''): void {
    setModelRows((state) => [...state, value])
  }
  function removeModelRow(index: number): void {
    setModelRows((state) => {
      const next = state.filter((_, item) => item !== index)
      return next.length ? next : ['']
    })
  }
  async function queryRemoteModels(): Promise<void> {
    if (!form.baseUrl) {
      message.warning(t('settings.baseUrlRequired'))
      return
    }
    setRemoteLoading(true)
    try {
      let headers: Record<string, string> = {}
      if (headersText.trim()) {
        try {
          headers = JSON.parse(headersText)
        } catch {
          message.error(t('settings.headersInvalid'))
          return
        }
      }
      const list = await settings.queryRemoteModels({
        id: editingId || undefined,
        baseUrl: form.baseUrl,
        apiKey: form.apiKey,
        headers
      })
      setRemoteModels(list)
      if (!list.length) message.warning(t('settings.remoteEmpty'))
      else message.success(t('settings.remoteLoaded', [list.length]))
    } catch {
      message.error(t('settings.remoteFail'))
    } finally {
      setRemoteLoading(false)
    }
  }
  async function submitProvider(): Promise<void> {
    const models = [...new Set(modelRows.map((item) => (item ?? '').trim()).filter(Boolean))]
    if (!form.name || !form.baseUrl || !models.length) {
      message.warning(t('settings.providerTip'))
      return
    }
    let headers: Record<string, string> = {}
    if (headersText.trim()) {
      try {
        const parsed = JSON.parse(headersText)
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
          throw new Error('invalid')
        headers = Object.fromEntries(
          Object.entries(parsed).map(([key, value]) => [
            key,
            value === null || value === undefined ? '' : String(value)
          ])
        )
      } catch {
        message.error(t('settings.headersInvalid'))
        return
      }
    }
    await settings.saveProvider({ id: editingId || undefined, ...form, headers, models })
    setDialogVisible(false)
    message.success(t('common.saved'))
  }
  function removeProvider(row: ProviderDTO): void {
    Modal.confirm({
      title: row.name,
      content: t('chat.deleteConfirm'),
      okText: t('common.delete'),
      cancelText: t('common.cancel'),
      onOk: async () => {
        await settings.removeProvider(row.id)
        message.success(t('common.deleted'))
      }
    })
  }
  async function toggleProvider(row: ProviderDTO, value: boolean): Promise<void> {
    await settings.saveProvider({ id: row.id, enabled: value })
  }
  const general = (
    <>
      <Form layout="vertical" className="settings-form">
        <Form.Item label={t('settings.theme')}>
          <Radio.Group
            className="soft-radio"
            value={settings.settings.theme}
            onChange={(event) => {
              void settings.saveSettings({ theme: event.target.value })
            }}
          >
            <Radio.Button value="light">{t('settings.themeLight')}</Radio.Button>
            <Radio.Button value="dark">{t('settings.themeDark')}</Radio.Button>
            <Radio.Button value="system">{t('settings.themeSystem')}</Radio.Button>
          </Radio.Group>
        </Form.Item>
        <Form.Item label={t('settings.language')}>
          <Radio.Group
            className="soft-radio"
            value={settings.settings.language}
            onChange={(event) => {
              void settings.saveSettings({ language: event.target.value })
            }}
          >
            <Radio.Button value="zh">中文</Radio.Button>
            <Radio.Button value="en">English</Radio.Button>
          </Radio.Group>
        </Form.Item>
        <Form.Item label={t('settings.autoCheckUpdate')}>
          <Switch
            checked={settings.settings.updateAutoCheck}
            onChange={(value) => {
              void settings.saveSettings({ updateAutoCheck: value })
            }}
          />
        </Form.Item>
      </Form>
      <div className="shortcuts">
        <div className="shortcuts-title">{t('settings.shortcuts')}</div>
        <div className="shortcuts-tip">{t('settings.shortcutsTip')}</div>
        {quickActions.map((action) => (
          <div key={action.id} className="shortcut-row">
            <span className="shortcut-label">{t(action.label)}</span>
            <ShortcutInput
              value={shortcuts[action.id]}
              onChange={(value) => onShortcutChange(action.id, value)}
            />
          </div>
        ))}
        <div className="shortcut-actions">
          <Button onClick={resetShortcuts}>{t('settings.shortcutReset')}</Button>
        </div>
      </div>
      <div className="data-dir">
        <div className="data-dir-title">{t('settings.dataDir')}</div>
        <div className="data-dir-tip">{t('settings.dataDirTip')}</div>
        <div className="data-dir-row">
          <Input
            className="data-dir-input"
            value={dataDirInput}
            onChange={(event) => setDataDirInput(event.target.value)}
            placeholder={t('settings.dataDirPlaceholder')}
          />
          <Button
            onClick={() => {
              void browseDataDir()
            }}
          >
            {t('settings.browse')}
          </Button>
        </div>
        <div className="data-dir-actions">
          <Button
            type="primary"
            onClick={() => {
              void saveDataDir()
            }}
          >
            {t('common.save')}
          </Button>
          <Button onClick={() => setDataDirInput(settings.defaultDataDir)}>
            {t('settings.restoreDefault')}
          </Button>
          <Button
            onClick={() => {
              void settings.openDataDir()
            }}
          >
            {t('settings.openDir')}
          </Button>
          <Button onClick={onRelaunch}>{t('settings.relaunch')}</Button>
        </div>
        <div className="field-hint">
          {t('settings.dbFile')}: {settings.dbFile}
        </div>
      </div>
      <div className="runtime">
        <div className="runtime-title">{t('settings.runtimeTitle')}</div>
        <div className="runtime-tip">{t('settings.runtimeTip')}</div>
        <div className="runtime-group">
          <div className="runtime-group-title">Node</div>
          <div className="runtime-field">
            <span className="runtime-field-label">{t('settings.runtimeSource')}</span>
            <Radio.Group
              className="soft-radio"
              value={nodeMode}
              onChange={(event) => setNodeMode(event.target.value)}
            >
              <Radio.Button value="builtin">{t('settings.nodeBuiltin')}</Radio.Button>
              <Radio.Button value="custom">{t('settings.nodeCustom')}</Radio.Button>
            </Radio.Group>
          </div>
          {nodeMode === 'custom' && (
            <div className="runtime-field">
              <span className="runtime-field-label">{t('settings.runtimePath')}</span>
              <Input
                className="runtime-input"
                value={nodePathInput}
                onChange={(event) => setNodePathInput(event.target.value)}
                placeholder={t('settings.nodePathPlaceholder')}
              />
              <Button
                onClick={() => {
                  void browseNodePath()
                }}
              >
                {t('settings.browse')}
              </Button>
            </div>
          )}
          <div className="runtime-field">
            <span className="runtime-field-label">{t('settings.runtimeCheck')}</span>
            <Button
              loading={nodeDetecting}
              onClick={() => {
                void detectNode()
              }}
            >
              {t('settings.detect')}
            </Button>
            <span className={`runtime-status ${nodeStatus.tone}`}>{nodeStatus.text}</span>
          </div>
        </div>
        <div className="runtime-group">
          <div className="runtime-group-title">Python</div>
          <div className="runtime-field">
            <span className="runtime-field-label">{t('settings.runtimePath')}</span>
            <Input
              className="runtime-input"
              value={pythonPathInput}
              onChange={(event) => setPythonPathInput(event.target.value)}
              placeholder={t('settings.pythonPathPlaceholder')}
            />
            <Button
              onClick={() => {
                void browsePythonPath()
              }}
            >
              {t('settings.browse')}
            </Button>
          </div>
          <div className="runtime-field">
            <span className="runtime-field-label">{t('settings.runtimeCheck')}</span>
            <Button
              loading={pythonDetecting}
              onClick={() => {
                void detectPython()
              }}
            >
              {t('settings.detect')}
            </Button>
            <span className={`runtime-status ${pythonStatus.tone}`}>{pythonStatus.text}</span>
          </div>
        </div>
        <div className="runtime-actions">
          <Button
            type="primary"
            disabled={!runtimeDirty}
            onClick={() => {
              void saveRuntime()
            }}
          >
            {t('common.save')}
          </Button>
          {runtimeDirty && <span className="runtime-dirty">{t('settings.unsaved')}</span>}
        </div>
      </div>
    </>
  )
  const personalization = (
    <Form layout="vertical" className="settings-form">
      <Form.Item label={t('settings.name')}>
        <Input
          value={appName}
          onChange={(event) => setAppName(event.target.value)}
          allowClear
          placeholder={t('settings.namePlaceholder')}
        />
      </Form.Item>
      <Form.Item label={t('settings.slogan')}>
        <Input
          value={slogan}
          onChange={(event) => setSlogan(event.target.value)}
          allowClear
          placeholder={t('settings.sloganPlaceholder')}
        />
      </Form.Item>
      <Form.Item label={t('settings.customInstruction')}>
        <Input.TextArea
          value={systemPrompt}
          onChange={(event) => setSystemPrompt(event.target.value)}
          rows={5}
          placeholder={t('settings.customInstructionPlaceholder')}
        />
      </Form.Item>
      <div className="form-actions">
        <Button
          type="primary"
          onClick={() => {
            void savePersonalization()
          }}
        >
          {t('common.save')}
        </Button>
        <Button onClick={restorePersonalization}>{t('settings.restoreDefault')}</Button>
      </div>
    </Form>
  )
  const providers = (
    <>
      <div className="provider-toolbar">
        <span className="provider-tip">{t('settings.providerTip')}</span>
        <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>
          {t('settings.addProvider')}
        </Button>
      </div>
      <Table<ProviderDTO>
        dataSource={settings.providers}
        rowKey="id"
        pagination={false}
        locale={{ emptyText: <Empty description={t('common.empty')} /> }}
        columns={[
          { title: t('settings.providerName'), dataIndex: 'name', width: 140 },
          { title: t('settings.baseUrl'), dataIndex: 'baseUrl', width: 220, ellipsis: true },
          {
            title: t('settings.models'),
            key: 'models',
            render: (_, row) =>
              row.models.length ? (
                <Tooltip
                  title={
                    <div className="model-tooltip">
                      {row.models.map((model) => (
                        <div key={model}>{model}</div>
                      ))}
                    </div>
                  }
                >
                  <div className="model-tags">
                    {row.models.map((model) => (
                      <Tag key={model} className="model-tag">
                        {model}
                      </Tag>
                    ))}
                  </div>
                </Tooltip>
              ) : (
                '-'
              )
          },
          {
            title: t('common.status'),
            key: 'status',
            width: 100,
            render: (_, row) => (
              <Switch
                checked={row.enabled}
                onChange={(value) => {
                  void toggleProvider(row, value)
                }}
              />
            )
          },
          {
            title: t('common.actions'),
            key: 'actions',
            width: 170,
            align: 'center',
            render: (_, row) => (
              <div className="row-actions">
                <Button type="text" onClick={() => openEdit(row)}>
                  {t('common.edit')}
                </Button>
                <Button type="text" danger onClick={() => removeProvider(row)}>
                  {t('common.delete')}
                </Button>
              </div>
            )
          }
        ]}
      />
    </>
  )
  const about = (
    <div className="about">
      <div className="about-brand">
        <img className="about-logo" src={logo} alt="logo" />
        <div className="about-name">{t('app.name')}</div>
      </div>
      <div className="about-list">
        <div className="about-row">
          <span className="about-label">{t('settings.version')}</span>
          <div className="about-version">
            <span className="about-value">{settings.version}</span>
            <Button
              size="small"
              loading={settings.updateChecking}
              onClick={() => {
                void settings.checkUpdate(true)
              }}
            >
              {t('settings.checkUpdate')}
            </Button>
          </div>
        </div>
        <div className="about-row">
          <span className="about-label">{t('settings.github')}</span>
          <a
            className="about-link"
            href="https://gitee.com/yudaocode/yudao-ai-desk"
            target="_blank"
            rel="noreferrer"
          >
            https://gitee.com/yudaocode/yudao-ai-desk
          </a>
        </div>
        <div className="about-row">
          <span className="about-label">{t('settings.docs')}</span>
          <a
            className="about-link"
            href="https://gitee.com/yudaocode/yudao-ai-desk/blob/main/README.md"
            target="_blank"
            rel="noreferrer"
          >
            https://gitee.com/yudaocode/yudao-ai-desk/blob/main/README.md
          </a>
        </div>
      </div>
    </div>
  )
  return (
    <div className="settings-page">
      <header
        className={`settings-header${settings.platform === 'darwin' && layout.sidebarCollapsed ? ' mac-collapsed' : ''}`}
      >
        <button
          className="sidebar-toggle"
          title={t(layout.sidebarCollapsed ? 'chat.expandSidebar' : 'chat.collapseSidebar')}
          onClick={layout.toggleSidebar}
        >
          {layout.sidebarCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
        </button>
        <Button type="text" icon={<LeftOutlined />} onClick={() => navigate('/')}>
          {t('settings.back')}
        </Button>
        <div className="settings-title">{t('settings.title')}</div>
      </header>
      <div className="settings-body desk-scroll">
        <div className="settings-inner">
          <Tabs
            activeKey={activeTab}
            onChange={setActiveTab}
            items={[
              { key: 'general', label: t('settings.general'), children: general },
              {
                key: 'personalization',
                label: t('settings.personalization'),
                children: personalization
              },
              { key: 'providers', label: t('settings.providers'), children: providers },
              { key: 'about', label: t('settings.about'), children: about }
            ]}
          />
        </div>
      </div>
      <Modal
        open={dialogVisible}
        onCancel={() => setDialogVisible(false)}
        className="settings-dialog"
        title={t(editingId ? 'settings.editProvider' : 'settings.addProvider')}
        width={620}
        centered
        footer={
          <>
            <Button onClick={() => setDialogVisible(false)}>{t('common.cancel')}</Button>
            <Button
              type="primary"
              onClick={() => {
                void submitProvider()
              }}
            >
              {t('common.save')}
            </Button>
          </>
        }
      >
        <Form layout="vertical">
          <Form.Item label={t('settings.providerName')}>
            <Input
              value={form.name}
              onChange={(event) => setForm((state) => ({ ...state, name: event.target.value }))}
              placeholder="DeepSeek"
            />
          </Form.Item>
          <Form.Item label={t('settings.baseUrl')}>
            <Input
              value={form.baseUrl}
              onChange={(event) => setForm((state) => ({ ...state, baseUrl: event.target.value }))}
              placeholder={t('settings.baseUrlPlaceholder')}
            />
          </Form.Item>
          <Form.Item label={t('settings.apiKey')}>
            <Input.Password
              value={form.apiKey}
              onChange={(event) => setForm((state) => ({ ...state, apiKey: event.target.value }))}
              placeholder={t('settings.apiKeyPlaceholder')}
            />
          </Form.Item>
          <Form.Item label={t('settings.headers')}>
            <Input.TextArea
              value={headersText}
              onChange={(event) => setHeadersText(event.target.value)}
              rows={3}
              placeholder={t('settings.headersPlaceholder')}
            />
            <div className="field-hint">示例：{'{"x-opencode-session":"{session}"}'}</div>
          </Form.Item>
          <Form.Item label={t('settings.models')}>
            <div className="model-editor">
              {modelRows.map((value, index) => (
                <div key={index} className="model-row">
                  <AutoComplete
                    className="model-input"
                    value={value}
                    onChange={(value) =>
                      setModelRows((state) =>
                        state.map((item, row) => (row === index ? value : item))
                      )
                    }
                    options={remoteModels.map((model) => ({ value: model }))}
                    allowClear
                    placeholder={t('settings.modelPlaceholder')}
                  />
                  <Button
                    type="text"
                    className="model-remove"
                    icon={<DeleteOutlined />}
                    onClick={() => removeModelRow(index)}
                  />
                </div>
              ))}
              <div className="model-actions">
                <Button icon={<PlusOutlined />} onClick={() => addModelRow()}>
                  {t('settings.addModel')}
                </Button>
                <Button
                  loading={remoteLoading}
                  icon={<ReloadOutlined />}
                  onClick={() => {
                    void queryRemoteModels()
                  }}
                >
                  {t('settings.queryRemote')}
                </Button>
              </div>
            </div>
          </Form.Item>
          <Form.Item label={t('common.enabled')}>
            <Switch
              checked={form.enabled}
              onChange={(value) => setForm((state) => ({ ...state, enabled: value }))}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
