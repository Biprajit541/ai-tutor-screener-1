import React, { useState, useEffect, useRef } from 'react'
import OrbAnimation from './OrbAnimation.jsx'
import TranscriptPanel from './TranscriptPanel.jsx'
import { useAudioRecorder } from '../hooks/useAudioRecorder.js'
import { transcribeAudio, sendChatMessage, speakText } from '../utils/api.js'

const SILENCE_THRESHOLD = 0.04
const SILENCE_FRAMES    = 150

export default function InterviewScreen({ session, onComplete }) {
  const { session_id, opening_message, candidate_name } = session

  const [phase, setPhase]             = useState('speaking')
  const [transcript, setTranscript]   = useState([
    { speaker: 'Aria', text: String(opening_message || '') }
  ])
  const [statusText, setStatusText]   = useState('Aria is speaking...')
  const [errorMsg, setErrorMsg]       = useState('')
  const [silenceWarn, setSilenceWarn] = useState(false)

  const transcriptRef   = useRef([{ speaker: 'Aria', text: String(opening_message || '') }])
  const phaseRef        = useRef('speaking')
  const mountedRef      = useRef(true)
  const currentAudioRef = useRef(null)
  const silenceCount    = useRef(0)
  const processingRef   = useRef(false)

  const { isRecording, audioLevel, startRecording, stopRecording } = useAudioRecorder()

  // ── Helpers ───────────────────────────────────────────────────────────────

  const go = (fn) => { if (mountedRef.current) try { fn() } catch(e) { console.error(e) } }

  const setPhaseAll = (p) => { phaseRef.current = p; go(() => setPhase(p)) }

  const addLine = (speaker, text) => {
    if (!speaker || !text) return
    const entry = { speaker: String(speaker).trim(), text: String(text).trim() }
    if (!entry.speaker || !entry.text) return
    transcriptRef.current = [...transcriptRef.current, entry]
    go(() => setTranscript([...transcriptRef.current]))
  }

  const stopCurrentAudio = () => {
    if (currentAudioRef.current) {
      try { currentAudioRef.current.pause(); currentAudioRef.current.src = '' } catch {}
      currentAudioRef.current = null
    }
  }

  // ── Silence detection ─────────────────────────────────────────────────────

  useEffect(() => {
    if (!isRecording || phaseRef.current !== 'listening') return
    if (audioLevel > SILENCE_THRESHOLD) {
      silenceCount.current = 0
      go(() => setSilenceWarn(false))
      return
    }
    silenceCount.current += 1
    if (silenceCount.current === 120) go(() => setSilenceWarn(true))
    if (silenceCount.current >= SILENCE_FRAMES) {
      silenceCount.current = 0
      handleStopRecording()
    }
  }, [audioLevel, isRecording])

  // ── Aria speaks ───────────────────────────────────────────────────────────

  const ariaSpeak = async (text, isComplete) => {
    if (!mountedRef.current) return
    setPhaseAll('speaking')
    go(() => { setStatusText('Aria is speaking...'); setErrorMsg(''); setSilenceWarn(false) })
    addLine('Aria', text)

    // Fetch and play audio
    const audio = await speakText(text, () => {})
    if (audio) currentAudioRef.current = audio

    if (audio) {
      await new Promise(resolve => {
        const words = text.trim().split(/\s+/).length
        const maxMs = Math.max((words / 2.5) * 1000 + 2000, 5000)
        const fallback = setTimeout(resolve, maxMs)
        audio.onended = () => { clearTimeout(fallback); resolve() }
        audio.onerror = () => { clearTimeout(fallback); resolve() }
      })
    }

    if (!mountedRef.current) return

    if (isComplete) {
      go(() => { setStatusText('Interview complete!') })
      setPhaseAll('done')
      setTimeout(() => {
        if (mountedRef.current) onComplete(session_id, transcriptRef.current)
      }, 1200)
    } else {
      setTimeout(() => { if (mountedRef.current) startListening() }, 500)
    }
  }

  // ── Start listening ───────────────────────────────────────────────────────

  const startListening = async () => {
    if (!mountedRef.current) return
    if (phaseRef.current === 'listening') return
    if (processingRef.current) return

    silenceCount.current = 0
    setPhaseAll('listening')
    go(() => { setStatusText('Listening — speak your answer'); setErrorMsg(''); setSilenceWarn(false) })

    try {
      await startRecording()
    } catch {
      go(() => { setErrorMsg('Microphone access denied. Please allow mic and refresh.'); setPhaseAll('idle'); setStatusText('Mic error') })
    }
  }

  // ── Stop recording → transcribe → AI ─────────────────────────────────────

  const handleStopRecording = async () => {
    if (phaseRef.current !== 'listening') return
    if (processingRef.current) return
    processingRef.current = true

    go(() => { setPhaseAll('thinking'); setStatusText('Transcribing...'); setSilenceWarn(false) })

    try {
      const blob = await stopRecording()

      if (!blob || blob.size < 3000) {
        processingRef.current = false
        go(() => setErrorMsg("Didn't hear anything — listening again."))
        setTimeout(() => { if (mountedRef.current) startListening() }, 800)
        return
      }

      const { text } = await transcribeAudio(blob)
      if (!mountedRef.current) return

      const clean = (text || '').trim()
      if (!clean || clean.length < 2) {
        processingRef.current = false
        go(() => setErrorMsg("Didn't catch that — please try again."))
        setTimeout(() => { if (mountedRef.current) startListening() }, 800)
        return
      }

      go(() => setStatusText('Aria is thinking...'))
      addLine(String(candidate_name || 'You'), clean)

      const result = await sendChatMessage(session_id, clean)
      if (!mountedRef.current) return
      if (!result?.reply) throw new Error('No reply received')

      processingRef.current = false
      await ariaSpeak(result.reply, result.is_complete)

    } catch (err) {
      console.error('handleStopRecording error:', err)
      if (!mountedRef.current) return
      processingRef.current = false
      go(() => {
        setErrorMsg(`Error: ${err.message || 'Something went wrong'} — tap mic to retry`)
        setPhaseAll('idle')
        setStatusText('Something went wrong')
      })
    }
  }

  // ── Mount ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    mountedRef.current  = true
    processingRef.current = false

    const begin = async () => {
      if (!mountedRef.current) return
      const audio = await speakText(opening_message || '', () => {})
      if (audio) currentAudioRef.current = audio

      if (audio) {
        await new Promise(resolve => {
          const words = (opening_message || '').trim().split(/\s+/).length
          const fallback = setTimeout(resolve, Math.max((words / 2.5) * 1000 + 2000, 5000))
          audio.onended = () => { clearTimeout(fallback); resolve() }
          audio.onerror = () => { clearTimeout(fallback); resolve() }
        })
      }
      if (mountedRef.current) startListening()
    }

    setTimeout(begin, 400)

    return () => {
      mountedRef.current = false
      stopCurrentAudio()
      try { stopRecording() } catch {}
    }
  }, [])

  // ── Mic button tap ────────────────────────────────────────────────────────

  const handleMicTap = () => {
    if (phaseRef.current === 'thinking') return
    if (phaseRef.current === 'speaking') {
      stopCurrentAudio()
      setTimeout(() => { if (mountedRef.current) startListening() }, 200)
      return
    }
    if (phaseRef.current === 'listening') { handleStopRecording(); return }
    startListening()
  }

  const handleFinish = () => {
    stopCurrentAudio()
    try { stopRecording() } catch {}
    onComplete(session_id, transcriptRef.current)
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const orbState = phase === 'listening' ? 'listening'
    : phase === 'thinking' ? 'thinking'
    : phase === 'speaking' ? 'speaking' : 'idle'

  const micColor = phase === 'listening'
    ? 'linear-gradient(135deg, #6ff7b8, #3dd68f)'
    : phase === 'thinking'
    ? 'linear-gradient(135deg, #666, #444)'
    : 'linear-gradient(135deg, #7c6ff7, #5b4bd8)'

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg)', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{
        padding: '0.875rem 1.5rem', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 30, height: 30, borderRadius: 8,
            background: 'linear-gradient(135deg, #7c6ff7, #f7a26f)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 700, fontSize: 13, color: '#fff', fontFamily: 'var(--font-display)'
          }}>C</div>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 14 }}>Cuemath</span>
          <span style={{
            fontSize: 9, padding: '2px 7px', borderRadius: 20,
            background: 'rgba(124,111,247,0.12)', color: '#7c6ff7',
            border: '1px solid rgba(124,111,247,0.22)', fontWeight: 700, letterSpacing: '0.06em'
          }}>SCREENER</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 6, height: 6, borderRadius: '50%',
            background: phase === 'listening' ? '#6ff7b8' : '#7c6ff7',
            boxShadow: phase === 'listening' ? '0 0 7px #6ff7b8' : '0 0 7px #7c6ff7',
            transition: 'all 0.3s'
          }} />
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{candidate_name}</span>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Left — Orb */}
        <div style={{
          width: 270, flexShrink: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', padding: '1.5rem 1rem',
          borderRight: '1px solid var(--border-subtle)',
          background: 'radial-gradient(ellipse at 50% 40%, rgba(124,111,247,0.06) 0%, transparent 70%)'
        }}>
          <OrbAnimation state={orbState} audioLevel={audioLevel} />

          <p style={{
            fontSize: 12, fontWeight: 500, marginTop: '1.1rem',
            color: phase === 'listening' ? '#6ff7b8' : phase === 'thinking' ? '#f7a26f' : 'var(--text-secondary)',
            transition: 'color 0.3s', textAlign: 'center', minHeight: 18
          }}>
            {statusText}
          </p>

          {silenceWarn && phase === 'listening' && (
            <div style={{
              width: 120, height: 3, borderRadius: 2, marginTop: 6,
              background: 'var(--bg-elevated)', overflow: 'hidden'
            }}>
              <div style={{ height: '100%', background: '#f7a26f', borderRadius: 2, animation: 'shrink 0.5s linear forwards' }} />
            </div>
          )}

          {errorMsg && (
            <p style={{ fontSize: 11, color: '#f76f6f', textAlign: 'center', maxWidth: 210, marginTop: 8, lineHeight: 1.5 }}>
              {errorMsg}
            </p>
          )}

          <button
            onClick={handleMicTap}
            disabled={phase === 'thinking'}
            style={{
              marginTop: '1.25rem',
              width: 64, height: 64, borderRadius: '50%',
              background: micColor, border: 'none',
              cursor: phase === 'thinking' ? 'not-allowed' : 'pointer',
              boxShadow: phase === 'listening'
                ? '0 0 0 10px rgba(111,247,184,0.1), 0 0 0 20px rgba(111,247,184,0.05)'
                : phase === 'thinking' ? 'none'
                : '0 5px 24px rgba(124,111,247,0.4)',
              transition: 'all 0.22s cubic-bezier(0.34,1.56,0.64,1)',
              transform: phase === 'listening' ? 'scale(1.08)' : 'scale(1)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              opacity: phase === 'thinking' ? 0.35 : 1
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              {phase === 'listening'
                ? <rect x="6" y="6" width="12" height="12" rx="2" fill="white"/>
                : <>
                    <rect x="9" y="2" width="6" height="12" rx="3" fill="white"/>
                    <path d="M5 10a7 7 0 0014 0" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                    <path d="M12 19v3M9 22h6" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                  </>
              }
            </svg>
          </button>

          <p style={{ marginTop: '0.5rem', fontSize: 10, color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.5 }}>
            {phase === 'listening' ? 'Tap to send · auto-sends on silence'
            : phase === 'thinking'  ? 'Processing...'
            : phase === 'speaking'  ? 'Tap to interrupt'
            : 'Tap to speak'}
          </p>
        </div>

        {/* Right — Transcript */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{
            padding: '0.55rem 1.25rem', borderBottom: '1px solid var(--border-subtle)',
            fontSize: 9, color: 'var(--text-muted)', fontWeight: 700,
            letterSpacing: '0.1em', flexShrink: 0
          }}>
            LIVE TRANSCRIPT
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <TranscriptPanel transcript={transcript} />
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{
        padding: '0.55rem 1.5rem', borderTop: '1px solid var(--border-subtle)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0, background: 'var(--bg-card)'
      }}>
        <p style={{ fontSize: 10, color: 'var(--text-muted)' }}>
          4–5 questions · mic opens automatically · works best on Chrome
        </p>
        <button
          onClick={handleFinish}
          style={{
            padding: '6px 14px', borderRadius: 8, fontSize: 11, fontWeight: 600,
            background: 'transparent', border: '1px solid rgba(247,111,111,0.3)',
            color: '#f76f6f', cursor: 'pointer', transition: 'all 0.2s'
          }}
          onMouseEnter={e => e.target.style.background = 'rgba(247,111,111,0.08)'}
          onMouseLeave={e => e.target.style.background = 'transparent'}
        >
          Finish Interview
        </button>
      </div>

      <style>{`@keyframes shrink { from { width: 100%; } to { width: 0%; } }`}</style>
    </div>
  )
}
