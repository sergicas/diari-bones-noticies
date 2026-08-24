import PageHero from '../components/PageHero.jsx'
import PushOptIn from '../components/PushOptIn.jsx'
import { EDITORIAL_TOPIC_INDEX } from '../lib/category.js'
import { distanceBandConfig } from '../lib/distance.js'
import { canInterceptNavigation } from '../lib/navigation.js'

function toggle(values, value) {
  return values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value]
}

export function PreferencesView({ preferences, onChange, onNavigate }) {
  const update = (patch) => onChange({ ...preferences, ...patch })

  return (
    <>
      <PageHero
        tag="Lectura a mida"
        title="Els meus interessos"
        description="Tria els temes i territoris que vols reconèixer d’un cop d’ull. La portada conserva sempre el mateix criteri i el mateix ordre editorial."
        actions={
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
        }
      />

      <section className="section-block preferences-panel" aria-labelledby="preferences-topics">
        <div className="section-heading">
          <div>
            <p className="section-tag">Només en aquest dispositiu</p>
            <h2 id="preferences-topics">Temes d’interès</h2>
          </div>
          <p className="section-caption">No cal compte i aquesta tria no s’envia al servidor.</p>
        </div>
        <div className="preference-options">
          {EDITORIAL_TOPIC_INDEX.map((topic) => (
            <label className="preference-option" key={topic.id}>
              <input
                type="checkbox"
                checked={preferences.topics.includes(topic.id)}
                onChange={() => update({ topics: toggle(preferences.topics, topic.id) })}
              />
              <span><strong>{topic.label}</strong><small>{topic.description}</small></span>
            </label>
          ))}
        </div>
      </section>

      <section className="section-block preferences-panel" aria-labelledby="preferences-territories">
        <div className="section-heading">
          <div>
            <p className="section-tag">Proximitat</p>
            <h2 id="preferences-territories">Territoris d’interès</h2>
          </div>
        </div>
        <div className="preference-options preference-options--compact">
          {distanceBandConfig.map((territory) => (
            <label className="preference-option" key={territory.id}>
              <input
                type="checkbox"
                checked={preferences.territories.includes(territory.id)}
                onChange={() => update({ territories: toggle(preferences.territories, territory.id) })}
              />
              <span><strong>{territory.label}</strong><small>{territory.description}</small></span>
            </label>
          ))}
        </div>
        <label className="preference-switch">
          <input
            type="checkbox"
            checked={preferences.showForYou}
            onChange={(event) => update({ showForYou: event.target.checked })}
          />
          <span>Mostrar el bloc «Per a tu» amb un màxim de quatre peces repetides de la portada.</span>
        </label>
      </section>

      <section className="section-block preferences-panel" aria-labelledby="preferences-notifications">
        <div className="section-heading">
          <div>
            <p className="section-tag">Sense soroll</p>
            <h2 id="preferences-notifications">Notificacions</h2>
          </div>
          <p className="section-caption">Només «La peça del dia» o desactivades. Mai més d’un avís al dia.</p>
        </div>
        <PushOptIn />
      </section>
    </>
  )
}

export default PreferencesView
