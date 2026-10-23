/*
 * 应用域跨进程契约：运行时信息、应用设置、快捷键与客户端更新。
 */

/* 快捷操作标识（命令面板「快捷操作」区块，同时支持全局快捷键触发） */
export type QuickAction = 'newChat' | 'settings' | 'terminal' | 'files' | 'browser'

/* 快捷操作 → 快捷键绑定：键名小写、以 + 连接，mod 表示平台主修饰键（macOS ⌘ / 其他 Ctrl） */
export type ShortcutMap = Partial<Record<QuickAction, string>>

/* 快捷键默认值（主进程与渲染进程共用；mod = 平台主修饰键，macOS ⌘ / 其他 Ctrl）
 * 取值按助记字母：新建 N、设置 S、终端 T、文件 F、浏览器 B */
export const DEFAULT_SHORTCUTS: ShortcutMap = {
  newChat: 'mod+n',
  settings: 'mod+s',
  terminal: 'mod+t',
  files: 'mod+f',
  browser: 'mod+b'
}

/* 应用设置 */
export interface AppSettings {
  /* 主题 */
  theme: 'light' | 'dark' | 'system'
  /* 界面语言（不支持运行时切换，需重启生效） */
  language: 'zh' | 'en'
  /* 当前供应商主键 */
  providerId: string
  /* 当前模型 ID */
  modelId: string
  /* 系统提示词（自定义指令） */
  systemPrompt: string
  /* 个性化：应用名称（左上角 Logo 区域）与 Slogan（空态欢迎语） */
  appName: string
  slogan: string
  /* 快捷操作快捷键（缺省项回退 DEFAULT_SHORTCUTS） */
  shortcuts: ShortcutMap
  /* 命令运行环境：Node 来源（builtin 内置 Electron Node / custom 自定义路径） */
  runtimeNodeMode: 'builtin' | 'custom'
  /* 自定义 Node 可执行文件路径（runtimeNodeMode=custom 时生效） */
  runtimeNodePath: string
  /* 自定义 Python 解释器路径（留空自动探测系统 python3 / python） */
  runtimePythonPath: string
  /* 启动时自动检查客户端更新 */
  updateAutoCheck: boolean
}

/* 运行时可执行文件检测入参 */
export interface RuntimeExecInput {
  /* 运行时类型：node / python */
  kind: 'node' | 'python'
  /* 可执行文件路径；node 省略时使用内置 Node，python 省略时自动探测 */
  path?: string
}

/* 运行时可执行文件检测结果 */
export interface RuntimeDetectResult {
  /* 是否检测通过 */
  ok: boolean
  /* 解析到的版本（如 v22.9.0 / Python 3.12.4） */
  version: string
  /* 实际使用的可执行文件路径或命令名 */
  path: string
  /* 失败提示（ok=false 时） */
  message: string
}

/* 运行时信息（版本 / 平台 / 数据目录） */
export interface RuntimeInfo {
  /* 应用版本 */
  version: string
  /* 运行平台（darwin / win32 / linux） */
  platform: string
  /* 当前数据目录 */
  dataDir: string
  /* 默认数据目录 */
  defaultDataDir: string
  /* SQLite 数据库文件路径 */
  dbFile: string
}

/* 客户端更新信息（引导式：检测 + 前往下载） */
export interface UpdateInfo {
  /* 是否有新版本 */
  hasUpdate: boolean
  /* 当前版本 */
  currentVersion: string
  /* 最新版本（去 v 前缀） */
  latestVersion: string
  /* release 页面地址 */
  releaseUrl: string
  /* 匹配到的安装包直链（可能为空） */
  downloadUrl: string
  /* release 说明正文 */
  notes: string
  /* 发布时间（ISO） */
  publishedAt: string
}
