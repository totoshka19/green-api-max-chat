import { ApiError, type GreenApi, type Notification } from './api'

interface PollHandlers {
  onNotification(body: unknown): void
  onError(error: Error): void
  onRecovery(): void
}

function pause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve()
      return
    }
    const finish = () => {
      clearTimeout(timer)
      signal.removeEventListener('abort', finish)
      resolve()
    }
    const timer = setTimeout(finish, ms)
    signal.addEventListener('abort', finish, { once: true })
  })
}

export async function pollNotifications(
  api: GreenApi,
  handlers: PollHandlers,
  signal: AbortSignal,
  wait: (ms: number, signal: AbortSignal) => Promise<void> = pause,
): Promise<void> {
  let pending: Notification | null = null
  let failures = 0
  while (!signal.aborted) {
    try {
      if (!pending) {
        const notification = await api.receiveNotification(signal)
        if (signal.aborted) break
        if (notification) {
          handlers.onNotification(notification.body)
          pending = notification
        }
      }
      if (pending) {
        await api.deleteNotification(pending.receiptId, signal)
        pending = null
      }
      if (signal.aborted) break
      if (failures) handlers.onRecovery()
      failures = 0
      await wait(250, signal)
    } catch (error) {
      if (signal.aborted) break
      const problem = error instanceof Error ? error : new Error('Не удалось получить сообщения.')
      handlers.onError(problem)
      if (problem instanceof ApiError && !problem.retryable) break
      failures++
      await wait(Math.min(1000 * 2 ** Math.min(failures - 1, 4), 15000), signal)
    }
  }
}
