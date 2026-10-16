import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import type { GreenApi } from './api'
import { initialChatState, normalizePhone, parseNotification, record, reduceChat } from './model'
import { pollNotifications } from './polling'

export function useChat(api: GreenApi) {
  const [state, dispatch] = useReducer(reduceChat, initialChatState)
  const [issue, setIssue] = useState('')
  const [instanceState, setInstanceState] = useState('authorized')
  const [reconnect, setReconnect] = useState(0)
  const [sendingChatId, setSendingChatId] = useState<string | null>(null)
  const [sendErrors, setSendErrors] = useState<Record<string, string>>({})
  const lifetime = useRef<AbortController | null>(null)
  const sending = useRef(false)

  useEffect(() => {
    const controller = new AbortController()
    lifetime.current = controller
    return () => controller.abort()
  }, [api])

  useEffect(() => {
    const controller = new AbortController()
    void pollNotifications(
      api,
      {
        onNotification(body) {
          const event = parseNotification(body)
          if (event) dispatch(event)
          const notification = record(body)
          if (
            notification.typeWebhook === 'stateInstanceChanged' &&
            typeof notification.stateInstance === 'string'
          )
            setInstanceState(notification.stateInstance)
        },
        onError: (error) => setIssue(error.message),
        onRecovery: () => setIssue(''),
      },
      controller.signal,
    )
    return () => controller.abort()
  }, [api, reconnect])

  async function openChat(input: string, dialogSignal: AbortSignal) {
    const phone = normalizePhone(input)
    const existing = state.chats.find((chat) => chat.phone === phone)
    if (existing) {
      dispatch({ kind: 'select', chatId: existing.id })
      return
    }
    const sessionSignal = lifetime.current?.signal
    if (!sessionSignal || sessionSignal.aborted) return
    const signal = AbortSignal.any([sessionSignal, dialogSignal])
    const chatId = await api.checkAccount(phone, signal)
    if (!signal.aborted) dispatch({ kind: 'open', chatId, phone })
  }

  async function sendMessage(chatId: string, text: string): Promise<boolean> {
    if (sending.current || !text.trim() || text.length > 4000 || instanceState !== 'authorized')
      return false
    const signal = lifetime.current?.signal
    if (!signal || signal.aborted) return false
    sending.current = true
    setSendingChatId(chatId)
    setSendErrors((errors) => ({ ...errors, [chatId]: '' }))
    try {
      const id = await api.sendMessage(chatId, text, signal)
      if (signal.aborted) return false
      dispatch({
        kind: 'message',
        chatId,
        message: {
          id,
          text,
          timestamp: Math.floor(Date.now() / 1000) * 1000,
          direction: 'outgoing',
          status: 'queued',
        },
      })
      return true
    } catch (error) {
      if (!signal.aborted)
        setSendErrors((errors) => ({
          ...errors,
          [chatId]: `${error instanceof Error ? error.message : 'Не удалось отправить сообщение.'} Текст сохранён. Перед повтором проверьте, не пришло ли сообщение получателю.`,
        }))
      return false
    } finally {
      sending.current = false
      if (!signal.aborted) setSendingChatId(null)
    }
  }

  const selectChat = useCallback(
    (chatId: string | null) => dispatch({ kind: 'select', chatId }),
    [],
  )
  return {
    ...state,
    issue,
    instanceState,
    sendingChatId,
    sendErrors,
    openChat,
    sendMessage,
    selectChat,
    retry: () => {
      setIssue('')
      setReconnect((value) => value + 1)
    },
  }
}
