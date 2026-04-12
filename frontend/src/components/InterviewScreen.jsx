import React, { useState, useEffect, useRef } from 'react'
import OrbAnimation from './OrbAnimation.jsx'
import TranscriptPanel from './TranscriptPanel.jsx'
import { useAudioRecorder } from '../hooks/useAudioRecorder.js'
import { transcribeAudio, sendChatMessage } from '../utils/api.js'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

// Silence: if audio level stays below threshold for SILENCE_MS milliseconds → auto send
const SILENCE_THRESHOLD_MS = 2500
const AUDIO_LOW_THRESHOLD  = 0.06

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
  const currentAudioRef  = useRef(null)
  const processingRef    = useRef(false)
  const silenceTimerRef  = useRef(null)
  const speechStarted    = useRef(false) // did user actually say something?

  const { isRecording, audioLevel, startRecording, stopRecording } = useAudioRecorder()

  // ── helpers ───────────────────────────────────────────────────────────────

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

  const clearSilenceTimer = () => {
    clearTimeout(silenceTimerRef.current)
    silenceTimerRef.current = null
  }

  // ── silence detection via audioLevel ─────────────────────────────────────

  useEffect(() => {
    if (!isRecording || phaseRef.current !== 'listening') return

    if (audioLevel > AUDIO_LOW_THRESHOLD) {
      // User is speaking — reset silence timer
      speechStarted.current = true
      clearSilenceTimer()
      go(() => setSilenceWarn(false))
      return
    }

    // Audio is low — only start silence timer if user has spoken at least once
    if (!speechStarted.current) return

    if (silenceTimerRef.current) return // already counting

    // Start silence countdown
    silenceTimerRef.current = setTimeout(() => {
      if (phaseRef.current === 'listening' && mountedRef.current) {
        handleStopRecording()
      }
    }, SILENCE_THRESHOLD_MS)

    // Show warning at halfway point
    setTimeout(() => {
      if (phaseRef.current === 'listening' && mountedRef.current) {
        go(() => setSilenceWarn(true))
      }
    }, SILENCE_THRESHOLD_MS / 2)

  }, [audioLevel, isRecording])

  // ── fetch and play TTS audio ──────────────────────────────────────────────

  const playTTS = async (text) => {
    try {
      const res = await fetch(`${API_URL}/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      })
      if (!res.ok) throw new Error(`TTS HTTP ${res.status}`)
      const { audio_b64 } = await res.json()

      return new Promise((resolve) => {
        stopCurrentAudio()
        const audio = new Audio(`data:audio/mp3;base64,${audio_b64}`)
        currentAudioRef.current = audio

        let done = false
        const finish = () => {
          if (done) return
          done = true
          currentAudioRef.current = null
          setTimeout(resolve, 500) // 500ms gap after speech ends before mic opens
        }

        audio.onended = finish
        audio.onerror = (e) => {
          console.error('Audio playback error:', e)
          finish()
        }

        // Fallback: estimate duration from word count + buffer
        audio.onloadedmetadata = () => {
          setTimeout(finish, audio.duration * 1000 + 600)
        }
        setTimeout(finish, 35000) // hard max 35s

        audio.play().catch((e) => {
          console.error('audio.play() failed:', e)
          finish()
        })
      })

    } catch (err) {
      console.error('playTTS error:', err)
      // If TTS fails, wait estimated time then continue
      const words = text.trim().split(/\s+/).length
      await new Promise(r => setTimeout(r, Math.max(words * 400, 2000)))
    }
  }

  // ── Aria speaks then opens mic ────────────────────────────────────────────

  const ariaSpeak = async (text, isComplete) => {
    if (!mountedRef.current) return
    setPhaseAll('speaking')
    go(() => {
      setStatusText('Aria is speaking...')
      setErrorMsg('')
      setSilenceWarn(false)
    })
    addLine('Aria', text)

    await playTTS(text)

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

  // ── start recording ───────────────────────────────────────────────────────

  const startListening = async () => {
    if (!mountedRef.current) return
    if (phaseRef.current === 'listening') return
    if (processingRef.current) return

    clearSilenceTimer()
    speechStarted.current = false
    setPhaseAll('listening')
    go(() => {
      setStatusText('Listening — speak your answer')
      setErrorMsg('')
      setSilenceWarn(false)
    })

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

  // ── stop recording → transcribe → send to AI ─────────────────────────────

  const handleStopRecording = async () => {
    if (phaseRef.current !== 'listening') return
    if (processingRef.current) return
    processingRef.current = true

    clearSilenceTimer()
    setPhaseAll('thinking')
    go(() => {
      setStatusText('Processing your answer...')
      setSilenceWarn(false)
    })

    try {
      const blob = await stopRecording()

      if (!blob || blob.size < 1000) {
        processingRef.current = false
        go(() => setErrorMsg("Didn't catch that — tap mic to try again."))
        setPhaseAll('idle')
        go(() => setStatusText("Tap mic to speak"))
        return
      }

      go(() => setStatusText('Transcribing...'))

      const { text } = await transcribeAudio(blob)
      if (!mountedRef.current) return

      const clean = (text || '').trim()
      if (!clean) {
        processingRef.current = false
        go(() => setErrorMsg("Didn't catch that — tap mic to try again."))
        setPhaseAll('idle')
        go(() => setStatusText("Tap mic to speak"))
        return
      }

      go(() => setStatusText('Aria is thinking...'))
      addLine(String(candidate_name || 'You'), clean)

      const result = await sendChatMessage(session_id, clean)
      if (!mountedRef.current) return

      if (!result?.reply) throw new Error('Empty reply from AI')

      processingRef.current = false
      await ariaSpeak(result.reply, Boolean(result.is_complete))

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
  }

  // ── mount: play opening → start listening ─────────────────────────────────

  useEffect(() => {
    mountedRef.current    = true
    processingRef.current = false

    const begin = async () => {
      if (!mountedRef.current) return
      setPhaseAll('speaking')
      go(() => setStatusText('Aria is speaking...'))
      await playTTS(opening_message || '')
      if (mountedRef.current) startListening()
    }

    // Small delay so browser is fully ready
    setTimeout(begin, 600)

    return () => {
      mountedRef.current = false
      stopCurrentAudio()
      clearSilenceTimer()
      try { stopRecording() } catch {}
    }
  }, [])

  // ── mic button ────────────────────────────────────────────────────────────

  const handleMicTap = () => {
    if (phaseRef.current === 'thinking') return
    if (phaseRef.current === 'speaking') {
      stopCurrentAudio()
      setTimeout(() => { if (mountedRef.current) startListening() }, 200)
      return
    }
    if (phaseRef.current === 'listening') {
      handleStopRecording()
      return
    }
    // idle or done → start fresh
    startListening()
  }

  const handleFinish = () => {
    stopCurrentAudio()
    clearSilenceTimer()
    try { stopRecording() } catch {}
    onComplete(session_id, transcriptRef.current)
  }

  // ── render ────────────────────────────────────────────────────────────────

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

        {/* Left — Orb + controls */}
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
            <div style={{
              width: 120, height: 3, borderRadius: 2, marginTop: 6,
              background: 'var(--bg-elevated)', overflow: 'hidden'
            }}>
              <div style={{
                height: '100%', background: '#f7a26f', borderRadius: 2,
                animation: `shrink ${SILENCE_THRESHOLD_MS / 2000}s linear forwards`
              }} />
            </div>
          )}

          {errorMsg && (
            <p style={{
              fontSize: 11, color: '#f76f6f', textAlign: 'center',
              maxWidth: 210, marginTop: 8, lineHeight: 1.5
            }}>
              {errorMsg}
            </p>
          )}

          {/* Mic button */}
          <button
            onClick={handleMicTap}
            disabled={phase === 'thinking'}
            style={{
              marginTop: '1.25rem',
              width: 64, height: 64, borderRadius: '50%',
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

          <p style={{
            marginTop: '0.5rem', fontSize: 10,
            color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.5
          }}>
            {phase === 'listening' ? 'Tap to send early · auto-sends after silence'
            : phase === 'thinking'  ? 'Processing...'
            : phase === 'speaking'  ? 'Tap mic to interrupt'
            : 'Tap mic to speak'}
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
