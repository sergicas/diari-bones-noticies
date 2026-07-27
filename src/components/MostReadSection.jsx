// Component de la secció de notícies més llegides de la setmana

import { useState, useEffect } from 'react'
import { canInterceptNavigation } from '../lib/navigation.js'

export function MostReadSection({ allStories, onNavigate }) {
  const [topStories, setTopStories] = useState(null)
  const [status, setStatus] = useState('loading')

  useEffect(() => {
    let cancelled = false
    fetch('/api/stats')
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return response.json()
      })
      .then((data) => {
        if (cancelled) return
        const byPath = new Map(
          allStories.map((s) => [`/noticia/${encodeURIComponent(s.id)}`, s]),
        )
        const selected = []
        for (const row of data.topPathsWeek || []) {
          const story = byPath.get(row.key)
          if (story) selected.push({ story, count: row.count })
          if (selected.length >= 3) break
        }
        setTopStories(selected)
        setStatus('ready')
      })
      .catch(() => {
        if (cancelled) return
        setStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [allStories])

  if (status !== 'ready' || !topStories || topStories.length === 0) {
    return null
  }

  return (
    <section className="section-block most-read-block">
      <div className="section-heading">
        <div>
          <p className="section-tag">Llegides al moment</p>
          <h2>Les peces amb més lectures aquesta setmana</h2>
        </div>
      </div>
      <ol className="most-read-list">
        {topStories.map((entry, index) => {
          const path = `/noticia/${encodeURIComponent(entry.story.id)}`
          return (
            <li key={entry.story.id} className="most-read-item">
              <span className="most-read-item__rank">
                {String(index + 1).padStart(2, '0')}
              </span>
              <a
                className="most-read-item__title"
                href={path}
                onClick={(event) => {
                  if (!canInterceptNavigation(event) || !onNavigate) return
                  event.preventDefault()
                  onNavigate(path)
                }}
              >
                {entry.story.title}
              </a>
              <span className="most-read-item__meta">
                {entry.story.category} · {entry.count} lectures
              </span>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

export default MostReadSection
