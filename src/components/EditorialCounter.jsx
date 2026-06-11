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

  if (hasError || !stats || (stats.reviewed === 0 && stats.published === 0)) {
    return null
  }

  const ratePercent = stats.reviewed > 0 ? Math.round((stats.published / stats.reviewed) * 100) : 0

  return (
    <section className="editorial-counter" aria-label="Comptador editorial">
      <p className="editorial-counter__kicker">El nostre criteri en xifres</p>
      <p className="editorial-counter__line">
        Aquest <strong>{formatMonth(stats.month)}</strong> hem mirat{' '}
        <strong>{formatCount(stats.reviewed)}</strong>{' '}
        notícies de tots els nostres mitjans. N'han passat el criteri editorial{' '}
        <strong>{formatCount(stats.published)}</strong> ({ratePercent}%).
      </p>
      <p className="editorial-counter__note">
        La resta han caigut perquè eren publicitat encoberta, opinió signada, fitxatges esportius,
        notícies de violència, o simplement no encaixaven amb la línia constructiva del diari.
      </p>
    </section>
  )
}
