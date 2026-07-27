import { editorialValues } from '../data/editorial.js'
import { canInterceptNavigation } from '../lib/navigation.js'

export default function PortadaManifestTeaser({ onNavigate }) {
  const teaserValues = editorialValues.slice(0, 3)
  return (
    <aside className="manifest-teaser" aria-label="Resum del manifest editorial">
      <div className="manifest-teaser__intro">
        <p className="manifest-teaser__kicker">Manifest editorial</p>
        <h2 className="manifest-teaser__title">
          Per què aquesta peça és aquí
        </h2>
        <p className="manifest-teaser__lead">
          El Bon Diari no és un agregador. Cada peça que arriba a portada passa
          per un criteri editorial humà i un filtre automàtic en sis llengües.
          Aquests són els tres principis que ens guien:
        </p>
      </div>
      <ul className="manifest-teaser__list">
        {teaserValues.map((value) => (
          <li key={value.title} className="manifest-teaser__item">
            <strong>{value.title}.</strong> {value.description}
          </li>
        ))}
      </ul>
      <a
        className="manifest-teaser__link"
        href="/manifest"
        onClick={(event) => {
          if (!canInterceptNavigation(event)) return
          event.preventDefault()
          onNavigate('/manifest')
        }}
      >
        Llegir el manifest sencer →
      </a>
    </aside>
  )
}
