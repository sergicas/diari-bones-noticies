import { canInterceptNavigation } from '../lib/navigation.js'

export default function NotFoundPage({ onNavigate }) {
  return (
    <section className="section-block not-found">
      <p className="section-tag">404 editorial</p>
      <h2>Aquesta pàgina no existeix dins del diari.</h2>
      <p>
        Potser l’enllaç ha caducat, o bé la notícia encara no forma part
        d’aquesta edició.
      </p>
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
    </section>
  )
}
