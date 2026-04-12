import React from 'react'

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error: error.message }
  }

  componentDidCatch(error, info) {
    console.error('App crashed:', error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          minHeight: '100vh', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 16,
          background: '#0a0a12', color: '#f0effe',
          fontFamily: 'DM Sans, sans-serif', padding: '2rem', textAlign: 'center'
        }}>
          <div style={{ fontSize: 40 }}>⚠️</div>
          <h2 style={{ fontFamily: 'Sora, sans-serif', fontSize: '1.4rem', fontWeight: 600 }}>
            Something went wrong
          </h2>
          <p style={{ color: '#9b99bc', fontSize: 14, maxWidth: 400 }}>
            {this.state.error}
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: 8, padding: '12px 28px', borderRadius: 12,
              background: 'linear-gradient(135deg, #7c6ff7, #5b4bd8)',
              color: '#fff', fontSize: 15, fontWeight: 600, border: 'none', cursor: 'pointer'
            }}
          >
            Restart Interview
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
