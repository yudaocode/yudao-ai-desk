/* 活动任务共享时钟：首个订阅者启动、最后一个退订后停止。 */
import { useEffect, useSyncExternalStore } from 'react'
let now = Date.now()
let timer: ReturnType<typeof setInterval> | null = null
const subscribers = new Set<() => void>()
function subscribe(listener: () => void): () => void {
  subscribers.add(listener)
  if (!timer)
    timer = setInterval(() => {
      now = Date.now()
      subscribers.forEach((notify) => notify())
    }, 500)
  return () => {
    subscribers.delete(listener)
    if (!subscribers.size && timer) {
      clearInterval(timer)
      timer = null
    }
  }
}
const idleSubscribe = () => () => {}
export function useNow(active: boolean): number {
  useEffect(() => {
    if (active) now = Date.now()
  }, [active])
  return useSyncExternalStore(active ? subscribe : idleSubscribe, () => now)
}
