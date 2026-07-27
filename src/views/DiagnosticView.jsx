import { useEffect, useMemo, useState } from 'react'
import PageHero from '../components/PageHero.jsx'
import { formatDateTime } from '../lib/viewHelpers.js'
import '../styles/diagnostic.css'

const tokenStorageKey = 'bondiari-health-token'

function metric(value, fallback = '0') {
  const number = Number(value)
  return Number.isFinite(number) ? number.toLocaleString('ca-ES') : fallback
}

function duration(milliseconds) {
  const value = Number(milliseconds)
  if (!Number.isFinite(value) || value <= 0) return 'N/D'
  if (value < 1000) return `${Math.round(value)} ms`
  return `${(value / 1000).toFixed(value < 10_000 ? 1 : 0)} s`
}

function queueLabel(queue) {
  if (!queue?.available) return 'N/D'
  return metric(queue.backlogCount)
}

function operationCopy(status) {
  if (status === 'critical') {
    return {
      eyebrow: 'Intervenció necessària',
      title: 'Hi ha incidències crítiques',
      detail: 'Revisa les alertes abans de forçar cap reprocessament.',
    }
  }
  if (status === 'warning') {
    return {
      eyebrow: 'Seguiment recomanat',
      title: 'El sistema funciona amb avisos',
      detail: 'La publicació continua activa, però hi ha senyals que cal vigilar.',
    }
  }
  return {
    eyebrow: 'Operació normal',
    title: 'Tots els sistemes estan operatius',
    detail: 'No hi ha cues endarrerides, jobs encallats ni fonts pausades.',
  }
}

function subscriberStatus(record) {
  if (record?.status === 'confirmed') {
    return { tone: 'healthy', label: 'Confirmat' }
  }
  if (record?.expired) {
    return { tone: 'warning', label: 'Pendent caducada' }
  }
  return { tone: 'warning', label: 'Pendent' }
}

function StatusPill({ status, children }) {
  return (
    <span className={`ops-status ops-status--${status}`}>
      <span className="ops-status__dot" aria-hidden="true" />
      {children}
    </span>
  )
}

function MetricCard({ label, value, detail, tone = 'neutral' }) {
  return (
    <article className={`ops-metric ops-metric--${tone}`}>
      <p>{label}</p>
      <strong>{value}</strong>
      <span>{detail}</span>
    </article>
  )
}

function LoginPanel({ inputToken, setInputToken, onSubmit, invalid }) {
  return (
    <>
      <PageHero
        tag="Diagnòstic privat"
        title="Centre d’operacions editorial"
        description="Supervisió de fonts, edicions, D1 i cues. L’accés requereix el secret de diagnòstic."
      />
      <section className="section-block ops-login">
        <form onSubmit={onSubmit}>
          <label htmlFor="health-token-input">Token de diagnòstic</label>
          <div className="ops-login__row">
            <input
              id="health-token-input"
              type="password"
              value={inputToken}
              onChange={(event) => setInputToken(event.target.value)}
              autoComplete="current-password"
              placeholder="BONDIARI_FEED_HEALTH_TOKEN"
              required
            />
            <button type="submit" className="button button--primary">
              Accedir
            </button>
          </div>
          {invalid ? (
            <p className="ops-login__error" role="alert">
              El token no és vàlid o ha caducat.
            </p>
          ) : null}
        </form>
      </section>
    </>
  )
}

export function DiagnosticView() {
  const [token, setToken] = useState(() => {
    if (typeof window === 'undefined') return ''
    return window.sessionStorage.getItem(tokenStorageKey) || ''
  })
  const [inputToken, setInputToken] = useState('')
  const [status, setStatus] = useState(() => (token ? 'loading' : 'login'))
  const [data, setData] = useState(null)
  const [filterQuery, setFilterQuery] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    if (!token) return undefined

    const controller = new AbortController()
    fetch('/api/feed-health?mode=dashboard', {
      headers: { 'x-health-token': token },
      signal: controller.signal,
    })
      .then((response) => {
        if (response.status === 401) throw new Error('unauthorized')
        if (!response.ok) throw new Error(`http-${response.status}`)
        return response.json()
      })
      .then((payload) => {
        setData({ ...payload, fetchedAt: Date.now() })
        setStatus('success')
      })
      .catch((error) => {
        if (error.name === 'AbortError') return
        if (error.message === 'unauthorized') {
          window.sessionStorage.removeItem(tokenStorageKey)
          setToken('')
          setStatus('invalid')
          return
        }
        setStatus('error')
      })

    return () => controller.abort()
  }, [token, refreshKey])

  useEffect(() => {
    if (!token) return undefined
    const intervalId = window.setInterval(
      () => setRefreshKey((value) => value + 1),
      60_000,
    )
    return () => window.clearInterval(intervalId)
  }, [token])

  const displayFeeds = useMemo(() => {
    const catalog = data?.catalog || []
    const query = filterQuery.toLowerCase().trim()
    if (!query) return catalog
    return catalog.filter((feed) =>
      [feed.name, feed.language, feed.defaultCategory].some((value) =>
        String(value || '').toLowerCase().includes(query),
      ),
    )
  }, [data?.catalog, filterQuery])

  const handleLogin = (event) => {
    event.preventDefault()
    const cleanToken = inputToken.trim()
    if (!cleanToken) return
    window.sessionStorage.setItem(tokenStorageKey, cleanToken)
    setInputToken('')
    setStatus('loading')
    setToken(cleanToken)
  }

  const handleLogout = () => {
    window.sessionStorage.removeItem(tokenStorageKey)
    setToken('')
    setData(null)
    setStatus('login')
  }

  if (!token) {
    return (
      <LoginPanel
        inputToken={inputToken}
        setInputToken={setInputToken}
        onSubmit={handleLogin}
        invalid={status === 'invalid'}
      />
    )
  }

  if (status === 'loading' && !data) {
    return (
      <section className="section-block ops-state" aria-live="polite">
        <div className="ops-state__spinner" aria-hidden="true" />
        <p>Carregant el snapshot operatiu…</p>
      </section>
    )
  }

  if (status === 'error' && !data) {
    return (
      <section className="section-block ops-state" role="alert">
        <p>No s’ha pogut carregar el centre d’operacions.</p>
        <button
          type="button"
          className="button button--primary"
          onClick={() => {
            setStatus('loading')
            setRefreshKey((value) => value + 1)
          }}
        >
          Reintentar
        </button>
      </section>
    )
  }

  const operations = data?.operations || { status: 'warning', issues: [] }
  const operationText = operationCopy(operations.status)
  const feedStats = data?.stats || {}
  const catalog = data?.catalog || []
  const pipeline = data?.pipeline || {}
  const database = pipeline.database || {}
  const ingestQueue = pipeline.queues?.ingest
  const distributionQueue = pipeline.queues?.distribution
  const cronTiming = data?.cronTiming
  const pausedCount = data?.circuitBreakers?.length || 0
  const healthyCount = Math.max(0, catalog.length - pausedCount)
  const jobs = database.jobs || {}
  const recentJobs = database.recentJobs || []
  const history = data?.history || []
  const audience = data?.audience || {
    available: false,
    confirmed: 0,
    pending: 0,
    subscribers: [],
  }
  const subscribers = audience.subscribers || []

  return (
    <>
      <PageHero
        tag="Diagnòstic privat"
        title="Centre d’operacions editorial"
        description="Una sola vista per supervisar el radar, la persistència durable i el pipeline de publicació."
      />

      <section className="section-block ops-dashboard">
        <header className="ops-toolbar">
          <div>
            <StatusPill status={operations.status}>
              {operationText.eyebrow}
            </StatusPill>
            <p>
              Darrera comprovació:{' '}
              <strong>{formatDateTime(operations.checkedAt)}</strong>
            </p>
          </div>
          <div className="ops-toolbar__actions">
            <button
              type="button"
              className="button button--secondary"
              onClick={() => {
                setStatus('loading')
                setRefreshKey((value) => value + 1)
              }}
              disabled={status === 'loading'}
            >
              {status === 'loading' ? 'Actualitzant…' : 'Actualitzar'}
            </button>
            <button type="button" className="link-button" onClick={handleLogout}>
              Tancar sessió
            </button>
          </div>
        </header>

        <div className={`ops-summary ops-summary--${operations.status}`}>
          <div>
            <p>{operationText.eyebrow}</p>
            <h2>{operationText.title}</h2>
            <span>{operationText.detail}</span>
          </div>
          <strong>{operations.issues.length}</strong>
        </div>

        {operations.issues.length > 0 ? (
          <div className="ops-alerts" aria-label="Alertes operatives">
            {operations.issues.map((issue) => (
              <article
                key={issue.code}
                className={`ops-alert ops-alert--${issue.severity}`}
              >
                <StatusPill status={issue.severity}>
                  {issue.severity === 'critical' ? 'Crítica' : 'Avís'}
                </StatusPill>
                <h3>{issue.title}</h3>
                <p>{issue.detail}</p>
              </article>
            ))}
          </div>
        ) : null}

        <div className="ops-metrics" aria-label="Indicadors principals">
          <MetricCard
            label="Fonts operatives"
            value={`${healthyCount} / ${catalog.length}`}
            detail={
              pausedCount > 0
                ? `${pausedCount} en pausa automàtica`
                : 'Cap circuit breaker actiu'
            }
            tone={pausedCount > 0 ? 'warning' : 'success'}
          />
          <MetricCard
            label="Darrer cron"
            value={duration(cronTiming?.cronDurationMs)}
            detail={
              cronTiming?.updatedAt
                ? formatDateTime(cronTiming.updatedAt)
                : 'Encara sense telemetria'
            }
          />
          <MetricCard
            label="Historial D1"
            value={metric(database.stories)}
            detail={`${metric(database.editions)} edicions durables`}
            tone={database.available ? 'success' : 'critical'}
          />
          <MetricCard
            label="Jobs del pipeline"
            value={metric(jobs.completed)}
            detail={`${metric(jobs.processing)} actius · ${metric(jobs.failed)} fallits`}
            tone={jobs.failed > 0 ? 'warning' : 'success'}
          />
          <MetricCard
            label="Cua d’ingesta"
            value={queueLabel(ingestQueue)}
            detail="missatges pendents"
            tone={
              Number(ingestQueue?.backlogCount || 0) > 0 ? 'warning' : 'success'
            }
          />
          <MetricCard
            label="Cua de distribució"
            value={queueLabel(distributionQueue)}
            detail="missatges pendents"
            tone={
              Number(distributionQueue?.backlogCount || 0) > 0
                ? 'warning'
                : 'success'
            }
          />
          <MetricCard
            label="Subscriptors"
            value={metric(audience.confirmed)}
            detail={`${metric(audience.pending)} pendents de confirmar`}
            tone={audience.available ? 'success' : 'warning'}
          />
        </div>

        <div className="ops-section-heading">
          <div>
            <p>Butlletí diari</p>
            <h2>Subscriptors</h2>
          </div>
          <span>
            {audience.available
              ? `${metric(audience.confirmed)} confirmats · ${metric(audience.pending)} pendents`
              : 'No s’ha pogut consultar la llista'}
          </span>
        </div>

        <div className="ops-table-wrap">
          <table className="ops-table">
            <caption className="sr-only">
              Subscriptors del butlletí i estat de confirmació
            </caption>
            <thead>
              <tr>
                <th>Correu</th>
                <th>Estat</th>
                <th>Idioma</th>
                <th>Alta</th>
                <th>Confirmació</th>
              </tr>
            </thead>
            <tbody>
              {subscribers.length > 0 ? (
                subscribers.map((subscriber) => {
                  const state = subscriberStatus(subscriber)
                  return (
                    <tr key={subscriber.email}>
                      <td>
                        <strong>{subscriber.email}</strong>
                      </td>
                      <td>
                        <StatusPill status={state.tone}>
                          {state.label}
                        </StatusPill>
                      </td>
                      <td>{String(subscriber.language || 'ca').toUpperCase()}</td>
                      <td>{formatDateTime(subscriber.subscribedAt)}</td>
                      <td>
                        {subscriber.confirmedAt
                          ? formatDateTime(subscriber.confirmedAt)
                          : '—'}
                      </td>
                    </tr>
                  )
                })
              ) : (
                <tr>
                  <td colSpan="5" className="ops-table__empty">
                    {audience.available
                      ? 'Encara no hi ha cap subscripció.'
                      : 'La llista de subscriptors no està disponible temporalment.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="ops-section-heading">
          <div>
            <p>Pipeline editorial</p>
            <h2>Últims jobs processats</h2>
          </div>
          <span>
            {database.latestEdition
              ? `Darrera edició: ${formatDateTime(database.latestEdition.published_at)}`
              : 'Encara no hi ha cap edició durable'}
          </span>
        </div>

        <div className="ops-table-wrap">
          <table className="ops-table">
            <caption className="sr-only">
              Deu jobs més recents del pipeline editorial
            </caption>
            <thead>
              <tr>
                <th>Job</th>
                <th>Tipus</th>
                <th>Estat</th>
                <th>Intent</th>
                <th>Actualitzat</th>
              </tr>
            </thead>
            <tbody>
              {recentJobs.length > 0 ? (
                recentJobs.map((job) => (
                  <tr key={job.idempotency_key}>
                    <td className="ops-table__key">{job.idempotency_key}</td>
                    <td>{job.job_type}</td>
                    <td>
                      <StatusPill
                        status={
                          job.status === 'failed'
                            ? 'critical'
                            : job.status === 'processing'
                              ? 'warning'
                              : 'healthy'
                        }
                      >
                        {job.status}
                      </StatusPill>
                    </td>
                    <td>{metric(job.attempts)}</td>
                    <td>{formatDateTime(job.updated_at)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="5" className="ops-table__empty">
                    Els jobs apareixeran després del primer cron amb la fase 2
                    activa.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="ops-section-heading">
          <div>
            <p>Catàleg editorial</p>
            <h2>Salut de les fonts</h2>
          </div>
          <label className="ops-search">
            <span className="sr-only">Filtrar fonts</span>
            <input
              type="search"
              placeholder="Mitjà, idioma o secció…"
              value={filterQuery}
              onChange={(event) => setFilterQuery(event.target.value)}
            />
          </label>
        </div>

        <div className="ops-table-wrap">
          <table className="ops-table">
            <caption className="sr-only">Estat de les fonts del radar</caption>
            <thead>
              <tr>
                <th>Font</th>
                <th>Idioma</th>
                <th>Categoria</th>
                <th>Latència</th>
                <th>Fallades</th>
                <th>Estat</th>
              </tr>
            </thead>
            <tbody>
              {displayFeeds.map((feed) => {
                const record = feedStats[feed.name] || {}
                const pauseEnd = record.pausedUntil
                  ? new Date(record.pausedUntil).getTime()
                  : 0
                const isPaused = pauseEnd > (data?.fetchedAt || 0)
                return (
                  <tr key={feed.name}>
                    <td>
                      <strong>{feed.name}</strong>
                      {feed.core ? <span className="ops-core">Core</span> : null}
                    </td>
                    <td>{String(feed.language || '—').toUpperCase()}</td>
                    <td>{feed.defaultCategory || '—'}</td>
                    <td>{duration(record.durationMs)}</td>
                    <td>{metric(record.consecutiveFailures)}</td>
                    <td>
                      <StatusPill status={isPaused ? 'warning' : 'healthy'}>
                        {isPaused ? 'Pausat' : 'Operatiu'}
                      </StatusPill>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {history.length > 0 ? (
          <section className="ops-history">
            <div className="ops-section-heading">
              <div>
                <p>Històric</p>
                <h2>Publicació dels darrers {history.length} dies</h2>
              </div>
            </div>
            <div className="ops-history__chart">
              {[...history].reverse().map((snapshot) => {
                const count = snapshot.cronTiming?.publishedCount || 0
                const height = Math.min(100, Math.max(8, count * 10))
                return (
                  <div key={snapshot.date} className="ops-history__day">
                    <span>{count}</span>
                    <div
                      className="ops-history__bar"
                      style={{ height: `${height}%` }}
                      title={`${snapshot.date}: ${count} peces publicades`}
                    />
                    <small>{snapshot.date.slice(5)}</small>
                  </div>
                )
              })}
            </div>
          </section>
        ) : null}
      </section>
    </>
  )
}

export default DiagnosticView
