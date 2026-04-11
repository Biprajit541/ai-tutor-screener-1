import React, { useState } from 'react'
import { startSession } from '../utils/api'

export default function WelcomeScreen({ onStart }) {
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleStart = async () => {
    if (!name.trim()) { setError('Please enter your name'); return }
    setLoading(true)
    setError('')
    try {
      const session = await startSession(name.trim())
      onStart(session)
    } catch {
      setError('Could not connect. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', padding: '2rem',
      background: 'radial-gradient(ellipse at 60% 20%, rgba(124,111,247,0.12) 0%, transparent 60%), var(--bg)'
    }}>
      <div style={{ maxWidth: 480, width: '100%', animation: 'fadeSlideUp 0.6s ease both' }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '3rem' }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'linear-gradient(135deg, #7c6ff7, #f7a26f)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 16, color: '#fff'
          }}>C</div>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 18, color: 'var(--text-primary)' }}>
            Cuemath
          </span>
          <span style={{
            marginLeft: 4, fontSize: 11, padding: '2px 8px', borderRadius: 20,
            background: 'rgba(124,111,247,0.15)', color: 'var(--accent)',
            border: '1px solid rgba(124,111,247,0.3)', fontWeight: 500, letterSpacing: '0.05em'
          }}>TUTOR SCREENER</span>
        </div>

        {/* Headline */}
        <h1 style={{
          fontFamily: 'var(--font-display)', fontSize: 'clamp(2rem, 5vw, 2.8rem)',
          fontWeight: 600, lineHeight: 1.2, marginBottom: '1rem',
          background: 'linear-gradient(135deg, var(--text-primary) 40%, var(--accent))',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          backgroundClip: 'text'
        }}>
          Your AI Interview<br />starts now.
        </h1>

        <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: '2.5rem', fontSize: 15 }}>
          You'll have a short 6–8 minute voice conversation with Aria, our AI interviewer.
          There are no trick questions — we just want to understand how you connect with students.
        </p>

        {/* What to expect */}
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
          borderRadius: 16, padding: '1.25rem 1.5rem', marginBottom: '2rem'
        }}>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500, marginBottom: '0.75rem', letterSpacing: '0.08em' }}>WHAT TO EXPECT</p>
          {[
            ['🎤', 'Speak naturally — Aria will listen and respond'],
            ['💬', '4–5 questions about how you teach and connect'],
            ['📊', 'Instant assessment report when you\'re done'],
            ['⏱', 'About 8 minutes total'],
          ].map(([icon, text]) => (
            <div key={text} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 8 }}>
              <span style={{ fontSize: 14 }}>{icon}</span>
              <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>{text}</span>
            </div>
          ))}
        </div>

        {/* Name input */}
        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500 }}>
          Your full name
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleStart()}
          placeholder="e.g. Priya Sharma"
          style={{
            width: '100%', padding: '14px 16px', marginBottom: '1rem',
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: 12, color: 'var(--text-primary)', fontSize: 15,
            outline: 'none', transition: 'border 0.2s'
          }}
          onFocus={(e) => e.target.style.borderColor = 'var(--accent)'}
          onBlur={(e) => e.target.style.borderColor = 'var(--border)'}
          autoFocus
        />

        {error && <p style={{ color: 'var(--red)', fontSize: 13, marginBottom: '1rem' }}>{error}</p>}

        <button
          onClick={handleStart}
          disabled={loading}
          style={{
            width: '100%', padding: '16px', borderRadius: 14,
            background: loading ? 'var(--bg-elevated)' : 'linear-gradient(135deg, #7c6ff7, #5b4bd8)',
            color: '#fff', fontSize: 16, fontWeight: 600,
            fontFamily: 'var(--font-display)', transition: 'all 0.2s',
            opacity: loading ? 0.7 : 1, cursor: loading ? 'not-allowed' : 'pointer',
            boxShadow: loading ? 'none' : '0 8px 32px rgba(124,111,247,0.35)'
          }}
        >
          {loading ? 'Connecting to Aria...' : 'Begin Interview →'}
        </button>

        <p style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: 12, color: 'var(--text-muted)' }}>
          By proceeding you consent to this conversation being recorded for evaluation purposes.
        </p>
      </div>
    </div>
  )
}