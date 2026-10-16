import { normalizePhone, record } from './model'

export interface Credentials {
  idInstance: string
  apiTokenInstance: string
  apiUrl: string
}

export interface Notification {
  receiptId: number
  body: unknown
}

export interface GreenApi {
  getState(signal?: AbortSignal): Promise<string>
  checkAccount(phone: string, signal?: AbortSignal): Promise<string>
  sendMessage(chatId: string, message: string, signal?: AbortSignal): Promise<string>
  receiveNotification(signal?: AbortSignal): Promise<Notification | null>
  deleteNotification(receiptId: number, signal?: AbortSignal): Promise<void>
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly retryable = false,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

function httpError(status: number, method: string): ApiError {
  if (status === 401 || status === 403)
    return new ApiError('Проверьте ID инстанса, ключ доступа и состояние аккаунта в GREEN-API.')
  if (status === 466)
    return new ApiError(
      'Достигнут лимит трёх чатов на тарифе Developer. Проверьте лимиты в GREEN-API.',
    )
  if (status === 469)
    return new ApiError('MAX временно ограничил проверки номеров. Попробуйте позже.')
  if (status === 429)
    return new ApiError(
      'Слишком много запросов. Подключение повторится через несколько секунд.',
      true,
    )
  if (status === 400 && method === 'receiveNotification')
    return new ApiError(
      'Не удалось получать сообщения. Проверьте уведомления и пустой URL webhook в GREEN-API.',
    )
  return new ApiError(`GREEN-API вернул ошибку ${status}. Попробуйте позже.`, status >= 500)
}

export function createApi(credentials: Credentials): GreenApi {
  let host: URL
  try {
    host = new URL(credentials.apiUrl.trim())
  } catch {
    throw new ApiError('Проверьте адрес API из личного кабинета.')
  }
  if (
    host.protocol !== 'https:' ||
    !/^(?:\d+\.)?api\.green-api\.com$/.test(host.hostname) ||
    host.port ||
    host.username ||
    host.password ||
    host.search ||
    host.hash ||
    host.pathname !== '/'
  ) {
    throw new ApiError(
      'Используйте HTTPS-адрес API GREEN-API из личного кабинета, например https://api.green-api.com.',
    )
  }
  const id = credentials.idInstance.trim()
  const token = credentials.apiTokenInstance.trim()
  if (!/^\d+$/.test(id)) throw new ApiError('ID инстанса должен содержать только цифры.')
  if (!/^[a-zA-Z0-9_-]+$/.test(token))
    throw new ApiError('Проверьте ключ доступа: он не должен быть пустым или содержать пробелы.')
  const base = `${host.origin}/waInstance${id}`

  async function request(
    method: string,
    verb: string,
    payload?: unknown,
    signal?: AbortSignal,
    suffix = '',
  ): Promise<unknown> {
    const timeout = AbortSignal.timeout(method === 'receiveNotification' ? 65000 : 30000)
    const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout
    try {
      const response = await fetch(`${base}/${method}/${encodeURIComponent(token)}${suffix}`, {
        method: verb,
        signal: requestSignal,
        cache: 'no-store',
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        headers: payload === undefined ? undefined : { 'Content-Type': 'application/json' },
        body: payload === undefined ? undefined : JSON.stringify(payload),
      })
      if (!response.ok) throw httpError(response.status, method)
      const text = await response.text()
      if (!text.trim() && method === 'receiveNotification') return null
      try {
        return JSON.parse(text)
      } catch {
        throw new ApiError('Некорректный ответ GREEN-API. Попробуйте позже.', true)
      }
    } catch (error) {
      if (signal?.aborted) throw new DOMException('Request aborted', 'AbortError')
      if (error instanceof ApiError) throw error
      throw new ApiError(
        timeout.aborted
          ? 'Время ожидания GREEN-API истекло. Проверьте подключение.'
          : 'Не удалось связаться с GREEN-API. Проверьте интернет и адрес API.',
        true,
      )
    }
  }
  const invalidResponse = () =>
    new ApiError('Некорректный ответ GREEN-API. Попробуйте позже.', true)
  return {
    async getState(signal) {
      const data = record(await request('getStateInstance', 'GET', undefined, signal))
      if (typeof data.stateInstance !== 'string') throw invalidResponse()
      return data.stateInstance
    },
    async checkAccount(phone, signal) {
      const data = record(
        await request(
          'checkAccount',
          'POST',
          { phoneNumber: Number(normalizePhone(phone)) },
          signal,
        ),
      )
      if (data.exist === false)
        throw new ApiError(
          'На этом номере не найден аккаунт MAX. Проверьте номер и доступность поиска получателя.',
        )
      if (data.status === false)
        throw new ApiError(
          'Не удалось проверить номер в MAX. Проверьте авторизацию и лимиты инстанса.',
        )
      if (data.exist !== true || typeof data.chatId !== 'string' || !/^\d+$/.test(data.chatId))
        throw invalidResponse()
      return data.chatId
    },
    async sendMessage(chatId, message, signal) {
      if (!message.trim() || message.length > 4000)
        throw new ApiError('Сообщение должно содержать от 1 до 4000 символов.')
      const data = record(await request('sendMessage', 'POST', { chatId, message }, signal))
      if (typeof data.idMessage !== 'string' || !data.idMessage) throw invalidResponse()
      return data.idMessage
    },
    async receiveNotification(signal) {
      const result = await request(
        'receiveNotification',
        'GET',
        undefined,
        signal,
        '?receiveTimeout=30',
      )
      if (result === null) return null
      const data = record(result)
      if (!Number.isSafeInteger(data.receiptId)) throw invalidResponse()
      return { receiptId: data.receiptId as number, body: data.body }
    },
    async deleteNotification(receiptId, signal) {
      const data = record(
        await request('deleteNotification', 'DELETE', undefined, signal, `/${receiptId}`),
      )
      if (typeof data.result !== 'boolean') throw invalidResponse()
    },
  }
}
