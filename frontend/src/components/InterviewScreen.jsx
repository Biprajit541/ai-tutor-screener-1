import React, { useState, useEffect, useRef, useCallback } from 'react'
import OrbAnimation from './OrbAnimation'
import TranscriptPanel from './TranscriptPanel'
import { useAudioRecorder } from '../hooks/useAudioRecorder'
import { sendChatMessage, speakText } from '../utils/api'

const SILENCE_TIMEOUT_MS = 5000 // 5 seconds of silence auto-closes mic

const STATUS = {
  idle:      'Initializing...',
  listening: 'Listening — speak now',
  silence:   'Still there? Closing in a moment...',
  thinking:  'Aria is thinking...',
  speaking:  'Aria is speaking...',
}

export default function InterviewScreen({ session, onComplete }) {
  const { session_id, opening_message, candidate_name } = session

  const [orbState, setOrbState]       = useState('speaking')
  const [statusKey, setStatusKey]     = useState('speaking')
  const [transcript, setTranscript]   = useState([{ speaker: 'Aria', text: opening_message }])
  const [liveText, setLiveText]       = useState('')
  const [error, setError]             = useState('')
  const [micOpen, setMicOpen]         = useState(false)
  const [silenceWarning, setSilenceWarning] = useState(false)

  const recognizerRef      = useRef(null)
  const finalTextRef       = useRef('')
  const interimTextRef     = useRef('')
  const silenceTimerRef    = useRef(null)
  const processingRef      = useRef(false)
  const micOpenRef         = useRef(false)
  const shouldListenRef    = useRef(false)

  const { audioLevel, startLevelTracking, stopLevelTracking } = useAudioRecorder()

  // ── Helpers ────────────────────────────────────────────────────────────────

  const clearSilenceTimer = () => {
    clearTimeout(silenceTimerRef.current)
    setSilenceWarning(false)
  }

  const stopMic = useCallback(() => {
    clearSilenceTimer()
    micOpenRef.current = false
    setMicOpen(false)
    stopLevelTracking()
    try { recognizerRef.current?.stop() } catch {}
  }, [stopLevelTracking])

  // ── Process spoken text → send to AI ──────────────────────────────────────

  const processAnswer = useCallback(async (spokenText) => {
    if (processingRef.current) return
    processingRef.current = true

    const text = spokenText.trim()
    setLiveText('')
    finalTextRef.current = ''
    interimTextRef.current = ''

    if (!text) {
      setError("I didn't catch that — please try again.")
      setOrbState('idle')
      setStatusKey('idle')
      processingRef.current = false
      // Re-open mic for retry
      setTimeout(() => openMic(), 1200)
      return
    }

    setError('')
    setOrbState('thinking')
    setStatusKey('thinking')

    try {
      setTranscript(prev => [...prev, { speaker: candidate_name, text }])

      const { reply, is_complete } = await sendChatMessage(session_id, text)
      setTranscript(prev => [...prev, { speaker: 'Aria', text: reply }])

      setOrbState('speaking')
      setStatusKey('speaking')

      await speakText(reply, () => {
        if (!is_complete) {
          // AI done speaking → auto open mic
          openMic()
        }
      })

      if (is_complete) {
        shouldListenRef.current = false
        setOrbState('idle')
        setTimeout(() => onComplete(session_id), 2500)
      }

    } catch {
      setError('Connection error — please wait a moment.')
      setOrbState('idle')
      setStatusKey('idle')
      setTimeout(() => openMic(), 3000)
    } finally {
      processingRef.current = false
    }
  }, [session_id, candidate_name, onComplete])

  // ── Open mic with auto speech recognition ─────────────────────────────────

  const openMic = useCallback(async () => {
    if (processingRef.current || micOpenRef.current) return

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) {
      setError('Please use Chrome or Edge for voice support.')
      return
    }

    try {
      await startLevelTracking()
    } catch {
      setError('Please allow microphone access in your browser.')
      return
    }

    finalTextRef.current = ''
    interimTextRef.current = ''
    micOpenRef.current = true
    setMicOpen(true)
    setOrbState('listening')
    setStatusKey('listening')
    setLiveText('')
    setSilenceWarning(false)

    const rec = new SR()
    rec.continuous = true
    rec.interimResults = true
    rec.lang = 'en-US'
    rec.maxAlternatives = 1

    // Start silence countdown
    const startSilenceCountdown = () => {
      clearSilenceTimer()
      silenceTimerRef.current = setTimeout(() => {
        setSilenceWarning(true)
        setStatusKey('silence')
        // Give 2 more seconds then close
        silenceTimerRef.current = setTimeout(() => {
          if (micOpenRef.current) {
            stopMic()
            const best = finalTextRef.current || interimTextRef.current
            processAnswer(best)
          }
        }, 2000)
      }, SILENCE_TIMEOUT_MS)
    }

    rec.onstart = () => {
      startSilenceCountdown()
    }

    rec.onresult = (e) => {
      let interim = ''
      let final = ''
      for (let i = 0; i < e.results.length; i++) {
        if (e.results[i].isFinal) {
          final += e.results[i][0].transcript + ' '
        } else {
          interim += e.results[i][0].transcript
        }
      }

      if (final) {
        finalTextRef.current = final.trim()
      }
      interimTextRef.current = interim
      setLiveText(final.trim() || interim)

      // Reset silence countdown every time speech detected
      if (interim || final) {
        clearSilenceTimer()
        setSilenceWarning(false)
        setStatusKey('listening')
        startSilenceCountdown()
      }
    }

    rec.onend = () => {
      // Recognizer stopped — if mic was still meant to be open, restart it
      // (Chrome stops recognition after ~60s or on silence)
      if (micOpenRef.current && !processingRef.current) {
        try {
          rec.start()
        } catch {
          // recognizer dead — create new one by calling openMic again
          micOpenRef.current = false
          setMicOpen(false)
          stopLevelTracking()
          openMic()
        }
      }
    }

    rec.onerror = (e) => {
      if (e.error === 'no-speech') {
        // no-speech is fine — silence timer will handle it
        return
      }
      if (e.error === 'aborted') return
      setError(`Mic error: ${e.error}`)
      stopMic()
      setOrbState('idle')
    }

    recognizerRef.current = rec
    try {
      rec.start()
    } catch {}

  }, [startLevelTracking, stopLevelTracking, stopMic, processAnswer])

  // ── Speak opening message then auto-open mic ───────────────────────────────

  useEffect(() => {
    shouldListenRef.current = true

    const go = () => {
      speakText(opening_message, () => {
        if (shouldListenRef.current) openMic()
      })
    }

    if (window.speechSynthesis.getVoices().length > 0) {
      go()
    } else {
      window.speechSynthesis.onvoiceschanged = go
    }

    return () => {
      shouldListenRef.current = false
      clearSilenceTimer()
      stopMic()
      window.speechSynthesis.cancel()
    }
  }, [])

  // ── Manual mic toggle (tap to open/close) ─────────────────────────────────

  const handleMicClick = useCallback(() => {
    if (orbState === 'speaking' || processingRef.current) return

    if (micOpen) {
      // Manual close → send whatever we have
      stopMic()
      const best = finalTextRef.current || interimTextRef.current
      processAnswer(best)
    } else {
      window.speechSynthesis.cancel()
      openMic()
    }
  }, [micOpen, orbState, stopMic, openMic, processAnswer])

  // ── Silence countdown bar width ────────────────────────────────────────────

  const micButtonColor = micOpen
    ? 'linear-gradient(135deg, #6ff7b8, #3dd68f)'
    : orbState === 'thinking'
    ? 'linear-gradient(135deg, #f7a26f, #e07b3a)'
    : 'linear-gradient(135deg, #7c6ff7, #5b4bd8)'

  const micButtonShadow = micOpen
    ? '0 0 0 16px rgba(111,247,184,0.12), 0 0 0 32px rgba(111,247,184,0.06)'
    : '0 8px 32px rgba(124,111,247,0.45)'

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      background: 'radial-gradient(ellipse at 30% 70%, rgba(124,111,247,0.08) 0%, transparent 55%), var(--bg)'
    }}>

      {/* Header */}
      <div style={{
        padding: '1.25rem 2rem', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)'
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

      {/* Main */}
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
          fontSize: 14, color: silenceWarning ? '#f7a26f' : 'var(--text-secondary)',
          marginBottom: '0.4rem', fontWeight: 500, transition: 'color 0.3s',
          minHeight: 22
        }}>
          {STATUS[statusKey]}
        </p>

        {/* Silence countdown bar */}
        {silenceWarning && (
          <div style={{
            width: 180, height: 3, background: 'var(--bg-elevated)',
            borderRadius: 2, marginBottom: '0.5rem', overflow: 'hidden'
          }}>
            <div style={{
              height: '100%', background: '#f7a26f', borderRadius: 2,
              animation: 'shrink 2s linear forwards',
              width: '100%'
            }} />
          </div>
        )}

        {/* Live transcript preview */}
        {liveText && orbState === 'listening' && (
          <div style={{
            maxWidth: 480, padding: '8px 14px',
            background: 'rgba(124,111,247,0.08)',
            border: '1px solid rgba(124,111,247,0.2)',
            borderRadius: 12, marginBottom: '0.75rem',
            fontSize: 13, color: 'var(--text-secondary)',
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
          width: '100%', maxWidth: 580,
          background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
          borderRadius: 20, marginBottom: '2rem', overflow: 'hidden'
        }}>
          <div style={{
            padding: '0.75rem 1rem', borderBottom: '1px solid var(--border-subtle)',
            fontSize: 11, color: 'var(--text-muted)', fontWeight: 500, letterSpacing: '0.08em'
          }}>
            CONVERSATION
          </div>
          <TranscriptPanel transcript={transcript} />
        </div>

        {/* Mic button — tap to toggle */}
        <button
          onClick={handleMicClick}
          disabled={orbState === 'thinking'}
          style={{
            width: 80, height: 80, borderRadius: '50%',
            background: micButtonColor,
            border: 'none', cursor: orbState === 'thinking' ? 'not-allowed' : 'pointer',
            boxShadow: micButtonShadow,
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
            ? 'Mic open — speak now, closes after 5s silence'
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
