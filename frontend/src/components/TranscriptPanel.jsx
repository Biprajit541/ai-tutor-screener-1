import React, { useEffect, useRef } from 'react'

export default function TranscriptPanel({ transcript }) {
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [transcript])

  const safe = Array.isArray(transcript)
    ? transcript.filter(e => e && typeof e.speaker === 'string' && typeof e.text === 'string')
    : []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '1.25rem 1.5rem' }}>
      {safe.length === 0 && (
        <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', marginTop: 24 }}>
          Conversation will appear here...
        </p>
      )}
      {safe.map((entry, i) => {
        const isAria = entry.speaker === 'Aria'
        return (
          <div key={i} style={{
            display: 'flex', gap: 10, alignItems: 'flex-start',
            flexDirection: isAria ? 'row' : 'row-reverse'
          }}>
            <div style={{
              width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
              background: isAria
                ? 'linear-gradient(135deg, #7c6ff7, #f7a26f)'
                : 'var(--bg-elevated)',
              border: isAria ? 'none' : '1px solid rgba(124,111,247,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 700, color: '#fff'
            }}>
              {isAria ? 'A' : (entry.speaker[0] || '?').toUpperCase()}
            </div>
            <div style={{ maxWidth: '78%' }}>
              <p style={{
                fontSize: 10, fontWeight: 700, marginBottom: 4, letterSpacing: '0.06em',
                color: isAria ? '#7c6ff7' : '#9b99bc',
                textAlign: isAria ? 'left' : 'right'
              }}>
                {isAria ? 'ARIA' : entry.speaker.toUpperCase()}
              </p>
              <div style={{
                padding: '9px 13px',
                borderRadius: isAria ? '3px 14px 14px 14px' : '14px 3px 14px 14px',
                background: isAria ? '#1a1a2e' : 'rgba(124,111,247,0.1)',
                border: `1px solid ${isAria ? 'rgba(255,255,255,0.06)' : 'rgba(124,111,247,0.2)'}`,
                fontSize: 13, lineHeight: 1.65, color: '#d4d2f0'
              }}>
                {entry.text}
              </div>
            </div>
          </div>
        )
      })}
      <div ref={bottomRef} />
    </div>
  )
}
