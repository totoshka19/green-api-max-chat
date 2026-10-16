import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { SpinnerGap, Plus, X } from './MaxIcon'

interface Props {
  onClose(): void
  onCreate(phone: string, signal: AbortSignal): Promise<void>
}

export function NewChatDialog({ onClose, onCreate }: Props) {
  const [phone, setPhone] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const dialog = useRef<HTMLElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const pending = useRef<AbortController | null>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    input.current?.focus()
    return () => {
      pending.current?.abort()
      previous?.focus()
    }
  }, [])

  async function create(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    const controller = new AbortController()
    pending.current = controller
    setError('')
    setBusy(true)
    try {
      await onCreate(phone, controller.signal)
      if (!controller.signal.aborted) onClose()
    } catch (problem) {
      if (!controller.signal.aborted)
        setError(problem instanceof Error ? problem.message : 'Не удалось создать чат.')
    } finally {
      if (!controller.signal.aborted) setBusy(false)
    }
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.stopPropagation()
      onClose()
    }
    if (event.key !== 'Tab') return
    const elements = dialog.current?.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), a[href]',
    )
    if (!elements?.length) return
    const first = elements[0],
      last = elements[elements.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    }
    if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return (
    <div
      className="modal-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        ref={dialog}
        className="new-chat-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-chat-title"
        onKeyDown={onKeyDown}
      >
        <button
          type="button"
          className="icon-button dialog-close"
          aria-label="Закрыть"
          onClick={onClose}
        >
          <X size={20} />
        </button>
        <span className="dialog-icon">
          <Plus size={26} />
        </span>
        <h2 id="new-chat-title">Новый чат</h2>
        <p className="muted">Введите номер человека, которому хотите написать в MAX.</p>
        <form onSubmit={create} aria-busy={busy}>
          <div className="field">
            <label htmlFor="recipient-phone">Номер телефона</label>
            <input
              ref={input}
              id="recipient-phone"
              type="tel"
              placeholder="+7 999 123-45-67"
              autoComplete="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              disabled={busy}
              required
            />
          </div>
          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}
          <button className="primary-button" type="submit" disabled={busy}>
            {busy ? (
              <>
                <SpinnerGap size={18} className="spin" /> Проверяем номер…
              </>
            ) : (
              'Создать чат'
            )}
          </button>
        </form>
        <p className="dialog-note">На тарифе Developer доступны 3 чата.</p>
      </section>
    </div>
  )
}
