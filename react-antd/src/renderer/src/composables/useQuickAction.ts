/* 快捷操作执行器：命令面板和全局快捷键使用相同业务操作。 */
import { useNavPush } from '@renderer/composables/useNavHistory'
import { useChatStore } from '@renderer/stores/chat'
import { useLayoutStore } from '@renderer/stores/layout'
import type { QuickAction } from '@shared/ipc'
export function useQuickAction(): (action: QuickAction) => void {
  const navigate = useNavPush()
  return (action) => {
    if (action === 'newChat') {
      useChatStore.getState().startNewChat()
      navigate('/')
    } else if (action === 'settings') navigate('/settings')
    else if (action === 'terminal') {
      navigate('/')
      useLayoutStore.getState().openTerminal()
    } else if (action === 'files' || action === 'browser') {
      navigate('/')
      useLayoutStore.getState().openRightPanelTool(action)
    }
  }
}
