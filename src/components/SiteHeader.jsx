import { useState } from 'react'
import { canInterceptNavigation } from '../lib/navigation.js'
import { formatDate } from '../lib/viewHelpers.js'

function readOwnerFlag() {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem('bondiari-owner') === '1'
  } catch {
    return false
  }
}

export default function SiteHeader({
  currentPage,
  isRefreshing,
  onNavigate,
  onRefresh,
}) {
  const navItems = [
    { href: '/', label: 'Portada', page: 'home' },
    { href: '/manifest', label: 'Manifest', page: 'manifest' },
    { href: '/hemeroteca', label: 'Hemeroteca', page: 'archive' },
    { href: '/desats', label: 'Desats', page: 'saved' },
  ]
  const [isOwner] = useState(readOwnerFlag)
  const isHome = currentPage === 'home'

  return (
    <header className={`masthead ${isHome ? 'masthead--home' : 'masthead--compact'}`}>
      <div className="masthead__top">
        <div className="masthead__utility">
          <p className="issue-chip">Edició del {formatDate(new Date())}</p>
          <nav className="site-nav" aria-label="Navegació principal">
            {navItems.map((item) => (
              <a
                key={item.href}
                className={`site-nav__link ${
                  currentPage === item.page ? 'is-active' : ''
                }`}
                href={item.href}
                aria-current={currentPage === item.page ? 'page' : undefined}
                onClick={(event) => {
                  if (!canInterceptNavigation(event)) return
                  event.preventDefault()
                  onNavigate(item.href)
                }}
              >
                {item.label}
              </a>
            ))}
          </nav>
        </div>

        {isOwner ? (
          <div className="masthead__actions">
            <button
              className={`button button--ghost ${isRefreshing ? 'is-loading' : ''}`}
              type="button"
              onClick={onRefresh}
              disabled={isRefreshing}
            >
              {isRefreshing ? 'Recarregant…' : 'Recarregar portada'}
            </button>
          </div>
        ) : null}
      </div>

      <div className="masthead__brand masthead__brand--graphis">
        <a
          className="graphis-title-band"
          href="/"
          aria-label="Tornar a la portada d'El Bon Diari"
          onClick={(event) => {
            if (!canInterceptNavigation(event)) return
            event.preventDefault()
            onNavigate('/')
          }}
        >
          <span className="graphis-title">EL BON DIARI</span>
          <span className="graphis-title-bird" aria-hidden="true">
            <img
              src="/logo-colibri.png?v=4"
              alt=""
              width="977"
              height="829"
              decoding="async"
            />
          </span>
        </a>

        {isHome ? (
          <div className="masthead__edition">
            <div className="brand-rhythm" aria-hidden="true">
              <span className="brand-rhythm__cell brand-rhythm__cell--red" />
              <span className="brand-rhythm__cell brand-rhythm__cell--blue" />
              <span className="brand-rhythm__cell brand-rhythm__cell--yellow" />
              <span className="brand-rhythm__cell brand-rhythm__cell--white">
                <img
                  src="/logo-colibri.png?v=4"
                  alt=""
                  width="977"
                  height="829"
                  decoding="async"
                />
              </span>
              <span className="brand-rhythm__cell brand-rhythm__cell--black" />
            </div>
            <div className="masthead__intro">
              <p className="section-tag">Periodisme constructiu i de servei</p>
              <p className="masthead__lead">
                Històries que expliquen què funciona, comprovacions que separen
                els fets del soroll i informació que pots convertir en una acció.
              </p>
              <a className="masthead__edition-link" href="#noticia-destacada">
                Llegir l’edició d’avui
              </a>
            </div>
          </div>
        ) : null}
      </div>
    </header>
  )
}
