import { useEffect, useState } from 'react'
import PageHero from '../components/PageHero.jsx'
import { fetchTerritorialPayload } from '../api/territorial.js'
import {
  TERRITORIAL_COMARQUES,
  loadTerritorialComarca,
  saveTerritorialComarca,
} from '../lib/territorial.js'
import './TerritorialView.css'

const sourceOrder = ['agenda', 'raisc', 'idescat']

function formatUpdatedAt(value) {
  const date = new Date(value || '')
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('ca-ES', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function SourceSection({ source, sourceId }) {
  const titleId = `territorial-source-${sourceId}`
  return (
    <section className="territorial-source" aria-labelledby={titleId}>
      <div className="territorial-source__heading">
        <div>
          <p className="section-tag">{source.scope}</p>
          <h2 id={titleId}>{source.label}</h2>
        </div>
        {source.status === 'stale' ? (
          <span className="territorial-source__status">Còpia de contingència</span>
        ) : null}
      </div>
      <p className="section-caption">{source.quality}</p>

      {source.status === 'error' ? (
        <div className="territorial-source__message" role="status">
          Aquesta font no ha respost. Les altres continuen disponibles.
        </div>
      ) : null}

      {source.status === 'empty' ? (
        <div className="territorial-source__message">
          No hi ha resultats publicats per aquesta comarca i aquest període.
        </div>
      ) : null}

      {source.items?.length ? (
        <div className="territorial-grid">
          {source.items.map((item, index) => (
            <article
              className="territorial-card"
              key={`${sourceId}-${item.url}-${item.title}-${index}`}
            >
              <p className="territorial-card__place">{item.location}</p>
              <h3>
                <a href={item.url} target="_blank" rel="noopener noreferrer">
                  {item.title}
                </a>
              </h3>
              <p>{item.summary}</p>
              {item.impact ? <p className="territorial-card__impact">{item.impact}</p> : null}
              <a
                className="territorial-card__source"
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                Consultar la font oficial
              </a>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  )
}

export function TerritorialView() {
  const [comarcaId, setComarcaId] = useState(loadTerritorialComarca)
  const [requestVersion, setRequestVersion] = useState(0)
  const [state, setState] = useState(() => ({
    status: comarcaId ? 'loading' : 'idle',
    payload: null,
  }))

  useEffect(() => {
    if (!comarcaId) {
      return undefined
    }

    const controller = new AbortController()
    fetchTerritorialPayload(comarcaId, { signal: controller.signal })
      .then((payload) => setState({ status: 'ready', payload }))
      .catch((error) => {
        if (error?.name === 'AbortError') return
        setState({ status: 'error', payload: error?.payload || null })
      })
    return () => controller.abort()
  }, [comarcaId, requestVersion])

  const handleComarcaChange = (event) => {
    const nextId = saveTerritorialComarca(event.target.value)
    setComarcaId(nextId)
    setState({ status: nextId ? 'loading' : 'idle', payload: null })
  }

  const payload = state.payload

  return (
    <>
      <PageHero
        tag="Proximitat territorial"
        title="El teu Bon Diari, comarca a comarca"
        description="Agenda cultural, concessions públiques i indicadors oficials del Barcelonès i el Maresme, consultats només quan obres aquesta vista."
      />

      <section
        className="section-block territorial-panel"
        aria-labelledby="territorial-selector-title"
        aria-busy={state.status === 'loading'}
      >
        <div className="territorial-selector">
          <div>
            <p className="section-tag">Primer cercle</p>
            <h2 id="territorial-selector-title">Tria la comarca</h2>
          </div>
          <label htmlFor="territorial-comarca">
            <span>Comarca preferida</span>
            <select
              id="territorial-comarca"
              value={comarcaId}
              onChange={handleComarcaChange}
            >
              <option value="">Selecciona una comarca</option>
              {TERRITORIAL_COMARQUES.map((comarca) => (
                <option key={comarca.id} value={comarca.id}>
                  {comarca.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="territorial-privacy">
          La preferència queda només al teu navegador. No fem servir la IP,
          geolocalització ni permisos d’ubicació; el servidor rep únicament el
          codi de comarca quan demanes aquesta informació.
        </p>
      </section>

      {state.status === 'idle' ? (
        <section className="section-block territorial-state">
          <p className="section-tag">A punt quan tu vulguis</p>
          <h2>Selecciona una comarca per començar</h2>
          <p>No es consulta cap font externa fins que facis aquesta tria.</p>
        </section>
      ) : null}

      {state.status === 'loading' ? (
        <section className="section-block territorial-state" role="status" aria-live="polite">
          <p className="section-tag">Fonts oficials</p>
          <h2>Carregant la informació territorial…</h2>
          <p>Consultem la memòria cau i, si cal, les tres fonts en paral·lel.</p>
        </section>
      ) : null}

      {state.status === 'error' ? (
        <section className="section-block territorial-state" role="alert">
          <p className="section-tag">Incidència temporal</p>
          <h2>No hem pogut completar la consulta</h2>
          <p>Cap de les fonts té ara mateix una resposta utilitzable. Ho pots tornar a provar.</p>
          <button
            className="button button--primary"
            type="button"
            onClick={() => {
              setState((current) => ({ ...current, status: 'loading' }))
              setRequestVersion((value) => value + 1)
            }}
          >
            Tornar-ho a provar
          </button>
        </section>
      ) : null}

      {state.status === 'ready' && payload ? (
        <div className="territorial-results">
          <section className="section-block territorial-summary" aria-live="polite">
            <div>
              <p className="section-tag">{payload.comarca.name}</p>
              <h2>Informació de proximitat</h2>
            </div>
            <p>
              Actualitzat el {formatUpdatedAt(payload.updatedAt)}
              {payload.status === 'degraded'
                ? ' · Alguna font usa una còpia de contingència.'
                : ''}
            </p>
          </section>
          {sourceOrder.map((sourceId) => (
            <SourceSection
              key={sourceId}
              sourceId={sourceId}
              source={payload.sources[sourceId]}
            />
          ))}
        </div>
      ) : null}
    </>
  )
}

export default TerritorialView
