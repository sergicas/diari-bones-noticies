// Component Targeta de Notícia per a les graelles d'articles

import { canInterceptNavigation, getStoryPath } from '../lib/navigation.js'
import { getDistanceBand, getOriginBadge } from '../lib/distance.js'
import { getStorySection } from '../lib/sections.js'
import { getTopicIcon } from '../lib/category.js'
import { formatDate, getLanguageLabel, handleImageError } from '../lib/viewHelpers.js'

export function StoryCard({ story, onNavigate }) {
  const storyPath = getStoryPath(story.id)
  const originBadge = getOriginBadge(story.origin, story.editorialFormat)
  const distanceBand = getDistanceBand(story)
  const storySection = getStorySection(story)
  const sectionIcon = getTopicIcon(storySection.label)

  return (
    <a
      className="story-card"
      href={storyPath}
      onClick={(event) => {
        if (!canInterceptNavigation(event)) {
          return
        }

        event.preventDefault()
        onNavigate(storyPath)
      }}
    >
      <div className="story-card__media">
        <img
          className="story-card__image"
          src={story.imageUrl}
          alt=""
          width="1600"
          height="1000"
          loading="lazy"
          decoding="async"
          onError={handleImageError}
        />
      </div>

      <div className="story-card__header">
        <div className="story-card__chips">
          <span className="paper-chip">
            {sectionIcon ? (
              <span className="paper-chip__icon" aria-hidden="true">
                {sectionIcon}{' '}
              </span>
            ) : null}
            {storySection.label}
          </span>
          <span className="paper-chip paper-chip--subtle">
            {distanceBand.label}
          </span>
          {story.language && story.language !== 'ca' ? (
            <span
              className="paper-chip paper-chip--lang"
              title={getLanguageLabel(story.language)}
            >
              {story.language.toUpperCase()}
            </span>
          ) : null}
          {story.isFresh ? (
            <span
              className="paper-chip paper-chip--fresh"
              title="Nova en aquest refresc"
            >
              <span className="paper-chip__dot" aria-hidden="true" />
              Nou
            </span>
          ) : null}
        </div>
        <span className="story-card__time">{story.readTime}</span>
      </div>

      <h3>{story.title}</h3>
      <p className="story-card__summary">{story.summary || story.impact}</p>

      <div className="story-card__footer">
        <span>{story.location}</span>
        <span>{formatDate(story.publishedAt)}</span>
      </div>

      {originBadge ? <span className="origin-badge">{originBadge}</span> : null}
    </a>
  )
}

export default StoryCard
