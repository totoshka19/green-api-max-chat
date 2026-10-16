import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { StrictMode } from 'react'
import App from './App'

afterEach(() => vi.unstubAllGlobals())

function mockNetwork(options: { unauthorized?: boolean; sendFailure?: boolean } = {}) {
  const calls: string[] = []
  let deliver: ((body: unknown) => void) | undefined
  vi.stubGlobal('fetch', async (input: string, init: RequestInit) => {
    const method = new URL(input).pathname.split('/')[2]
    calls.push(method)
    const json = (data: unknown) => new Response(JSON.stringify(data))
    if (method === 'getStateInstance')
      return options.unauthorized
        ? new Response('', { status: 401 })
        : json({ stateInstance: 'authorized' })
    if (method === 'checkAccount') return json({ exist: true, chatId: '10000000', fromCache: true })
    if (method === 'sendMessage') {
      if (options.sendFailure) throw new TypeError('Network error')
      return json({ idMessage: 'out-1' })
    }
    if (method === 'deleteNotification') return json({ result: true })
    if (method === 'receiveNotification') {
      return new Promise<Response>((resolve, reject) => {
        if (init.signal?.aborted) {
          reject(new DOMException('Aborted', 'AbortError'))
          return
        }
        deliver = (body) => resolve(json(body))
        init.signal?.addEventListener(
          'abort',
          () => reject(new DOMException('Aborted', 'AbortError')),
          { once: true },
        )
      })
    }
    throw new Error(`Unexpected method ${method}`)
  })
  return {
    calls,
    receive: (body: unknown) => {
      if (!deliver) throw new Error('No active receiver')
      deliver(body)
    },
  }
}

async function connect(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('ID инстанса'), '3100000000')
  await user.type(screen.getByLabelText('Ключ доступа'), 'test-token')
  await user.click(screen.getByRole('button', { name: 'Подключиться' }))
}

async function openChat(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Новый чат' }))
  await user.type(screen.getByLabelText('Номер телефона'), '+7 (999) 123-45-67')
  await user.click(screen.getByRole('button', { name: 'Создать чат' }))
  await screen.findByRole('textbox', { name: 'Сообщение' })
}

it('expands API settings and removes the collapsed field from keyboard navigation', async () => {
  const user = userEvent.setup()
  render(<App />)
  const toggle = screen.getByRole('button', { name: 'Дополнительные настройки' })
  expect(toggle).toHaveAttribute('aria-expanded', 'false')
  expect(screen.queryByRole('textbox', { name: 'Адрес API' })).not.toBeInTheDocument()
  await user.click(toggle)
  expect(toggle).toHaveAttribute('aria-expanded', 'true')
  const field = screen.getByRole('textbox', { name: 'Адрес API' })
  expect(field).toBeEnabled()
  await user.clear(field)
  await user.type(field, 'https://3100.api.green-api.com')
  await user.click(toggle)
  expect(toggle).toHaveAttribute('aria-expanded', 'false')
  expect(field).toBeDisabled()
  await user.click(toggle)
  expect(screen.getByRole('textbox', { name: 'Адрес API' })).toHaveValue(
    'https://3100.api.green-api.com',
  )
})

it('connects, opens a chat, sends text, receives a reply and disconnects', async () => {
  vi.spyOn(Date, 'now').mockReturnValue(1763115112789)
  const network = mockNetwork()
  const user = userEvent.setup()
  render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
  await connect(user)
  await openChat(user)
  await user.type(screen.getByRole('textbox', { name: 'Сообщение' }), 'Привет из приложения')
  await user.click(screen.getByRole('button', { name: 'Отправить' }))
  expect(await screen.findByText('Привет из приложения')).toBeInTheDocument()
  await act(async () =>
    network.receive({
      receiptId: 7,
      body: {
        typeWebhook: 'incomingMessageReceived',
        instanceData: { idInstance: 3100000000, wid: '79990000000@c.us', typeInstance: 'v3' },
        timestamp: 1763115112,
        idMessage: 'in-1',
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
        messageData: {
          typeMessage: 'textMessage',
          textMessageData: { textMessage: 'Ответ из MAX' },
        },
      },
    }),
  )
  expect(await within(screen.getByRole('log')).findByText('Ответ из MAX')).toBeInTheDocument()
  const messages = within(screen.getByRole('log')).getAllByRole('article')
  expect(messages[0]).toHaveTextContent('Привет из приложения')
  expect(messages[1]).toHaveTextContent('Ответ из MAX')
  await waitFor(() => expect(network.calls).toContain('deleteNotification'))
  expect(screen.getByRole('textbox', { name: 'Сообщение' })).toHaveValue('')
  await user.click(screen.getByRole('button', { name: 'Выйти' }))
  expect(screen.getByLabelText('Ключ доступа')).toHaveValue('')
  expect(screen.queryByText('Ответ из MAX')).not.toBeInTheDocument()
})

it('keeps the connection form open when credentials are rejected', async () => {
  mockNetwork({ unauthorized: true })
  const user = userEvent.setup()
  render(<App />)
  await connect(user)
  expect(await screen.findByRole('alert')).toHaveTextContent(/ключ доступа/i)
  expect(screen.getByRole('button', { name: 'Подключиться' })).toBeEnabled()
  expect(screen.queryByRole('heading', { name: 'Чаты' })).not.toBeInTheDocument()
})

it('keeps the draft and does not retry a failed send automatically', async () => {
  const network = mockNetwork({ sendFailure: true })
  const user = userEvent.setup()
  render(<App />)
  await connect(user)
  await openChat(user)
  const composer = screen.getByRole('textbox', { name: 'Сообщение' })
  await user.type(composer, 'Текст останется')
  await user.click(screen.getByRole('button', { name: 'Отправить' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(/отправ|связаться/i)
  expect(composer).toHaveValue('Текст останется')
  expect(network.calls.filter((method) => method === 'sendMessage')).toHaveLength(1)
})

it('reopens an existing phone without spending another CheckAccount request', async () => {
  const network = mockNetwork()
  const user = userEvent.setup()
  render(<App />)
  await connect(user)
  await openChat(user)
  await openChat(user)
  expect(network.calls.filter((method) => method === 'checkAccount')).toHaveLength(1)
})

it('does not send blank or overlong text', async () => {
  const network = mockNetwork()
  const user = userEvent.setup()
  render(<App />)
  await connect(user)
  await openChat(user)
  const composer = screen.getByRole('textbox', { name: 'Сообщение' })
  await user.type(composer, '   ')
  expect(screen.getByRole('button', { name: 'Отправить' })).toBeDisabled()
  fireEvent.change(composer, { target: { value: 'a'.repeat(4001) } })
  expect(screen.getByRole('button', { name: 'Отправить' })).toBeDisabled()
  expect(network.calls).not.toContain('sendMessage')
})
