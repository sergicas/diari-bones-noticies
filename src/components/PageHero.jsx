export default function PageHero({ tag, title, description, actions, headingLevel = 'h1' }) {
  const Heading = headingLevel === 'h2' ? 'h2' : 'h1'

  return (
    <section className="section-block page-hero">
      <div className="page-hero__content">
        <p className="section-tag">{tag}</p>
        <Heading>{title}</Heading>
        <p className="page-hero__lead">{description}</p>
      </div>

      {actions ? <div className="page-hero__actions">{actions}</div> : null}
    </section>
  )
}
