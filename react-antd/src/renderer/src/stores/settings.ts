/* 设置与供应商状态：沿用上游业务方法，React 状态通过 Zustand 更新 */
import { create } from 'zustand'
import { message } from 'antd'
import { api } from '../api'
import { setLanguage, t } from '../i18n'
import type {
  AppSettings,
  ProviderDTO,
  ProviderModelQuery,
  RuntimeExecInput,
  RuntimeDetectResult,
  UpdateInfo
} from '../../../shared/ipc'

interface SettingsState {
  settings: AppSettings
  providers: ProviderDTO[]
  loaded: boolean
  dataDir: string
  defaultDataDir: string
  dbFile: string
  version: string
  platform: string
  updateInfo: UpdateInfo | null
  updateChecking: boolean
  applyTheme(): void
  load(): Promise<void>
  saveSettings(patch: Partial<AppSettings>): Promise<void>
  saveProvider(dto: Partial<ProviderDTO>): Promise<ProviderDTO>
  removeProvider(id: string): Promise<void>
  queryRemoteModels(input: ProviderModelQuery): Promise<string[]>
  selectDataDir(): Promise<string>
  saveDataDir(dir: string): Promise<string>
  openDataDir(): Promise<void>
  relaunch(): Promise<void>
  selectExecutable(title: string): Promise<string>
  detectExecutable(input: RuntimeExecInput): Promise<RuntimeDetectResult>
  checkUpdate(notify?: boolean): Promise<void>
  openUpdate(): Promise<void>
  dismissUpdate(): void
  selectProvider(providerId: string): Promise<void>
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: {
    theme: 'dark',
    language: 'zh',
    providerId: '',
    modelId: '',
    systemPrompt: '',
    appName: '',
    slogan: '',
    shortcuts: {},
    runtimeNodeMode: 'builtin',
    runtimeNodePath: '',
    runtimePythonPath: '',
    updateAutoCheck: true
  },
  providers: [],
  loaded: false,
  dataDir: '',
  defaultDataDir: '',
  dbFile: '',
  version: '',
  platform: '',
  updateInfo: null,
  updateChecking: false,
  /* 应用主题到 DOM，保留原有 desk CSS 变量 */
  applyTheme: () => {
    const settings = get().settings
    const dark =
      settings.theme === 'dark' ||
      (settings.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
    document.documentElement.classList.toggle('dark', dark)
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  },
  /* 首次加载设置、供应商与运行信息 */
  load: async () => {
    const settings = await api.settings.get()
    const providers = await api.provider.list()
    const info = await api.app.info()
    set({
      settings,
      providers,
      version: info.version,
      dataDir: info.dataDir,
      defaultDataDir: info.defaultDataDir,
      dbFile: info.dbFile,
      platform: info.platform,
      loaded: true
    })
    setLanguage(settings.language)
    get().applyTheme()
  },
  saveSettings: async (patch) => {
    const settings = await api.settings.save(JSON.parse(JSON.stringify(patch)))
    if (patch.language) setLanguage(patch.language)
    set({ settings })
    get().applyTheme()
  },
  saveProvider: async (dto) => {
    const saved = await api.provider.save(dto)
    set({ providers: await api.provider.list() })
    if (!get().settings.providerId)
      await get().saveSettings({ providerId: saved.id, modelId: saved.models[0] ?? '' })
    return saved
  },
  removeProvider: async (id) => {
    await api.provider.remove(id)
    const providers = await api.provider.list()
    set({ providers })
    if (get().settings.providerId === id) {
      const next = providers[0]
      await get().saveSettings({ providerId: next?.id ?? '', modelId: next?.models[0] ?? '' })
    }
  },
  queryRemoteModels: (input) => api.provider.remoteModels(input),
  selectDataDir: () => api.app.selectDataDir(),
  saveDataDir: async (dir) => {
    const dataDir = await api.app.setDataDir(dir)
    set({ dataDir })
    return dataDir
  },
  openDataDir: () => api.app.openDataDir(),
  relaunch: () => api.app.relaunch(),
  selectExecutable: (title) => api.app.selectExecutable(title),
  detectExecutable: (input) => api.app.detectExecutable(input),
  /* 手动检查才提示无更新/失败，保持上游行为 */
  checkUpdate: async (notify = false) => {
    set({ updateChecking: true })
    try {
      const info = await api.update.check()
      set({ updateInfo: info })
      if (!info.hasUpdate && notify) message.success(t('update.latest'))
    } catch (error) {
      if (notify) message.error(t('update.failed', [(error as Error).message]))
    } finally {
      set({ updateChecking: false })
    }
  },
  openUpdate: async () => {
    const info = get().updateInfo
    const url = info?.downloadUrl || info?.releaseUrl
    if (url) await api.update.openDownload(url)
    set({ updateInfo: null })
  },
  dismissUpdate: () => set({ updateInfo: null }),
  selectProvider: async (providerId) => {
    const provider = get().providers.find((item) => item.id === providerId)
    await get().saveSettings({ providerId, modelId: provider?.models[0] ?? '' })
  }
}))
