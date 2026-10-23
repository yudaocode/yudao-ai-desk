/*
* 路由历史导航：基于 Vue Router 维护的 history.state 判断能否后退/前进
* @author xuxueli 2026-10-18
*/
import { onMounted, onUnmounted, ref, type Ref } from 'vue'
import { useRouter } from 'vue-router'

/* 返回：能否后退 / 能否前进（响应式），供顶部导航箭头控制可用态 */
export function useNavHistory(): { canBack: Ref<boolean>; canForward: Ref<boolean> } {
  const router = useRouter()
  const canBack = ref(false)
  const canForward = ref(false)

  /* 依据当前 history 条目的 back/forward 指针刷新按钮可用态 */
  function refresh(): void {
    const state = window.history.state as { back?: unknown; forward?: unknown } | null
    canBack.value = Boolean(state?.back)
    canForward.value = Boolean(state?.forward)
  }

  /* 路由完成后刷新（push/back/forward 均会更新 history.state） */
  const stop = router.afterEach(() => refresh())

  onMounted(refresh)

  onUnmounted(stop)

  refresh()

  return { canBack, canForward }
}
