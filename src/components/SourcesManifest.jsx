import {
  SOURCE_GROUPS,
  SOURCE_STATUS,
  SOURCE_TIERS,
  TOTAL_CATALOGUED_SOURCES,
} from '../lib/sources.js'

export default function SourcesManifest() {
  return (
    <section className="section-block sources-manifest">
      <div className="section-heading">
        <div>
          <p className="section-tag">D’on surten les notícies</p>
          <h2>{TOTAL_CATALOGUED_SOURCES} fonts amb una funció clara</h2>
        </div>
      </div>

      <p className="sources-manifest__lead">
        No totes les fonts fan la mateixa feina. Les fonts primàries aporten
        dades i documents; el radar periodístic detecta històries; i les pistes
        només obren una investigació. Una peça arriba a Bondiari quan el seu
        nivell de verificació és explícit i supera el filtre editorial.
      </p>

      <div className="sources-manifest__grid">
        {SOURCE_GROUPS.map((group) => (
          <article key={group.scope} className="sources-manifest__group">
            <h3>{group.scope}</h3>
            <p className="sources-manifest__desc">{group.description}</p>
            <ul>
              {group.sources.map((source) => (
                <li key={source.name}>
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {source.name}
                  </a>
                  <span className="sources-manifest__meta">
                    {SOURCE_TIERS[source.tier]} · {SOURCE_STATUS[source.status]}
                  </span>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>

      <p className="sources-manifest__note">
        Regla de publicació: una afirmació factual necessita una font primària
        o dues fonts independents. Notes de premsa, xarxes i aportacions de
        lectors són pistes; mai es publiquen automàticament. Totes les peces
        enllacen a l’origen i indiquen què se sap i què queda per comprovar.
      </p>
    </section>
  )
}
