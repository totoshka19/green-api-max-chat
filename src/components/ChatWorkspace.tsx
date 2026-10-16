import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import {
  WarningCircle,
  ArrowLeft,
  Check,
  Checks,
  Question,
  Clock,
  SpinnerGap,
  SignOut,
  Message,
  Plus,
  MagnifyingGlass,
  Send,
  XCircle,
} from './MaxIcon'
import type { GreenApi } from '../chat/api'
import type { Chat, MessageStatus } from '../chat/model'
import { useChat } from '../chat/useChat'
import { Brand } from './Brand'
import { NewChatDialog } from './NewChatDialog'

interface Props {
  api: GreenApi
  instanceId: string
  onDisconnect(): void
}
const time = (value: number) =>
  new Date(value).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
const day = (value: number) =>
  new Date(value).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
const title = (chat: Chat) => chat.name || (chat.phone ? `+${chat.phone}` : `Чат ${chat.id}`)

function Avatar({ chat }: { chat: Chat }) {
  return (
    <span className={`avatar avatar--${Number(chat.id.slice(-1)) % 4}`} aria-hidden="true">
      {chat.name ? chat.name.slice(0, 1).toUpperCase() : <Message size={23} />}
    </span>
  )
}

function DeliveryStatus({ status }: { status: MessageStatus }) {
  const labels: Record<MessageStatus, string> = {
    queued: 'В очереди',
    sent: 'Отправлено',
    delivered: 'Доставлено',
    read: 'Прочитано',
    failed: 'Не доставлено',
    received: 'Получено',
  }
  return (
    <span
      className={`delivery-status delivery-status--${status}`}
      role="img"
      aria-label={labels[status]}
      title={labels[status]}
    >
      {status === 'queued' ? (
        <Clock size={13} />
      ) : status === 'failed' ? (
        <XCircle size={14} />
      ) : status === 'read' ? (
        <Checks size={16} />
      ) : (
        <Check size={16} />
      )}
    </span>
  )
}

export function ChatWorkspace({ api, instanceId, onDisconnect }: Props) {
  const chat = useChat(api)
  const [newChatOpen, setNewChatOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const messageEnd = useRef<HTMLDivElement>(null)
  const composer = useRef<HTMLTextAreaElement>(null)
  const active = chat.chats.find((item) => item.id === chat.activeChatId)
  const draft = active ? (drafts[active.id] ?? '') : ''
  const sending = chat.sendingChatId !== null
  const allowed =
    !!active &&
    !!draft.trim() &&
    draft.length <= 4000 &&
    !sending &&
    chat.instanceState === 'authorized'
  const filteredChats = chat.chats.filter((item) =>
    `${title(item)} ${item.phone ?? ''}`.toLowerCase().includes(query.toLowerCase()),
  )
  const sortedChats = [...filteredChats].sort(
    (a, b) => (b.messages.at(-1)?.timestamp ?? 0) - (a.messages.at(-1)?.timestamp ?? 0),
  )

  useEffect(() => {
    messageEnd.current?.scrollIntoView?.({ block: 'end', behavior: 'instant' })
  }, [active?.id, active?.messages.length])
  useEffect(() => {
    if (active && !newChatOpen && !sending) composer.current?.focus()
  }, [active?.id, newChatOpen, sending]) // eslint-disable-line react-hooks/exhaustive-deps

  async function send(event?: FormEvent) {
    event?.preventDefault()
    if (!active || !allowed) return
    const id = active.id,
      text = draft
    if (await chat.sendMessage(id, text))
      setDrafts((current) => ({ ...current, [id]: current[id] === text ? '' : current[id] }))
  }
  function onComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      void send()
    }
  }

  return (
    <>
      <main className={`workspace${active ? ' workspace--chat-open' : ''}`} inert={newChatOpen}>
        <nav className="navigation-rail" aria-label="Аккаунт">
          <Brand small />
          <span className="rail-item rail-item--active" title="Чаты">
            <Message size={23} />
            <span>Чаты</span>
          </span>
          <div className="rail-bottom">
            <a
              className="icon-button"
              href="https://green-api.com/v3/docs/"
              target="_blank"
              rel="noreferrer"
              aria-label="Документация"
            >
              <Question size={21} />
            </a>
            <button
              className="icon-button"
              type="button"
              aria-label="Выйти"
              title="Выйти"
              onClick={onDisconnect}
            >
              <SignOut size={21} />
            </button>
            <span className="account-avatar" title={`Инстанс ${instanceId}`}>
              {instanceId.slice(-2)}
            </span>
          </div>
        </nav>
        <aside className="chat-sidebar" aria-label="Список чатов">
          <header className="sidebar-header">
            <h1>Чаты</h1>
            <button
              type="button"
              className="icon-button"
              aria-label="Новый чат"
              title="Новый чат"
              onClick={() => setNewChatOpen(true)}
            >
              <Plus size={23} />
            </button>
          </header>
          <div className="search-field">
            <MagnifyingGlass size={18} />
            <input
              aria-label="Поиск чатов"
              placeholder="Поиск"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <div className="chat-list">
            {sortedChats.map((item) => {
              const last = item.messages.at(-1)
              return (
                <button
                  type="button"
                  key={item.id}
                  className={`chat-item${item.id === active?.id ? ' chat-item--active' : ''}`}
                  onClick={() => chat.selectChat(item.id)}
                  aria-current={item.id === active?.id ? 'true' : undefined}
                >
                  <Avatar chat={item} />
                  <span className="chat-item-content">
                    <span className="chat-item-top">
                      <strong>{title(item)}</strong>
                      {last && (
                        <time dateTime={new Date(last.timestamp).toISOString()}>
                          {time(last.timestamp)}
                        </time>
                      )}
                    </span>
                    <span className="chat-item-bottom">
                      <span>
                        {last
                          ? `${last.direction === 'outgoing' ? 'Вы: ' : ''}${last.text}`
                          : 'Напишите первое сообщение'}
                      </span>
                      {item.unread > 0 && <span className="unread-badge">{item.unread}</span>}
                    </span>
                  </span>
                </button>
              )
            })}
            {!sortedChats.length && (
              <div className="sidebar-empty">
                <Message size={32} />
                <h2>{query ? 'Чат не найден' : 'Пока нет чатов'}</h2>
                <p>
                  {query
                    ? 'Попробуйте другое имя или номер.'
                    : 'Создайте чат по номеру телефона, чтобы начать переписку.'}
                </p>
                {!query && (
                  <button
                    className="text-button"
                    type="button"
                    onClick={() => setNewChatOpen(true)}
                  >
                    Создать первый чат
                  </button>
                )}
              </div>
            )}
          </div>
          {(chat.issue || chat.instanceState !== 'authorized') && (
            <div className="connection-banner sidebar-connection" role="status">
              <span>{chat.issue || 'Проверьте авторизацию MAX в GREEN-API.'}</span>
              <button type="button" onClick={chat.retry}>
                Повторить
              </button>
            </div>
          )}
          <footer className="sidebar-footer">
            <span
              className={`status-dot${chat.issue || chat.instanceState !== 'authorized' ? ' status-dot--warning' : ''}`}
            />
            <span>
              {chat.issue
                ? 'Нет соединения'
                : chat.instanceState === 'authorized'
                  ? 'GREEN-API подключён'
                  : 'Проверьте подключение MAX'}
            </span>
            <span className="instance-label">{instanceId.slice(-4)}</span>
          </footer>
        </aside>
        <section className="conversation" aria-label="Переписка">
          {(chat.issue || chat.instanceState !== 'authorized') && (
            <div className="connection-banner" role="status">
              <WarningCircle size={18} />
              <span>
                {chat.issue || 'MAX не авторизован. Проверьте инстанс в личном кабинете GREEN-API.'}
              </span>
              <button type="button" onClick={chat.retry}>
                Повторить
              </button>
            </div>
          )}
          {active ? (
            <>
              <header className="conversation-header">
                <button
                  className="icon-button mobile-back"
                  type="button"
                  aria-label="Назад к чатам"
                  onClick={() => chat.selectChat(null)}
                >
                  <ArrowLeft size={23} />
                </button>
                <Avatar chat={active} />
                <div>
                  <h2>{title(active)}</h2>
                  <p>{active.name && active.phone ? `+${active.phone}` : 'MAX'}</p>
                </div>
                <span className="conversation-label">Текстовые сообщения</span>
              </header>
              <div
                className="messages"
                role="log"
                aria-label="Сообщения"
                aria-live="polite"
                aria-relevant="additions text"
              >
                {active.messages.length === 0 && (
                  <div className="empty-conversation">
                    <span className="empty-chat-icon">
                      <Message size={33} />
                    </span>
                    <h3>Начните разговор</h3>
                    <p>
                      Отправьте первое сообщение.
                      <br />
                      Ответ из MAX появится здесь.
                    </p>
                  </div>
                )}
                {active.messages.map((message, index) => (
                  <div className="message-group" key={message.id}>
                    {(index === 0 ||
                      new Date(active.messages[index - 1].timestamp).toDateString() !==
                        new Date(message.timestamp).toDateString()) && (
                      <div className="date-divider">
                        <span>{day(message.timestamp)}</span>
                      </div>
                    )}
                    <article className={`message message--${message.direction}`}>
                      <p>{message.text}</p>
                      <span className="message-meta">
                        <time dateTime={new Date(message.timestamp).toISOString()}>
                          {time(message.timestamp)}
                        </time>
                        {message.direction === 'outgoing' && (
                          <DeliveryStatus status={message.status} />
                        )}
                      </span>
                    </article>
                  </div>
                ))}
                <div ref={messageEnd} />
              </div>
              <div className="composer-area">
                {chat.sendErrors[active.id] && (
                  <p className="error-message send-error" role="alert">
                    {chat.sendErrors[active.id]}
                  </p>
                )}
                <form className="composer" onSubmit={send}>
                  <textarea
                    ref={composer}
                    rows={1}
                    aria-label="Сообщение"
                    placeholder="Написать сообщение…"
                    value={draft}
                    onChange={(event) =>
                      setDrafts((current) => ({ ...current, [active.id]: event.target.value }))
                    }
                    onKeyDown={onComposerKeyDown}
                    disabled={
                      chat.sendingChatId === active.id || chat.instanceState !== 'authorized'
                    }
                  />
                  <button
                    type="submit"
                    className="send-button"
                    aria-label="Отправить"
                    title="Отправить"
                    disabled={!allowed}
                  >
                    {chat.sendingChatId === active.id ? (
                      <SpinnerGap size={23} className="spin" />
                    ) : (
                      <Send size={24} />
                    )}
                  </button>
                </form>
                <div className="composer-hint">
                  <span>Enter — отправить, Shift + Enter — новая строка</span>
                  {draft.length > 3500 && (
                    <span className={draft.length > 4000 ? 'character-limit' : ''}>
                      {draft.length} / 4000
                    </span>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="welcome-state">
              <Brand />
              <h2>На связи в MAX</h2>
              <p>
                Выберите чат или начните новый разговор.
                <br />
                Сообщения будут появляться здесь.
              </p>
              <button type="button" className="primary-button" onClick={() => setNewChatOpen(true)}>
                <Plus size={19} /> Начать переписку
              </button>
              <span className="welcome-note">Подключено через GREEN-API</span>
            </div>
          )}
        </section>
      </main>
      {newChatOpen && (
        <NewChatDialog onClose={() => setNewChatOpen(false)} onCreate={chat.openChat} />
      )}
    </>
  )
}
