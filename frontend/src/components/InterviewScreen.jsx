import React, { useState, useEffect, useRef, useCallback } from 'react'
import OrbAnimation from './OrbAnimation.jsx'
import TranscriptPanel from './TranscriptPanel.jsx'
import { useAudioRecorder } from '../hooks/useAudioRecorder.js'
import { transcribeAudio, sendChatMessage, speakText, stopSpeaking } from '../utils/api.js'

export default function InterviewScreen({ session, onComplete }) {
  const { session_id, opening_message, candidate_name } = session

  const [phase, setPhase]             = useState('speaking')
  const [transcript, setTranscript]   = useState([
    { speaker: 'Aria', text: String(opening_message || '') }
  ])
  const [statusText, setStatusText]   = useState('Aria is speaking...')
  const [errorMsg, setErrorMsg]       = useState('')
  const [silenceWarn, setSilenceWarn] = useState(false)

  const transcriptRef    = useRef([{ speaker: 'Aria', text: String(opening_message || '') }])
  const phaseRef         = useRef('speaking')
  const mountedRef       = useRef(true)
  const processingRef    = useRef(false)
  const stopRecordingRef = useRef(null)
  const ariaSpeakRef     = useRef(null)

  const go = (fn) => { if (mountedRef.current) try { fn() } catch(e) { console.error(e) } }
  const setPhaseAll = (p) => { phaseRef.current = p; go(() => setPhase(p)) }

  const addLine = (speaker, text) => {
    if (!speaker || !text) return
    const entry = { speaker: String(speaker).trim(), text: String(text).trim() }
    if (!entry.speaker || !entry.text) return
    transcriptRef.current = [...transcriptRef.current, entry]
    go(() => setTranscript([...transcriptRef.current]))
  }

  // ── handleStopRecording ───────────────────────────────────────────────────

  const handleStopRecording = useCallback(async () => {
    if (phaseRef.current !== 'listening') return
    if (processingRef.current) return
    processingRef.current = true

    setPhaseAll('thinking')
    go(() => { setStatusText('Processing your answer...'); setSilenceWarn(false) })

    try {
      const blob = await stopRecordingRef.current?.()

      if (!blob || blob.size < 1000) {
        processingRef.current = false
        go(() => {
          setErrorMsg("Didn't catch that — tap mic to try again.")
          setPhaseAll('idle')
          setStatusText('Tap mic to speak')
        })
        return
      }

      go(() => setStatusText('Transcribing...'))
      const { text } = await transcribeAudio(blob)
      if (!mountedRef.current) return

      const clean = (text || '').trim()
      if (!clean) {
        processingRef.current = false
        go(() => {
          setErrorMsg("Didn't catch that — tap mic to try again.")
          setPhaseAll('idle')
          setStatusText('Tap mic to speak')
        })
        return
      }

      go(() => setStatusText('Aria is thinking...'))
      addLine(String(candidate_name || 'You'), clean)

      const result = await sendChatMessage(session_id, clean)
      if (!mountedRef.current) return
      if (!result?.reply) throw new Error('Empty reply from AI')

      processingRef.current = false
      await ariaSpeakRef.current?.(result.reply, Boolean(result.is_complete))

    } catch (err) {
      console.error('handleStopRecording error:', err)
      if (!mountedRef.current) return
      processingRef.current = false
      go(() => {
        setErrorMsg('Connection error — tap mic to retry')
        setPhaseAll('idle')
        setStatusText('Tap mic to retry')
      })
    }
  }, [session_id, candidate_name])

  // ── onSilence — called by setInterval inside hook ─────────────────────────

  const onSilence = useCallback(() => {
    console.log('onSilence fired — phase:', phaseRef.current)
    if (phaseRef.current !== 'listening') return
    if (processingRef.current) return
    go(() => setSilenceWarn(false))
    handleStopRecording()
  }, [handleStopRecording])

  // ── Hook ──────────────────────────────────────────────────────────────────

  const { isRecording, audioLevel, startRecording, stopRecording } = useAudioRecorder({
    onSilence,
    silenceMs: 4000
  })

  useEffect(() => {
    stopRecordingRef.current = stopRecording
  }, [stopRecording])

  // ── ariaSpeak ─────────────────────────────────────────────────────────────

  const ariaSpeak = async (text, isComplete) => {
    if (!mountedRef.current) return
    setPhaseAll('speaking')
    go(() => {
      setStatusText('Aria is speaking...')
      setErrorMsg('')
      setSilenceWarn(false)
    })
    addLine('Aria', text)
    await speakText(text)
    if (!mountedRef.current) return
    if (isComplete) {
      setPhaseAll('done')
      go(() => setStatusText('Interview complete!'))
      setTimeout(() => {
        if (mountedRef.current) onComplete(session_id, transcriptRef.current)
      }, 1200)
    } else {
      startListening()
    }
  }

  ariaSpeakRef.current = ariaSpeak

  // ── startListening ────────────────────────────────────────────────────────

  const startListening = async () => {
    if (!mountedRef.current) return
    if (phaseRef.current === 'listening') return
    if (processingRef.current) return

    go(() => setSilenceWarn(false))
    setPhaseAll('listening')
    go(() => { setStatusText('Listening — speak your answer'); setErrorMsg('') })

    try {
      await startRecording()
    } catch (err) {
      console.error('Mic error:', err)
      go(() => {
        setErrorMsg('Microphone access denied. Please allow mic and refresh.')
        setPhaseAll('idle')
        setStatusText('Mic error')
      })
    }
  }

  // ── Mount ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    mountedRef.current    = true
    processingRef.current = false

    const begin = async () => {
      if (!mountedRef.current) return
      setPhaseAll('speaking')
      go(() => setStatusText('Aria is speaking...'))
      await new Promise(resolve => {
        if (window.speechSynthesis.getVoices().length > 0) { resolve() }
        else {
          window.speechSynthesis.onvoiceschanged = () => {
            window.speechSynthesis.onvoiceschanged = null
            resolve()
          }
          setTimeout(resolve, 2000)
        }
      })
      await speakText(opening_message || '')
      if (mountedRef.current) startListening()
    }

    setTimeout(begin, 400)

    return () => {
      mountedRef.current = false
      stopSpeaking()
      try { stopRecording() } catch {}
    }
  }, [])

  // ── Mic tap ───────────────────────────────────────────────────────────────

  const handleMicTap = () => {
    if (phaseRef.current === 'thinking') return
    if (phaseRef.current === 'speaking') {
      stopSpeaking()
      setTimeout(() => { if (mountedRef.current) startListening() }, 200)
      return
    }
    if (phaseRef.current === 'listening') { handleStopRecording(); return }
    startListening()
  }

  const handleFinish = () => {
    stopSpeaking()
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
    ? 'linear-gradient(135deg, #555, #333)'
    : 'linear-gradient(135deg, #7c6ff7, #5b4bd8)'

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg)', overflow: 'hidden' }}>

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

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        <div style={{
          width: 270, flexShrink: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', padding: '1.5rem 1rem',
          borderRight: '1px solid var(--border-subtle)',
          background: 'radial-gradient(ellipse at 50% 40%, rgba(124,111,247,0.06) 0%, transparent 70%)'
        }}>
          <OrbAnimation state={orbState} audioLevel={audioLevel} />

          <p style={{
            fontSize: 12, fontWeight: 500, marginTop: '1.1rem',
            color: phase === 'listening' ? '#6ff7b8'
              : phase === 'thinking' ? '#f7a26f'
              : 'var(--text-secondary)',
            transition: 'color 0.3s', textAlign: 'center', minHeight: 18
          }}>
            {statusText}
          </p>

          {silenceWarn && phase === 'listening' && (
            <div style={{ width: 120, height: 3, borderRadius: 2, marginTop: 6, background: 'var(--bg-elevated)', overflow: 'hidden' }}>
              <div style={{ height: '100%', background: '#f7a26f', borderRadius: 2, animation: 'shrink 2s linear forwards' }} />
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
              marginTop: '1.25rem', width: 64, height: 64, borderRadius: '50%',
              background: micColor, border: 'none',
              cursor: phase === 'thinking' ? 'not-allowed' : 'pointer',
              boxShadow: phase === 'listening'
                ? '0 0 0 10px rgba(111,247,184,0.12), 0 0 0 20px rgba(111,247,184,0.05)'
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
            {phase === 'listening' ? 'Tap to send · auto-sends after 4s silence'
            : phase === 'thinking'  ? 'Processing...'
            : phase === 'speaking'  ? 'Tap to interrupt'
            : 'Tap to speak'}
          </p>
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{
            padding: '0.55rem 1.25rem', borderBottom: '1px solid var(--border-subtle)',
            fontSize: 9, color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.1em', flexShrink: 0
          }}>
            LIVE TRANSCRIPT
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <TranscriptPanel transcript={transcript} />
          </div>
        </div>
      </div>

      <div style={{
        padding: '0.55rem 1.5rem', borderTop: '1px solid var(--border-subtle)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0, background: 'var(--bg-card)'
      }}>
        <p style={{ fontSize: 10, color: 'var(--text-muted)' }}>
          4–5 questions · mic opens after each response · Chrome recommended
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
