/*
* 路由历史导航：基于 React Router 维护的 history.state.idx 判断能否后退/前进
* @author xuxueli 2026-10-18
*/
import { useCallback, useEffect, useState } from 'react'
import { useLocation, useNavigate, useNavigationType } from 'react-router-dom'

/* 当前窗口历史栈顶位置（sessionStorage：刷新后仍可前进，与 Vue Router 的 history.state.forward 一致） */
const HISTORY_TOP_KEY = 'desk-nav-history-top'

/* 当前 history 条目位置（React Router 写入 history.state.idx，刷新后保留） */
function currentIndex(): number {
  const state = window.history.state as { idx?: unknown } | null
  return typeof state?.idx === 'number' ? state.idx : 0
}

/* 已记录的历史栈顶位置（未记录或非法时回落 0） */
function storedTop(): number {
  const top = Number(sessionStorage.getItem(HISTORY_TOP_KEY))
  return Number.isInteger(top) && top > 0 ? top : 0
}

/* 返回：能否后退 / 能否前进，供顶部导航箭头控制可用态 */
export function useNavHistory(): { canBack: boolean; canForward: boolean } {
  const location = useLocation()
  const navigationType = useNavigationType()
  const [nav, setNav] = useState({ canBack: false, canForward: false })

  /* 路由完成后刷新：push 截断前进历史并以当前位置为栈顶；back/forward/replace/刷新 保持栈顶 */
  useEffect(() => {
    const index = currentIndex()
    const top = navigationType === 'PUSH' ? index : Math.max(storedTop(), index)
    sessionStorage.setItem(HISTORY_TOP_KEY, String(top))
    setNav({ canBack: index > 0, canForward: index < top })
  }, [location, navigationType])

  return nav
}

/* 路由跳转：目标与当前完整路径（含查询）相同则不入栈，与 Vue Router 重复导航不新增历史一致 */
export function useNavPush(): (path: string) => void {
  const navigate = useNavigate()
  return useCallback(
    (path: string) => {
      /* 读取实时 hash：异步回调（如选中会话后）中不使用渲染时的旧 location */
      if ((window.location.hash.slice(1) || '/') !== path) {
        navigate(path)
      }
    },
    [navigate]
  )
}
