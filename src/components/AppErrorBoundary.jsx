import { Component } from 'react'

export default class AppErrorBoundary extends Component {
  state = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, info) {
    console.error('[bondiari] Error no recuperat a la interfície', error, info)
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <main className="app-error" aria-labelledby="app-error-title">
        <p className="app-error__kicker">El Bon Diari</p>
        <h1 id="app-error-title">Aquesta pàgina no s’ha pogut mostrar</h1>
        <p>
          La incidència pot ser temporal. Recarrega la pàgina per recuperar la
          darrera edició disponible.
        </p>
        <div className="app-error__actions">
          <button type="button" onClick={() => window.location.reload()}>
            Recarrega la pàgina
          </button>
          <a href="/">Torna a la portada</a>
        </div>
      </main>
    )
  }
}
