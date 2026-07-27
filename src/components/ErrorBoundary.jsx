// Component ErrorBoundary per capturar errors de càrrega de chunks offline o fallades d'interfície

import { Component } from 'react'

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.warn('[ErrorBoundary] Error capturat:', error, errorInfo)
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null })
    if (typeof window !== 'undefined') {
      window.location.reload()
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <section className="section-block empty-state" role="alert">
          <h2>No s'ha pogut carregar la vista.</h2>
          <p>
            És possible que estiguis navegant sense connexió o que la xarxa s'hagi interromput.
          </p>
          <button
            type="button"
            className="button button--primary"
            onClick={this.handleRetry}
          >
            Tornar a intentar
          </button>
        </section>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary
