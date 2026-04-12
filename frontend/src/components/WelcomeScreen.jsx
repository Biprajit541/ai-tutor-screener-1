import React, { useState } from 'react'
import { startSession } from '../utils/api.js'

export default function WelcomeScreen({ onStart }) {
  const [name, setName]       = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  const handleStart = async () => {
    if (!name.trim()) { setError('Please enter your name'); return }
    setLoading(true)
    setError('')
    try {
      const session = await startSession(name.trim())
      onStart(session)
    } catch {
      setError('Could not connect to server. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', padding: '2rem',
      background: 'radial-gradient(ellipse at 60% 20%, rgba(124,111,247,0.1) 0%, transparent 60%), var(--bg)'
    }}>
      <div style={{ maxWidth: 460, width: '100%', animation: 'fadeSlideUp 0.5s ease' }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '2.5rem' }}>
          <div style={{
            width: 38, height: 38, borderRadius: 11,
            background: 'linear-gradient(135deg, #7c6ff7, #f7a26f)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 17, color: '#fff'
          }}>C</div>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 18 }}>Cuemath</span>
          <span style={{
            fontSize: 10, padding: '2px 8px', borderRadius: 20, marginLeft: 2,
            background: 'rgba(124,111,247,0.12)', color: '#7c6ff7',
            border: '1px solid rgba(124,111,247,0.25)', fontWeight: 700, letterSpacing: '0.06em'
          }}>TUTOR SCREENER</span>
        </div>

        <h1 style={{
          fontFamily: 'var(--font-display)', fontSize: 'clamp(1.8rem, 5vw, 2.6rem)',
          fontWeight: 700, lineHeight: 1.2, marginBottom: '1rem',
          background: 'linear-gradient(135deg, #f0effe 40%, #7c6ff7)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text'
        }}>
          Your AI Interview<br />starts now.
        </h1>

        <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: '2rem', fontSize: 15 }}>
          A short 6–8 minute voice conversation with Aria, our AI interviewer.
          No trick questions — just a natural conversation about how you teach.
        </p>

        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
          borderRadius: 14, padding: '1.1rem 1.4rem', marginBottom: '1.75rem'
        }}>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, marginBottom: '0.7rem', letterSpacing: '0.08em' }}>
            WHAT TO EXPECT
          </p>
          {[
            ['🎤', 'Aria speaks, you respond — fully voice-based'],
            ['💬', '4–5 questions about teaching and connecting with students'],
            ['📊', 'Full assessment report with transcript at the end'],
            ['⏱',  'About 8 minutes total'],
          ].map(([icon, text]) => (
            <div key={text} style={{ display: 'flex', gap: 10, marginBottom: 7, alignItems: 'flex-start' }}>
              <span style={{ fontSize: 13 }}>{icon}</span>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{text}</span>
            </div>
          ))}
        </div>

        <label style={{ display: 'block', fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500, marginBottom: 6 }}>
          Your full name
        </label>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleStart()}
          placeholder="e.g. Priya Sharma"
          autoFocus
          style={{
            width: '100%', padding: '13px 15px', marginBottom: '0.875rem',
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: 11, color: 'var(--text-primary)', fontSize: 15, outline: 'none'
          }}
          onFocus={e => e.target.style.borderColor = '#7c6ff7'}
          onBlur={e => e.target.style.borderColor = 'rgba(124,111,247,0.18)'}
        />

        {error && (
          <p style={{ color: 'var(--red)', fontSize: 13, marginBottom: '0.875rem' }}>{error}</p>
        )}

        <button
          onClick={handleStart}
          disabled={loading}
          style={{
            width: '100%', padding: '15px', borderRadius: 13,
            background: loading ? 'var(--bg-elevated)' : 'linear-gradient(135deg, #7c6ff7, #5b4bd8)',
            color: '#fff', fontSize: 16, fontWeight: 700,
            fontFamily: 'var(--font-display)', border: 'none',
            opacity: loading ? 0.7 : 1, cursor: loading ? 'not-allowed' : 'pointer',
            boxShadow: loading ? 'none' : '0 8px 28px rgba(124,111,247,0.35)'
          }}
        >
          {loading ? 'Connecting to Aria...' : 'Begin Interview →'}
        </button>

        <p style={{ textAlign: 'center', marginTop: '1.25rem', fontSize: 11, color: 'var(--text-muted)' }}>
          By continuing you consent to this conversation being recorded for evaluation.
        </p>
      </div>
    </div>
  )
}
