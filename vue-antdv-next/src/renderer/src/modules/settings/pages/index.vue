<script setup lang="ts">
/* 设置页：常规 + 个性化 + 供应商管理 */
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { message as ElMessage, Modal, Input } from 'antdv-next'
import { useSettingsStore } from '@renderer/stores/settings'
import { t } from '@renderer/i18n'
import ShortcutInput from '@renderer/components/ShortcutInput.vue'
import { DEFAULT_SHORTCUTS } from '@shared/ipc'
import logo from '@renderer/assets/icon.png'
import type {
  AppSettings,
  ProviderDTO,
  QuickAction,
  RuntimeDetectResult,
  ShortcutMap
} from '@shared/ipc'

const route = useRoute()
const settings = useSettingsStore()
/* 支持从对话页「+新建供应商」跳转直达供应商 TAB（选中项由左侧子菜单共享） */
if (typeof route.query.tab === 'string' && route.query.tab) {
  settings.activeTab = route.query.tab
}

/* --- 常规：主题 / 语言切换后立即生效（无需保存） --- */
const theme = computed<AppSettings['theme']>({
  get: () => settings.settings.theme,
  set: (value) => {
    void settings.saveSettings({ theme: value })
  }
})
const language = computed<AppSettings['language']>({
  get: () => settings.settings.language,
  set: (value) => {
    void settings.saveSettings({ language: value })
  }
})
/* 运行时数据目录（可编辑，保存后需重启生效） */
const dataDirInput = ref('')

function syncGeneral(): void {
  dataDirInput.value = settings.dataDir
}

watch(() => settings.loaded, syncGeneral)
onMounted(syncGeneral)

/* --- 常规：快捷操作快捷键（点击录制，修改后立即保存） --- */
const quickActions: { id: QuickAction; label: string }[] = [
  { id: 'newChat', label: 'chat.newChatAction' },
  { id: 'settings', label: 'settings.title' },
  { id: 'terminal', label: 'chat.terminal' },
  { id: 'files', label: 'panel.files' },
  { id: 'browser', label: 'panel.browser' }
]
const shortcuts = ref<ShortcutMap>({})

function syncShortcuts(): void {
  shortcuts.value = { ...DEFAULT_SHORTCUTS, ...settings.settings.shortcuts }
}

watch(() => settings.loaded, syncShortcuts)
onMounted(syncShortcuts)

/* 修改单个快捷键：合并后立即保存（传普通对象，避免 IPC 无法克隆 Vue 响应式代理） */
function onShortcutChange(id: QuickAction, binding: string): void {
  const next: ShortcutMap = { ...shortcuts.value, [id]: binding }
  shortcuts.value = next
  void settings.saveSettings({ shortcuts: { ...next } })
}

/* 恢复默认快捷键并保存 */
function resetShortcuts(): void {
  const next: ShortcutMap = { ...DEFAULT_SHORTCUTS }
  shortcuts.value = next
  void settings.saveSettings({ shortcuts: { ...next } })
  ElMessage.success(t('common.saved'))
}

/* --- 个性化：名称 / Slogan / 自定义指令（失焦即保存） --- */
const appName = ref('')
const slogan = ref('')
const systemPrompt = ref('')

function syncPersonalization(): void {
  appName.value = settings.settings.appName || t('app.name')
  slogan.value = settings.settings.slogan || t('chat.emptyTitle')
  systemPrompt.value = settings.settings.systemPrompt
}

watch(() => settings.loaded, syncPersonalization)
onMounted(syncPersonalization)

/* 自定义指令默认值（与主进程 DEFAULTS 保持一致，用于「恢复默认」） */
const DEFAULT_SYSTEM_PROMPT = '你是 Yudao AI Desk 智能助手，回答简洁、准确、有条理。'

async function savePersonalization(): Promise<void> {
  await settings.saveSettings({
    appName: appName.value,
    slogan: slogan.value,
    systemPrompt: systemPrompt.value
  })
  ElMessage.success(t('common.saved'))
}

/* 恢复默认：名称/Slogan 回内置文案，自定义指令回内置默认 */
function restorePersonalization(): void {
  appName.value = t('app.name')
  slogan.value = t('chat.emptyTitle')
  systemPrompt.value = DEFAULT_SYSTEM_PROMPT
}

/* --- 运行时数据目录 --- */
/* 通过系统对话框选择数据目录 */
async function browseDataDir(): Promise<void> {
  const dir = await settings.selectDataDir()
  if (dir) {
    dataDirInput.value = dir
  }
}

/* 保存数据目录（写入配置文件，重启后生效） */
async function saveDataDir(): Promise<void> {
  await settings.saveDataDir(dataDirInput.value)
  dataDirInput.value = settings.dataDir
  ElMessage.success(t('settings.dataDirSaved'))
}

/* 恢复默认数据目录（仅回填输入框，保存后生效） */
function resetDataDir(): void {
  dataDirInput.value = settings.defaultDataDir
}

/* 重启应用：开发模式下 electron-vite 的 dev server 会随进程退出关闭，自动重启会白屏，故仅提示 */
function onRelaunch(): void {
  if (import.meta.env.DEV) {
    Modal.info({ content: t('settings.relaunchDevTip'), title: t('settings.relaunch'), okText: t('common.confirm') })
    return
  }
  void settings.relaunch()
}

/* --- 常规：命令运行环境（Node / Python 路径，Agent 执行命令与终端面板共用） --- */
const nodeMode = ref<AppSettings['runtimeNodeMode']>('builtin')
const nodePathInput = ref('')
const pythonPathInput = ref('')
/* 检测结果（null 表示尚未检测） */
const nodeDetect = ref<RuntimeDetectResult | null>(null)
const pythonDetect = ref<RuntimeDetectResult | null>(null)
/* 检测中状态（按钮 loading） */
const nodeDetecting = ref(false)
const pythonDetecting = ref(false)

/* Node 状态文案：未检测时内置提示「跟随 Electron」、自定义提示「未检测」 */
const nodeStatus = computed<{ text: string; tone: 'idle' | 'ok' | 'error' }>(() => {
  const result = nodeDetect.value
  if (!result) {
    return {
      text: nodeMode.value === 'builtin' ? t('settings.nodeBuiltinTip') : t('settings.notDetected'),
      tone: 'idle'
    }
  }
  return {
    text: result.ok ? `${result.version} · ${result.path}` : result.message,
    tone: result.ok ? 'ok' : 'error'
  }
})

/* Python 状态文案：未检测时留空提示自动探测、已填提示「未检测」 */
const pythonStatus = computed<{ text: string; tone: 'idle' | 'ok' | 'error' }>(() => {
  const result = pythonDetect.value
  if (!result) {
    return {
      text: pythonPathInput.value.trim() ? t('settings.notDetected') : t('settings.pythonAutoTip'),
      tone: 'idle'
    }
  }
  return {
    text: result.ok ? `${result.version} · ${result.path}` : result.message,
    tone: result.ok ? 'ok' : 'error'
  }
})

/* 是否存在未保存的运行时设置（用于保存按钮禁用与提示） */
const runtimeDirty = computed(
  () =>
    nodeMode.value !== settings.settings.runtimeNodeMode ||
    nodePathInput.value.trim() !== settings.settings.runtimeNodePath ||
    pythonPathInput.value.trim() !== settings.settings.runtimePythonPath
)

function syncRuntime(): void {
  nodeMode.value = settings.settings.runtimeNodeMode
  nodePathInput.value = settings.settings.runtimeNodePath
  pythonPathInput.value = settings.settings.runtimePythonPath
  nodeDetect.value = null
  pythonDetect.value = null
}

watch(() => settings.loaded, syncRuntime)
onMounted(syncRuntime)

/* 修改 Node 来源 / 路径后，清空旧的检测结果，避免展示过期状态 */
watch([nodeMode, nodePathInput], () => {
  nodeDetect.value = null
})
/* 修改 Python 路径后，清空旧的检测结果 */
watch(pythonPathInput, () => {
  pythonDetect.value = null
})

/* 选择 Node 可执行文件 */
async function browseNodePath(): Promise<void> {
  const path = await settings.selectExecutable(t('settings.nodePath'))
  if (path) {
    nodePathInput.value = path
  }
}

/* 选择 Python 解释器 */
async function browsePythonPath(): Promise<void> {
  const path = await settings.selectExecutable(t('settings.pythonPath'))
  if (path) {
    pythonPathInput.value = path
  }
}

/* 保存运行时 Path 设置（Node 路径 + Python 路径） */
async function saveRuntime(): Promise<void> {
  await settings.saveSettings({
    runtimeNodeMode: nodeMode.value,
    runtimeNodePath: nodePathInput.value.trim(),
    runtimePythonPath: pythonPathInput.value.trim()
  })
  ElMessage.success(t('common.saved'))
}

/* 检测 Node 版本：内置取内置 shim，自定义取输入路径 */
async function detectNode(): Promise<void> {
  nodeDetecting.value = true
  try {
    nodeDetect.value = await settings.detectExecutable({
      kind: 'node',
      path: nodeMode.value === 'custom' ? nodePathInput.value.trim() : undefined
    })
    showDetectResult(nodeDetect.value)
  } catch (error) {
    nodeDetect.value = null
    ElMessage.error(t('settings.detectFail', [(error as Error).message]))
  } finally {
    nodeDetecting.value = false
  }
}

/* 检测 Python 版本：路径留空时自动探测系统解释器 */
async function detectPython(): Promise<void> {
  pythonDetecting.value = true
  try {
    pythonDetect.value = await settings.detectExecutable({
      kind: 'python',
      path: pythonPathInput.value.trim() || undefined
    })
    showDetectResult(pythonDetect.value)
  } catch (error) {
    pythonDetect.value = null
    ElMessage.error(t('settings.detectFail', [(error as Error).message]))
  } finally {
    pythonDetecting.value = false
  }
}

/* 统一回显检测结果（通过弹成功提示，失败弹错误提示） */
function showDetectResult(result: RuntimeDetectResult): void {
  if (result.ok) {
    ElMessage.success(t('settings.detectOk', [result.version]))
  } else {
    ElMessage.error(result.message || t('settings.detectFail', ['未知错误']))
  }
}

/* --- 供应商 --- */
/* 供应商编辑弹窗：显隐、编辑中的 id（空即新增）与表单数据 */
const dialogVisible = ref(false)
const editingId = ref('')
const form = ref({ name: '', baseUrl: '', apiKey: '', enabled: true })
/* 模型行（动态多行管理，支持手输与远程下拉选择） */
const modelRows = ref<string[]>([''])
/* 远程查询得到的可选模型 */
const remoteModels = ref<string[]>([])
/* 远程模型查询加载态、请求 Header 文本（JSON） */
const remoteLoading = ref(false)
const headersText = ref('{}')
/* 请求Header 示例（含花括号，放模板文本避免 i18n 占位符解析冲突） */
const headersExample = '{"x-opencode-session":"{session}"}'

/* 打开新增供应商弹窗并重置表单 */
function openAdd(): void {
  editingId.value = ''
  form.value = { name: '', baseUrl: '', apiKey: '', enabled: true }
  modelRows.value = ['']
  remoteModels.value = []
  headersText.value = '{}'
  dialogVisible.value = true
}

/* 打开编辑供应商弹窗并回填表单 */
function openEdit(row: ProviderDTO): void {
  editingId.value = row.id
  form.value = {
    name: row.name,
    baseUrl: row.baseUrl,
    apiKey: row.apiKey,
    enabled: row.enabled
  }
  modelRows.value = row.models.length > 0 ? [...row.models] : ['']
  remoteModels.value = []
  headersText.value = JSON.stringify(row.headers ?? {}, null, 2)
  dialogVisible.value = true
}

/* 新增一行模型 */
function addModelRow(value = ''): void {
  modelRows.value.push(value)
}

/* 移除一行模型（保留至少一行） */
function removeModelRow(index: number): void {
  modelRows.value.splice(index, 1)
  if (modelRows.value.length === 0) {
    modelRows.value.push('')
  }
}

/* 查询远程可用模型（复用当前表单的地址/密钥/请求头，未填密钥时后端按已保存配置兜底） */
async function queryRemoteModels(): Promise<void> {
  if (!form.value.baseUrl) {
    ElMessage.warning(t('settings.baseUrlRequired'))
    return
  }
  remoteLoading.value = true
  try {
    let headers: Record<string, string> = {}
    const raw = headersText.value.trim()
    if (raw) {
      try {
        headers = JSON.parse(raw)
      } catch {
        ElMessage.error(t('settings.headersInvalid'))
        return
      }
    }
    const list = await settings.queryRemoteModels({
      id: editingId.value || undefined,
      baseUrl: form.value.baseUrl,
      apiKey: form.value.apiKey,
      headers
    })
    remoteModels.value = list
    if (list.length === 0) {
      ElMessage.warning(t('settings.remoteEmpty'))
    } else {
      ElMessage.success(t('settings.remoteLoaded', [list.length]))
    }
  } catch {
    ElMessage.error(t('settings.remoteFail'))
  } finally {
    remoteLoading.value = false
  }
}

/* 提交供应商表单：模型去重、校验请求 Header 后保存 */
async function submitProvider(): Promise<void> {
  const models = Array.from(
    new Set(
      modelRows.value
        .map((item) => (item ?? '').trim())
        .filter(Boolean)
    )
  )
  if (!form.value.name || !form.value.baseUrl || models.length === 0) {
    ElMessage.warning(t('settings.providerTip'))
    return
  }

  /* 解析并校验请求Header（JSON 对象，value 可含 {session} 占位符） */
  let headers: Record<string, string> = {}
  const rawHeaders = headersText.value.trim()
  if (rawHeaders) {
    try {
      const parsed = JSON.parse(rawHeaders)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('invalid')
      }
      headers = Object.fromEntries(
        Object.entries(parsed).map(([key, value]) => [
          key,
          value === null || value === undefined ? '' : String(value)
        ])
      )
    } catch {
      ElMessage.error(t('settings.headersInvalid'))
      return
    }
  }

  await settings.saveProvider({
    id: editingId.value || undefined,
    name: form.value.name,
    baseUrl: form.value.baseUrl,
    apiKey: form.value.apiKey,
    enabled: form.value.enabled,
    headers,
    models
  })
  dialogVisible.value = false
  ElMessage.success(t('common.saved'))
}

/* 删除供应商（二次确认） */
async function removeProvider(row: ProviderDTO): Promise<void> {
  try {
    await new Promise<void>((resolve, reject) => {
      Modal.confirm({
        title: row.name, content: t('chat.deleteConfirm'),
        okText: t('common.delete'), cancelText: t('common.cancel'),
        onOk: () => resolve(), onCancel: () => reject('cancel')
      })
    })
    await settings.removeProvider(row.id)
    ElMessage.success(t('common.deleted'))
  } catch {
    /* 取消 */
  }
}

/* 切换供应商启用状态并立即保存 */
async function toggleProvider(row: ProviderDTO, value: boolean): Promise<void> {
  await settings.saveProvider({ id: row.id, enabled: value })
}
</script>

<template>
  <div class="settings-page">
    <div class="desk-scroll settings-body">
      <div class="settings-inner">
        <a-tabs v-model:active-key="settings.activeTab" class="settings-tabs">
          <!-- 通用 -->
          <a-tab-pane :tab="t('settings.general')" key="general">
            <a-form layout="vertical" class="settings-form">
              <a-form-item :label="t('settings.theme')">
                <a-radio-group v-model:value="theme" class="soft-radio">
                  <a-radio-button value="light">{{ t('settings.themeLight') }}</a-radio-button>
                  <a-radio-button value="dark">{{ t('settings.themeDark') }}</a-radio-button>
                  <a-radio-button value="system">{{ t('settings.themeSystem') }}</a-radio-button>
                </a-radio-group>
              </a-form-item>
              <a-form-item :label="t('settings.language')">
                <a-radio-group v-model:value="language" class="soft-radio">
                  <a-radio-button value="zh">中文</a-radio-button>
                  <a-radio-button value="en">English</a-radio-button>
                </a-radio-group>
              </a-form-item>
              <a-form-item :label="t('settings.autoCheckUpdate')">
                <a-switch
                  :checked="settings.settings.updateAutoCheck"
                  @update:checked="(value) => settings.saveSettings({ updateAutoCheck: Boolean(value) })"
                />
              </a-form-item>
            </a-form>

            <!-- 快捷键：为快捷操作配置全局快捷键（点击输入框录制，Esc 取消） -->
            <div class="shortcuts">
              <div class="shortcuts-title">{{ t('settings.shortcuts') }}</div>
              <div class="shortcuts-tip">{{ t('settings.shortcutsTip') }}</div>
              <div v-for="action in quickActions" :key="action.id" class="shortcut-row">
                <span class="shortcut-label">{{ t(action.label) }}</span>
                <ShortcutInput
                  :model-value="shortcuts[action.id]"
                  @update:model-value="(value: string) => onShortcutChange(action.id, value)"
                />
              </div>
              <div class="shortcut-actions">
                <a-button @click="resetShortcuts">{{ t('settings.shortcutReset') }}</a-button>
              </div>
            </div>

            <!-- 运行时数据目录：查看 / 修改 / 打开 -->
            <div class="data-dir">
              <div class="data-dir-title">{{ t('settings.dataDir') }}</div>
              <div class="data-dir-tip">{{ t('settings.dataDirTip') }}</div>
              <div class="data-dir-row">
                <a-input
                  v-model:value="dataDirInput"
                  class="data-dir-input"
                  :placeholder="t('settings.dataDirPlaceholder')"
                />
                <a-button @click="browseDataDir">{{ t('settings.browse') }}</a-button>
              </div>
              <div class="data-dir-actions">
                <a-button type="primary" @click="saveDataDir">{{ t('common.save') }}</a-button>
                <a-button @click="resetDataDir">{{ t('settings.restoreDefault') }}</a-button>
                <a-button @click="settings.openDataDir()">{{ t('settings.openDir') }}</a-button>
                <a-button @click="onRelaunch">{{ t('settings.relaunch') }}</a-button>
              </div>
              <div class="field-hint">{{ t('settings.dbFile') }}: {{ settings.dbFile }}</div>
            </div>

            <!-- 命令运行环境：Node / Python 路径（Agent 执行命令与终端面板共用） -->
            <div class="runtime">
              <div class="runtime-title">{{ t('settings.runtimeTitle') }}</div>
              <div class="runtime-tip">{{ t('settings.runtimeTip') }}</div>

              <!-- Node：内置（Electron）或自定义可执行文件 -->
              <div class="runtime-group">
                <div class="runtime-group-title">Node</div>
                <div class="runtime-field">
                  <span class="runtime-field-label">{{ t('settings.runtimeSource') }}</span>
                  <a-radio-group v-model:value="nodeMode" class="soft-radio">
                    <a-radio-button value="builtin">{{ t('settings.nodeBuiltin') }}</a-radio-button>
                    <a-radio-button value="custom">{{ t('settings.nodeCustom') }}</a-radio-button>
                  </a-radio-group>
                </div>
                <div v-if="nodeMode === 'custom'" class="runtime-field">
                  <span class="runtime-field-label">{{ t('settings.runtimePath') }}</span>
                  <a-input
                    v-model:value="nodePathInput"
                    class="runtime-input"
                    :placeholder="t('settings.nodePathPlaceholder')"
                  />
                  <a-button @click="browseNodePath">{{ t('settings.browse') }}</a-button>
                </div>
                <div class="runtime-field">
                  <span class="runtime-field-label">{{ t('settings.runtimeCheck') }}</span>
                  <a-button :loading="nodeDetecting" @click="detectNode">
                    {{ t('settings.detect') }}
                  </a-button>
                  <span class="runtime-status" :class="nodeStatus.tone">{{ nodeStatus.text }}</span>
                </div>
              </div>

              <!-- Python：留空自动探测系统解释器 -->
              <div class="runtime-group">
                <div class="runtime-group-title">Python</div>
                <div class="runtime-field">
                  <span class="runtime-field-label">{{ t('settings.runtimePath') }}</span>
                  <a-input
                    v-model:value="pythonPathInput"
                    class="runtime-input"
                    :placeholder="t('settings.pythonPathPlaceholder')"
                  />
                  <a-button @click="browsePythonPath">{{ t('settings.browse') }}</a-button>
                </div>
                <div class="runtime-field">
                  <span class="runtime-field-label">{{ t('settings.runtimeCheck') }}</span>
                  <a-button :loading="pythonDetecting" @click="detectPython">
                    {{ t('settings.detect') }}
                  </a-button>
                  <span class="runtime-status" :class="pythonStatus.tone">{{ pythonStatus.text }}</span>
                </div>
              </div>

              <div class="runtime-actions">
                <a-button type="primary" :disabled="!runtimeDirty" @click="saveRuntime">
                  {{ t('common.save') }}
                </a-button>
                <span v-if="runtimeDirty" class="runtime-dirty">{{ t('settings.unsaved') }}</span>
              </div>
            </div>
          </a-tab-pane>

          <!-- 个性化 -->
          <a-tab-pane :tab="t('settings.personalization')" key="personalization">
            <a-form layout="vertical" class="settings-form">
              <a-form-item :label="t('settings.name')">
                <a-input
                  v-model:value="appName"
                  allow-clear
                  :placeholder="t('settings.namePlaceholder')"
                />
              </a-form-item>
              <a-form-item :label="t('settings.slogan')">
                <a-input
                  v-model:value="slogan"
                  allow-clear
                  :placeholder="t('settings.sloganPlaceholder')"
                />
              </a-form-item>
              <a-form-item :label="t('settings.customInstruction')">
                <a-textarea
                  v-model:value="systemPrompt"

                  :rows="5"
                  :placeholder="t('settings.customInstructionPlaceholder')"
                />
              </a-form-item>
              <div class="form-actions">
                <a-button type="primary" @click="savePersonalization">{{ t('common.save') }}</a-button>
                <a-button @click="restorePersonalization">{{ t('settings.restoreDefault') }}</a-button>
              </div>
            </a-form>
          </a-tab-pane>

          <!-- 供应商 -->
          <a-tab-pane :tab="t('settings.providers')" key="providers">
            <div class="provider-toolbar">
              <span class="provider-tip">{{ t('settings.providerTip') }}</span>
              <a-button type="primary" @click="openAdd">
                <span class="ui-icon"><Plus /></span>
                {{ t('settings.addProvider') }}
              </a-button>
            </div>
            <a-table
              :data-source="settings.providers"
              :columns="[
                { key: 'name', dataIndex: 'name', title: t('settings.providerName'), width: 140 },
                { key: 'baseUrl', dataIndex: 'baseUrl', title: t('settings.baseUrl'), width: 220, ellipsis: true },
                { key: 'models', title: t('settings.models') },
                { key: 'status', title: t('common.status'), width: 100 },
                { key: 'actions', title: t('common.actions'), width: 170, align: 'center' }
              ]"
              row-key="id"
              :pagination="false"
            >
              <template #bodyCell="{ column, record: row }">
                <template v-if="column.key === 'models'">
                  <a-tooltip v-if="row.models.length > 0" placement="top">
                    <template #title>
                      <div class="model-tooltip">
                        <div v-for="model in row.models" :key="model">{{ model }}</div>
                      </div>
                    </template>
                    <div class="model-tags">
                      <a-tag v-for="model in row.models" :key="model" class="model-tag">{{ model }}</a-tag>
                    </div>
                  </a-tooltip>
                  <span v-else>-</span>
                </template>
                <a-switch v-else-if="column.key === 'status'" :checked="row.enabled"
                  @update:checked="(value) => toggleProvider(row as ProviderDTO, Boolean(value))" />
                <div v-else-if="column.key === 'actions'" class="row-actions">
                  <a-button type="text" @click="openEdit(row as ProviderDTO)">{{ t('common.edit') }}</a-button>
                  <a-button type="text" danger @click="removeProvider(row as ProviderDTO)">{{ t('common.delete') }}</a-button>
                </div>
              </template>
              <template #emptyText><a-empty :description="t('common.empty')" /></template>
            </a-table>
          </a-tab-pane>

          <!-- 关于我们 -->
          <a-tab-pane :tab="t('settings.about')" key="about">
            <div class="about">
              <div class="about-brand">
                <img class="about-logo" :src="logo" alt="logo" />
                <div class="about-name">{{ t('app.name') }}</div>
              </div>
              <div class="about-list">
                <div class="about-row">
                  <span class="about-label">{{ t('settings.version') }}</span>
                  <div class="about-version">
                    <span class="about-value">{{ settings.version }}</span>
                    <a-button
                      size="small"
                      :loading="settings.updateChecking"
                      @click="settings.checkUpdate(true)"
                    >
                      {{ t('settings.checkUpdate') }}
                    </a-button>
                  </div>
                </div>
                <div class="about-row">
                  <span class="about-label">{{ t('settings.github') }}</span>
                  <a
                    class="about-link"
                    href="https://gitee.com/yudaocode/yudao-ai-desk"
                    target="_blank"
                    rel="noreferrer"
                  >
                    https://gitee.com/yudaocode/yudao-ai-desk
                  </a>
                </div>
                <div class="about-row">
                  <span class="about-label">{{ t('settings.docs') }}</span>
                  <a
                    class="about-link"
                    href="https://gitee.com/yudaocode/yudao-ai-desk/blob/main/README.md"
                    target="_blank"
                    rel="noreferrer"
                  >
                    https://gitee.com/yudaocode/yudao-ai-desk/blob/main/README.md
                  </a>
                </div>
              </div>
            </div>
          </a-tab-pane>
        </a-tabs>
      </div>
    </div>

    <!-- 供应商编辑弹窗 -->
    <a-modal
      v-model:open="dialogVisible"
      class="settings-dialog"
      :title="editingId ? t('settings.editProvider') : t('settings.addProvider')"
      width="620px"
      centered
    >
      <a-form layout="vertical">
        <a-form-item :label="t('settings.providerName')">
          <a-input v-model:value="form.name" placeholder="DeepSeek" />
        </a-form-item>
        <a-form-item :label="t('settings.baseUrl')">
          <a-input v-model:value="form.baseUrl" :placeholder="t('settings.baseUrlPlaceholder')" />
        </a-form-item>
        <a-form-item :label="t('settings.apiKey')">
          <a-input-password
            v-model:value="form.apiKey"


            :placeholder="t('settings.apiKeyPlaceholder')"
          />
        </a-form-item>
        <a-form-item :label="t('settings.headers')">
          <a-textarea
            v-model:value="headersText"

            :rows="3"
            :placeholder="t('settings.headersPlaceholder')"
          />
          <div class="field-hint">示例：{{ headersExample }}</div>
        </a-form-item>
        <a-form-item :label="t('settings.models')">
          <div class="model-editor">
            <div v-for="(_, index) in modelRows" :key="index" class="model-row">
              <a-auto-complete
                v-model:value="modelRows[index]"
                class="model-input"
                :options="remoteModels.map((model) => ({ value: model }))"
                allow-clear
                :placeholder="t('settings.modelPlaceholder')"
              />
              <a-button type="text" class="model-remove" @click="removeModelRow(index)">
                <span class="ui-icon"><Delete /></span>
              </a-button>
            </div>
            <div class="model-actions">
              <a-button @click="addModelRow()">
                <span class="ui-icon"><Plus /></span>
                {{ t('settings.addModel') }}
              </a-button>
              <a-button :loading="remoteLoading" @click="queryRemoteModels">
                <span class="ui-icon"><Refresh /></span>
                {{ t('settings.queryRemote') }}
              </a-button>
            </div>
          </div>
        </a-form-item>
        <a-form-item :label="t('common.enabled')">
          <a-switch v-model:checked="form.enabled" />
        </a-form-item>
      </a-form>
      <template #footer>
        <a-button @click="dialogVisible = false">{{ t('common.cancel') }}</a-button>
        <a-button type="primary" @click="submitProvider">{{ t('common.save') }}</a-button>
      </template>
    </a-modal>
  </div>
</template>

<style scoped lang="scss">
.settings-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  /* 字号与左侧菜单保持一致（14px），统一按钮与主要文案 */
  font-size: 14px;
}

/* 供应商弹窗（可能被 teleport 到 body，用 :global 命中），字号与左侧菜单一致 */
:global(.settings-dialog) {
  font-size: 14px;
}

/* 顶栏可拖拽移动窗口（导航控件除外） */
.settings-body {
  flex: 1;
}

/* 设置分类已移至左侧子菜单：隐藏内嵌 Tabs 头部，仅渲染当前分类内容 */
.settings-tabs :deep(.ant-tabs-nav) {
  display: none;
}

.settings-inner {
  max-width: 940px;
  margin: 0 auto;
  padding: 28px 32px 48px;
}

.field-hint {
  margin-top: 6px;
  font-size: 13px;
  color: var(--desk-text-tertiary);
  font-family: 'SFMono-Regular', ui-monospace, Menlo, Consolas, monospace;
}

.settings-form {
  max-width: 640px;
}

/* 表单底部操作按钮（个性化：保存 / 恢复默认） */
.form-actions {
  display: flex;
  gap: 8px;
}

.model-row {
  display: flex;
  gap: 12px;
  width: 100%;
}

.provider-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
}

.provider-tip {
  font-size: 12px;
  color: var(--desk-text-tertiary);
}

/* 模型列表：单行展示、溢出省略，悬浮 tooltip 查看全部 */
.model-tags {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 6px;
  overflow: hidden;
  max-width: 100%;
  white-space: nowrap;
}

.model-tags .model-tag {
  margin: 0;
  flex-shrink: 0;
}

.model-tooltip {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 260px;
  overflow-y: auto;
}

/* 供应商操作列：按钮不换行 */
.row-actions {
  display: flex;
  align-items: center;
  justify-content: center;
  white-space: nowrap;
}

/* 模型动态多行编辑器 */
.model-editor {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.model-editor .model-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.model-editor .model-input {
  flex: 1;
}

.model-editor .model-remove {
  flex-shrink: 0;
  color: var(--desk-text-tertiary);
}

.model-editor .model-actions {
  display: flex;
  gap: 8px;
}

/* 快捷键：快捷操作快捷键配置 */
.shortcuts {
  margin-top: 28px;
  padding-top: 20px;
  border-top: 1px solid var(--desk-border);
}

.shortcuts-title {
  font-size: 14px;
  color: var(--desk-text-secondary);
  margin-bottom: 6px;
}

.shortcuts-tip {
  font-size: 12px;
  color: var(--desk-text-tertiary);
  margin-bottom: 12px;
}

.shortcut-row {
  display: flex;
  align-items: center;
  gap: 16px;
  max-width: 640px;
  height: 40px;
}

.shortcut-label {
  flex: 1;
  min-width: 0;
  color: var(--desk-text);
}

.shortcut-actions {
  margin-top: 12px;
}

/* 运行时数据目录 */
.data-dir {
  margin-top: 28px;
  padding-top: 20px;
  border-top: 1px solid var(--desk-border);
}

.data-dir-title {
  font-size: 14px;
  color: var(--desk-text-secondary);
  margin-bottom: 6px;
}

.data-dir-tip {
  font-size: 12px;
  color: var(--desk-text-tertiary);
  margin-bottom: 12px;
}

.data-dir-row {
  display: flex;
  gap: 8px;
  max-width: 640px;
  margin-bottom: 12px;
}

.data-dir-input {
  flex: 1;
}

.data-dir-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 8px;
}

/* 命令运行环境（Node / Python 路径） */
.runtime {
  margin-top: 28px;
  padding-top: 20px;
  border-top: 1px solid var(--desk-border);
}

.runtime-title {
  font-size: 14px;
  color: var(--desk-text-secondary);
  margin-bottom: 6px;
}

.runtime-tip {
  font-size: 12px;
  color: var(--desk-text-tertiary);
  margin-bottom: 16px;
}

/* 每个运行时一个分组卡片，字段标签左对齐、状态独立展示 */
.runtime-group {
  max-width: 640px;
  padding: 14px 16px;
  margin-bottom: 12px;
  border: 1px solid var(--desk-border);
  border-radius: var(--desk-radius-sm);
  background: var(--desk-bg-elevated);
}

.runtime-group-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--desk-text);
  margin-bottom: 10px;
}

.runtime-field {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 32px;
}

.runtime-field + .runtime-field {
  margin-top: 10px;
}

.runtime-field-label {
  flex-shrink: 0;
  width: 40px;
  font-size: 13px;
  color: var(--desk-text-secondary);
}

.runtime-input {
  flex: 1;
}

/* 检测状态：常态弱化、成功绿色、失败红色 */
.runtime-status {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  color: var(--desk-text-tertiary);
  word-break: break-all;
}

.runtime-status.ok {
  color: #389e0d;
}

.runtime-status.error {
  color: #cf1322;
}

.runtime-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  max-width: 640px;
  margin-top: 4px;
}

.runtime-dirty {
  font-size: 12px;
  color: var(--desk-warning);
}

/* 关于我们 */
.about {
  display: flex;
  flex-direction: column;
  gap: 20px;
  max-width: 640px;
}

.about-brand {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.about-logo {
  width: 56px;
  height: 56px;
  border-radius: 16px;
  object-fit: contain;
  flex-shrink: 0;
  box-shadow: var(--desk-shadow);
}

.about-name {
  font-size: 17px;
  font-weight: 600;
  line-height: 1.3;
  text-align: center;
}

.about-list {
  border: 1px solid var(--desk-border);
  border-radius: var(--desk-radius-sm);
  overflow: hidden;
  background: var(--desk-bg-elevated);
}

.about-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 16px;
  font-size: 14px;
}

.about-row + .about-row {
  border-top: 1px solid var(--desk-border);
}

.about-label {
  color: var(--desk-text-secondary);
  flex-shrink: 0;
}

.about-value {
  color: var(--desk-text);
  font-family: 'SFMono-Regular', ui-monospace, Menlo, Consolas, monospace;
  font-size: 13px;
}

/* 版本行：版本号与「检查更新」同行展示，保持间距不挤压 */
.about-version {
  display: flex;
  align-items: center;
  gap: 16px;
}

.about-link {
  color: var(--desk-primary);
  text-decoration: none;
  word-break: break-all;
  text-align: right;
}

.about-link:hover {
  text-decoration: underline;
}
</style>
