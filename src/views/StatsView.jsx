// Vista del tauler de mètriques editorials (/estadistiques)

import { useState, useEffect } from 'react'
import PageHero from '../components/PageHero.jsx'

function markOwnerAndRead() {
  if (typeof window === 'undefined') return false
  try {
    window.localStorage.setItem('bondiari-owner', '1')
    return true
  } catch {
    return false
  }
}

export function StatsView({ allStories }) {
  const [stats, setStats] = useState(null)
  const [status, setStatus] = useState('loading')
  const [isOwner, setIsOwner] = useState(markOwnerAndRead)

  useEffect(() => {
    let cancelled = false

    fetch('/api/stats')
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return response.json()
      })
      .then((data) => {
        if (cancelled) return
        setStats(data)
        setStatus('ready')
      })
      .catch(() => {
        if (cancelled) return
        setStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [])

  function toggleOwner() {
    try {
      if (isOwner) {
        window.localStorage.removeItem('bondiari-owner')
        setIsOwner(false)
      } else {
        window.localStorage.setItem('bondiari-owner', '1')
        setIsOwner(true)
      }
    } catch {
      // localStorage no disponible
    }
  }

  const titleByPath = new Map()
  if (allStories) {
    for (const story of allStories) {
      titleByPath.set(`/noticia/${encodeURIComponent(story.id)}`, story.title)
    }
  }
  titleByPath.set('/', 'Portada')
  titleByPath.set('/manifest', 'Manifest editorial')
  titleByPath.set('/hemeroteca', 'Hemeroteca')

  const ownerBanner = (
    <section className={`owner-banner ${isOwner ? 'is-on' : 'is-off'}`}>
      <div>
        <strong>
          {isOwner
            ? 'Les teves visites no s’estan comptant.'
            : 'Les teves visites s’estan comptant.'}
        </strong>
        <p>
          {isOwner
            ? 'Aquest navegador està marcat com a propietari. Cap navegació teva no s’afegeix al total.'
            : 'Per excloure’t un altre cop, prem el botó. Si esborres dades del navegador, hauràs de tornar-ho a marcar.'}
        </p>
      </div>
      <button
        type="button"
        className="button button--ghost"
        onClick={toggleOwner}
      >
        {isOwner ? 'Tornar a comptar-me' : 'Exclou-me del comptador'}
      </button>
    </section>
  )

  if (status === 'loading') {
    return (
      <>
        <PageHero
          tag="Estadístiques"
          title="El pols de lectura d’El Bon Diari"
          description="Comptador propi sense cookies ni serveis externs: només pàgina, origen i mida de pantalla, agregats."
        />
        {ownerBanner}
        <section className="section-block">
          <h2>Carregant dades…</h2>
        </section>
      </>
    )
  }

  if (status === 'error' || !stats) {
    return (
      <>
        <PageHero
          tag="Estadístiques"
          title="El pols de lectura d’El Bon Diari"
          description="Comptador propi sense cookies ni serveis externs: només pàgina, origen i mida de pantalla, agregats."
        />
        {ownerBanner}
        <section className="section-block">
          <h2>Encara no hi ha dades a mostrar.</h2>
          <p>Quan la pàgina rebi visites, apareixeran aquí.</p>
        </section>
      </>
    )
  }

  const dailyMax = stats.daily.reduce((max, d) => Math.max(max, d.count), 0) || 1
  const last7 = stats.daily.slice(-7).reduce((sum, d) => sum + d.count, 0)
  const last30 = stats.daily.reduce((sum, d) => sum + d.count, 0)
  const totalDevices = Object.values(stats.devices).reduce(
    (sum, v) => sum + Number(v || 0),
    0,
  ) || 1

  return (
    <>
      <PageHero
        tag="Estadístiques"
        title="El pols de lectura d’El Bon Diari"
        description="Comptador propi sense cookies ni serveis externs: només pàgina, origen i mida de pantalla, agregats."
      />

      {ownerBanner}

      <section className="stats-grid">
        <article className="stats-card stats-card--big">
          <span className="stats-card__label">Visites totals</span>
          <strong>{stats.total.toLocaleString('ca-ES')}</strong>
        </article>
        <article className="stats-card">
          <span className="stats-card__label">Últims 7 dies</span>
          <strong>{last7.toLocaleString('ca-ES')}</strong>
        </article>
        <article className="stats-card">
          <span className="stats-card__label">Últims 30 dies</span>
          <strong>{last30.toLocaleString('ca-ES')}</strong>
        </article>
      </section>

      <section className="section-block">
        <div className="section-heading">
          <div>
            <p className="section-tag">Activitat diària</p>
            <h2>Visites dia a dia</h2>
          </div>
          <p className="section-caption">
            Es mostren els darrers 30 dies registrats.
          </p>
        </div>
        <div className="stats-bars">
          {stats.daily.length === 0 ? (
            <p className="news-section__placeholder">
              Encara no hi ha cap dia registrat.
            </p>
          ) : (
            stats.daily.map((row) => (
              <div key={row.day} className="stats-bar">
                <span className="stats-bar__day">{row.day}</span>
                <div className="stats-bar__track">
                  <div
                    className="stats-bar__fill"
                    style={{ width: `${(row.count / dailyMax) * 100}%` }}
                  />
                </div>
                <span className="stats-bar__count">{row.count}</span>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="section-block">
        <div className="section-heading">
          <div>
            <p className="section-tag">Continguts</p>
            <h2>Pàgines més llegides</h2>
          </div>
        </div>
        <ol className="stats-list">
          {stats.topPaths.length === 0 ? (
            <li className="news-section__placeholder">Cap visita encara.</li>
          ) : (
            stats.topPaths.map((row) => (
              <li key={row.key} className="stats-list__item">
                <span className="stats-list__primary">
                  {titleByPath.get(row.key) || row.key}
                </span>
                <span className="stats-list__secondary">{row.key}</span>
                <span className="stats-list__count">{row.count}</span>
              </li>
            ))
          )}
        </ol>
      </section>

      <section className="section-block">
        <div className="section-heading">
          <div>
            <p className="section-tag">Orígens</p>
            <h2>D’on arriben els lectors</h2>
          </div>
        </div>
        <ol className="stats-list">
          {stats.topReferrers.length === 0 ? (
            <li className="news-section__placeholder">Cap origen encara.</li>
          ) : (
            stats.topReferrers.map((row) => (
              <li key={row.key} className="stats-list__item">
                <span className="stats-list__primary">{row.key}</span>
                <span className="stats-list__count">{row.count}</span>
              </li>
            ))
          )}
        </ol>
      </section>

      <section className="section-block">
        <div className="section-heading">
          <div>
            <p className="section-tag">Dispositius</p>
            <h2>Per on llegeixen</h2>
          </div>
        </div>
        <div className="stats-devices">
          {['mobile', 'tablet', 'desktop', 'unknown'].map((key) => {
            const value = Number(stats.devices[key] || 0)
            const pct = Math.round((value / totalDevices) * 100)
            const label =
              key === 'mobile'
                ? 'Mòbil'
                : key === 'tablet'
                ? 'Tauleta'
                : key === 'desktop'
                ? 'Ordinador'
                : 'Sense detectar'
            return (
              <article key={key} className="stats-device">
                <span className="stats-device__label">{label}</span>
                <strong>{value.toLocaleString('ca-ES')}</strong>
                <small>{pct}%</small>
              </article>
            )
          })}
        </div>
      </section>
    </>
  )
}

export default StatsView
