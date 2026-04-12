import React, { useEffect, useState } from 'react'
import { assessCandidate } from '../utils/api.js'

const VERDICT_STYLE = {
  Strong:   { bg: 'rgba(111,247,184,0.1)',  color: '#6ff7b8', border: 'rgba(111,247,184,0.25)', dot: '#6ff7b8' },
  Adequate: { bg: 'rgba(247,202,111,0.1)',  color: '#f7ca6f', border: 'rgba(247,202,111,0.25)', dot: '#f7ca6f' },
  Weak:     { bg: 'rgba(247,111,111,0.1)',  color: '#f76f6f', border: 'rgba(247,111,111,0.25)', dot: '#f76f6f' },
}

const REC_STYLE = {
  Advance: { color: '#6ff7b8', bg: 'rgba(111,247,184,0.08)', border: 'rgba(111,247,184,0.2)', label: 'Advance to Next Round', icon: '✓' },
  Hold:    { color: '#f7ca6f', bg: 'rgba(247,202,111,0.08)', border: 'rgba(247,202,111,0.2)', label: 'Hold for Review',       icon: '⏸' },
  Decline: { color: '#f76f6f', bg: 'rgba(247,111,111,0.08)', border: 'rgba(247,111,111,0.2)', label: 'Do Not Advance',        icon: '✗' },
}

const DIMENSION_ORDER = [
  'communication_clarity',
  'warmth_empathy',
  'simplification_ability',
  'patience_adaptability',
  'english_fluency',
]

const DIMENSION_DESCRIPTIONS = {
  communication_clarity:   'Are responses clear, well-structured, and easy to follow?',
  warmth_empathy:          'Does the candidate show genuine care and emotional intelligence?',
  simplification_ability:  'Can they break down complex concepts for a child using analogies?',
  patience_adaptability:   'How do they handle struggling students and repeated mistakes?',
  english_fluency:         'Grammar, vocabulary, and natural expression (not accent).',
}

function ScoreRing({ score, color }) {
  const r = 28
  const circ = 2 * Math.PI * r
  const pct = (score / 10) * circ
  return (
    <svg width="70" height="70" viewBox="0 0 70 70">
      <circle cx="35" cy="35" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="5" />
      <circle
        cx="35" cy="35" r={r} fill="none"
        stroke={color} strokeWidth="5"
        strokeDasharray={`${pct} ${circ}`}
        strokeLinecap="round"
        transform="rotate(-90 35 35)"
        style={{ transition: 'stroke-dasharray 1s ease' }}
      />
      <text x="35" y="39" textAnchor="middle" fill={color} fontSize="16" fontWeight="700" fontFamily="Sora, sans-serif">
        {score}
      </text>
    </svg>
  )
}

function DimensionCard({ dimKey, dim }) {
  const vs = VERDICT_STYLE[dim.verdict] || VERDICT_STYLE.Adequate
  const desc = DIMENSION_DESCRIPTIONS[dimKey] || ''
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
      borderRadius: 16, padding: '1.25rem', display: 'flex', gap: 16, alignItems: 'flex-start'
    }}>
      {/* Score ring */}
      <div style={{ flexShrink: 0 }}>
        <ScoreRing score={dim.score} color={vs.color} />
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
            {dim.label}
          </span>
          <span style={{
            fontSize: 10, padding: '2px 8px', borderRadius: 20, fontWeight: 700,
            background: vs.bg, color: vs.color, border: `1px solid ${vs.border}`
          }}>
            {dim.verdict}
          </span>
        </div>

        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, lineHeight: 1.4 }}>
          {desc}
        </p>

        {/* Score bar */}
        <div style={{ height: 4, background: 'var(--bg-elevated)', borderRadius: 2, overflow: 'hidden', marginBottom: 10 }}>
          <div style={{
            height: '100%', borderRadius: 2,
            width: `${dim.score * 10}%`,
            background: vs.color,
            transition: 'width 1s ease'
          }} />
        </div>

        {/* Evidence quote */}
        {dim.evidence && (
          <div style={{
            padding: '8px 12px', borderRadius: 8,
            background: 'rgba(255,255,255,0.03)',
            border: `1px solid ${vs.border}`,
            borderLeft: `3px solid ${vs.color}`
          }}>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 3, letterSpacing: '0.06em' }}>
              EVIDENCE
            </p>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, fontStyle: 'italic' }}>
              "{dim.evidence}"
            </p>
          </div>
        )}
      </div>
    </div>
  )
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
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f76f6f', background: 'var(--bg)', fontFamily: 'var(--font-body)' }}>
      {error}
    </div>
  )

  if (!report) return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, background: 'var(--bg)' }}>
      <div style={{ width: 44, height: 44, borderRadius: '50%', border: '3px solid #7c6ff7', borderTopColor: 'transparent', animation: 'spin-slow 0.8s linear infinite' }} />
      <p style={{ color: 'var(--text-secondary)', fontSize: 14, fontFamily: 'var(--font-body)' }}>
        Generating your assessment...
      </p>
    </div>
  )

  const rec = REC_STYLE[report.recommendation] || REC_STYLE.Hold
  const overallScore = Number(report.overall_score) || 0
  const dims = report.dimensions || {}

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
          <span style={{ fontWeight: 600, fontSize: 14, fontFamily: 'var(--font-display)' }}>
            Cuemath Tutor Screener
          </span>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {[
            { k: 'report',     l: '📊 Assessment' },
            { k: 'transcript', l: '💬 Transcript'  }
          ].map(t => (
            <button key={t.k} onClick={() => setTab(t.k)} style={{
              padding: '5px 14px', borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: 'pointer',
              background: tab === t.k ? 'rgba(124,111,247,0.15)' : 'transparent',
              border: `1px solid ${tab === t.k ? 'rgba(124,111,247,0.4)' : 'var(--border-subtle)'}`,
              color: tab === t.k ? '#7c6ff7' : 'var(--text-secondary)'
            }}>{t.l}</button>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: 780, margin: '0 auto', padding: '2rem 1rem' }}>

        {tab === 'report' && (
          <>
            {/* Candidate header */}
            <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
              <p style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.12em', marginBottom: 8, fontWeight: 700 }}>
                INTERVIEW ASSESSMENT REPORT
              </p>
              <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 700, marginBottom: 4 }}>
                {report.candidate_name}
              </h1>
              <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                Cuemath Tutor Screener · {new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            </div>

            {/* Overall score + recommendation */}
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr auto', gap: 12,
              marginBottom: '1.5rem', alignItems: 'stretch'
            }}>
              {/* Recommendation */}
              <div style={{
                padding: '1.25rem 1.5rem', borderRadius: 16,
                background: rec.bg, border: `1px solid ${rec.border}`
              }}>
                <p style={{ fontSize: 10, color: rec.color, fontWeight: 700, letterSpacing: '0.1em', marginBottom: 6 }}>
                  RECOMMENDATION
                </p>
                <p style={{ fontSize: 22, fontWeight: 700, color: rec.color, marginBottom: 8, fontFamily: 'var(--font-display)' }}>
                  {rec.icon} {rec.label}
                </p>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.65 }}>
                  {report.recommendation_reason}
                </p>
              </div>

              {/* Overall score */}
              <div style={{
                padding: '1.25rem', borderRadius: 16, minWidth: 130,
                background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
              }}>
                <p style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.1em', marginBottom: 8 }}>
                  OVERALL
                </p>
                <ScoreRing score={overallScore} color={rec.color} />
                <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>out of 10</p>
              </div>
            </div>

            {/* Standout quote */}
            {report.standout_quote && (
              <div style={{
                padding: '1rem 1.25rem', borderRadius: 14, marginBottom: '1.5rem',
                background: 'var(--bg-card)', borderLeft: '3px solid #7c6ff7',
                border: '1px solid var(--border-subtle)', borderLeftWidth: 3, borderLeftColor: '#7c6ff7'
              }}>
                <p style={{ fontSize: 10, color: '#7c6ff7', fontWeight: 700, letterSpacing: '0.08em', marginBottom: 8 }}>
                  ✦ STANDOUT MOMENT
                </p>
                <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.75, fontStyle: 'italic' }}>
                  "{report.standout_quote}"
                </p>
              </div>
            )}

            {/* Dimension breakdown header */}
            <div style={{ marginBottom: '1rem' }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2 }}>
                Evaluation Breakdown
              </p>
              <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Each dimension scored 1–10 with specific evidence from the conversation.
              </p>
            </div>

            {/* Dimension cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: '1.5rem' }}>
              {DIMENSION_ORDER.map(key => {
                const dim = dims[key]
                if (!dim) return null
                return <DimensionCard key={key} dimKey={key} dim={dim} />
              })}
            </div>

            {/* Strengths & Concerns */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: '2rem' }}>
              {/* Strengths */}
              <div style={{
                background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
                borderRadius: 14, padding: '1rem 1.25rem'
              }}>
                <p style={{ fontSize: 10, color: '#6ff7b8', fontWeight: 700, letterSpacing: '0.08em', marginBottom: 12 }}>
                  ✓ STRENGTHS
                </p>
                {(report.strengths || []).length === 0
                  ? <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>None noted.</p>
                  : (report.strengths || []).map((s, i) => (
                    <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'flex-start' }}>
                      <div style={{
                        width: 18, height: 18, borderRadius: '50%', flexShrink: 0, marginTop: 1,
                        background: 'rgba(111,247,184,0.12)', display: 'flex', alignItems: 'center',
                        justifyContent: 'center', fontSize: 9, color: '#6ff7b8', fontWeight: 700
                      }}>✓</div>
                      <span style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.55 }}>{s}</span>
                    </div>
                  ))
                }
              </div>

              {/* Concerns */}
              <div style={{
                background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
                borderRadius: 14, padding: '1rem 1.25rem'
              }}>
                <p style={{ fontSize: 10, color: '#f7ca6f', fontWeight: 700, letterSpacing: '0.08em', marginBottom: 12 }}>
                  ! AREAS TO WATCH
                </p>
                {(report.concerns || []).length === 0
                  ? <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>No significant concerns.</p>
                  : (report.concerns || []).map((c, i) => (
                    <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'flex-start' }}>
                      <div style={{
                        width: 18, height: 18, borderRadius: '50%', flexShrink: 0, marginTop: 1,
                        background: 'rgba(247,202,111,0.12)', display: 'flex', alignItems: 'center',
                        justifyContent: 'center', fontSize: 9, color: '#f7ca6f', fontWeight: 700
                      }}>!</div>
                      <span style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.55 }}>{c}</span>
                    </div>
                  ))
                }
              </div>
            </div>

            {/* Score summary bar */}
            <div style={{
              background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
              borderRadius: 14, padding: '1rem 1.25rem', marginBottom: '1.5rem'
            }}>
              <p style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.08em', marginBottom: 12 }}>
                SCORE SUMMARY
              </p>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                {DIMENSION_ORDER.map(key => {
                  const dim = dims[key]
                  if (!dim) return null
                  const vs = VERDICT_STYLE[dim.verdict] || VERDICT_STYLE.Adequate
                  const shortLabel = {
                    communication_clarity:  'Clarity',
                    warmth_empathy:         'Warmth',
                    simplification_ability: 'Simplify',
                    patience_adaptability:  'Patience',
                    english_fluency:        'Fluency',
                  }[key] || key
                  return (
                    <div key={key} style={{ flex: 1, minWidth: 60, textAlign: 'center' }}>
                      <div style={{
                        height: `${dim.score * 8}px`, borderRadius: '4px 4px 0 0',
                        background: vs.color, opacity: 0.8,
                        transition: 'height 1s ease', minHeight: 4
                      }} />
                      <div style={{ height: 1, background: 'var(--border-subtle)', marginBottom: 4 }} />
                      <p style={{ fontSize: 10, color: vs.color, fontWeight: 700 }}>{dim.score}</p>
                      <p style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>{shortLabel}</p>
                    </div>
                  )
                })}
              </div>
            </div>

            <p style={{ textAlign: 'center', fontSize: 10, color: 'var(--text-muted)' }}>
              Cuemath AI Screener · Session {String(sessionId).slice(0, 8).toUpperCase()}
            </p>
          </>
        )}

        {tab === 'transcript' && (
          <div style={{
            background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
            borderRadius: 16, overflow: 'hidden'
          }}>
            <div style={{ padding: '0.875rem 1.25rem', borderBottom: '1px solid var(--border-subtle)' }}>
              <p style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.1em' }}>
                FULL CONVERSATION TRANSCRIPT
              </p>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                {safeTranscript.length} messages
              </p>
            </div>
            <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: 20 }}>
              {safeTranscript.length === 0 && (
                <p style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center' }}>
                  No transcript available.
                </p>
              )}
              {safeTranscript.map((entry, i) => {
                const isAria = entry.speaker === 'Aria'
                return (
                  <div key={i} style={{ display: 'flex', gap: 10, flexDirection: isAria ? 'row' : 'row-reverse' }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                      background: isAria ? 'linear-gradient(135deg, #7c6ff7, #f7a26f)' : 'var(--bg-elevated)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 12, fontWeight: 700, color: '#fff'
                    }}>
                      {isAria ? 'A' : (entry.speaker[0] || '?').toUpperCase()}
                    </div>
                    <div style={{ maxWidth: '80%' }}>
                      <p style={{
                        fontSize: 10, fontWeight: 700, marginBottom: 4, letterSpacing: '0.06em',
                        color: isAria ? '#7c6ff7' : '#9b99bc',
                        textAlign: isAria ? 'left' : 'right'
                      }}>
                        {isAria ? 'ARIA' : entry.speaker.toUpperCase()}
                      </p>
                      <div style={{
                        padding: '10px 14px',
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
