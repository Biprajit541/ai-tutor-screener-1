import React, { useState, useEffect, useRef, useCallback } from 'react'
import OrbAnimation from './OrbAnimation'
import TranscriptPanel from './TranscriptPanel'
import { useAudioRecorder } from '../hooks/useAudioRecorder'
import { sendChatMessage, speakText } from '../utils/api'

const STATUS = {
  idle:      'Press & hold to speak',
  listening: 'Listening...',
  thinking:  'Aria is thinking...',
  speaking:  'Aria is speaking...',
}

export default function InterviewScreen({ session, onComplete }) {
  const { session_id, opening_message, candidate_name } = session
  const [orbState, setOrbState] = useState('speaking')
  const [transcript, setTranscript] = useState([{ speaker: 'Aria', text: opening_message }])
  const [isProcessing, setIsProcessing] = useState(false)
  const [liveText, setLiveText] = useState('')
  const [error, setError] = useState('')

  const recognizerRef = useRef(null)
  const finalTextRef = useRef('')
  const interimTextRef = useRef('')
  const isReleasedRef = useRef(false)
  const processingLockRef = useRef(false)

  const { isRecording, audioLevel, startLevelTracking, stopLevelTracking } = useAudioRecorder()

  useEffect(() => {
    const speak = () => speakText(opening_message, () => setOrbState('idle'))
    if (window.speechSynthesis.getVoices().length > 0) {
      speak()
    } else {
      window.speechSynthesis.onvoiceschanged = speak
    }
  }, [])

  const processAndRespond = useCallback(async (spokenText) => {
    if (processingLockRef.current) return
    processingLockRef.current = true

    const text = spokenText.trim()
    if (!text) {
      setOrbState('idle')
      setIsProcessing(false)
      setError("I didn't catch that. Please hold and speak clearly.")
      processingLockRef.current = false
      return
    }

    setError('')
    setLiveText('')
    setOrbState('thinking')
    setIsProcessing(true)

    try {
      setTranscript(prev => [...prev, { speaker: candidate_name, text }])
      const { reply, is_complete } = await sendChatMessage(session_id, text)
      setTranscript(prev => [...prev, { speaker: 'Aria', text: reply }])
      setOrbState('speaking')
      await speakText(reply, () => {
        if (!is_complete) setOrbState('idle')
      })
      if (is_complete) {
        setTimeout(() => onComplete(session_id), 2500)
      }
    } catch {
      setError('Connection error. Please try again.')
      setOrbState('idle')
    } finally {
      setIsProcessing(false)
      processingLockRef.current = false
    }
  }, [session_id, candidate_name, onComplete])

  const handlePressStart = useCallback(async () => {
    if (isProcessing || orbState === 'speaking') return
    window.speechSynthesis.cancel()
    setError('')
    setLiveText('')
    finalTextRef.current = ''
    interimTextRef.current = ''
    isReleasedRef.current = false
    processingLockRef.current = false

    try {
      await startLevelTracking()
    } catch {
      setError('Please allow microphone access in your browser.')
      return
    }

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) {
      setError('Please use Chrome or Edge for voice support.')
      stopLevelTracking()
      return
    }

    const rec = new SR()
    rec.continuous = true        // keep listening until we stop it
    rec.interimResults = true
    rec.lang = 'en-US'
    rec.maxAlternatives = 1

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
      if (final) finalTextRef.current = final.trim()
      interimTextRef.current = interim
      setLiveText(final || interim)
    }

    rec.onend = () => {
      // If user already released the button, process whatever we have
      if (isReleasedRef.current) {
        const best = finalTextRef.current || interimTextRef.current
        processAndRespond(best)
      }
    }

    rec.onerror = (e) => {
      if (e.error === 'no-speech') {
        // treat as empty — will show "didn't catch that"
        if (isReleasedRef.current) processAndRespond('')
      } else {
        setError(`Mic error: ${e.error}`)
        setOrbState('idle')
        stopLevelTracking()
      }
    }

    recognizerRef.current = rec
    rec.start()
    setOrbState('listening')
  }, [isProcessing, orbState, startLevelTracking, stopLevelTracking, processAndRespond])

  const handlePressEnd = useCallback(() => {
    if (orbState !== 'listening') return
    isReleasedRef.current = true
    stopLevelTracking()

    // Stop recognizer — onend will fire and call processAndRespond
    if (recognizerRef.current) {
      try {
        recognizerRef.current.stop()
      } catch {}
    }

    setOrbState('thinking')
    setIsProcessing(true)
  }, [orbState, stopLevelTracking])

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
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#6ff7b8', boxShadow: '0 0 8px #6ff7b8' }} />
          <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500 }}>Live Interview</span>
        </div>
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{candidate_name}</span>
      </div>

      {/* Main */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '3rem 1rem 2rem' }}>

        <div style={{ marginBottom: '1.5rem' }}>
          <OrbAnimation state={orbState} audioLevel={audioLevel} />
        </div>

        <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: '0.5rem', fontWeight: 500 }}>
          {STATUS[orbState]}
        </p>

        {liveText && orbState === 'listening' && (
          <p style={{
            fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic',
            marginBottom: '0.5rem', maxWidth: 400, textAlign: 'center'
          }}>
            "{liveText}"
          </p>
        )}

        {error && (
          <p style={{
            fontSize: 13, color: 'var(--red)', marginBottom: '1rem',
            maxWidth: 400, textAlign: 'center'
          }}>
            {error}
          </p>
        )}

        {/* Transcript */}
        <div style={{
          width: '100%', maxWidth: 580,
          background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
          borderRadius: 20, marginBottom: '2.5rem', overflow: 'hidden'
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
          onMouseDown={handlePressStart}
          onMouseUp={handlePressEnd}
          onTouchStart={(e) => { e.preventDefault(); handlePressStart() }}
          onTouchEnd={(e) => { e.preventDefault(); handlePressEnd() }}
          disabled={isProcessing && orbState !== 'listening'}
          style={{
            width: 80, height: 80, borderRadius: '50%',
            background: orbState === 'listening'
              ? 'linear-gradient(135deg, #6ff7b8, #3dd68f)'
              : 'linear-gradient(135deg, #7c6ff7, #5b4bd8)',
            border: 'none', cursor: 'pointer',
            boxShadow: orbState === 'listening'
              ? '0 0 0 16px rgba(111,247,184,0.12), 0 0 0 32px rgba(111,247,184,0.06)'
              : '0 8px 32px rgba(124,111,247,0.45)',
            transition: 'all 0.25s cubic-bezier(0.34,1.56,0.64,1)',
            transform: orbState === 'listening' ? 'scale(1.12)' : 'scale(1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            opacity: (isProcessing && orbState !== 'listening') ? 0.5 : 1
          }}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
            {orbState === 'listening'
              ? <rect x="6" y="6" width="12" height="12" rx="2" fill="white"/>
              : <>
                  <rect x="9" y="2" width="6" height="12" rx="3" fill="white"/>
                  <path d="M5 10a7 7 0 0014 0" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                  <path d="M12 19v3M9 22h6" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                </>
            }
          </svg>
        </button>

        <p style={{ marginTop: '1rem', fontSize: 12, color: 'var(--text-muted)' }}>
          {orbState === 'listening' ? 'Release to send' : 'Hold to speak'}
        </p>

        <p style={{ marginTop: '0.75rem', fontSize: 11, color: 'var(--text-muted)' }}>
          ⚠️ Use Chrome or Edge for best voice support
        </p>
      </div>
    </div>
  )
}
