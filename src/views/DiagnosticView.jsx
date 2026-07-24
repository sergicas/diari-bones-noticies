// Vista de diagnòstic privat d'El Bon Diari (/diagnostic)

import { useState, useEffect } from 'react'
import PageHero from '../components/PageHero.jsx'
import { formatDateTime } from '../lib/viewHelpers.js'

export function DiagnosticView() {
  const [token, setToken] = useState(() => {
    if (typeof window === 'undefined') return ''
    return window.sessionStorage.getItem('bondiari-health-token') || ''
  })
  const [inputToken, setInputToken] = useState('')
  const [status, setStatus] = useState(() => (token ? 'loading' : 'unauthorized'))
  const [data, setData] = useState(null)
  const [filterQuery, setFilterQuery] = useState('')
  const [retryCount, setRetryCount] = useState(0)

  useEffect(() => {
    if (!token) return

    let isCancelled = false

    fetch('/api/feed-health?mode=dashboard', {
      headers: {
        'x-health-token': token,
      },
    })
      .then((res) => {
        if (res.status === 401) {
          throw new Error('401')
        }
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`)
        }
        return res.json()
      })
      .then((payload) => {
        if (isCancelled) return
        // fetchedAt fixa el "ara" del render: evita cridar Date.now() en ple
        // dibuix (regla de puresa de React) i tota la taula jutja el mateix instant.
        setData({ ...payload, fetchedAt: Date.now() })
        setStatus('success')
      })
      .catch((err) => {
        if (isCancelled) return
        if (err.message === '401') {
          setStatus('unauthorized')
          if (typeof window !== 'undefined') {
            window.sessionStorage.removeItem('bondiari-health-token')
          }
        } else {
          setStatus('error')
        }
      })

    return () => {
      isCancelled = true
    }
  }, [token, retryCount])

  const handleLogin = (e) => {
    e.preventDefault()
    if (!inputToken.trim()) return
    const cleanToken = inputToken.trim()
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem('bondiari-health-token', cleanToken)
    }
    setStatus('loading')
    setToken(cleanToken)
  }

  const handleLogout = () => {
    if (typeof window !== 'undefined') {
      window.sessionStorage.removeItem('bondiari-health-token')
    }
    setToken('')
    setData(null)
    setStatus('unauthorized')
  }

  if (status === 'unauthorized' || !token) {
    return (
      <>
        <PageHero
          tag="Diagnòstic Privat"
          title="Accés restringit al tauler editorial"
          description="Aquest panell de salut requerirà el secret de diagnòstic (BONDIARI_FEED_HEALTH_TOKEN)."
        />
        <section className="section-block about-block">
          <form className="newsletter-form" onSubmit={handleLogin}>
            <label htmlFor="health-token-input" className="section-tag">
              Token de Seguretat
            </label>
            <div className="newsletter-form__field">
              <input
                id="health-token-input"
                type="password"
                value={inputToken}
                onChange={(e) => setInputToken(e.target.value)}
                placeholder="Introdueix el token de diagnòstic..."
                required
              />
              <button type="submit" className="button button--primary">
                Accedir al panell
              </button>
            </div>
            {status === 'unauthorized' && inputToken ? (
              <p className="error-note" style={{ color: 'var(--color-error, #d9534f)' }}>
                Token d'accés no vàlid (401 Unauthorized).
              </p>
            ) : null}
          </form>
        </section>
      </>
    )
  }

  if (status === 'loading') {
    return (
      <section className="section-block">
        <PageHero
          tag="Diagnòstic Privat"
          title="Recuperant mètriques de salut..."
          description="Estem consultant l’estat en temps real de les 70 fonts RSS i el KV."
        />
      </section>
    )
  }

  if (status === 'error') {
    return (
      <section className="section-block">
        <PageHero
          tag="Diagnòstic Privat"
          title="Error en carregar el diagnòstic"
          description="No s'han pogut recuperar les dades del servidor o KV."
        />
        <button
          type="button"
          className="button button--primary"
          onClick={() => {
            setStatus('loading')
            setRetryCount((count) => count + 1)
          }}
        >
          Reintentar
        </button>
      </section>
    )
  }

  const feedStats = data?.stats || {}
  const cronTiming = data?.cronTiming || null
  const circuitBreakers = data?.circuitBreakers || []
  const history = data?.history || []
  const catalog = data?.catalog || []

  // Agregació de fonts
  const totalCatalogFeeds = catalog.length
  const pausedCount = circuitBreakers.length
  const healthyCount = totalCatalogFeeds - pausedCount

  const filterLower = filterQuery.toLowerCase().trim()
  const displayFeeds = catalog.filter((feed) => {
    if (!filterLower) return true
    return (
      feed.name.toLowerCase().includes(filterLower) ||
      feed.language.toLowerCase().includes(filterLower) ||
      (feed.defaultCategory || '').toLowerCase().includes(filterLower)
    )
  })

  return (
    <>
      <PageHero
        tag="Diagnòstic Privat"
        title="Tauler de Salut de Feeds & Radar"
        description="Estat en temps real de les 70 fonts RSS, resiliència del circuit breaker i mètriques del cron."
      />

      <section className="section-block">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <div>
            <p className="section-tag">Estat del Radar</p>
            <h2>Mètriques Executives</h2>
          </div>
          <button type="button" className="link-button" onClick={handleLogout}>
            Tancar sessió de diagnòstic
          </button>
        </div>

        <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
          <div className="stat-card" style={{ padding: '1.2rem', background: 'var(--paper)', borderRadius: '8px', border: '1px solid var(--line-strong)' }}>
            <span className="section-tag">Fonts RSS Saludables</span>
            <h3 style={{ fontSize: '2rem', margin: '0.4rem 0', color: 'var(--ink)' }}>
              {healthyCount} / {totalCatalogFeeds}
            </h3>
            <p style={{ margin: 0, fontSize: '0.85rem', color: pausedCount > 0 ? 'var(--color-warning, #f0ad4e)' : 'var(--accent, #34C759)' }}>
              {pausedCount > 0 ? `${pausedCount} font(s) en circuit breaker` : '100% fonts operatives'}
            </p>
          </div>

          <div className="stat-card" style={{ padding: '1.2rem', background: 'var(--paper)', borderRadius: '8px', border: '1px solid var(--line-strong)' }}>
            <span className="section-tag">Durada Darrer Cron</span>
            <h3 style={{ fontSize: '2rem', margin: '0.4rem 0', color: 'var(--ink)' }}>
              {cronTiming?.cronDurationMs ? `${(cronTiming.cronDurationMs / 1000).toFixed(2)}s` : 'N/D'}
            </h3>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--muted)' }}>
              {cronTiming?.updatedAt ? formatDateTime(cronTiming.updatedAt) : 'Sense dades de durada'}
            </p>
          </div>

          <div className="stat-card" style={{ padding: '1.2rem', background: 'var(--paper)', borderRadius: '8px', border: '1px solid var(--line-strong)' }}>
            <span className="section-tag">Peces Revisades / Publicades</span>
            <h3 style={{ fontSize: '2rem', margin: '0.4rem 0', color: 'var(--ink)' }}>
              {cronTiming?.reviewedThisPass ?? 0} / {cronTiming?.publishedCount ?? 0}
            </h3>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--muted)' }}>
              Peces noves a l’última passada
            </p>
          </div>
        </div>

        {/* Cerca i Taula de Fonts RSS */}
        <div className="section-heading" style={{ marginTop: '2rem' }}>
          <div>
            <p className="section-tag">Catàleg Editorial</p>
            <h2>Estat individual de les {totalCatalogFeeds} fonts RSS</h2>
          </div>
          <div className="search-field" style={{ maxWidth: '300px' }}>
            <input
              type="search"
              placeholder="Filtrar per mitjà, idioma o secció..."
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
            />
          </div>
        </div>

        <div style={{ overflowX: 'auto', marginTop: '1rem' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--color-border, #ccc)' }}>
                <th style={{ padding: '0.8rem' }}>Font / Mitjà</th>
                <th style={{ padding: '0.8rem' }}>Idioma</th>
                <th style={{ padding: '0.8rem' }}>Categoria</th>
                <th style={{ padding: '0.8rem' }}>Latència (ms)</th>
                <th style={{ padding: '0.8rem' }}>Fallades</th>
                <th style={{ padding: '0.8rem' }}>Estat Circuit</th>
              </tr>
            </thead>
            <tbody>
              {displayFeeds.map((feed) => {
                const rec = feedStats[feed.name] || {}
                // El radar marca la pausa amb pausedUntil (data ISO de fi de pausa).
                const pauseEnd = rec.pausedUntil ? new Date(rec.pausedUntil).getTime() : 0
                const isCircuitActive = Boolean(pauseEnd && pauseEnd > (data?.fetchedAt || 0))
                const latency = rec.durationMs
                const failures = rec.consecutiveFailures || 0

                let latencyColor = '#5cb85c'
                if (!latency || latency > 3000) latencyColor = '#d9534f'
                else if (latency > 1500) latencyColor = '#f0ad4e'

                return (
                  <tr key={feed.name} style={{ borderBottom: '1px solid var(--color-border-subtle, #eee)' }}>
                    <td style={{ padding: '0.8rem', fontWeight: feed.core ? 'bold' : 'normal' }}>
                      {feed.name} {feed.core ? '★' : ''}
                    </td>
                    <td style={{ padding: '0.8rem' }}>{feed.language.toUpperCase()}</td>
                    <td style={{ padding: '0.8rem' }}>{feed.defaultCategory}</td>
                    <td style={{ padding: '0.8rem', color: latencyColor, fontWeight: 'bold' }}>
                      {latency ? `${latency} ms` : 'N/D'}
                    </td>
                    <td style={{ padding: '0.8rem' }}>{failures}</td>
                    <td style={{ padding: '0.8rem' }}>
                      {isCircuitActive ? (
                        <span className="paper-chip" style={{ background: '#f0ad4e', color: '#fff' }}>
                          Pausat
                        </span>
                      ) : (
                        <span className="paper-chip" style={{ background: '#5cb85c', color: '#fff' }}>
                          OK
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Històric diari 7/30 dies en SVG */}
        {history.length > 0 ? (
          <div style={{ marginTop: '3rem' }}>
            <p className="section-tag">Històric de Salut</p>
            <h2>Estabilitat diària dels darrers {history.length} dies</h2>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', height: '140px', marginTop: '1.5rem', paddingBottom: '1rem', borderBottom: '1px solid var(--color-border, #ccc)' }}>
              {/* El servidor envia el dia més recent primer; el gràfic es llegeix
                  d'esquerra (més antic) a dreta (avui). */}
              {[...history].reverse().map((snap) => {
                const count = snap.cronTiming?.publishedCount || 0
                const heightPct = Math.min(100, Math.max(15, count * 10))
                return (
                  <div key={snap.date} style={{ flex: 1, textAlign: 'center' }}>
                    <div
                      style={{
                        height: `${heightPct}%`,
                        background: 'var(--color-primary, #0275d8)',
                        borderRadius: '4px 4px 0 0',
                      }}
                      title={`${snap.date}: ${count} notícies publicades`}
                    />
                    <span style={{ fontSize: '0.7rem', display: 'block', marginTop: '0.4rem' }}>
                      {snap.date.slice(5)}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        ) : null}
      </section>
    </>
  )
}

export default DiagnosticView
