/*
 * 主进程 / 预加载 / 渲染进程共享契约的聚合入口：
 *   - 各域契约（DTO / 常量）定义在 contracts/*，此处统一再导出，保持既有 import 路径不变；
 *   - 汇总 IPC 通道常量（IPC）与 preload 暴露给渲染进程的 API 接口（DeskApi）。
 */

export * from './contracts/app'
export * from './contracts/provider'
export * from './contracts/project'
export * from './contracts/session'
export * from './contracts/chat'
export * from './contracts/terminal'
export * from './contracts/fs'
export * from './contracts/shell'

import type {
  AppSettings,
  RuntimeDetectResult,
  RuntimeExecInput,
  RuntimeInfo,
  UpdateInfo
} from './contracts/app'
import type { ProviderDTO, ProviderModelQuery } from './contracts/provider'
import type { ProjectCreateInput, ProjectDTO } from './contracts/project'
import type { SessionDTO, StoredMessage } from './contracts/session'
import type { ChatApprovalChoice, ChatApprovalPrompt, ChatEvent } from './contracts/chat'
import type { TerminalCreateInput, TerminalDTO, TerminalEvent } from './contracts/terminal'
import type { FileContent, FsEntry } from './contracts/fs'
import type { OpenWithApp } from './contracts/shell'

/* 预加载暴露给渲染进程的 API */
export interface DeskApi {
  /* 应用运行时信息与数据目录 */
  app: {
    /* 读取运行时信息（版本 / 平台 / 数据目录） */
    info(): Promise<RuntimeInfo>
    /* 切换数据目录并返回生效路径 */
    setDataDir(dir: string): Promise<string>
    /* 弹出目录选择框并切换数据目录 */
    selectDataDir(): Promise<string>
    /* 在文件管理器中打开数据目录 */
    openDataDir(): Promise<void>
    /* 重启应用使数据目录变更生效 */
    relaunch(): Promise<void>
    /* 弹出可执行文件选择框，取消返回空串 */
    selectExecutable(title?: string): Promise<string>
    /* 检测运行时可执行文件（node / python）版本 */
    detectExecutable(input: RuntimeExecInput): Promise<RuntimeDetectResult>
  }
  /* 客户端更新（引导式：检测 + 前往下载） */
  update: {
    /* 检测最新版本 */
    check(): Promise<UpdateInfo>
    /* 用系统浏览器打开下载 / release 页面 */
    openDownload(url: string): Promise<void>
  }
  /* 应用设置读写 */
  settings: {
    /* 读取应用设置 */
    get(): Promise<AppSettings>
    /* 保存设置片段并返回完整设置 */
    save(patch: Partial<AppSettings>): Promise<AppSettings>
  }
  /* 供应商（OpenAI 兼容端点）管理 */
  provider: {
    /* 供应商列表 */
    list(): Promise<ProviderDTO[]>
    /* 新增或更新供应商 */
    save(dto: Partial<ProviderDTO>): Promise<ProviderDTO>
    /* 删除供应商 */
    remove(id: string): Promise<void>
    /* 查询远端可用模型 */
    remoteModels(input: ProviderModelQuery): Promise<string[]>
  }
  /* 项目管理（1:1 绑定本地磁盘目录） */
  project: {
    /* 项目列表 */
    list(): Promise<ProjectDTO[]>
    /* 新建项目（path 缺省时弹出目录选择对话框，取消返回 null） */
    create(input?: ProjectCreateInput): Promise<ProjectDTO | null>
    /* 重命名项目（仅改名称，目录绑定不变） */
    rename(id: string, name: string): Promise<ProjectDTO>
    /* 删除项目（级联删除其下会话与消息） */
    remove(id: string): Promise<void>
    /* 在文件管理器中显示项目目录 */
    reveal(id: string): Promise<void>
  }
  /* 会话管理 */
  session: {
    /* 会话列表 */
    list(): Promise<SessionDTO[]>
    /* 新建会话（缺省使用设置中的供应商 / 模型） */
    create(input?: Partial<SessionDTO>): Promise<SessionDTO>
    /* 更新会话（供应商 / 模型 / 模式等） */
    update(id: string, patch: Partial<SessionDTO>): Promise<SessionDTO>
    /* 重命名会话 */
    rename(id: string, title: string): Promise<void>
    /* 删除会话 */
    remove(id: string): Promise<void>
    /* 读取会话历史消息 */
    messages(sessionId: string): Promise<StoredMessage[]>
    /* 清空会话消息 */
    clear(sessionId: string): Promise<void>
    /* 按 ID 删除指定消息 */
    removeMessages(sessionId: string, ids: string[]): Promise<void>
  }
  /* 对话（发送 / 中止 / 事件订阅 / 越界审批） */
  chat: {
    /* 发送用户消息并启动流式生成 */
    send(input: { sessionId: string; text: string }): Promise<void>
    /* 中止当前会话的生成 */
    abort(sessionId: string): Promise<void>
    /* 订阅对话流式事件（返回取消订阅函数） */
    onEvent(cb: (event: ChatEvent) => void): () => void
    /* 越界审批：主进程推送请求，渲染进程回传选择 */
    onApproval(cb: (prompt: ChatApprovalPrompt) => void): () => void
    /* 回传越界审批选择（once / session / deny） */
    respondApproval(requestId: string, choice: ChatApprovalChoice): Promise<void>
  }
  /* 终端（本地 PTY）管理 */
  terminal: {
    /* 创建终端实例 */
    create(input?: TerminalCreateInput): Promise<TerminalDTO>
    /* 写入终端输入 */
    write(id: string, data: string): Promise<void>
    /* 调整终端尺寸 */
    resize(id: string, cols: number, rows: number): Promise<void>
    /* 销毁终端实例 */
    dispose(id: string): Promise<void>
    /* 订阅终端输出 / 退出事件（返回取消订阅函数） */
    onEvent(cb: (event: TerminalEvent) => void): () => void
  }
  /* 本地文件系统（右侧「工具 → 文件」面板使用，限定在项目目录内） */
  fs: {
    /* 列出目录项（子目录懒加载） */
    list(root: string, dir: string): Promise<FsEntry[]>
    /* 读取文件内容（文本预览；图片附带预览数据 URL） */
    read(root: string, path: string): Promise<FileContent>
    /* 写入文件内容 */
    write(root: string, path: string, content: string): Promise<void>
    /* 监听目录变更（本地增删文件后自动刷新）；onChange 返回取消订阅函数 */
    watch(dir: string): Promise<void>
    /* 取消目录监听 */
    unwatch(dir: string): Promise<void>
    /* 订阅目录变更事件（返回取消订阅函数） */
    onChange(cb: (dir: string) => void): () => void
  }
  /* 系统外壳能力（外部打开 / 打开所在文件夹 / 在文件管理器中显示 / 用指定应用打开） */
  shell: {
    /* 用系统默认程序打开外部链接 */
    openExternal(url: string): Promise<void>
    /* 用系统默认程序打开文件或目录 */
    openPath(path: string): Promise<void>
    /* 在文件管理器中显示指定路径 */
    reveal(path: string): Promise<void>
    /* 探测本机可用的「打开方式」应用 */
    openWithApps(): Promise<OpenWithApp[]>
    /* 用指定应用打开文件 */
    openWith(appPath: string, file: string): Promise<void>
  }
  /* 内嵌浏览器（右侧「工具 → 浏览器」面板）：主进程把新窗口请求转发为「新标签页」 */
  browser: {
    /* 订阅新标签页请求（返回取消订阅函数） */
    onOpenTab(cb: (url: string) => void): () => void
  }
}

/* IPC 通道名（统一 desk:{module}:{action}；主进程经 ipcMain.handle 注册，preload 经 ipcRenderer.invoke/on 使用） */
export const IPC = {
  /* 应用信息与数据目录 */
  appInfo: 'desk:app:info',
  appSetDataDir: 'desk:app:set-data-dir',
  appSelectDataDir: 'desk:app:select-data-dir',
  appOpenDataDir: 'desk:app:open-data-dir',
  appRelaunch: 'desk:app:relaunch',
  appSelectExecutable: 'desk:app:select-executable',
  appDetectExecutable: 'desk:app:detect-executable',
  /* 客户端更新 */
  updateCheck: 'desk:update:check',
  updateOpen: 'desk:update:open',
  /* 应用设置 */
  settingsGet: 'desk:settings:get',
  settingsSave: 'desk:settings:save',
  /* 供应商 */
  providerList: 'desk:provider:list',
  providerSave: 'desk:provider:save',
  providerRemove: 'desk:provider:remove',
  providerRemoteModels: 'desk:provider:remote-models',
  /* 项目 */
  projectList: 'desk:project:list',
  projectCreate: 'desk:project:create',
  projectRename: 'desk:project:rename',
  projectRemove: 'desk:project:remove',
  projectReveal: 'desk:project:reveal',
  /* 会话 */
  sessionList: 'desk:session:list',
  sessionCreate: 'desk:session:create',
  sessionUpdate: 'desk:session:update',
  sessionRename: 'desk:session:rename',
  sessionRemove: 'desk:session:remove',
  sessionMessages: 'desk:session:messages',
  sessionClear: 'desk:session:clear',
  sessionDeleteMessages: 'desk:session:delete-messages',
  /* 对话 */
  chatSend: 'desk:chat:send',
  chatAbort: 'desk:chat:abort',
  chatEvent: 'desk:chat:event',
  chatApprovalRequest: 'desk:chat:approval-request',
  chatApprovalRespond: 'desk:chat:approval-respond',
  /* 终端 */
  terminalCreate: 'desk:terminal:create',
  terminalWrite: 'desk:terminal:write',
  terminalResize: 'desk:terminal:resize',
  terminalDispose: 'desk:terminal:dispose',
  terminalEvent: 'desk:terminal:event',
  /* 本地文件系统 */
  fsList: 'desk:fs:list',
  fsRead: 'desk:fs:read',
  fsWrite: 'desk:fs:write',
  fsWatch: 'desk:fs:watch',
  fsUnwatch: 'desk:fs:unwatch',
  fsChange: 'desk:fs:change',
  /* 系统外壳能力 */
  shellOpenExternal: 'desk:shell:open-external',
  shellOpenPath: 'desk:shell:open-path',
  shellReveal: 'desk:shell:reveal',
  shellOpenWithApps: 'desk:shell:open-with-apps',
  shellOpenWith: 'desk:shell:open-with',
  /* 内嵌浏览器新窗口请求 → 渲染层新标签页 */
  browserOpenTab: 'desk:browser:open-tab'
} as const
