import { expect, it } from 'vitest'
import { pollNotifications } from './polling'
import type { GreenApi } from './api'

it('processes and acknowledges each notification before receiving the next', async () => {
  const controller = new AbortController()
  const calls: string[] = []
  const api = {
    receiveNotification: async () => {
      calls.push('receive')
      return { receiptId: 7, body: { typeWebhook: 'unknown' } }
    },
    deleteNotification: async () => {
      calls.push('delete')
      controller.abort()
    },
  } as unknown as GreenApi
  await pollNotifications(
    api,
    {
      onNotification: () => {
        calls.push('process')
      },
      onError: () => {},
      onRecovery: () => {},
    },
    controller.signal,
  )
  expect(calls).toEqual(['receive', 'process', 'delete'])
})

it('retries acknowledgment without reprocessing a notification', async () => {
  const controller = new AbortController()
  let processed = 0
  let received = 0
  let deleted = 0
  const api = {
    receiveNotification: async () => {
      received++
      return { receiptId: 7, body: {} }
    },
    deleteNotification: async () => {
      deleted++
      if (deleted === 1) throw new Error('offline')
      controller.abort()
    },
  } as unknown as GreenApi
  await pollNotifications(
    api,
    {
      onNotification: () => {
        processed++
      },
      onError: () => {},
      onRecovery: () => {},
    },
    controller.signal,
    async () => {},
  )
  expect({ processed, received, deleted }).toEqual({ processed: 1, received: 1, deleted: 2 })
})

it('stops immediately when already aborted', async () => {
  const controller = new AbortController()
  controller.abort()
  let received = 0
  const api = {
    receiveNotification: async () => {
      received++
      return null
    },
  } as unknown as GreenApi
  await pollNotifications(
    api,
    { onNotification: () => {}, onError: () => {}, onRecovery: () => {} },
    controller.signal,
  )
  expect(received).toBe(0)
})
