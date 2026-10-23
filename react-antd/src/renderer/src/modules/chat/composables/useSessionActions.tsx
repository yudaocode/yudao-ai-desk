/*
* 会话当前项操作：重命名 / 删除（供顶栏等外壳复用，逻辑归属 chat 域）
* @author xuxueli 2026-10-18
*/
import { Input, Modal, message } from 'antd'
import { useChatStore } from '@renderer/stores/chat'
import { t } from '@renderer/i18n'

export interface SessionActions {
  onChatCommand: (command: string) => void
  renameCurrent: () => void
  deleteCurrent: () => void
}

export function useSessionActions(): SessionActions {
  /* 当前会话：弹框回调时读取最新状态，避免使用渲染时的旧会话 */
  function currentSession() {
    const chat = useChatStore.getState()
    return chat.sessions.find((item) => item.id === chat.currentId)
  }

  /* 重命名当前会话 */
  function renameCurrent(): void {
    const session = currentSession()
    if (!session) return
    let value = session.title
    Modal.confirm({
      title: t('chat.renameSession'),
      content: (
        <Input
          defaultValue={value}
          onChange={(event) => {
            value = event.target.value
          }}
        />
      ),
      okText: t('common.confirm'),
      cancelText: t('common.cancel'),
      onOk: () => useChatStore.getState().renameSession(session.id, value || session.title)
    })
  }

  /* 删除当前会话 */
  function deleteCurrent(): void {
    const session = currentSession()
    if (!session) return
    Modal.confirm({
      title: t('chat.deleteSession'),
      content: t('chat.deleteConfirm'),
      okText: t('common.delete'),
      cancelText: t('common.cancel'),
      onOk: async () => {
        await useChatStore.getState().removeSession(session.id)
        message.success(t('common.deleted'))
      }
    })
  }

  /* 会话操作下拉命令分发 */
  function onChatCommand(command: string): void {
    if (command === 'rename') renameCurrent()
    else if (command === 'delete') deleteCurrent()
  }

  return { onChatCommand, renameCurrent, deleteCurrent }
}
