// Vista completa de lectura d'una notícia individual (/noticia/:id)

import PageHero from '../components/PageHero.jsx'
import { StoryCard } from '../components/StoryCard.jsx'
import SaveButton from '../components/SaveButton.jsx'
import ShareRow from '../components/ShareRow.jsx'
import { canInterceptNavigation } from '../lib/navigation.js'
import { getDistanceBand, getOriginLabel } from '../lib/distance.js'
import { getStorySection } from '../lib/sections.js'
import { formatDate, handleImageError } from '../lib/viewHelpers.js'

export function StoryDetailView({ story, sourceLink, imageLink, relatedStories, onNavigate }) {
  const distanceBand = getDistanceBand(story)
  const storySection = getStorySection(story)

  return (
    <>
      <div className="no-print">
        <PageHero
          headingLevel="h1"
          tag="Pàgina d'article"
          title={story.title}
          description={story.summary || story.impact}
          actions={
            <>
              <a
                className="button button--ghost"
                href="/"
                onClick={(event) => {
                  if (!canInterceptNavigation(event)) {
                    return
                  }

                  event.preventDefault()
                  onNavigate('/')
                }}
              >
                Tornar a la portada
              </a>
              <button
                type="button"
                className="button button--ghost"
                onClick={() => window.print()}
                aria-label="Imprimir article o desar com a PDF per a aules"
              >
                Imprimir / Desar PDF
              </button>
              <a
                className="button button--primary"
                href={sourceLink.href}
                target="_blank"
                rel="noopener noreferrer"
              >
                {sourceLink.label}
              </a>
            </>
          }
        />
      </div>

      <article className="article-page">
        <header className="article-print-header print-only">
          <p className="article-print-header__kicker">El Bon Diari</p>
          <h1>{story.title}</h1>
          <p className="article-print-header__summary">
            {story.summary || story.impact}
          </p>
          <p className="article-print-header__meta">
            Font: {story.source} · Publicada: {formatDate(story.publishedAt)}
          </p>
        </header>

        <div className="article-page__header no-print">
          <div className="story-modal__chips">
            <span className="paper-chip">{storySection.label}</span>
            <span className="paper-chip paper-chip--subtle">
              {distanceBand.label}
            </span>
            <span className="paper-chip paper-chip--subtle">
              {getOriginLabel(story.origin, story.editorialFormat)}
            </span>
          </div>
          <p className="article-page__kicker">{story.kicker}</p>
        </div>

        <div className="article-page__lead no-print">
          <div className="article-page__media">
            <a
              className="story-image-link"
              href={imageLink}
              target="_blank"
              rel="noopener noreferrer"
            >
              <img
                className="article-page__image"
                src={story.imageUrl}
                alt={story.imageAlt}
                width="1600"
                height="900"
                fetchPriority="high"
                decoding="async"
                onError={handleImageError}
              />
            </a>
            {story.imageCredit ? (
              <p className="image-credit">{story.imageCredit}</p>
            ) : null}
          </div>

          <aside className="article-page__aside">
            <article className="story-modal__detail-card">
              <span>Publicada</span>
              <strong>{formatDate(story.publishedAt)}</strong>
            </article>
            <article className="story-modal__detail-card">
              <span>Lloc</span>
              <strong>{story.location}</strong>
            </article>
            <article className="story-modal__detail-card">
              <span>Proximitat editorial</span>
              <strong>{distanceBand.editorialLabel}</strong>
            </article>
            <article className="story-modal__detail-card">
              <span>Temps de lectura</span>
              <strong>{story.readTime}</strong>
            </article>
            {story.impact ? (
              <article className="story-modal__detail-card">
                <span>Impacte</span>
                <strong>{story.impact}</strong>
              </article>
            ) : null}
          </aside>
        </div>

        <div className="article-page__body">
          {story.body.map((paragraph) => (
            <p key={`${story.id}-${paragraph.slice(0, 24)}`}>{paragraph}</p>
          ))}
        </div>

        <div className="article-page__save no-print">
          <SaveButton story={story} />
        </div>

        <div className="no-print">
          <ShareRow story={story} />
        </div>

        <div className="article-page__footer no-print">
          <div className="story-modal__source">
            <span>Font</span>
            <a
              className="source-link"
              href={sourceLink.href}
              target="_blank"
              rel="noopener noreferrer"
            >
              {story.source}
            </a>
            {sourceLink.isFallback ? (
              <small className="source-note">
                Sense URL directa: obrim una cerca de referència.
              </small>
            ) : null}
            {sourceLink.isInternalDemo ? (
              <small className="source-note">
                Aquesta peça obre una fitxa de font vinculada a la notícia.
              </small>
            ) : null}
          </div>

          <div className="story-modal__buttons">
            <a
              className="button button--ghost"
              href="/"
              onClick={(event) => {
                if (!canInterceptNavigation(event)) {
                  return
                }

                event.preventDefault()
                onNavigate('/')
              }}
            >
              Tornar a la portada
            </a>
            <a
              className="button button--primary"
              href={sourceLink.href}
              target="_blank"
              rel="noopener noreferrer"
            >
              Llegir la font original
            </a>
          </div>
        </div>
      </article>

      {relatedStories.length > 0 ? (
        <section className="section-block no-print">
          <div className="section-heading">
            <div>
              <p className="section-tag">Relacionades</p>
              <h2>Altres peces de la mateixa edició</h2>
            </div>
          </div>

          <div className="news-grid">
            {relatedStories.map((relatedStory) => (
              <StoryCard
                key={relatedStory.id}
                story={relatedStory}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        </section>
      ) : null}
    </>
  )
}

export default StoryDetailView
