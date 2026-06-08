/**
 * 极简事件总线，用于跨模块通信（例如 API 层通知 UI 层）。
 */
type Listener = (...args: unknown[]) => void

const listeners = new Map<string, Set<Listener>>()

export function on(event: string, fn: Listener) {
  if (!listeners.has(event)) {
    listeners.set(event, new Set())
  }
  listeners.get(event)!.add(fn)
  return () => listeners.get(event)?.delete(fn)
}

export function off(event: string, fn: Listener) {
  listeners.get(event)?.delete(fn)
}

export function emit(event: string, ...args: unknown[]) {
  listeners.get(event)?.forEach((fn) => fn(...args))
}
