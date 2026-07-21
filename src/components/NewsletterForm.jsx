import { useEffect, useState } from 'react'

function formatCount(value) {
  if (typeof value !== 'number') return ''
  return new Intl.NumberFormat('ca-ES').format(value)
}

export default function NewsletterForm({ defaultLanguage = 'ca', variant = 'full' }) {
  const isCompact = variant === 'compact'
  const headingId = `newsletter-heading-${variant}`
  const [email, setEmail] = useState('')
  const [language, setLanguage] = useState(defaultLanguage)
  const [status, setStatus] = useState('idle') // idle | sending | ok | already | error
  const [errorMsg, setErrorMsg] = useState('')
  const [subscriberCount, setSubscriberCount] = useState(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/newsletter/stats')
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (cancelled || !data) return
        if (typeof data.confirmed === 'number') setSubscriberCount(data.confirmed)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (status === 'sending') return
    setStatus('sending')
    setErrorMsg('')
    try {
      const response = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), language, source: 'web' }),
      })
      const data = await response.json()
      if (!response.ok || !data.ok) {
        setStatus('error')
        if (data.error === 'invalid-email') {
          setErrorMsg("L'adreça no té un format vàlid.")
        } else if (data.error === 'rate-limited') {
          setErrorMsg('Hem rebut massa subscripcions des d\'aquesta xarxa per hora. Torna-ho a provar més tard.')
        } else {
          setErrorMsg('No hem pogut completar la subscripció. Torna-ho a provar.')
        }
        return
      }
      setStatus(data.alreadySubscribed ? 'already' : 'ok')
      setEmail('')
    } catch {
      setStatus('error')
      setErrorMsg('Hi ha hagut un problema de connexió. Torna-ho a provar.')
    }
  }

  return (
    <section
      className={`newsletter-block${isCompact ? ' newsletter-block--compact' : ''}`}
      aria-labelledby={headingId}
    >
      <div className="newsletter-block__inner">
        <p className="newsletter-block__kicker">El butlletí</p>
        <h2 id={headingId}>Les bones notícies, cada matí a les 7</h2>
        <p className="newsletter-block__intro">
          {isCompact
            ? 'Rep les millors notícies del dia al correu. Gratis, sense soroll i sense publicitat.'
            : "Una selecció breu i curada de les millors notícies del dia, sense soroll ni publicitat. T'arriba al correu cada matí a les 7. Et pots donar de baixa en qualsevol moment amb un sol clic."}
        </p>
        {typeof subscriberCount === 'number' && subscriberCount > 0 ? (
          <p className="newsletter-block__count" aria-live="polite">
            {subscriberCount === 1
              ? "Ja hi som una persona. Vols ser la segona?"
              : `Ja hi som ${formatCount(subscriberCount)} lectors.`}
          </p>
        ) : null}
        <form className="newsletter-block__form" onSubmit={handleSubmit} noValidate>
          <label className="newsletter-block__field">
            <span className="newsletter-block__label">El teu correu</span>
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="nom@correu.cat"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              disabled={status === 'sending'}
            />
          </label>
          {!isCompact ? (
            <label className="newsletter-block__field newsletter-block__field--lang">
              <span className="newsletter-block__label">Idioma</span>
              <select
                value={language}
                onChange={(event) => setLanguage(event.target.value)}
                disabled={status === 'sending'}
              >
                <option value="ca">Català</option>
                <option value="es">Castellà</option>
                <option value="en">Anglès</option>
                <option value="fr">Francès</option>
              </select>
            </label>
          ) : null}
          <button type="submit" className="newsletter-block__submit" disabled={status === 'sending'}>
            {status === 'sending' ? 'Enviant…' : 'Subscriu-me'}
          </button>
        </form>
        {status === 'ok' ? (
          <p className="newsletter-block__feedback newsletter-block__feedback--ok" role="status">
            Falta un sol pas: t'hem enviat un correu de confirmació. Obre'l i toca el botó per acabar la subscripció.
          </p>
        ) : null}
        {status === 'already' ? (
          <p className="newsletter-block__feedback newsletter-block__feedback--ok" role="status">
            Aquesta adreça ja està confirmada. No cal fer res més.
          </p>
        ) : null}
        {status === 'error' ? (
          <p className="newsletter-block__feedback newsletter-block__feedback--error" role="alert">
            {errorMsg}
          </p>
        ) : null}
        {!isCompact ? (
          <p className="newsletter-block__note">
            Mai compartim la teva adreça. Només el rebran les bones notícies de bondiari.
          </p>
        ) : null}
      </div>
    </section>
  )
}
