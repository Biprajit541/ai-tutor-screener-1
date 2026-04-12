import React, { useEffect, useState } from 'react'
import { assessCandidate } from '../utils/api.js'

const VERDICT = {
  Strong:   { bg: 'rgba(111,247,184,0.08)', color: '#6ff7b8', border: 'rgba(111,247,184,0.2)' },
  Adequate: { bg: 'rgba(247,162,111,0.08)', color: '#f7a26f', border: 'rgba(247,162,111,0.2)' },
  Weak:     { bg: 'rgba(247,111,111,0.08)', color: '#f76f6f', border: 'rgba(247,111,111,0.2)' },
}
const REC = {
  Advance: { color: '#6ff7b8', bg: 'rgba(111,247,184,0.09)',  border: 'rgba(111,247,184,0.22)', label: '✓ Advance to Next Round' },
  Hold:    { color: '#f7a26f', bg: 'rgba(247,162,111,0.09)', border: 'rgba(247,162,111,0.22)', label: '⏸ Hold for Review' },
  Decline: { color: '#f76f6f', bg: 'rgba(247,111,111,0.09)', border: 'rgba(247,111,111,0.22)', label: '✗ Do Not Advance' },
}

export default function ReportScreen({ sessionId, transcript }) {
  const [report, setReport] = useState(null)
  const [tab, setTab]       = useState('report')
  const [error, setError]   = useState('')

  useEffect(() => {
    assessCandidate(sessionId)
      .then(setReport)
      .catch(() => setError('Could not generate report. Please refresh.'))
  }, [sessionId])

  const safeTranscript = Array.isArray(transcript)
    ? transcript.filter(e => e?.speaker && e?.text)
    : []

  if (error) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f76f6f', background: 'var(--bg)' }}>
      {error}
    </div>
  )

  if (!report) return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, background: 'var(--bg)' }}>
      <div style={{ width: 42, height: 42, borderRadius: '50%', border: '3px solid #7c6ff7', borderTopColor: 'transparent', animation: 'spin-slow 0.8s linear infinite' }} />
      <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Generating your assessment...</p>
    </div>
  )

  const rec = REC[report.recommendation] || REC.Hold

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', fontFamily: 'var(--font-body)' }}>

      {/* Sticky header */}
      <div style={{
        padding: '0.875rem 1.75rem', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)',
        background: 'var(--bg-card)', position: 'sticky', top: 0, zIndex: 10
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 7,
            background: 'linear-gradient(135deg, #7c6ff7, #f7a26f)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 700, fontSize: 12, color: '#fff'
          }}>C</div>
          <span style={{ fontWeight: 600, fontSize: 13, fontFamily: 'var(--font-display)' }}>Cuemath Tutor Screener</span>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {[{ k: 'report', l: '📊 Assessment' }, { k: 'transcript', l: '💬 Transcript' }].map(t => (
            <button key={t.k} onClick={() => setTab(t.k)} style={{
              padding: '5px 13px', borderRadius: 7, fontSize: 11, fontWeight: 500,
              background: tab === t.k ? 'rgba(124,111,247,0.14)' : 'transparent',
              border: `1px solid ${tab === t.k ? 'rgba(124,111,247,0.38)' : 'var(--border-subtle)'}`,
              color: tab === t.k ? '#7c6ff7' : 'var(--text-secondary)', cursor: 'pointer'
            }}>{t.l}</button>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: 680, margin: '0 auto', padding: '1.75rem 1rem' }}>

        {tab === 'report' && (
          <>
            {/* Candidate */}
            <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
              <p style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.12em', marginBottom: 6, fontWeight: 700 }}>INTERVIEW ASSESSMENT</p>
              <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.8rem', fontWeight: 700, marginBottom: 4 }}>
                {report.candidate_name}
              </h1>
              <p style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                Cuemath · {new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            </div>

            {/* Recommendation */}
            <div style={{
              padding: '1.25rem 1.4rem', borderRadius: 14, marginBottom: '1.1rem',
              background: rec.bg, border: `1px solid ${rec.border}`,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14
            }}>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 10, color: rec.color, fontWeight: 700, letterSpacing: '0.1em', marginBottom: 5 }}>RECOMMENDATION</p>
                <p style={{ fontSize: 18, fontWeight: 700, color: rec.color, marginBottom: 5, fontFamily: 'var(--font-display)' }}>{rec.label}</p>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{report.recommendation_reason}</p>
              </div>
              <div style={{ textAlign: 'center', flexShrink: 0 }}>
                <div style={{ fontSize: '2.6rem', fontWeight: 800, color: rec.color, fontFamily: 'var(--font-display)', lineHeight: 1 }}>
                  {Math.round(report.overall_score)}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>/ 10</div>
              </div>
            </div>

            {/* Standout quote */}
            {report.standout_quote && (
              <div style={{
                padding: '0.875rem 1.1rem', borderRadius: 12, marginBottom: '1.1rem',
                background: 'var(--bg-card)', borderLeft: '3px solid #7c6ff7',
                border: '1px solid var(--border-subtle)', borderLeftWidth: 3, borderLeftColor: '#7c6ff7'
              }}>
                <p style={{ fontSize: 9, color: '#7c6ff7', fontWeight: 700, letterSpacing: '0.08em', marginBottom: 7 }}>STANDOUT MOMENT</p>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, fontStyle: 'italic' }}>
                  "{report.standout_quote}"
                </p>
              </div>
            )}

            {/* Dimensions */}
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 16, overflow: 'hidden', marginBottom: '1.1rem' }}>
              <div style={{ padding: '0.75rem 1.1rem', borderBottom: '1px solid var(--border-subtle)' }}>
                <p style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.1em' }}>EVALUATION BREAKDOWN</p>
              </div>
              {Object.values(report.dimensions).map((dim, i) => {
                const vc = VERDICT[dim.verdict] || VERDICT.Adequate
                return (
                  <div key={i} style={{ padding: '0.875rem 1.1rem', borderBottom: '1px solid var(--border-subtle)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                      <span style={{ fontSize: 13, fontWeight: 500 }}>{dim.label}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{
                          fontSize: 9, padding: '2px 8px', borderRadius: 20,
                          background: vc.bg, color: vc.color, border: `1px solid ${vc.border}`, fontWeight: 700
                        }}>{dim.verdict}</span>
                        <span style={{ fontSize: 16, fontWeight: 700, color: vc.color, minWidth: 20, textAlign: 'right' }}>{dim.score}</span>
                      </div>
                    </div>
                    <div style={{ height: 4, background: 'var(--bg-elevated)', borderRadius: 2, overflow: 'hidden', marginBottom: 5 }}>
                      <div style={{
                        height: '100%', borderRadius: 2, width: `${dim.score * 10}%`,
                        background: dim.score >= 8 ? '#6ff7b8' : dim.score >= 5 ? '#f7a26f' : '#f76f6f',
                        transition: 'width 1s ease'
                      }} />
                    </div>
                    <p style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>{dim.evidence}</p>
                  </div>
                )
              })}
            </div>

            {/* Strengths & Concerns */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: '1.75rem' }}>
              {[
                { title: 'STRENGTHS', color: '#6ff7b8', items: report.strengths || [], icon: '✓', empty: null },
                { title: 'AREAS TO WATCH', color: '#f7a26f', items: report.concerns || [], icon: '!', empty: 'No significant concerns.' }
              ].map(({ title, color, items, icon, empty }) => (
                <div key={title} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 13, padding: '0.875rem 1.1rem' }}>
                  <p style={{ fontSize: 9, color, fontWeight: 700, letterSpacing: '0.08em', marginBottom: 10 }}>{title}</p>
                  {items.length === 0 && empty
                    ? <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>{empty}</p>
                    : items.map((s, i) => (
                      <div key={i} style={{ display: 'flex', gap: 7, marginBottom: 7 }}>
                        <span style={{ color, fontSize: 11 }}>{icon}</span>
                        <span style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{s}</span>
                      </div>
                    ))
                  }
                </div>
              ))}
            </div>

            <p style={{ textAlign: 'center', fontSize: 10, color: 'var(--text-muted)' }}>
              Cuemath AI Screener · Session {String(sessionId).slice(0, 8).toUpperCase()}
            </p>
          </>
        )}

        {tab === 'transcript' && (
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 16, overflow: 'hidden' }}>
            <div style={{ padding: '0.75rem 1.1rem', borderBottom: '1px solid var(--border-subtle)' }}>
              <p style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.1em' }}>FULL CONVERSATION</p>
            </div>
            <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: 18 }}>
              {safeTranscript.length === 0 && (
                <p style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center' }}>No transcript available.</p>
              )}
              {safeTranscript.map((entry, i) => {
                const isAria = entry.speaker === 'Aria'
                return (
                  <div key={i} style={{ display: 'flex', gap: 10, flexDirection: isAria ? 'row' : 'row-reverse' }}>
                    <div style={{
                      width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
                      background: isAria ? 'linear-gradient(135deg, #7c6ff7, #f7a26f)' : 'var(--bg-elevated)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, fontWeight: 700, color: '#fff'
                    }}>
                      {isAria ? 'A' : (entry.speaker[0] || '?').toUpperCase()}
                    </div>
                    <div style={{ maxWidth: '80%' }}>
                      <p style={{
                        fontSize: 9, fontWeight: 700, marginBottom: 4, letterSpacing: '0.06em',
                        color: isAria ? '#7c6ff7' : '#9b99bc',
                        textAlign: isAria ? 'left' : 'right'
                      }}>
                        {isAria ? 'ARIA' : entry.speaker.toUpperCase()}
                      </p>
                      <div style={{
                        padding: '9px 13px',
                        borderRadius: isAria ? '3px 14px 14px 14px' : '14px 3px 14px 14px',
                        background: isAria ? 'var(--bg-elevated)' : 'rgba(124,111,247,0.1)',
                        border: `1px solid ${isAria ? 'rgba(255,255,255,0.06)' : 'rgba(124,111,247,0.2)'}`,
                        fontSize: 13, lineHeight: 1.65, color: '#d4d2f0'
                      }}>
                        {entry.text}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
