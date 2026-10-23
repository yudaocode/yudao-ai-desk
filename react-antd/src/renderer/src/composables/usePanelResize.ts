/*
* 面板宽度拖拽：统一左侧栏（手柄在右缘）与右侧栏（手柄在左缘）的拖拽调整交互
* @author xuxueli 2026-10-18
*/
import { useCallback, useEffect, useRef, type MouseEvent as ReactMouseEvent } from 'react'

/* 拖拽边缘：left = 手柄在面板右缘（向右拖变宽）；right = 手柄在面板左缘（向左拖变宽） */
export type PanelResizeEdge = 'left' | 'right'

/* 入参：读写宽度（宽度状态由调用方/Zustand 持有）+ 手柄所在边缘 */
export interface PanelResizeOptions {
  getWidth: () => number
  setWidth: (width: number) => void
  edge: PanelResizeEdge
}

/* 返回拖拽启动函数，供手柄 onMouseDown 绑定；拖拽中卸载组件时移除窗口监听并复位 body 状态 */
export function usePanelResize(options: PanelResizeOptions): {
  startResize: (event: ReactMouseEvent) => void
} {
  const optionsRef = useRef(options)
  optionsRef.current = options
  const resizeCleanup = useRef<(() => void) | null>(null)

  useEffect(
    () => () => {
      resizeCleanup.current?.()
    },
    []
  )

  /* 开始拖拽：按边缘方向换算位移，实时写回宽度；拖拽期间禁用过渡与文本选中 */
  const startResize = useCallback((event: ReactMouseEvent): void => {
    event.preventDefault()
    resizeCleanup.current?.()
    const startX = event.clientX
    const startWidth = optionsRef.current.getWidth()
    const direction = optionsRef.current.edge === 'left' ? 1 : -1
    const onMove = (e: MouseEvent): void => {
      optionsRef.current.setWidth(startWidth + direction * (e.clientX - startX))
    }
    const onUp = (): void => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      document.body.classList.remove('resizing')
      resizeCleanup.current = null
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    document.body.classList.add('resizing')
    resizeCleanup.current = onUp
  }, [])

  return { startResize }
}
