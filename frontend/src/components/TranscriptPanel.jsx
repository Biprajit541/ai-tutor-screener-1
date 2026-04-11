import React, { useEffect, useRef } from 'react'

export default function TranscriptPanel({ transcript }) {
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [transcript])

  return (
    <div style={{
      width: '100%', maxHeight: 280, overflowY: 'auto',
      padding: '1rem', display: 'flex', flexDirection: 'column', gap: 12
    }}>
      {transcript.map((entry, i) => (
        <div key={i} style={{
          display: 'flex', gap: 10, alignItems: 'flex-start',
          animation: 'fadeSlideUp 0.3s ease both',
          flexDirection: entry.speaker === 'Aria' ? 'row' : 'row-reverse'
        }}>
          <div style={{
            width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
            background: entry.speaker === 'Aria'
              ? 'linear-gradient(135deg, #7c6ff7, #f7a26f)'
              : 'var(--bg-elevated)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontWeight: 600, color: '#fff'
          }}>
            {entry.speaker === 'Aria' ? 'A' : entry.speaker[0]?.toUpperCase()}
          </div>
          <div style={{
            maxWidth: '75%', padding: '8px 12px', borderRadius: 12,
            background: entry.speaker === 'Aria' ? 'var(--bg-elevated)' : 'rgba(124,111,247,0.1)',
            border: `1px solid ${entry.speaker === 'Aria' ? 'var(--border-subtle)' : 'rgba(124,111,247,0.2)'}`,
            fontSize: 13, lineHeight: 1.6, color: 'var(--text-secondary)'
          }}>
            {entry.text}
          </div>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  )
}