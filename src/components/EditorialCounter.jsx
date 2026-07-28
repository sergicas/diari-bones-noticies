import { useEffect, useState } from 'react'

const monthLabels = [
  'gener', 'febrer', 'març', 'abril', 'maig', 'juny',
  'juliol', 'agost', 'setembre', 'octubre', 'novembre', 'desembre',
]

function formatMonth(yyyyMm) {
  if (!yyyyMm) return ''
  const [year, month] = yyyyMm.split('-')
  const name = monthLabels[parseInt(month, 10) - 1]
  if (!name) return yyyyMm
  return `${name} del ${year}`
}

function formatCount(value) {
  if (typeof value !== 'number') return '—'
  return new Intl.NumberFormat('ca-ES').format(value)
}

function formatCoverageDate(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('ca-ES', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date)
}

export default function EditorialCounter() {
  const [stats, setStats] = useState(null)
  const [hasError, setHasError] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch('/api/editorial-stats')
      .then((response) => {
        if (!response.ok) throw new Error('http ' + response.status)
        return response.json()
      })
      .then((data) => {
        if (!cancelled) setStats(data)
      })
      .catch(() => {
        if (!cancelled) setHasError(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const processedEntries = stats?.processedEntries ?? stats?.reviewed
  const publishedUnique = stats?.publishedUnique ?? stats?.published

  if (hasError || !stats || (processedEntries === 0 && publishedUnique === 0)) {
    return null
  }

  return (
    <section className="editorial-counter" aria-label="Comptador editorial">
      <p className="editorial-counter__kicker">El nostre criteri en xifres</p>
      <p className="editorial-counter__line">
        Aquest <strong>{formatMonth(stats.month)}</strong> el radar ha processat{' '}
        <strong>{formatCount(processedEntries)}</strong> entrades de les fonts.{' '}
        L’arxiu verificable conserva{' '}
        <strong>{formatCount(publishedUnique)}</strong> notícies úniques publicades.
      </p>
      <p className="editorial-counter__note">
        Una mateixa notícia pot aparèixer en més d’una actualització del radar;
        per això separem les entrades processades de les peces úniques conservades
        {stats.trackingSince
          ? ` des del ${formatCoverageDate(stats.trackingSince)}`
          : ''}.
      </p>
    </section>
  )
}
