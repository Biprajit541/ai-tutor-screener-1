import React, { useState, useEffect, useRef } from 'react'
import OrbAnimation from './OrbAnimation'
import TranscriptPanel from './TranscriptPanel'
import { useAudioRecorder } from '../hooks/useAudioRecorder'
import { sendChatMessage, speakText } from '../utils/api'

export default function InterviewScreen({ session, onComplete }) {
  const { session_id, opening_message, candidate_name } = session

  const [orbState, setOrbState]     = useState('speaking')
  const [transcript, setTranscript] = useState([{ speaker: 'Aria', text: opening_message }])
  const [liveText, setLiveText]     = useState('')
  const [error, setError]           = useState('')
  const [micOpen, setMicOpen]       = useState(false)
  const [silenceWarn, setSilenceWarn] = useState(false)
  const [statusText, setStatusText] = useState('Aria is speaking...')

  // All mutable state in refs to avoid stale closures
  const recRef           = useRef(null)
  const finalRef         = useRef('')
  const interimRef       = useRef('')
  const silenceTimer1    = useRef(null)
  const silenceTimer2    = useRef(null)
  const processing       = useRef(false)
  const micActive        = useRef(false)
  const mounted          = useRef(true)

  const { audioLevel, startLevelTracking, stopLevelTracking } = useAudioRecorder()

  // ── Safe state setters (no-op after unmount) ──────────────────────────────
  const safe = (fn) => { if (mounted.current) fn() }

  // ── Clear silence timers ──────────────────────────────────────────────────
  const clearTimers = () => {
    clearTimeout(silenceTimer1.current)
    clearTimeout(silenceTimer2.current)
  }

  // ── Stop microphone ───────────────────────────────────────────────────────
  const stopMic = () => {
    clearTimers()
    micActive.current = false
    stopLevelTracking()
    try { recRef.current?.stop() } catch {}
    safe(() => {
      setMicOpen(false)
      setSilenceWarn(false)
    })
  }

  // ── Send answer to AI, speak reply, reopen mic ────────────────────────────
  const processAnswer = async (text) => {
    if (processing.current) return
    if (!mounted.current) return
    processing.current = true

    const clean = text.trim()
    safe(() => { setLiveText('') })
    finalRef.current = ''
    interimRef.current = ''

    if (!clean) {
      safe(() => {
        setError("I didn't catch that — mic will reopen in a moment.")
        setOrbState('idle')
        setStatusText('Tap mic or wait to retry')
      })
      processing.current = false
      setTimeout(() => { if (mounted.current) startMic() }, 2000)
      return
    }

    safe(() => {
      setError('')
      setOrbState('thinking')
      setStatusText('Aria is thinking...')
    })

    try {
      safe(() => setTranscript(prev => [...prev, { speaker: candidate_name, text: clean }]))

      const { reply, is_complete } = await sendChatMessage(session_id, clean)

      if (!mounted.current) return

      safe(() => {
        setTranscript(prev => [...prev, { speaker: 'Aria', text: reply }])
        setOrbState('speaking')
        setStatusText('Aria is speaking...')
      })

      await speakText(reply, () => {
        if (!mounted.current) return
        if (!is_complete) {
          processing.current = false
          startMic()
        }
      })

      if (is_complete) {
        processing.current = false
        safe(() => {
          setOrbState('idle')
          setStatusText('Interview complete!')
        })
        setTimeout(() => { if (mounted.current) onComplete(session_id) }, 2500)
      }

    } catch {
      if (!mounted.current) return
      safe(() => {
        setError('Connection error — retrying in 3 seconds.')
        setOrbState('idle')
        setStatusText('Connection error')
      })
      processing.current = false
      setTimeout(() => { if (mounted.current) startMic() }, 3000)
    }
  }

  // ── Start microphone + speech recognition ────────────────────────────────
  const startMic = async () => {
    if (!mounted.current) return
    if (processing.current) return
    if (micActive.current) return

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) {
      safe(() => setError('Please use Chrome or Edge for voice support.'))
      return
    }

    try {
      await startLevelTracking()
    } catch {
      safe(() => setError('Please allow microphone access in your browser.'))
      return
    }

    if (!mounted.current) return

    finalRef.current = ''
    interimRef.current = ''
    micActive.current = true

    safe(() => {
      setMicOpen(true)
      setSilenceWarn(false)
      setLiveText('')
      setError('')
      setOrbState('listening')
      setStatusText('Listening — speak now')
    })

    const startSilenceCountdown = () => {
      clearTimers()
      silenceTimer1.current = setTimeout(() => {
        if (!micActive.current) return
        safe(() => {
          setSilenceWarn(true)
          setStatusText('Closing in 2 seconds...')
        })
        silenceTimer2.current = setTimeout(() => {
          if (!micActive.current) return
          const best = finalRef.current || interimRef.current
          stopMic()
          processAnswer(best)
        }, 2000)
      }, 5000)
    }

    const rec = new SR()
    rec.continuous = true
    rec.interimResults = true
    rec.lang = 'en-US'
    rec.maxAlternatives = 1

    rec.onstart = () => {
      startSilenceCountdown()
    }

    rec.onresult = (e) => {
      if (!micActive.current) return
      let interim = ''
      let final = ''
      for (let i = 0; i < e.results.length; i++) {
        if (e.results[i].isFinal) final += e.results[i][0].transcript + ' '
        else interim += e.results[i][0].transcript
      }
      if (final) finalRef.current = final.trim()
      interimRef.current = interim
      safe(() => setLiveText(final.trim() || interim))

      // Reset silence timer on any speech
      clearTimers()
      safe(() => {
        setSilenceWarn(false)
        setStatusText('Listening — speak now')
      })
      startSilenceCountdown()
    }

    rec.onend = () => {
      // Chrome auto-stops recognition — restart if mic still active
      if (micActive.current && mounted.current && !processing.current) {
        try {
          rec.start()
        } catch {
          // recognizer broken — reset and restart fresh
          micActive.current = false
          stopLevelTracking()
          safe(() => setMicOpen(false))
          setTimeout(() => { if (mounted.current) startMic() }, 500)
        }
      }
    }

    rec.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return
      safe(() => setError(`Mic error: ${e.error}`))
      stopMic()
      safe(() => {
        setOrbState('idle')
        setStatusText('Mic error — tap to retry')
      })
    }

    recRef.current = rec
    try { rec.start() } catch {}
  }

  // ── On mount: speak opening then start mic ────────────────────────────────
  useEffect(() => {
    mounted.current = true

    const begin = () => {
      if (!mounted.current) return
      speakText(opening_message, () => {
        if (mounted.current) startMic()
      })
    }

    if (window.speechSynthesis.getVoices().length > 0) {
      begin()
    } else {
      window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.onvoiceschanged = null
        begin()
      }
    }

    return () => {
      mounted.current = false
      clearTimers()
      stopMic()
      window.speechSynthesis.cancel()
    }
  }, []) // empty deps — runs once only

  // ── Manual mic tap ────────────────────────────────────────────────────────
  const handleMicClick = () => {
    if (processing.current || orbState === 'thinking') return
    if (micActive.current) {
      // Force close and send
      const best = finalRef.current || interimRef.current
      stopMic()
      processAnswer(best)
    } else {
      window.speechSynthesis.cancel()
      startMic()
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  const micColor = micOpen
    ? 'linear-gradient(135deg, #6ff7b8, #3dd68f)'
    : orbState === 'thinking'
    ? 'linear-gradient(135deg, #f7a26f, #e07b3a)'
    : 'linear-gradient(135deg, #7c6ff7, #5b4bd8)'

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      background: 'radial-gradient(ellipse at 30% 70%, rgba(124,111,247,0.08) 0%, transparent 55%), var(--bg)'
    }}>

      {/* Header */}
      <div style={{
        padding: '1.25rem 2rem', display: 'flex',
        alignItems: 'center', justifyContent: 'space-between',
        borderBottom: '1px solid var(--border-subtle)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: micOpen ? '#6ff7b8' : '#7c6ff7',
            boxShadow: micOpen ? '0 0 8px #6ff7b8' : '0 0 8px #7c6ff7',
            transition: 'all 0.3s'
          }} />
          <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500 }}>
            Live Interview
          </span>
        </div>
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{candidate_name}</span>
      </div>

      {/* Body */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', padding: '2.5rem 1rem 2rem'
      }}>

        {/* Orb */}
        <div style={{ marginBottom: '1.25rem' }}>
          <OrbAnimation state={orbState} audioLevel={audioLevel} />
        </div>

        {/* Status */}
        <p style={{
          fontSize: 14, fontWeight: 500, minHeight: 22, marginBottom: '0.4rem',
          color: silenceWarn ? '#f7a26f' : 'var(--text-secondary)',
          transition: 'color 0.3s'
        }}>
          {statusText}
        </p>

        {/* Silence countdown bar */}
        {silenceWarn && (
          <div style={{
            width: 180, height: 3, borderRadius: 2,
            background: 'var(--bg-elevated)', marginBottom: '0.5rem', overflow: 'hidden'
          }}>
            <div style={{
              height: '100%', borderRadius: 2, background: '#f7a26f',
              animation: 'shrink 2s linear forwards'
            }} />
          </div>
        )}

        {/* Live text */}
        {liveText && orbState === 'listening' && (
          <div style={{
            maxWidth: 480, padding: '8px 14px', marginBottom: '0.75rem',
            background: 'rgba(124,111,247,0.08)',
            border: '1px solid rgba(124,111,247,0.2)',
            borderRadius: 12, fontSize: 13, color: 'var(--text-secondary)',
            fontStyle: 'italic', textAlign: 'center',
            animation: 'fadeSlideUp 0.2s ease'
          }}>
            "{liveText}"
          </div>
        )}

        {/* Error */}
        {error && (
          <p style={{
            fontSize: 13, color: 'var(--red)', marginBottom: '0.75rem',
            maxWidth: 400, textAlign: 'center'
          }}>
            {error}
          </p>
        )}

        {/* Transcript */}
        <div style={{
          width: '100%', maxWidth: 580, marginBottom: '2rem',
          background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
          borderRadius: 20, overflow: 'hidden'
        }}>
          <div style={{
            padding: '0.75rem 1rem', borderBottom: '1px solid var(--border-subtle)',
            fontSize: 11, color: 'var(--text-muted)', fontWeight: 500, letterSpacing: '0.08em'
          }}>
            CONVERSATION
          </div>
          <TranscriptPanel transcript={transcript} />
        </div>

        {/* Mic button */}
        <button
          onClick={handleMicClick}
          disabled={orbState === 'thinking'}
          style={{
            width: 80, height: 80, borderRadius: '50%',
            background: micColor, border: 'none',
            cursor: orbState === 'thinking' ? 'not-allowed' : 'pointer',
            boxShadow: micOpen
              ? '0 0 0 16px rgba(111,247,184,0.12), 0 0 0 32px rgba(111,247,184,0.06)'
              : '0 8px 32px rgba(124,111,247,0.45)',
            transition: 'all 0.25s cubic-bezier(0.34,1.56,0.64,1)',
            transform: micOpen ? 'scale(1.1)' : 'scale(1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            opacity: orbState === 'thinking' ? 0.6 : 1
          }}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
            {micOpen
              ? <rect x="6" y="6" width="12" height="12" rx="2" fill="white"/>
              : <>
                  <rect x="9" y="2" width="6" height="12" rx="3" fill="white"/>
                  <path d="M5 10a7 7 0 0014 0" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                  <path d="M12 19v3M9 22h6" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                </>
            }
          </svg>
        </button>

        <p style={{ marginTop: '0.75rem', fontSize: 12, color: 'var(--text-muted)' }}>
          {micOpen
            ? 'Mic open — closes after 5s silence'
            : orbState === 'thinking'
            ? 'Processing your answer...'
            : 'Tap mic to speak manually'}
        </p>

        <p style={{ marginTop: '0.5rem', fontSize: 11, color: 'var(--text-muted)' }}>
          ⚠️ Use Chrome or Edge for best voice support
        </p>
      </div>

      <style>{`
        @keyframes shrink {
          from { width: 100%; }
          to { width: 0%; }
        }
      `}</style>
    </div>
  )
}
