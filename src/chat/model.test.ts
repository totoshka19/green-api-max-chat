import { describe, expect, it } from 'vitest'
import { normalizePhone, parseNotification, reduceChat, initialChatState } from './model'

const incoming = {
  typeWebhook: 'incomingMessageReceived',
  instanceData: { idInstance: 3100000000, wid: '79990000000@c.us', typeInstance: 'v3' },
  timestamp: 1763115112,
  idMessage: '1763115112345',
  senderData: {
    chatId: '10000000',
    chatName: 'Анна',
    chatType: 'user',
    sender: '10000000',
    senderName: 'Анна',
    senderType: 'user',
    senderContactName: 'Анна',
    senderPhoneNumber: 79991234567,
  },
  messageData: { typeMessage: 'textMessage', textMessageData: { textMessage: 'Привет!' } },
}

describe('phone numbers', () => {
  it.each([
    ['+7 (999) 123-45-67', '79991234567'],
    ['8 999 123 45 67', '79991234567'],
    ['+375 29 123-45-67', '375291234567'],
  ])('normalizes %s for CheckAccount', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected)
  })
  it.each(['', '123', 'hello79991234567', '+12345678901', '799912345678901'])(
    'rejects %s',
    (input) => {
      expect(() => normalizePhone(input)).toThrow()
    },
  )
})

describe('notifications', () => {
  it('maps an incoming MAX text to its canonical chat id', () => {
    expect(parseNotification(incoming)).toEqual({
      kind: 'message',
      chatId: '10000000',
      name: 'Анна',
      phone: '79991234567',
      message: {
        id: '1763115112345',
        text: 'Привет!',
        timestamp: 1763115112000,
        direction: 'incoming',
        status: 'received',
      },
    })
  })
  it('accepts text with a link', () => {
    expect(
      parseNotification({
        ...incoming,
        messageData: {
          typeMessage: 'extendedTextMessage',
          extendedTextMessageData: { text: 'https://example.com' },
        },
      }),
    ).toMatchObject({ message: { text: 'https://example.com' } })
  })
  it('ignores media, groups and malformed notifications', () => {
    for (const body of [
      null,
      {},
      { ...incoming, senderData: { ...incoming.senderData, chatType: 'group' } },
      { ...incoming, messageData: { typeMessage: 'imageMessage' } },
    ]) {
      expect(parseNotification(body)).toBeNull()
    }
  })
  it('ignores timestamps that cannot be rendered as dates', () => {
    expect(parseNotification({ ...incoming, timestamp: 1e100 })).toBeNull()
  })
  it('ignores a JSON object in place of the webhook type without coercing it', () => {
    expect(parseNotification(JSON.parse('{"typeWebhook":{"toString":null}}'))).toBeNull()
  })
  it('does not duplicate redelivered messages', () => {
    const event = parseNotification(incoming)!
    const once = reduceChat(initialChatState, event)
    const twice = reduceChat(once, event)
    expect(twice.chats).toHaveLength(1)
    expect(twice.chats[0].messages).toHaveLength(1)
    expect(twice.chats[0].unread).toBe(1)
  })
  it('keeps read status when an older delivered notification arrives', () => {
    let state = reduceChat(initialChatState, {
      kind: 'open',
      chatId: '10000000',
      phone: '79991234567',
    })
    state = reduceChat(state, {
      kind: 'message',
      chatId: '10000000',
      message: { id: 'out-1', text: 'Hi', timestamp: 1, direction: 'outgoing', status: 'queued' },
    })
    state = reduceChat(state, { kind: 'status', chatId: '10000000', id: 'out-1', status: 'read' })
    state = reduceChat(state, {
      kind: 'status',
      chatId: '10000000',
      id: 'out-1',
      status: 'delivered',
    })
    expect(state.chats[0].messages[0].status).toBe('read')
  })
  it('applies a delivery status received before the send response', () => {
    let state = reduceChat(initialChatState, {
      kind: 'status',
      chatId: '10000000',
      id: 'out-1',
      status: 'delivered',
    })
    state = reduceChat(state, {
      kind: 'message',
      chatId: '10000000',
      message: { id: 'out-1', text: 'Hi', timestamp: 1, direction: 'outgoing', status: 'queued' },
    })
    expect(state.chats[0].messages[0].status).toBe('delivered')
  })
  it('selecting a chat clears unread messages', () => {
    const state = reduceChat(reduceChat(initialChatState, parseNotification(incoming)!), {
      kind: 'select',
      chatId: '10000000',
    })
    expect(state.activeChatId).toBe('10000000')
    expect(state.chats[0].unread).toBe(0)
  })
})
