/*
 * IPC 网关：注册主进程全部 ipcMain 处理器，只做参数透传、必要编排（如 dataDir 选择）与错误兜底。
 *   - 业务编排下沉 services/*（chat 编排在 services/chatService.ts）；底层能力由 agent/* 提供。
 *   - 本文件不写业务规则，保持薄网关。
 */

import { app, dialog, ipcMain, shell, type BrowserWindow } from 'electron'
import { IPC } from '@shared/ipc'
import type {
  AppSettings,
  ChatApprovalChoice,
  ProviderDTO,
  ProviderModelQuery,
  ProjectCreateInput,
  RuntimeExecInput,
  RuntimeInfo,
  SessionDTO,
  StoredMessage,
  TerminalCreateInput
} from '@shared/ipc'
import { getSettings, saveSettings } from './services/settingsService'
import { getDataDir, getDbFile, getDefaultDataDir, setDataDir } from './config/paths'
import { detectExecutable } from './services/envService'
import { checkForUpdate, openDownload } from './services/updateService'
import {
  deleteProvider,
  fetchRemoteModels,
  listProviders,
  saveProvider
} from './services/providerService'
import {
  clearMessages,
  createSession,
  deleteMessages,
  deleteSession,
  listMessages,
  listSessions,
  updateSession
} from './services/sessionService'
import {
  createProject,
  deleteProject,
  getProject,
  listProjects,
  renameProject
} from './services/projectService'
import {
  createTerminal,
  disposeAllTerminals,
  disposeTerminal,
  onTerminalEvent,
  resizeTerminal,
  writeTerminal
} from './services/terminalService'
import { listDir, readFile, writeFile } from './services/fsService'
import { initFsWatch, unwatchDir, watchDir } from './services/fsWatchService'
import { listOpenWithApps, openWith } from './services/openWithService'
import { abortChat, respondApproval, sendChat } from './services/chatService'
import {
  clearSessionPermissions,
  disposeAgentRuntime,
  evictAgent,
  resetAgents
} from './agent/host/runtimeHost'

/* 注册全部 IPC 处理器 */
export function registerIpc(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle(
    IPC.appInfo,
    (): RuntimeInfo => ({
      version: app.getVersion(),
      platform: process.platform,
      dataDir: getDataDir(),
      defaultDataDir: getDefaultDataDir(),
      dbFile: getDbFile()
    })
  )
  ipcMain.handle(IPC.appSetDataDir, (_event, dir: string) => setDataDir(dir))
  ipcMain.handle(IPC.appSelectDataDir, async () => {
    const result = await dialog.showOpenDialog({
      title: '选择数据目录',
      defaultPath: getDataDir(),
      properties: ['openDirectory', 'createDirectory']
    })
    return result.canceled || result.filePaths.length === 0 ? '' : result.filePaths[0]
  })
  ipcMain.handle(IPC.appOpenDataDir, async () => {
    await shell.openPath(getDataDir())
  })
  ipcMain.handle(IPC.appRelaunch, () => {
    /*
     * 开发模式：electron-vite 的 dev server 会随本进程退出而关闭，
     * app.relaunch 拉起的新进程无渲染服务可加载（白屏），故此处兜底不重启（渲染层已做样式化提示）。
     */
    if (!app.isPackaged) {
      console.warn('[relaunch] 开发模式下不执行自动重启，请手动重新运行 npm run dev')
      return
    }
    /* app.exit 不触发 before-quit，需先手动回收运行时进程与终端，避免残留 */
    disposeAgentRuntime()
    disposeAllTerminals()
    app.relaunch()
    app.exit(0)
  })

  /* 弹出可执行文件选择框（供设置中选择 Node / Python） */
  ipcMain.handle(IPC.appSelectExecutable, async (_event, title?: string) => {
    const result = await dialog.showOpenDialog({
      title: title || '选择可执行文件',
      properties: ['openFile']
    })
    if (result.canceled || result.filePaths.length === 0) {
      return ''
    }
    return result.filePaths[0]
  })
  /* 检测运行时可执行文件（node / python）版本 */
  ipcMain.handle(IPC.appDetectExecutable, (_event, input: RuntimeExecInput) =>
    detectExecutable(input)
  )

  /* --- 客户端更新（引导式） --- */
  ipcMain.handle(IPC.updateCheck, () => checkForUpdate())
  ipcMain.handle(IPC.updateOpen, (_event, url: string) => openDownload(url))

  /* --- 设置 --- */
  ipcMain.handle(IPC.settingsGet, () => getSettings())
  ipcMain.handle(IPC.settingsSave, (_event, patch: Partial<AppSettings>) => {
    const saved = saveSettings(patch)
    /* 自定义指令变更后清空运行时缓存，使全部会话（含旧对话）下次对话即生效 */
    if (patch.systemPrompt !== undefined) {
      resetAgents()
    }
    return saved
  })

  /* --- 供应商 --- */
  ipcMain.handle(IPC.providerList, () => listProviders())
  ipcMain.handle(IPC.providerSave, (_event, dto: Partial<ProviderDTO>) => {
    const saved = saveProvider(dto)
    /* 供应商配置（含 API Key）变更后，清空运行时缓存，使下一次对话立即生效 */
    resetAgents()
    return saved
  })
  ipcMain.handle(IPC.providerRemove, (_event, id: string) => {
    deleteProvider(id)
    resetAgents()
  })
  ipcMain.handle(IPC.providerRemoteModels, (_event, input: ProviderModelQuery) =>
    fetchRemoteModels(input)
  )

  /* --- 项目（1:1 绑定本地目录） --- */
  ipcMain.handle(IPC.projectList, () => listProjects())
  ipcMain.handle(IPC.projectCreate, async (_event, input?: ProjectCreateInput) => {
    /* 未显式传入路径时，弹出系统目录选择对话框（取消返回 null） */
    let path = input?.path?.trim() ?? ''
    if (!path) {
      const result = await dialog.showOpenDialog({
        title: input?.dialogTitle || '选择项目目录',
        properties: ['openDirectory', 'createDirectory']
      })
      if (result.canceled || result.filePaths.length === 0) {
        return null
      }
      path = result.filePaths[0]
    }
    return createProject({ name: input?.name, path })
  })
  ipcMain.handle(IPC.projectRename, (_event, id: string, name: string) => renameProject(id, name))
  ipcMain.handle(IPC.projectRemove, (_event, id: string) => {
    /* 级联删除前先清理项目下会话的运行时 Agent 缓存与越界白名单 */
    const removed = deleteProject(id)
    removed.forEach((sessionId) => {
      evictAgent(sessionId)
      clearSessionPermissions(sessionId)
    })
  })
  ipcMain.handle(IPC.projectReveal, (_event, id: string) => {
    /* 在系统文件管理器中展示项目目录（macOS Finder / Windows 资源管理器 / Linux 文件管理器） */
    const project = getProject(id)
    if (project) {
      shell.showItemInFolder(project.path)
    }
  })

  /* --- 会话 --- */
  ipcMain.handle(IPC.sessionList, () => listSessions())
  ipcMain.handle(IPC.sessionCreate, (_event, input?: Partial<SessionDTO>) => createSession(input))
  ipcMain.handle(IPC.sessionUpdate, (_event, id: string, patch: Partial<SessionDTO>) => {
    evictAgent(id)
    return updateSession(id, patch)
  })
  ipcMain.handle(IPC.sessionRename, (_event, id: string, title: string) => {
    updateSession(id, { title })
  })
  ipcMain.handle(IPC.sessionRemove, (_event, id: string) => {
    evictAgent(id)
    clearSessionPermissions(id)
    deleteSession(id)
  })
  ipcMain.handle(IPC.sessionMessages, (_event, sessionId: string): StoredMessage[] =>
    listMessages(sessionId)
  )
  ipcMain.handle(IPC.sessionClear, (_event, sessionId: string) => {
    evictAgent(sessionId)
    clearSessionPermissions(sessionId)
    clearMessages(sessionId)
  })
  ipcMain.handle(IPC.sessionDeleteMessages, (_event, sessionId: string, ids: string[]) => {
    /* 删除消息后清空运行时缓存，使对话上下文与存储一致 */
    evictAgent(sessionId)
    deleteMessages(sessionId, ids)
  })

  /* --- 对话（编排下沉 chatService，网关仅转发事件） --- */
  ipcMain.handle(IPC.chatSend, (_event, input: { sessionId: string; text: string }) =>
    sendChat(input, (payload) => {
      getWindow()?.webContents.send(IPC.chatEvent, payload)
    })
  )
  ipcMain.handle(IPC.chatAbort, (_event, sessionId: string) => abortChat(sessionId))
  /* 越界审批：渲染进程回传选择，唤醒等待中的越界确认 */
  ipcMain.handle(IPC.chatApprovalRespond, (_event, requestId: string, choice: ChatApprovalChoice) =>
    respondApproval(requestId, choice)
  )

  /* --- 终端（本地 PTY） --- */
  ipcMain.handle(IPC.terminalCreate, (_event, input?: TerminalCreateInput) => createTerminal(input))
  ipcMain.handle(IPC.terminalWrite, (_event, id: string, data: string) => writeTerminal(id, data))
  ipcMain.handle(IPC.terminalResize, (_event, id: string, cols: number, rows: number) =>
    resizeTerminal(id, cols, rows)
  )
  ipcMain.handle(IPC.terminalDispose, (_event, id: string) => disposeTerminal(id))
  /* 终端输出/退出事件统一转发到渲染窗口 */
  onTerminalEvent((event) => {
    getWindow()?.webContents.send(IPC.terminalEvent, event)
  })

  /* --- 本地文件系统（右侧「文件」面板；限定项目目录内） --- */
  ipcMain.handle(IPC.fsList, (_event, root: string, dir: string) => listDir(root, dir))
  ipcMain.handle(IPC.fsRead, (_event, root: string, path: string) => readFile(root, path))
  ipcMain.handle(IPC.fsWrite, (_event, root: string, path: string, content: string) =>
    writeFile(root, path, content)
  )
  /* 目录监听：本地增删文件后推送变更，渲染层刷新对应目录 */
  initFsWatch((dir) => getWindow()?.webContents.send(IPC.fsChange, dir))
  ipcMain.handle(IPC.fsWatch, (_event, dir: string) => watchDir(dir))
  ipcMain.handle(IPC.fsUnwatch, (_event, dir: string) => unwatchDir(dir))

  /* --- 系统外壳能力 --- */
  ipcMain.handle(IPC.shellOpenExternal, (_event, url: string) => shell.openExternal(url))
  ipcMain.handle(IPC.shellOpenPath, (_event, path: string) => shell.openPath(path))
  ipcMain.handle(IPC.shellReveal, (_event, path: string) => {
    shell.showItemInFolder(path)
  })
  ipcMain.handle(IPC.shellOpenWithApps, () => listOpenWithApps())
  ipcMain.handle(IPC.shellOpenWith, (_event, appPath: string, file: string) =>
    openWith(appPath, file)
  )
}
