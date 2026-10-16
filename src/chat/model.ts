export type MessageStatus = 'queued' | 'sent' | 'delivered' | 'read' | 'failed' | 'received'

export interface Message {
  id: string
  text: string
  timestamp: number
  direction: 'incoming' | 'outgoing'
  status: MessageStatus
}

export interface Chat {
  id: string
  name: string
  phone?: string
  messages: Message[]
  unread: number
}

export interface ChatState {
  chats: Chat[]
  activeChatId: string | null
  pendingStatuses: Record<string, MessageStatus>
}

export type ChatEvent =
  | { kind: 'open'; chatId: string; phone: string }
  | { kind: 'select'; chatId: string | null }
  | { kind: 'message'; chatId: string; name?: string; phone?: string; message: Message }
  | { kind: 'status'; chatId: string; id: string; status: MessageStatus }

export const initialChatState: ChatState = { chats: [], activeChatId: null, pendingStatuses: {} }

export function normalizePhone(input: string): string {
  if (!/^[+\d\s()-]+$/.test(input))
    throw new Error('Введите номер телефона в международном формате.')
  let digits = input.replace(/\D/g, '')
  if (/^8\d{10}$/.test(digits)) digits = `7${digits.slice(1)}`
  if (!/^(7\d{10}|375\d{9})$/.test(digits)) {
    throw new Error(
      'Введите номер с кодом +7 или +375. Проверка MAX поддерживает номера РФ и Беларуси.',
    )
  }
  return digits
}

export function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

const messageStatuses: MessageStatus[] = [
  'queued',
  'sent',
  'delivered',
  'read',
  'failed',
  'received',
]

export function parseNotification(value: unknown): ChatEvent | null {
  const body = record(value)
  if (body.typeWebhook === 'outgoingMessageStatus') {
    if (
      typeof body.chatId !== 'string' ||
      typeof body.idMessage !== 'string' ||
      !messageStatuses.includes(body.status as MessageStatus)
    )
      return null
    return {
      kind: 'status',
      chatId: body.chatId,
      id: body.idMessage,
      status: body.status as MessageStatus,
    }
  }
  if (
    typeof body.typeWebhook !== 'string' ||
    !['incomingMessageReceived', 'outgoingMessageReceived', 'outgoingAPIMessageReceived'].includes(
      body.typeWebhook,
    )
  )
    return null
  const sender = record(body.senderData)
  if (
    sender.chatType === 'group' ||
    typeof sender.chatId !== 'string' ||
    !/^\d+(?:@c\.us)?$/.test(sender.chatId)
  )
    return null
  const data = record(body.messageData)
  const text =
    data.typeMessage === 'textMessage'
      ? record(data.textMessageData).textMessage
      : data.typeMessage === 'extendedTextMessage'
        ? record(data.extendedTextMessageData).text
        : undefined
  if (
    typeof text !== 'string' ||
    typeof body.idMessage !== 'string' ||
    typeof body.timestamp !== 'number' ||
    !Number.isFinite(body.timestamp)
  )
    return null
  if (!Number.isFinite(new Date(body.timestamp * 1000).getTime())) return null
  const incoming = body.typeWebhook === 'incomingMessageReceived'
  const name = sender.senderContactName || sender.chatName || sender.senderName
  const phone = sender.senderPhoneNumber
  return {
    kind: 'message',
    chatId: sender.chatId,
    name: typeof name === 'string' ? name : undefined,
    phone:
      typeof phone === 'number' && phone > 0
        ? String(phone)
        : typeof phone === 'string' && /^\d+$/.test(phone)
          ? phone
          : undefined,
    message: {
      id: body.idMessage,
      text,
      timestamp: body.timestamp * 1000,
      direction: incoming ? 'incoming' : 'outgoing',
      status: incoming ? 'received' : 'sent',
    },
  }
}

function advanceStatus(current: MessageStatus, next: MessageStatus): MessageStatus {
  if (current === 'received') return current
  if (next === 'failed') return current === 'read' || current === 'delivered' ? current : next
  if (current === 'failed') return next === 'delivered' || next === 'read' ? next : current
  const order: MessageStatus[] = ['queued', 'sent', 'delivered', 'read']
  return order.indexOf(next) > order.indexOf(current) ? next : current
}

export function reduceChat(state: ChatState, event: ChatEvent): ChatState {
  if (event.kind === 'select') {
    return {
      ...state,
      activeChatId: event.chatId,
      chats: state.chats.map((chat) => (chat.id === event.chatId ? { ...chat, unread: 0 } : chat)),
    }
  }
  if (event.kind === 'status') {
    const key = `${event.chatId}:${event.id}`
    const existing = state.chats.some(
      (chat) =>
        chat.id === event.chatId && chat.messages.some((message) => message.id === event.id),
    )
    if (!existing) {
      const pendingStatuses = {
        ...state.pendingStatuses,
        [key]: advanceStatus(state.pendingStatuses[key] ?? 'queued', event.status),
      }
      const keys = Object.keys(pendingStatuses)
      if (keys.length > 500) delete pendingStatuses[keys[0]]
      return { ...state, pendingStatuses }
    }
    return {
      ...state,
      chats: state.chats.map((chat) =>
        chat.id === event.chatId
          ? {
              ...chat,
              messages: chat.messages.map((message) =>
                message.id === event.id
                  ? { ...message, status: advanceStatus(message.status, event.status) }
                  : message,
              ),
            }
          : chat,
      ),
    }
  }
  const found = state.chats.find((chat) => chat.id === event.chatId)
  const chat: Chat = found ?? { id: event.chatId, name: '', messages: [], unread: 0 }
  if (event.kind === 'open') {
    const updated = { ...chat, phone: event.phone, unread: 0 }
    return {
      ...state,
      activeChatId: event.chatId,
      chats: found
        ? state.chats.map((item) => (item.id === chat.id ? updated : item))
        : [updated, ...state.chats],
    }
  }
  const duplicate = chat.messages.some((message) => message.id === event.message.id)
  const key = `${event.chatId}:${event.message.id}`
  const pending = state.pendingStatuses[key]
  const pendingStatuses = { ...state.pendingStatuses }
  delete pendingStatuses[key]
  const message = {
    ...event.message,
    status: pending ? advanceStatus(event.message.status, pending) : event.message.status,
  }
  const updated: Chat = {
    ...chat,
    name: event.name || chat.name,
    phone: event.phone || chat.phone,
    messages: duplicate
      ? chat.messages
      : [...chat.messages, message].sort((a, b) => a.timestamp - b.timestamp),
    unread:
      chat.unread +
      (!duplicate && message.direction === 'incoming' && state.activeChatId !== chat.id ? 1 : 0),
  }
  return {
    ...state,
    pendingStatuses,
    chats: found
      ? state.chats.map((item) => (item.id === chat.id ? updated : item))
      : [updated, ...state.chats],
  }
}
