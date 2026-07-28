// Pàgina pròpia de cada tema: una "portada petita" d'un sol àmbit (Cultura,
// Ciència, Política…). Capçalera del tema + una peça destacada + graella. Es
// nodreix de les peces recents I de l'hemeroteca del tema, així que no queda
// buida encara que el dia sigui fluix.

import { StoryCard } from '../components/StoryCard.jsx'
import { canInterceptNavigation, getStoryPath } from '../lib/navigation.js'
import { getDistanceBand, getOriginLabel } from '../lib/distance.js'
import { getStorySection } from '../lib/sections.js'
import { getTopicIcon } from '../lib/category.js'
import { formatDate, handleImageError } from '../lib/viewHelpers.js'

export function TopicPageView({
  topic,
  featuredStory,
  featuredImageLink,
  featuredSourceLink,
  gridStories,
  totalCount,
  navigate,
}) {
  if (!topic) {
    return (
      <section className="section-block">
        <p className="section-tag">Tema no trobat</p>
        <h1>Aquest tema no existeix</h1>
        <p>
          <a
            href="/temes"
            onClick={(event) => {
              if (!canInterceptNavigation(event)) return
              event.preventDefault()
              navigate('/temes')
            }}
          >
            Torna a l’índex de temes
          </a>
        </p>
      </section>
    )
  }

  return (
    <>
      <section className="section-block topic-page__header">
        <p className="section-tag">Tema</p>
        <h1>
          <span className="topic-icon" aria-hidden="true">
            {getTopicIcon(topic.label)}
          </span>{' '}
          {topic.label}
        </h1>
        <p className="topic-page__description">{topic.description}</p>
        {topic.subtopics?.length > 0 ? (
          <ul className="topic-index__subtopics" aria-label={`Àmbits de ${topic.label}`}>
            {topic.subtopics.map((subtopic) => (
              <li key={subtopic}>{subtopic}</li>
            ))}
          </ul>
        ) : null}
        <p className="section-caption">
          {totalCount === 0
            ? 'Encara no hi ha cap peça d’aquest tema; el radar en publicarà quan en trobi.'
            : `${totalCount} ${totalCount === 1 ? 'peça' : 'peces'} en aquest tema.`}{' '}
          <a
            className="section-caption__link"
            href="/temes"
            onClick={(event) => {
              if (!canInterceptNavigation(event)) return
              event.preventDefault()
              navigate('/temes')
            }}
          >
            Tots els temes
          </a>
        </p>
      </section>

      {featuredStory ? (
        <section className="hero-grid" aria-label={`Peça destacada de ${topic.label}`}>
          <article className="featured-story">
            <div className="featured-story__media">
              <a
                className="story-image-link"
                href={featuredImageLink}
                target="_blank"
                rel="noopener noreferrer"
              >
                <img
                  className="featured-story__image"
                  src={featuredStory.imageUrl}
                  alt={featuredStory.imageAlt}
                  width="1600"
                  height="850"
                  fetchPriority="high"
                  decoding="async"
                  onError={handleImageError}
                />
              </a>
            </div>

            <div className="featured-story__content">
              <div className="featured-story__header">
                <span className="paper-chip paper-chip--light">
                  {getTopicIcon(getStorySection(featuredStory).label) ? (
                    <span className="paper-chip__icon" aria-hidden="true">
                      {getTopicIcon(getStorySection(featuredStory).label)}{' '}
                    </span>
                  ) : null}
                  {getStorySection(featuredStory).label}
                </span>
                <span className="paper-chip paper-chip--subtle">
                  {getDistanceBand(featuredStory).label}
                </span>
                {featuredStory.origin !== 'editorial' ? (
                  <span className="paper-chip paper-chip--subtle">
                    {getOriginLabel(featuredStory.origin, featuredStory.editorialFormat)}
                  </span>
                ) : null}
              </div>

              <p className="featured-story__kicker">{featuredStory.kicker}</p>
              <h2>{featuredStory.title}</h2>
              <p className="featured-story__summary">
                {featuredStory.summary || featuredStory.impact}
              </p>
            </div>

            <div className="featured-story__footer">
              <div className="featured-story__meta">
                <span>{featuredStory.location}</span>
                <span>{formatDate(featuredStory.publishedAt)}</span>
                <span>{featuredStory.readTime}</span>
              </div>

              {featuredSourceLink ? (
                <div className="featured-story__source">
                  <span>Font</span>
                  <a
                    href={featuredSourceLink.href}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {featuredStory.source}
                  </a>
                </div>
              ) : null}

              <a
                className="button button--light"
                href={getStoryPath(featuredStory.id)}
                onClick={(event) => {
                  if (!canInterceptNavigation(event)) return
                  event.preventDefault()
                  navigate(getStoryPath(featuredStory.id))
                }}
              >
                Obrir la peça completa
              </a>
            </div>
          </article>
        </section>
      ) : null}

      {gridStories.length > 0 ? (
        <section className="section-block" aria-label={`Més peces de ${topic.label}`}>
          <div className="section-heading">
            <div>
              <p className="section-tag">{topic.label}</p>
              <h2>Més d’aquest tema</h2>
            </div>
            <p className="section-caption">
              Peces recents i de l’hemeroteca, amb la data original visible.
            </p>
          </div>
          <div className="news-grid news-grid--portada">
            {gridStories.map((story) => (
              <StoryCard key={story.id} story={story} onNavigate={navigate} />
            ))}
          </div>
        </section>
      ) : null}
    </>
  )
}

export default TopicPageView
