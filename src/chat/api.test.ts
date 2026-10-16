import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApi } from './api'

const credentials = {
  idInstance: '3100000000',
  apiTokenInstance: 'test-token',
  apiUrl: 'https://api.green-api.com',
}
afterEach(() => vi.unstubAllGlobals())

describe('GREEN-API client', () => {
  it('resolves a phone number to the MAX chatId using a numeric phoneNumber', async () => {
    let captured: { url?: string; body?: unknown } = {}
    vi.stubGlobal('fetch', async (url: string, options: RequestInit) => {
      captured = { url, body: JSON.parse(options.body as string) }
      return new Response(JSON.stringify({ exist: true, chatId: '10000000', fromCache: true }))
    })
    expect(await createApi(credentials).checkAccount('79991234567')).toBe('10000000')
    expect(captured).toEqual({
      url: 'https://api.green-api.com/waInstance3100000000/checkAccount/test-token',
      body: { phoneNumber: 79991234567 },
    })
  })
  it('rejects a phone without a MAX account', async () => {
    vi.stubGlobal(
      'fetch',
      async () => new Response(JSON.stringify({ exist: false, chatId: '', fromCache: false })),
    )
    await expect(createApi(credentials).checkAccount('79991234567')).rejects.toThrow(/MAX/)
  })
  it('returns null for an empty receive response', async () => {
    vi.stubGlobal('fetch', async () => new Response(''))
    expect(await createApi(credentials).receiveNotification()).toBeNull()
  })
  it('returns a valid receipt even for an unsupported body so it can be acknowledged', async () => {
    vi.stubGlobal(
      'fetch',
      async () => new Response(JSON.stringify({ receiptId: 7, body: 'unsupported' })),
    )
    expect(await createApi(credentials).receiveNotification()).toEqual({
      receiptId: 7,
      body: 'unsupported',
    })
  })
  it('sends text once and returns its message identifier', async () => {
    const fetcher = vi.fn(
      async (..._args: [string, RequestInit]) =>
        new Response(JSON.stringify({ idMessage: 'out-1' })),
    )
    vi.stubGlobal('fetch', fetcher)
    expect(await createApi(credentials).sendMessage('10000000', 'Привет')).toBe('out-1')
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(JSON.parse(fetcher.mock.calls[0][1]!.body as string)).toEqual({
      chatId: '10000000',
      message: 'Привет',
    })
  })
  it('does not expose server text or credentials in errors', async () => {
    vi.stubGlobal('fetch', async () => new Response('secret test-token', { status: 401 }))
    try {
      await createApi(credentials).getState()
    } catch (error) {
      expect((error as Error).message).not.toContain('test-token')
      expect((error as Error).message).toMatch(/ключ|доступ/i)
    }
  })
  it.each([
    'https://evil.example',
    'https://green-api.com.evil.example',
    'http://api.green-api.com',
    'https://user:password@api.green-api.com',
  ])('rejects an unsafe API host %s', (apiUrl) => {
    expect(() => createApi({ ...credentials, apiUrl })).toThrow()
  })
  it('accepts the official cluster host', () => {
    expect(() =>
      createApi({ ...credentials, apiUrl: 'https://3100.api.green-api.com/' }),
    ).not.toThrow()
  })
  it('rejects malformed success responses', async () => {
    vi.stubGlobal('fetch', async () => new Response('{}'))
    await expect(createApi(credentials).sendMessage('10000000', 'Hi')).rejects.toThrow(/ответ/i)
  })
})
