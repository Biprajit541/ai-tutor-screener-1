import React, { useState, useEffect, useRef } from 'react'
import OrbAnimation from './OrbAnimation'
import TranscriptPanel from './TranscriptPanel'
import { useAudioRecorder } from '../hooks/useAudioRecorder'
import { sendChatMessage, speakText } from '../utils/api'

export default function InterviewScreen({ session, onComplete }) {
  const { session_id, opening_message, candidate_name } = session

  const [orbState, setOrbState]       = useState('speaking')
  const [transcript, setTranscript]   = useState([{ speaker: 'Aria', text: opening_message }])
  const [liveText, setLiveText]       = useState('')
  const [error, setError]             = useState('')
  const [micOpen, setMicOpen]         = useState(false)
  const [silenceWarn, setSilenceWarn] = useState(false)
  const [statusText, setStatusText]   = useState('Aria is speaking...')

  const recRef      = useRef(null)
  const finalRef    = useRef('')
  const interimRef  = useRef('')
  const timer1      = useRef(null)
  const timer2      = useRef(null)
  const processing  = useRef(false)
  const micActive   = useRef(false)
  const mountedRef  = useRef(true)
  const speakingRef = useRef(false)

  const { audioLevel, startLevelTracking, stopLevelTracking } = useAudioRecorder()

  const safeSet = (fn) => {
    try { if (mountedRef.current) fn() } catch (e) { console.error('safeSet:', e) }
  }

  const clearTimers = () => {
    clearTimeout(timer1.current)
    clearTimeout(timer2.current)
  }

  const stopMic = () => {
    clearTimers()
    micActive.current = false
    try { stopLevelTracking() } catch {}
    try { recRef.current?.stop() } catch {}
    recRef.current = null
    safeSet(() => { setMicOpen(false); setSilenceWarn(false) })
  }

  const processAnswer = async (text) => {
    if (!mountedRef.current || processing.current) return
    processing.current = true

    const clean = (text || '').trim()
    safeSet(() => setLiveText(''))
    finalRef.current = ''
    interimRef.current = ''

    if (!clean) {
      safeSet(() => {
        setError("Didn't catch that — mic will reopen shortly.")
        setOrbState('idle')
        setStatusText('Retrying...')
      })
      processing.current = false
      setTimeout(() => { if (mountedRef.current) startMic() }, 2000)
      return
    }

    safeSet(() => {
      setError('')
      setOrbState('thinking')
      setStatusText('Aria is thinking...')
    })

    try {
      safeSet(() =>
        setTranscript(prev => [...prev, { speaker: candidate_name, text: clean }])
      )

      const result = await sendChatMessage(session_id, clean)
      if (!mountedRef.current) return

      const { reply, is_complete } = result

      safeSet(() => {
        setTranscript(prev => [...prev, { speaker: 'Aria', text: reply }])
        setOrbState('speaking')
        setStatusText('Aria is speaking...')
      })

      speakingRef.current = true
      await new Promise((resolve) => { speakText(reply, resolve) })
      speakingRef.current = false

      if (!mountedRef.current) return

      if (is_complete) {
        safeSet(() => { setOrbState('idle'); setStatusText('Interview complete!') })
        processing.current = false
        setTimeout(() => { if (mountedRef.current) onComplete(session_id) }, 2500)
      } else {
        processing.current = false
        setTimeout(() => { if (mountedRef.current) startMic() }, 800)
      }

    } catch (err) {
      console.error('processAnswer error:', err)
      if (!mountedRef.current) return
      speakingRef.current = false
      safeSet(() => {
        setError('Connection error — retrying in 3 seconds.')
        setOrbState('idle')
        setStatusText('Connection error')
      })
      processing.current = false
      setTimeout(() => { if (mountedRef.current) startMic() }, 3000)
    }
  }

  const startMic = async () => {
    if (!mountedRef.current || processing.current || micActive.current) return
    if (speakingRef.current || window.speechSynthesis.speaking) return

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) {
      safeSet(() => setError('Please use Chrome or Edge for voice support.'))
      return
    }

    try { await startLevelTracking() } catch {
      safeSet(() => setError('Microphone access denied. Please allow it and refresh.'))
      return
    }

    if (!mountedRef.current) return

    finalRef.current = ''
    interimRef.current = ''
    micActive.current = true

    safeSet(() => {
      setMicOpen(true)
      setSilenceWarn(false)
      setLiveText('')
      setError('')
      setOrbState('listening')
      setStatusText('Listening — speak now')
    })

    const kickSilence = () => {
      clearTimers()
      timer1.current = setTimeout(() => {
        if (!micActive.current || !mountedRef.current) return
        safeSet(() => { setSilenceWarn(true); setStatusText('Closing in 2 seconds...') })
        timer2.current = setTimeout(() => {
          if (!micActive.current || !mountedRef.current) return
          const best = finalRef.current || interimRef.current
          stopMic()
          processAnswer(best)
        }, 2000)
      }, 5000)
    }

    let rec
    try { rec = new SR() } catch {
      safeSet(() => setError('Could not start speech recognition.'))
      micActive.current = false
      try { stopLevelTracking() } catch {}
      return
    }

    rec.continuous = true
    rec.interimResults = true
    rec.lang = 'en-US'
    rec.maxAlternatives = 1

    rec.onstart = () => { kickSilence() }

    rec.onresult = (e) => {
      // Guard: if mic was stopped, ignore stale results
      if (!micActive.current || !mountedRef.current) return
      try {
        let interim = ''
        let final = ''
        const results = e.results
        if (!results || results.length === 0) return
        for (let i = 0; i < results.length; i++) {
          const result = results[i]
          // Guard each result item
          if (!result || !result[0]) continue
          if (result.isFinal) {
            final += (result[0].transcript || '') + ' '
          } else {
            interim += (result[0].transcript || '')
          }
        }
        if (final.trim()) finalRef.current = final.trim()
        if (interim) interimRef.current = interim
        safeSet(() => setLiveText(final.trim() || interim))
        clearTimers()
        safeSet(() => { setSilenceWarn(false); setStatusText('Listening — speak now') })
        kickSilence()
      } catch (err) {
        console.error('onresult error:', err)
      }
    }

    rec.onend = () => {
      // Only restart if mic is still meant to be active
      if (micActive.current && mountedRef.current && !processing.current) {
        try {
          rec.start()
        } catch {
          micActive.current = false
          safeSet(() => setMicOpen(false))
          try { stopLevelTracking() } catch {}
          setTimeout(() => { if (mountedRef.current) startMic() }, 800)
        }
      }
    }

    rec.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return
      console.error('rec error:', e.error)
      safeSet(() => setError(`Mic error: ${e.error} — tap to retry`))
      stopMic()
      safeSet(() => { setOrbState('idle'); setStatusText('Tap mic to retry') })
    }

    recRef.current = rec
    try { rec.start() } catch (err) {
      console.error('rec.start error:', err)
      micActive.current = false
      safeSet(() => { setMicOpen(false); setError('Could not start mic. Tap to retry.') })
    }
  }

  useEffect(() => {
    mountedRef.current = true

    const begin = () => {
      if (!mountedRef.current) return
      try {
        speakingRef.current = true
        speakText(opening_message, () => {
          speakingRef.current = false
          setTimeout(() => { if (mountedRef.current) startMic() }, 800)
        })
      } catch (e) {
        console.error('speakText error:', e)
        speakingRef.current = false
        setTimeout(() => { if (mountedRef.current) startMic() }, 2000)
      }
    }

    const voices = window.speechSynthesis.getVoices()
    if (voices.length > 0) {
      begin()
    } else {
      window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.onvoiceschanged = null
        begin()
      }
      setTimeout(() => {
        if (mountedRef.current && !speakingRef.current) begin()
      }, 2000)
    }

    return () => {
      mountedRef.current = false
      speakingRef.current = false
      clearTimers()
      stopMic()
      try { window.speechSynthesis.cancel() } catch {}
    }
  }, [])

  const handleMicClick = () => {
    if (processing.current || orbState === 'thinking') return
    if (speakingRef.current || window.speechSynthesis.speaking) {
      // Interrupt Aria
      window.speechSynthesis.cancel()
      speakingRef.current = false
      setTimeout(() => { if (mountedRef.current) startMic() }, 300)
      return
    }
    if (micActive.current) {
      const best = finalRef.current || interimRef.current
      stopMic()
      processAnswer(best)
    } else {
      startMic()
    }
  }

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

      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', padding: '2.5rem 1rem 2rem'
      }}>

        <div style={{ marginBottom: '1.25rem' }}>
          <OrbAnimation state={orbState} audioLevel={audioLevel} />
        </div>

        <p style={{
          fontSize: 14, fontWeight: 500, minHeight: 22, marginBottom: '0.4rem',
          color: silenceWarn ? '#f7a26f' : 'var(--text-secondary)',
          transition: 'color 0.3s'
        }}>
          {statusText}
        </p>

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

        {liveText && orbState === 'listening' && (
          <div style={{
            maxWidth: 480, padding: '8px 14px', marginBottom: '0.75rem',
            background: 'rgba(124,111,247,0.08)',
            border: '1px solid rgba(124,111,247,0.2)',
            borderRadius: 12, fontSize: 13, color: 'var(--text-secondary)',
            fontStyle: 'italic', textAlign: 'center'
          }}>
            "{liveText}"
          </div>
        )}

        {error && (
          <p style={{
            fontSize: 13, color: 'var(--red)', marginBottom: '0.75rem',
            maxWidth: 400, textAlign: 'center'
          }}>
            {error}
          </p>
        )}

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
            : orbState === 'speaking'
            ? 'Tap mic to interrupt Aria'
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
