/*
* 面板宽度拖拽：统一左侧栏（手柄在右缘）与右侧栏（手柄在左缘）的拖拽调整交互
* @author xuxueli 2026-10-18
*/

/* 拖拽边缘：left = 手柄在面板右缘（向右拖变宽）；right = 手柄在面板左缘（向左拖变宽） */
export type PanelResizeEdge = 'left' | 'right'

/* 入参：读写宽度（宽度状态由调用方/Pinia 持有）+ 手柄所在边缘 */
export interface PanelResizeOptions {
  getWidth: () => number
  setWidth: (width: number) => void
  edge: PanelResizeEdge
}

/* 返回拖拽启动函数，供手柄 mousedown 绑定 */
export function usePanelResize(options: PanelResizeOptions): {
  startResize: (event: MouseEvent) => void
} {
  /* 开始拖拽：按边缘方向换算位移，实时写回宽度；拖拽期间禁用过渡与文本选中 */
  function startResize(event: MouseEvent): void {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = options.getWidth()
    const direction = options.edge === 'left' ? 1 : -1
    const onMove = (e: MouseEvent): void => {
      options.setWidth(startWidth + direction * (e.clientX - startX))
    }
    const onUp = (): void => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      document.body.classList.remove('resizing')
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    document.body.classList.add('resizing')
  }

  return { startResize }
}
