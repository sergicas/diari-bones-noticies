import { editorialValues } from '../data/articles'

export default function ManifestSection() {
  return (
    <section className="section-block">
      <div className="section-heading">
        <div>
          <p className="section-tag">Manifest</p>
          <h2>Com publiquem sense caure en l’optimisme buit</h2>
        </div>
      </div>

      <div className="values-grid">
        {editorialValues.map((value) => (
          <article key={value.title} className="value-card">
            <span className="paper-chip paper-chip--accent">{value.tag}</span>
            <h3>{value.title}</h3>
            <p>{value.description}</p>
          </article>
        ))}
      </div>
    </section>
  )
}
