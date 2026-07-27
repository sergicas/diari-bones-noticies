// Vista de notícies desades personalment (/desats)

import { useState, useEffect } from 'react'
import PageHero from '../components/PageHero.jsx'
import { canInterceptNavigation } from '../lib/navigation.js'
import { getSaved, removeSaved, SAVED_EVENT } from '../lib/saved.js'
import { formatDate, handleImageError } from '../lib/viewHelpers.js'

export function SavedView({ onNavigate }) {
  const [items, setItems] = useState(getSaved)

  useEffect(() => {
    function sync() {
      setItems(getSaved())
    }
    window.addEventListener(SAVED_EVENT, sync)
    return () => window.removeEventListener(SAVED_EVENT, sync)
  }, [])

  return (
    <>
      <PageHero
        tag="La teva col·lecció"
        title="Desats per llegir després"
        description="Els articles que guardes es queden al teu dispositiu: els pots rellegir aquí quan vulguis, fins i tot sense connexió."
      />

      <section className="section-block">
        {items.length === 0 ? (
          <div className="saved-empty">
            <h2>Encara no has desat cap notícia.</h2>
            <p>
              Quan trobis una peça que vulguis rellegir, prem{' '}
              <strong>«Desa per llegir després»</strong> i la tindràs aquí a mà,
              també quan estiguis sense connexió.
            </p>
            <a
              className="button button--primary"
              href="/"
              onClick={(event) => {
                if (!canInterceptNavigation(event) || !onNavigate) return
                event.preventDefault()
                onNavigate('/')
              }}
            >
              Explora la portada
            </a>
          </div>
        ) : (
          <ul className="saved-list">
            {items.map((story) => (
              <li key={story.id} className="saved-card">
                {story.imageUrl ? (
                  <img
                    className="saved-card__image"
                    src={story.imageUrl}
                    alt={story.imageAlt}
                    width="750"
                    height="550"
                    onError={handleImageError}
                    loading="lazy"
                    decoding="async"
                  />
                ) : null}
                <div className="saved-card__content">
                  <div className="saved-card__meta">
                    {story.category ? (
                      <span className="paper-chip">{story.category}</span>
                    ) : null}
                    {story.publishedAt ? (
                      <span className="saved-card__date">
                        {formatDate(story.publishedAt)}
                      </span>
                    ) : null}
                  </div>
                  <h2 className="saved-card__title">{story.title}</h2>
                  {story.summary ? (
                    <p className="saved-card__summary">{story.summary}</p>
                  ) : null}
                  {story.impact ? (
                    <p className="saved-card__impact">
                      <strong>Impacte:</strong> {story.impact}
                    </p>
                  ) : null}
                  {story.body && story.body.length > 0 ? (
                    <details className="saved-card__full">
                      <summary>Llegeix l'article complet</summary>
                      {story.body.map((paragraph, index) => (
                        <p key={`${story.id}-${index}`}>{paragraph}</p>
                      ))}
                    </details>
                  ) : null}
                  <div className="saved-card__actions">
                    <a
                      className="saved-card__link"
                      href={`/noticia/${encodeURIComponent(story.id)}`}
                      onClick={(event) => {
                        if (!canInterceptNavigation(event) || !onNavigate) return
                        event.preventDefault()
                        onNavigate(`/noticia/${encodeURIComponent(story.id)}`)
                      }}
                    >
                      Obre la pàgina
                    </a>
                    {story.url ? (
                      <a
                        className="saved-card__link"
                        href={story.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Font original
                      </a>
                    ) : null}
                    <button
                      type="button"
                      className="saved-card__remove"
                      onClick={() => removeSaved(story.id)}
                    >
                      Treu dels desats
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}

export default SavedView
