/*
* 持久化宽度：localStorage 读写 + 越界夹取 + 默认值回落（左侧栏 / 右侧栏共用）
* @author xuxueli 2026-10-18
*/

/* 宽度约束与默认值 */
export interface PersistedWidthOptions {
  default: number
  min: number
  max: number
}

/* 返回：初始宽度 + 设置（夹取并持久化，返回生效宽度）+ 恢复默认（返回默认宽度）；响应式状态由 Zustand 持有 */
export interface PersistedWidth {
  width: number
  setWidth: (width: number) => number
  resetWidth: () => number
}

/* 创建持久化宽度：读取越界则回落默认；set 夹取后写回；reset 恢复默认值 */
export function createPersistedWidth(
  storageKey: string,
  options: PersistedWidthOptions
): PersistedWidth {
  const stored = Number(localStorage.getItem(storageKey))
  const width =
    Number.isFinite(stored) && stored >= options.min && stored <= options.max
      ? Math.round(stored)
      : options.default

  /* 设置宽度：夹取到 [min, max] 并持久化 */
  function setWidth(next: number): number {
    const value = Math.min(options.max, Math.max(options.min, Math.round(next)))
    localStorage.setItem(storageKey, String(value))
    return value
  }

  /* 恢复默认宽度并持久化 */
  function resetWidth(): number {
    localStorage.setItem(storageKey, String(options.default))
    return options.default
  }

  return { width, setWidth, resetWidth }
}
