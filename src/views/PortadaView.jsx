// Vista de la portada principal del diari (notícies del dia, filtres, ticker i destacada)

import { StoryCard } from '../components/StoryCard.jsx'
import NewsletterForm from '../components/NewsletterForm.jsx'
import EditorialCounter from '../components/EditorialCounter.jsx'
import PushOptIn from '../components/PushOptIn.jsx'
import MostReadSection from '../components/MostReadSection.jsx'
import { canInterceptNavigation, getStoryPath } from '../lib/navigation.js'
import { getDistanceBand, getOriginLabel } from '../lib/distance.js'
import { getStorySection } from '../lib/sections.js'
import { formatDate, handleImageError } from '../lib/viewHelpers.js'

export function PortadaView({
  categories,
  activeCategory,
  applyCategoryFilter,
  getFilterPath,
  activeDistanceFilter,
  searchTerm,
  setSearchTerm,
  liveTicker,
  featuredStory,
  featuredImageLink,
  featuredSourceLink,
  resetFilters,
  sectionShowingGeneral,
  headlineCount,
  isServiceSection,
  navigate,
  hasActiveFilters,
  distanceFilterOptions,
  applyDistanceFilter,
  activeDistanceOption,
  editionStories,
  portadaStories,
}) {
  const primaryCategoryNames = new Set([
    'Totes',
    'Local',
    'Ho comprovem',
    'Et pot servir',
    'Cultura',
    'Ciència',
  ])
  const primaryCategories = categories.filter(
    (category) =>
      primaryCategoryNames.has(category) || category === activeCategory,
  )
  const secondaryCategories = categories.filter(
    (category) => !primaryCategories.includes(category),
  )
  const todayStories = portadaStories.slice(0, 3)
  const remainingStories = portadaStories.slice(3)

  const renderCategoryLink = (category, prefix) => (
    <a
      key={`${prefix}-${category}`}
      className={`category-pill ${
        activeCategory === category ? 'is-active' : ''
      }`}
      href={getFilterPath({
        category,
        distanceFilter: activeDistanceFilter,
        search: searchTerm,
      })}
      aria-current={activeCategory === category ? 'true' : undefined}
      onClick={(event) => applyCategoryFilter(category, event)}
    >
      {category}
    </a>
  )

  return (
    <>
      <h1 className="sr-only">
        El Bon Diari: periodisme constructiu, útil i verificable
      </h1>
      <section className="topics-bar" aria-label="Temes">
        <div className="topics-bar__heading">
          <p className="section-tag">Explora l’edició</p>
          <p>Una portada comuna, amb accessos ràpids als formats principals.</p>
        </div>
        <div className="category-row category-row--primary">
          {primaryCategories.map((category) =>
            renderCategoryLink(category, 'primary'),
          )}
        </div>
        {secondaryCategories.length > 0 ? (
          <details className="topic-explorer">
            <summary>Més temes</summary>
            <div className="category-row category-row--secondary">
              {secondaryCategories.map((category) =>
                renderCategoryLink(category, 'secondary'),
              )}
            </div>
          </details>
        ) : null}
      </section>
      <section
        id="noticia-destacada"
        className="hero-grid"
        tabIndex="-1"
        aria-label="Notícia destacada"
      >
        {featuredStory ? (
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
                  {getStorySection(featuredStory).label}
                </span>
                <span className="paper-chip paper-chip--subtle">
                  {getDistanceBand(featuredStory).label}
                </span>
                {featuredStory.origin !== 'editorial' ? (
                  <span className="paper-chip paper-chip--subtle">
                    {getOriginLabel(
                      featuredStory.origin,
                      featuredStory.editorialFormat,
                    )}
                  </span>
                ) : null}
              </div>

              <p className="featured-story__kicker">
                {featuredStory.kicker}
              </p>
              <h2>{featuredStory.title}</h2>
              <p className="featured-story__summary">
                {featuredStory.summary || featuredStory.impact}
              </p>
            </div>

            <div className="featured-story__footer">
              {featuredStory.impact !==
              (featuredStory.summary || featuredStory.impact) ? (
                <div className="featured-story__impact">
                  <span>Impacte</span>
                  <strong>{featuredStory.impact}</strong>
                </div>
              ) : null}

              <div className="featured-story__meta">
                <span>{featuredStory.location}</span>
                <span>{formatDate(featuredStory.publishedAt)}</span>
                <span>{featuredStory.readTime}</span>
              </div>

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

              {featuredStory.imageCredit ? (
                <p className="image-credit image-credit--light">
                  {featuredStory.imageCredit}
                </p>
              ) : null}

              <a
                className="button button--light"
                href={getStoryPath(featuredStory.id)}
                onClick={(event) => {
                  if (!canInterceptNavigation(event)) {
                    return
                  }

                  event.preventDefault()
                  navigate(getStoryPath(featuredStory.id))
                }}
              >
                Obrir la peça completa
              </a>
            </div>
          </article>
        ) : (
          <article className="featured-story featured-story--empty">
            <p className="section-tag">Edició en preparació</p>
            <h2>
              {portadaStories.length > 0
                ? 'Encara no tenim una peça prou recent per encapçalar l’edició.'
                : 'Cap peça encaixa amb els filtres actuals.'}
            </h2>
            <p className="featured-story__summary">
              {portadaStories.length > 0
                ? 'La informació de servei vigent continua disponible a sota; el radar publicarà una nova destacada quan superi el control editorial.'
                : 'Torna al radar progressiu perquè la portada recuperi la selecció editorial completa.'}
            </p>
            <button
              className="button button--primary"
              type="button"
              onClick={resetFilters}
            >
              Recuperar la portada
            </button>
          </article>
        )}

      </section>

      {todayStories.length > 0 ? (
        <section className="section-block editorial-highlights">
          <div className="section-heading">
            <div>
              <p className="section-tag">Avui val la pena saber</p>
              <h2>Tres peces per entendre què està funcionant</h2>
            </div>
          </div>
          <div className="news-grid news-grid--highlights">
            {todayStories.map((story) => (
              <StoryCard key={story.id} story={story} onNavigate={navigate} />
            ))}
          </div>
        </section>
      ) : null}

      {liveTicker.length > 0 ? (
        <section className="latest-stories" aria-labelledby="latest-stories-title">
          <div className="latest-stories__heading">
            <p className="section-tag">Últimes incorporacions</p>
            <h2 id="latest-stories-title">El radar, sense urgència</h2>
          </div>
          <div className="latest-stories__list">
            {liveTicker.slice(0, 3).map((item) => (
              <a
                key={item.url}
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                <span>{item.category || 'Actualitat'}</span>
                <strong>{item.title}</strong>
                <small>{item.source}</small>
              </a>
            ))}
          </div>
        </section>
      ) : null}

      <NewsletterForm />

      <section
        id="resultats-portada"
        className="section-block"
        tabIndex="-1"
      >
        <div className="section-heading">
          <div>
            <p className="section-tag">Portada viva</p>
            <h2 className="sr-only">Portada viva</h2>
          </div>
          <p className="section-caption">
            {sectionShowingGeneral
              ? 'Aquesta secció encara no té peces pròpies avui; mentrestant, aquí tens la selecció del dia.'
              : headlineCount > 0
              ? `Mostrant ${headlineCount} peces a l’edició actual.`
              : isServiceSection
              ? `Encara no hi ha cap peça disponible a ${activeCategory}; el radar tornarà a consultar-ne les fonts oficials al pròxim refresc.`
              : 'Cap història coincideix amb aquest filtre ara mateix.'}
            <a
              className="section-caption__link"
              href="/hemeroteca"
              onClick={(event) => {
                if (!canInterceptNavigation(event)) {
                  return
                }

                event.preventDefault()
                navigate('/hemeroteca')
              }}
            >
              Anar a la Hemeroteca
            </a>
          </p>
        </div>

        <div className="control-strip">
          <label className="search-field" htmlFor="story-search">
            <span>Cerca per lloc, tema o impacte</span>
            <input
              id="story-search"
              name="story-search"
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Ex. biblioteca, energia, barri..."
            />
          </label>

          {hasActiveFilters ? (
            <button
              className="link-button"
              type="button"
              onClick={resetFilters}
            >
              Netejar filtres
            </button>
          ) : null}
        </div>

        <details className="filter-drawer" open={hasActiveFilters || undefined}>
          <summary>Filtrar per proximitat</summary>
          <div
            className="distance-row"
            aria-label="Filtres per proximitat respecte de Catalunya"
          >
            {distanceFilterOptions.map((option) => (
              <a
                key={option.id}
                className={`distance-pill ${
                  activeDistanceFilter === option.id ? 'is-active' : ''
                }`}
                href={getFilterPath({
                  category: activeCategory,
                  distanceFilter: option.id,
                  search: searchTerm,
                })}
                aria-current={
                  activeDistanceFilter === option.id ? 'true' : undefined
                }
                onClick={(event) => applyDistanceFilter(option.id, event)}
              >
                {option.label}
              </a>
            ))}
          </div>
          <p className="distance-note">
            <strong>{activeDistanceOption.label}.</strong>{' '}
            {activeDistanceOption.description}
          </p>
        </details>

        {remainingStories.length > 0 ? (
          <div className="news-grid news-grid--portada">
            {remainingStories.map((story) => (
              <StoryCard
                key={story.id}
                story={story}
                onNavigate={navigate}
              />
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <h3>
              {isServiceSection
                ? `Encara no hi ha peces a ${activeCategory}.`
                : 'No n’hi ha més per aquest filtre.'}
            </h3>
            <p>
              {isServiceSection
                ? 'La secció està activa, però ara mateix no hi ha cap element vigent de les fonts oficials. Ho tornarem a comprovar automàticament.'
                : portadaStories.length > 0
                ? 'Aquestes són totes les peces que encaixen amb la selecció actual. Pots llegir-les o provar una altra categoria.'
                : 'Prova amb una paraula diferent o torna a “Totes” per recuperar la portada completa.'}
            </p>
          </div>
        )}

        {/* Només l'edició viva: si hi entressin totes les peces, el rànquing
            de lectures tornaria a treure articles de fa setmanes a portada. */}
        <MostReadSection allStories={editionStories} onNavigate={navigate} />
      </section>

      <EditorialCounter />
      <PushOptIn />
    </>
  )
}

export default PortadaView
