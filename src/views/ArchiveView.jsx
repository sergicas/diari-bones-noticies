// Vista de l'Hemeroteca (/hemeroteca)

import { useState } from 'react'
import PageHero from '../components/PageHero.jsx'
import { canInterceptNavigation } from '../lib/navigation.js'
import { getLanguageLabel } from '../lib/viewHelpers.js'
import { StoryCard } from '../components/StoryCard.jsx'
import { editorialSections, getStorySection } from '../lib/sections.js'

export function ArchiveView({ archiveStories, lastRefreshLabel, onNavigate }) {
  const [searchTerm, setSearchTerm] = useState('')
  const [sourceFilter, setSourceFilter] = useState('all')
  const [langFilter, setLangFilter] = useState('all')

  const availableSources = [...new Set(archiveStories.map((s) => s.source).filter(Boolean))].sort()
  const availableLanguages = [...new Set(archiveStories.map((s) => s.language).filter(Boolean))].sort()

  const normalizedQuery = searchTerm.trim().toLowerCase()
  const filtered = archiveStories.filter((story) => {
    if (sourceFilter !== 'all' && story.source !== sourceFilter) return false
    if (langFilter !== 'all' && story.language !== langFilter) return false
    if (!normalizedQuery) return true
    const haystack = `${story.title || ''} ${story.summary || ''} ${story.impact || ''} ${story.source || ''} ${story.location || ''}`.toLowerCase()
    return haystack.includes(normalizedQuery)
  })

  const hasFilters = normalizedQuery !== '' || sourceFilter !== 'all' || langFilter !== 'all'

  const resetFilters = () => {
    setSearchTerm('')
    setSourceFilter('all')
    setLangFilter('all')
  }

  return (
    <>
      <PageHero
        tag="Hemeroteca"
        title="Les peces útils no desapareixen: queden guardades per tornar-hi."
        description={`Les notícies de més de 2 dies surten de la portada i es guarden aquí. Ara mateix hi ha ${archiveStories.length} històries ordenades de més recent a més llunyana.`}
        actions={
          <a
            className="button button--primary"
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
              editorialSections
                .map((section) => ({
                  section,
                  stories: filtered.filter(
                    (story) => getStorySection(story).id === section.id,
                  ),
                }))
                .filter((group) => group.stories.length > 0)
                .map(({ section, stories }) => (
                  <div className="archive-topic" key={section.id}>
                    <div className="section-heading">
                      <div>
                        <p className="section-tag">{section.label}</p>
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
              Quan una notícia passa dels 2 dies, surt de la portada i queda
              guardada aquí automàticament.
            </p>
          </div>
        )}
      </section>
    </>
  )
}

export default ArchiveView
