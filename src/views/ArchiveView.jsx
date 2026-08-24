// Vista de l'Hemeroteca (/hemeroteca)

import { useState } from 'react'
import PageHero from '../components/PageHero.jsx'
import { canInterceptNavigation } from '../lib/navigation.js'
import { getLanguageLabel } from '../lib/viewHelpers.js'
import { StoryCard } from '../components/StoryCard.jsx'
import {
  EDITORIAL_TOPIC_INDEX,
  classifyAllowedEditorialTopic,
} from '../lib/category.js'
import { getStoryPreferenceMatch, hasReaderInterests } from '../lib/readerPreferences.js'
import { distanceBandConfig, getDistanceBand } from '../lib/distance.js'

export function ArchiveView({
  archiveStories,
  initialTopic = 'all',
  lastRefreshLabel,
  onNavigate,
  readerPreferences,
}) {
  const [searchTerm, setSearchTerm] = useState('')
  const [sourceFilter, setSourceFilter] = useState('all')
  const [langFilter, setLangFilter] = useState('all')
  const [topicFilter, setTopicFilter] = useState(initialTopic)
  const [territoryFilter, setTerritoryFilter] = useState(
    readerPreferences?.territories?.length ? 'preferred' : 'all',
  )
  const [interestFilter, setInterestFilter] = useState(
    initialTopic === 'all' && hasReaderInterests(readerPreferences) ? 'preferred' : 'all',
  )

  const availableSources = [...new Set(archiveStories.map((s) => s.source).filter(Boolean))].sort()
  const availableLanguages = [...new Set(archiveStories.map((s) => s.language).filter(Boolean))].sort()

  const normalizedQuery = searchTerm.trim().toLowerCase()
  const filtered = archiveStories.filter((story) => {
    const preferenceMatch = getStoryPreferenceMatch(story, readerPreferences)
    if (interestFilter === 'preferred' && !preferenceMatch.matches) return false
    if (
      topicFilter !== 'all' &&
      classifyAllowedEditorialTopic(story) !== topicFilter
    ) return false
    if (sourceFilter !== 'all' && story.source !== sourceFilter) return false
    if (langFilter !== 'all' && story.language !== langFilter) return false
    if (territoryFilter === 'preferred' && !readerPreferences.territories.includes(preferenceMatch.territoryId)) return false
    if (territoryFilter !== 'all' && territoryFilter !== 'preferred' && getDistanceBand(story).id !== territoryFilter) return false
    if (!normalizedQuery) return true
    const haystack = `${story.title || ''} ${story.summary || ''} ${story.impact || ''} ${story.source || ''} ${story.location || ''}`.toLowerCase()
    return haystack.includes(normalizedQuery)
  })

  const hasFilters =
    normalizedQuery !== '' ||
    topicFilter !== 'all' ||
    sourceFilter !== 'all' ||
    langFilter !== 'all'
    || territoryFilter !== 'all'
    || interestFilter !== 'all'

  // Les peces FITS-NONE són accessibles des de l'hemeroteca, però no formen
  // part de cap tema nou ni poden aparèixer en un filtre de tema específic.
  const unclassifiedArchiveStories = topicFilter === 'all'
    ? filtered.filter((story) => !classifyAllowedEditorialTopic(story))
    : []
  const archiveGroups = [
    ...EDITORIAL_TOPIC_INDEX
      .map((topic) => ({
        id: topic.id,
        label: topic.label,
        stories: filtered.filter(
          (story) => classifyAllowedEditorialTopic(story) === topic.label,
        ),
      }))
      .filter((group) => group.stories.length > 0),
    ...(unclassifiedArchiveStories.length > 0
      ? [{
          id: 'hemeroteca-general',
          label: 'Hemeroteca general',
          stories: unclassifiedArchiveStories,
        }]
      : []),
  ]

  const resetFilters = () => {
    setSearchTerm('')
    setTopicFilter('all')
    setSourceFilter('all')
    setLangFilter('all')
    setTerritoryFilter('all')
    setInterestFilter('all')
  }

  return (
    <>
      <PageHero
        tag="Hemeroteca"
        title="Les peces útils no desapareixen: queden guardades per tornar-hi."
        description={`Les notícies de més de 5 dies surten de la portada i es guarden aquí. Ara mateix hi ha ${archiveStories.length} històries ordenades de més recent a més llunyana.`}
        actions={
          <>
            <a
              className="button button--primary"
              href="/"
              onClick={(event) => {
                if (!canInterceptNavigation(event)) return
                event.preventDefault()
                onNavigate('/')
              }}
            >
              Tornar a la portada
            </a>
            <a
              className="button button--ghost"
              href="/temes"
              onClick={(event) => {
                if (!canInterceptNavigation(event)) return
                event.preventDefault()
                onNavigate('/temes')
              }}
            >
              Índex de temes
            </a>
          </>
        }
      />

      <section className="section-block archive-section">
        <div className="section-heading">
          <div>
            <p className="section-tag">Notícies antigues</p>
            <h2>Hemeroteca</h2>
          </div>
          <p className="section-caption">
            {lastRefreshLabel
              ? `Última actualització del radar: ${lastRefreshLabel}.`
              : 'El radar encara espera la primera actualització publicada.'}
          </p>
        </div>

        {archiveStories.length > 0 ? (
          <>
            <div className="archive-toolbar" role="search" aria-label="Cerca a la hemeroteca">
              <label className="archive-toolbar__field archive-toolbar__field--search">
                <span>Cercar per paraula</span>
                <input
                  type="search"
                  placeholder="Títol, font, lloc..."
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                />
              </label>
              <label className="archive-toolbar__field">
                <span>Tema</span>
                <select value={topicFilter} onChange={(event) => setTopicFilter(event.target.value)}>
                  <option value="all">Tots els temes</option>
                  {EDITORIAL_TOPIC_INDEX.map((topic) => (
                    <option key={topic.id} value={topic.label}>{topic.label}</option>
                  ))}
                </select>
              </label>
              <label className="archive-toolbar__field">
                <span>Interessos</span>
                <select value={interestFilter} onChange={(event) => setInterestFilter(event.target.value)}>
                  <option value="all">Totes les peces</option>
                  <option value="preferred" disabled={!hasReaderInterests(readerPreferences)}>Els meus interessos</option>
                </select>
              </label>
              <label className="archive-toolbar__field">
                <span>Territori</span>
                <select value={territoryFilter} onChange={(event) => setTerritoryFilter(event.target.value)}>
                  <option value="all">Tots els territoris</option>
                  <option value="preferred" disabled={!readerPreferences?.territories?.length}>Els meus territoris</option>
                  {distanceBandConfig.map((territory) => (
                    <option key={territory.id} value={territory.id}>{territory.label}</option>
                  ))}
                </select>
              </label>
              <label className="archive-toolbar__field">
                <span>Font</span>
                <select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}>
                  <option value="all">Totes les fonts</option>
                  {availableSources.map((source) => (
                    <option key={source} value={source}>{source}</option>
                  ))}
                </select>
              </label>
              <label className="archive-toolbar__field">
                <span>Idioma</span>
                <select value={langFilter} onChange={(event) => setLangFilter(event.target.value)}>
                  <option value="all">Tots els idiomes</option>
                  {availableLanguages.map((code) => (
                    <option key={code} value={code}>{getLanguageLabel(code)}</option>
                  ))}
                </select>
              </label>
              {hasFilters ? (
                <button type="button" className="archive-toolbar__reset" onClick={resetFilters}>
                  Esborrar filtres
                </button>
              ) : null}
            </div>
            <p className="archive-toolbar__count">
              {hasFilters ? `${filtered.length} de ${archiveStories.length} peces` : `${archiveStories.length} peces`}
            </p>
            {filtered.length > 0 ? (
              archiveGroups.map(({ id, label, stories }) => (
                  <div className="archive-topic" key={id}>
                    <div className="section-heading">
                      <div>
                        <p className="section-tag">{label}</p>
                        <h3>{stories.length} {stories.length === 1 ? 'peça' : 'peces'}</h3>
                      </div>
                    </div>
                    <div className="news-grid">
                      {stories.map((story) => (
                        <StoryCard
                          key={story.id}
                          story={story}
                          onNavigate={onNavigate}
                        />
                      ))}
                    </div>
                  </div>
                ))
            ) : (
              <div className="empty-state">
                <h3>Cap peça coincideix amb la cerca.</h3>
                <p>Prova amb una paraula més senzilla o esborra els filtres.</p>
              </div>
            )}
          </>
        ) : (
          <div className="empty-state">
            <h3>La Hemeroteca encara és buida.</h3>
            <p>
              Quan una notícia passa dels 5 dies, surt de la portada i queda
              guardada aquí automàticament.
            </p>
          </div>
        )}
      </section>
    </>
  )
}

export default ArchiveView
