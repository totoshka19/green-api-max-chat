import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  ArrowRight,
  CaretDown,
  ArrowSquareOut,
  Eye,
  EyeSlash,
  Key,
  SpinnerGap,
  Lock,
} from './MaxIcon'
import { createApi, type GreenApi } from '../chat/api'
import { Brand } from './Brand'

interface Props {
  onConnected(api: GreenApi, instanceId: string): void
}

export function ConnectionForm({ onConnected }: Props) {
  const [id, setId] = useState('')
  const [token, setToken] = useState('')
  const [apiUrl, setApiUrl] = useState('https://api.green-api.com')
  const [showToken, setShowToken] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const pending = useRef<AbortController | null>(null)
  useEffect(() => () => pending.current?.abort(), [])

  async function connect(event: FormEvent) {
    event.preventDefault()
    if (pending.current && !pending.current.signal.aborted) return
    const controller = new AbortController()
    pending.current = controller
    setBusy(true)
    setError('')
    try {
      const api = createApi({ idInstance: id, apiTokenInstance: token, apiUrl })
      const state = await api.getState(controller.signal)
      if (controller.signal.aborted) return
      if (state !== 'authorized')
        throw new Error(
          'Инстанс не готов к работе. Подключите MAX в GREEN-API и дождитесь статуса «Авторизован».',
        )
      setToken('')
      onConnected(api, id.trim())
    } catch (problem) {
      if (!controller.signal.aborted)
        setError(problem instanceof Error ? problem.message : 'Не удалось подключиться.')
    } finally {
      if (!controller.signal.aborted) {
        pending.current = null
        setBusy(false)
      }
    }
  }

  return (
    <main className="connection-page">
      <div className="connection-top">
        <span className="wordmark">
          <img
            className="max-wordmark"
            src={`${import.meta.env.BASE_URL}max-wordmark.svg`}
            width="101"
            height="32"
            alt="MAX"
          />
          <span className="wordmark-divider" /> <span className="green-wordmark">GREEN-API</span>
        </span>
        <a
          className="text-link"
          href="https://green-api.com/v3/docs/before-start/"
          target="_blank"
          rel="noreferrer"
        >
          Как подключиться <ArrowSquareOut size={14} />
        </a>
      </div>
      <section className="connection-card" aria-labelledby="connection-title">
        <Brand />
        <h1 id="connection-title">Подключение к MAX</h1>
        <p className="connection-intro">
          Введите данные инстанса GREEN-API,
          <br className="desktop-break" /> чтобы открыть переписки.
        </p>
        <form onSubmit={connect} className="connection-form" aria-busy={busy}>
          <div className="field">
            <label htmlFor="instance-id">ID инстанса</label>
            <input
              id="instance-id"
              inputMode="numeric"
              autoComplete="off"
              placeholder="Например, 3100000000"
              value={id}
              onChange={(event) => setId(event.target.value)}
              required
              disabled={busy}
            />
          </div>
          <div className="field">
            <label htmlFor="instance-token">Ключ доступа</label>
            <div className="password-field">
              <input
                id="instance-token"
                type={showToken ? 'text' : 'password'}
                autoComplete="off"
                spellCheck={false}
                placeholder="apiTokenInstance"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                required
                disabled={busy}
              />
              <button
                type="button"
                className="icon-button"
                aria-label={showToken ? 'Скрыть ключ' : 'Показать ключ'}
                aria-pressed={showToken}
                onClick={() => setShowToken(!showToken)}
              >
                {showToken ? <EyeSlash size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>
          <div className="advanced-settings">
            <button
              type="button"
              className="advanced-settings-toggle"
              aria-expanded={settingsOpen}
              aria-controls="advanced-settings-panel"
              onClick={() => setSettingsOpen((open) => !open)}
            >
              Дополнительные настройки <CaretDown size={17} />
            </button>
            <div
              id="advanced-settings-panel"
              className="advanced-settings-panel"
              data-open={settingsOpen}
              aria-hidden={!settingsOpen}
              inert={!settingsOpen}
            >
              <div className="advanced-settings-content">
                <div className="field">
                  <label htmlFor="api-url">Адрес API</label>
                  <input
                    id="api-url"
                    type="url"
                    autoComplete="off"
                    spellCheck={false}
                    value={apiUrl}
                    onChange={(event) => setApiUrl(event.target.value)}
                    disabled={busy || !settingsOpen}
                    required
                  />
                  <p className="field-hint">Значение apiUrl из карточки инстанса.</p>
                </div>
              </div>
            </div>
          </div>
          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="primary-button connect-button" disabled={busy}>
            {busy ? (
              <>
                <SpinnerGap size={18} className="spin" /> Подключаемся…
              </>
            ) : (
              <>
                Подключиться <ArrowRight size={18} />
              </>
            )}
          </button>
        </form>
        <p className="privacy-note">
          <Lock size={17} /> Ключ хранится только в памяти этой вкладки.
        </p>
        <div className="connection-help">
          <Key size={16} />
          <p>
            Данные подключения - в{' '}
            <a href="https://console.green-api.com/instanceList" target="_blank" rel="noreferrer">
              кабинете GREEN-API
            </a>
            .
          </p>
        </div>
      </section>
      <footer className="connection-footer">Текстовые сообщения в MAX через GREEN-API</footer>
    </main>
  )
}
