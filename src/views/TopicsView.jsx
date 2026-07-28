import PageHero from '../components/PageHero.jsx'
import { canInterceptNavigation } from '../lib/navigation.js'
import {
  EDITORIAL_TOPIC_INDEX,
  classifyAllowedEditorialTopic,
} from '../lib/category.js'

function TopicLink({ href, children, onNavigate, secondary = false }) {
  return (
    <a
      className={`button ${secondary ? 'button--ghost' : 'button--primary'}`}
      href={href}
      onClick={(event) => {
        if (!canInterceptNavigation(event)) return
        event.preventDefault()
        onNavigate(href)
      }}
    >
      {children}
    </a>
  )
}

export function TopicsView({ stories, activeStoryIds, archiveStoryIds, onNavigate }) {
  const activeIds = new Set(activeStoryIds)
  const archiveIds = new Set(archiveStoryIds)
  const topicGroups = EDITORIAL_TOPIC_INDEX.map((topic) => {
    const topicStories = stories.filter(
      (story) => classifyAllowedEditorialTopic(story) === topic.label,
    )
    const recent = topicStories.filter((story) => activeIds.has(story.id)).length
    return {
      ...topic,
      total: topicStories.length,
      recent,
      archived: topicStories.filter((story) => archiveIds.has(story.id)).length,
    }
  })

  return (
    <>
      <PageHero
        tag="Índex de temes"
        title="Deu àmbits per trobar allò que fa avançar el món."
        description="Cada tema té la seva pàgina, amb les peces recents de portada i les històries conservades a l’hemeroteca, sense duplicats."
        actions={
          <TopicLink href="/" onNavigate={onNavigate}>
            Tornar a la portada
          </TopicLink>
        }
      />

      <section className="section-block topic-index" aria-labelledby="topic-index-title">
        <div className="section-heading">
          <div>
            <p className="section-tag">Tots els temes</p>
            <h2 id="topic-index-title">Índex editorial</h2>
          </div>
          <p className="section-caption">
            Les peces de fins a cinc dies són de portada; les anteriors queden a
            l’hemeroteca.
          </p>
        </div>

        <div className="topic-index__grid">
          {topicGroups.map((topic) => (
            <article className="topic-index__card" key={topic.id}>
              <p className="section-tag">{topic.total} {topic.total === 1 ? 'peça' : 'peces'}</p>
              <h3>{topic.label}</h3>
              <p>{topic.description}</p>
              {topic.subtopics.length > 0 ? (
                <ul className="topic-index__subtopics" aria-label={`Àmbits de ${topic.label}`}>
                  {topic.subtopics.map((subtopic) => (
                    <li key={subtopic}>{subtopic}</li>
                  ))}
                </ul>
              ) : null}
              <dl className="topic-index__counts">
                <div>
                  <dt>Portada</dt>
                  <dd>{topic.recent}</dd>
                </div>
                <div>
                  <dt>Hemeroteca</dt>
                  <dd>{topic.archived}</dd>
                </div>
              </dl>
              <div className="topic-index__actions">
                <TopicLink href={`/tema/${topic.id}`} onNavigate={onNavigate}>
                  Obrir el tema
                </TopicLink>
                <TopicLink
                  href={`/hemeroteca?tema=${topic.id}`}
                  onNavigate={onNavigate}
                  secondary
                >
                  Hemeroteca
                </TopicLink>
              </div>
            </article>
          ))}
        </div>
      </section>
    </>
  )
}

export default TopicsView
