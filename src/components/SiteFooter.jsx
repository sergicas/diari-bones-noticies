import { canInterceptNavigation } from '../lib/navigation.js'

export default function SiteFooter({ children, onNavigate }) {
  const internalLinks = [
    { href: '/temes', label: 'Índex de temes' },
    { href: '/manifest', label: 'Manifest' },
    { href: '/hemeroteca', label: 'Hemeroteca' },
    { href: '/estadistiques', label: 'Estadístiques' },
    { href: '/sobre', label: 'Sobre el diari' },
    { href: '/privacitat', label: 'Privacitat' },
  ]

  return (
    <footer className="site-footer">
      <div className="site-footer__content">
        <p>
          <strong>El Bon Diari</strong> · Edició digital en català. Selecció
          editorial i desenvolupament a càrrec de Sergi Castillo.
        </p>
        <div className="site-footer__links">
          {internalLinks.map((item) => (
            <a
              key={item.href}
              href={item.href}
              onClick={(event) => {
                if (!canInterceptNavigation(event) || !onNavigate) return
                event.preventDefault()
                onNavigate(item.href)
              }}
            >
              {item.label}
            </a>
          ))}
          <a href="/feed.xml" target="_blank" rel="noopener noreferrer">
            RSS
          </a>
        </div>
        <div className="site-footer__accessibility">
          {children}
        </div>
      </div>
    </footer>
  )
}
