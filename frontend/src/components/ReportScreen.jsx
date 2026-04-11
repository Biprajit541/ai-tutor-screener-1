import React, { useEffect, useState } from 'react'
import { assessCandidate } from '../utils/api'

const VERDICT_COLORS = {
  Strong:   { bg: 'rgba(111,247,184,0.1)', color: '#6ff7b8', border: 'rgba(111,247,184,0.25)' },
  Adequate: { bg: 'rgba(247,162,111,0.1)', color: '#f7a26f', border: 'rgba(247,162,111,0.25)' },
  Weak:     { bg: 'rgba(247,111,111,0.1)', color: '#f76f6f', border: 'rgba(247,111,111,0.25)' },
}

const REC_COLORS = {
  Advance: { bg: 'rgba(111,247,184,0.12)', color: '#6ff7b8', border: 'rgba(111,247,184,0.3)', label: '✓ Advance to Next Round' },
  Hold:    { bg: 'rgba(247,162,111,0.12)', color: '#f7a26f', border: 'rgba(247,162,111,0.3)', label: '⏸ Hold for Review' },
  Decline: { bg: 'rgba(247,111,111,0.12)', color: '#f76f6f', border: 'rgba(247,111,111,0.3)', label: '✗ Do Not Advance' },
}

function ScoreBar({ score }) {
  return (
    <div style={{ height: 6, background: 'var(--bg-elevated)', borderRadius: 3, overflow: 'hidden', marginTop: 6 }}>
      <div style={{
        height: '100%', width: `${score * 10}%`, borderRadius: 3,
        background: score >= 8 ? '#6ff7b8' : score >= 5 ? '#f7a26f' : '#f76f6f',
        transition: 'width 1s ease'
      }} />
    </div>
  )
}

export default function ReportScreen({ sessionId }) {
  const [report, setReport] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    assessCandidate(sessionId)
      .then(setReport)
      .catch(() => setError('Could not generate report. Please refresh and try again.'))
  }, [sessionId])

  if (error) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--red)' }}>
      {error}
    </div>
  )

  if (!report) return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20 }}>
      <div style={{
        width: 56, height: 56, borderRadius: '50%',
        border: '3px solid var(--accent)', borderTopColor: 'transparent',
        animation: 'spin-slow 0.8s linear infinite'
      }} />
      <p style={{ color: 'var(--text-secondary)', fontSize: 15 }}>Generating your assessment...</p>
    </div>
  )

  const rec = REC_COLORS[report.recommendation] || REC_COLORS.Hold

  return (
    <div style={{
      minHeight: '100vh', padding: '2rem 1rem',
      background: 'radial-gradient(ellipse at 70% 10%, rgba(124,111,247,0.1) 0%, transparent 50%), var(--bg)'
    }}>
      <div style={{ maxWidth: 660, margin: '0 auto', animation: 'fadeSlideUp 0.5s ease' }}>

        {/* Header */}
        <div style={{ marginBottom: '2.5rem', textAlign: 'center' }}>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500, letterSpacing: '0.1em', marginBottom: 8 }}>INTERVIEW ASSESSMENT</p>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.8rem', fontWeight: 600, marginBottom: 4 }}>
            {report.candidate_name}
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Cuemath Tutor Screener · {new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
        </div>

        {/* Recommendation banner */}
        <div style={{
          padding: '1.25rem 1.5rem', borderRadius: 16, marginBottom: '1.5rem',
          background: rec.bg, border: `1px solid ${rec.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between'
        }}>
          <div>
            <p style={{ fontSize: 11, color: rec.color, fontWeight: 600, letterSpacing: '0.1em', marginBottom: 4 }}>RECOMMENDATION</p>
            <p style={{ fontSize: 18, fontWeight: 600, color: rec.color, fontFamily: 'var(--font-display)' }}>{rec.label}</p>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>{report.recommendation_reason}</p>
          </div>
          <div style={{ textAlign: 'center', flexShrink: 0, marginLeft: '1.5rem' }}>
            <div style={{
              fontSize: '2.5rem', fontWeight: 700, fontFamily: 'var(--font-display)',
              color: rec.color, lineHeight: 1
            }}>{Math.round(report.overall_score)}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>/ 10</div>
          </div>
        </div>

        {/* Standout Quote */}
        {report.standout_quote && (
          <div style={{
            padding: '1rem 1.25rem', borderRadius: 14, marginBottom: '1.5rem',
            background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
            borderLeft: '3px solid var(--accent)'
          }}>
            <p style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 600, letterSpacing: '0.08em', marginBottom: 8 }}>STANDOUT QUOTE</p>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, fontStyle: 'italic' }}>
              "{report.standout_quote}"
            </p>
          </div>
        )}

        {/* Dimension scores */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 20, overflow: 'hidden', marginBottom: '1.5rem' }}>
          <div style={{ padding: '0.75rem 1.25rem', borderBottom: '1px solid var(--border-subtle)' }}>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.08em' }}>EVALUATION BREAKDOWN</p>
          </div>
          {Object.values(report.dimensions).map((dim) => {
            const vc = VERDICT_COLORS[dim.verdict] || VERDICT_COLORS.Adequate
            return (
              <div key={dim.label} style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border-subtle)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ fontSize: 14, fontWeight: 500 }}>{dim.label}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{
                      fontSize: 11, padding: '2px 8px', borderRadius: 20,
                      background: vc.bg, color: vc.color, border: `1px solid ${vc.border}`, fontWeight: 600
                    }}>{dim.verdict}</span>
                    <span style={{ fontSize: 16, fontWeight: 600, minWidth: 24, textAlign: 'right' }}>{dim.score}</span>
                  </div>
                </div>
                <ScoreBar score={dim.score} />
                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.6 }}>{dim.evidence}</p>
              </div>
            )
          })}
        </div>

        {/* Strengths & Concerns */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: '2rem' }}>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 16, padding: '1rem 1.25rem' }}>
            <p style={{ fontSize: 11, color: '#6ff7b8', fontWeight: 600, letterSpacing: '0.08em', marginBottom: 12 }}>STRENGTHS</p>
            {report.strengths.map((s, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <span style={{ color: '#6ff7b8', fontSize: 13, marginTop: 1 }}>✓</span>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{s}</span>
              </div>
            ))}
          </div>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 16, padding: '1rem 1.25rem' }}>
            <p style={{ fontSize: 11, color: '#f7a26f', fontWeight: 600, letterSpacing: '0.08em', marginBottom: 12 }}>AREAS TO WATCH</p>
            {report.concerns.length === 0
              ? <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No significant concerns noted.</p>
              : report.concerns.map((c, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <span style={{ color: '#f7a26f', fontSize: 13, marginTop: 1 }}>!</span>
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{c}</span>
                </div>
              ))
            }
          </div>
        </div>

        <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}>
          Generated by Cuemath AI Screener · Session {sessionId.slice(0, 8).toUpperCase()}
        </p>
      </div>
    </div>
  )
}