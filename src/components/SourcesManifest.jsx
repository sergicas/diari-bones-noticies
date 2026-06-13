import { SOURCE_GROUPS, TOTAL_SOURCES } from '../lib/sources.js'

export default function SourcesManifest() {
  return (
    <section className="section-block sources-manifest">
      <div className="section-heading">
        <div>
          <p className="section-tag">D’on surten les notícies</p>
          <h2>{TOTAL_SOURCES} fonts, un sol criteri</h2>
        </div>
      </div>

      <p className="sources-manifest__lead">
        Cada poques hores revisem les portades d’aquestes capçaleres. No les
        publiquem perquè sí: una peça només arriba a Bondiari si supera el filtre
        editorial —ha de ser constructiva, verificable i no pot ser publicitat
        encoberta, opinió partidista, fitxatge esportiu ni crònica de violència.
        La resta es queda fora, i ho expliquem al comptador de la portada.
      </p>

      <div className="sources-manifest__grid">
        {SOURCE_GROUPS.map((group) => (
          <article key={group.scope} className="sources-manifest__group">
            <h3>{group.scope}</h3>
            <p className="sources-manifest__desc">{group.description}</p>
            <ul>
              {group.sources.map((source) => (
                <li key={source}>{source}</li>
              ))}
            </ul>
          </article>
        ))}
      </div>

      <p className="sources-manifest__note">
        Les notícies sempre enllacen a la font original i mantenen el crèdit de
        la imatge. Bondiari no reescriu ni s’apropia del periodisme dels altres:
        el tria, el ordena i hi posa context.
      </p>
    </section>
  )
}
