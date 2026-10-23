/*
* 会话当前项操作：重命名 / 删除（供顶栏等外壳复用，逻辑归属 chat 域）
* @author xuxueli 2026-10-18
*/
import { h } from 'vue'
import { message as ElMessage, Modal, Input } from 'antdv-next'
import { useChatStore } from '@renderer/stores/chat'
import { t } from '@renderer/i18n'

export interface SessionActions {
  onChatCommand: (command: string) => void
  renameCurrent: () => Promise<void>
  deleteCurrent: () => Promise<void>
}

export function useSessionActions(): SessionActions {
  const chat = useChatStore()

  /* 重命名当前会话 */
  async function renameCurrent(): Promise<void> {
    const session = chat.currentSession
    if (!session) {
      return
    }
    try {
      let inputName = session.title
      const value = await new Promise<string>((resolve, reject) => {
        Modal.confirm({
          title: t('chat.renameSession'),
          content: () => h(Input, { defaultValue: inputName, onChange: (event: Event) => { inputName = (event.target as HTMLInputElement).value } }),
          okText: t('common.confirm'), cancelText: t('common.cancel'),
          onOk: () => resolve(inputName), onCancel: () => reject('cancel')
        })
      })
      await chat.renameSession(session.id, value || session.title)
    } catch {
      /* 取消 */
    }
  }

  /* 删除当前会话 */
  async function deleteCurrent(): Promise<void> {
    const session = chat.currentSession
    if (!session) {
      return
    }
    try {
      await new Promise<void>((resolve, reject) => {
        Modal.confirm({
          title: t('chat.deleteSession'), content: t('chat.deleteConfirm'),
          okText: t('common.delete'), cancelText: t('common.cancel'),
          onOk: () => resolve(), onCancel: () => reject('cancel')
        })
      })
      await chat.removeSession(session.id)
      ElMessage.success(t('common.deleted'))
    } catch {
      /* 取消 */
    }
  }

  /* 会话操作下拉命令分发 */
  function onChatCommand(command: string): void {
    if (command === 'rename') {
      void renameCurrent()
    } else if (command === 'delete') {
      void deleteCurrent()
    }
  }

  return { onChatCommand, renameCurrent, deleteCurrent }
}
