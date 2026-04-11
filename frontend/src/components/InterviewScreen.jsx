import React, { useState, useEffect, useRef } from 'react'
import OrbAnimation from './OrbAnimation'
import TranscriptPanel from './TranscriptPanel'
import { useAudioRecorder } from '../hooks/useAudioRecorder'
import { sendChatMessage, speakText } from '../utils/api'

export default function InterviewScreen({ session, onComplete }) {
  const { session_id, opening_message, candidate_name } = session

  const [orbState, setOrbState]       = useState('speaking')
  const [transcript, setTranscript]   = useState(
    // Guard the initial entry too
    (opening_message && candidate_name !== undefined)
      ? [{ speaker: 'Aria', text: String(opening_message) }]
      : []
  )
  const [liveText, setLiveText]       = useState('')
  const [error, setError]             = useState('')
  const [micOpen, setMicOpen]         = useState(false)
  const [silenceWarn, setSilenceWarn] = useState(false)
  const [statusText, setStatusText]   = useState('Aria is speaking...')

  const state = useRef({
    mounted: true,
    speaking: false,
    processing: false,
    micOn: false,
    collected: '',
    silTimer: null,
    warnTimer: null,
  })

  const recRef = useRef(null)
  const { audioLevel, startLevelTracking, stopLevelTracking } = useAudioRecorder()

  const S = state.current

  const safe = (fn) => {
    try { if (S.mounted) fn() } catch(e) { console.error('safe error:', e) }
  }

  // Guard every transcript push — never allow undefined speaker or text
  const pushTranscript = (speaker, text) => {
    if (!speaker || !text || typeof speaker !== 'string' || typeof text !== 'string') return
    if (!speaker.trim() || !text.trim()) return
    safe(() => setTranscript(prev => {
      const safe = Array.isArray(prev)
        ? prev.filter(e => e && typeof e.speaker === 'string' && typeof e.text === 'string')
        : []
      return [...safe, { speaker: speaker.trim(), text: text.trim() }]
    }))
  }

  const stopEverything = () => {
    clearTimeout(S.silTimer)
    clearTimeout(S.warnTimer)
    S.micOn = false
    try { recRef.current?.abort() } catch {}
    try { recRef.current?.stop() } catch {}
    recRef.current = null
    try { stopLevelTracking() } catch {}
    safe(() => { setMicOpen(false); setSilenceWarn(false) })
  }

  const sendAnswer = async (text) => {
    if (!S.mounted || S.processing) return
    S.processing = true
    stopEverything()

    const clean = (text || '').trim()
    safe(() => setLiveText(''))
    S.collected = ''

    if (!clean) {
      safe(() => {
        setError("Didn't catch that — trying again.")
        setOrbState('idle')
        setStatusText('Retrying...')
      })
      S.processing = false
      setTimeout(() => { if (S.mounted) listenOnce() }, 1500)
      return
    }

    safe(() => {
      setError('')
      setOrbState('thinking')
      setStatusText('Aria is thinking...')
    })

    // Push candidate answer safely
    pushTranscript(String(candidate_name || 'Candidate'), clean)

    try {
      const result = await sendChatMessage(session_id, clean)
      if (!S.mounted) return

      // Guard the result object
      if (!result || typeof result.reply !== 'string') {
        throw new Error('Invalid response from server')
      }

      const { reply, is_complete } = result

      // Push Aria reply safely
      pushTranscript('Aria', reply)

      safe(() => {
        setOrbState('speaking')
        setStatusText('Aria is speaking...')
      })

      S.speaking = true
      await new Promise(resolve => speakText(reply, resolve))
      S.speaking = false

      if (!S.mounted) return

      S.processing = false

      if (is_complete) {
        safe(() => { setOrbState('idle'); setStatusText('Interview complete!') })
        setTimeout(() => { if (S.mounted) onComplete(session_id) }, 2500)
      } else {
        setTimeout(() => { if (S.mounted) listenOnce() }, 1000)
      }

    } catch (err) {
      console.error('sendAnswer error:', err)
      if (!S.mounted) return
      S.speaking = false
      S.processing = false
      safe(() => {
        setError('Connection error — retrying in 3 seconds.')
        setOrbState('idle')
        setStatusText('Connection error')
      })
      setTimeout(() => { if (S.mounted) listenOnce() }, 3000)
    }
  }

  const listenOnce = () => {
    if (!S.mounted || S.processing || S.micOn || S.speaking) return
    if (window.speechSynthesis.speaking) return

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) {
      safe(() => setError('Use Chrome or Edge for voice support.'))
      return
    }

    S.collected = ''

    startLevelTracking().catch(() => {
      safe(() => setError('Microphone access denied.'))
    })

    S.micOn = true
    safe(() => {
      setMicOpen(true)
      setSilenceWarn(false)
      setLiveText('')
      setError('')
      setOrbState('listening')
      setStatusText('Listening — speak now')
    })

    const startSilenceTimer = () => {
      clearTimeout(S.silTimer)
      clearTimeout(S.warnTimer)
      S.silTimer = setTimeout(() => {
        if (!S.micOn || !S.mounted) return
        safe(() => { setSilenceWarn(true); setStatusText('Sending in 2 seconds...') })
        S.warnTimer = setTimeout(() => {
          if (!S.micOn || !S.mounted) return
          const toSend = S.collected
          sendAnswer(toSend)
        }, 2000)
      }, 5000)
    }

    let rec
    try {
      rec = new SR()
    } catch (err) {
      console.error('SR create failed:', err)
      S.micOn = false
      try { stopLevelTracking() } catch {}
      safe(() => { setMicOpen(false); setError('Could not start mic. Tap to retry.') })
      return
    }

    rec.continuous = false
    rec.interimResults = true
    rec.lang = 'en-US'
    rec.maxAlternatives = 1

    rec.onstart = () => { startSilenceTimer() }

    rec.onresult = (e) => {
      try {
        // Triple-guard every access
        if (!e) return
        if (!e.results) return
        if (e.results.length === 0) return
        const firstResult = e.results[0]
        if (!firstResult) return
        if (firstResult.length === 0) return
        const firstAlt = firstResult[0]
        if (!firstAlt) return
        const spokenText = firstAlt.transcript
        if (typeof spokenText !== 'string') return

        const isFinal = Boolean(firstResult.isFinal)

        safe(() => setLiveText(S.collected + (isFinal ? '' : spokenText)))

        if (isFinal && spokenText.trim()) {
          S.collected += spokenText + ' '
          safe(() => setLiveText(S.collected.trim()))
        }

        clearTimeout(S.silTimer)
        clearTimeout(S.warnTimer)
        safe(() => { setSilenceWarn(false); setStatusText('Listening — speak now') })
        startSilenceTimer()
      } catch (err) {
        // Never let onresult crash — swallow and log only
        console.error('onresult error (swallowed):', err)
      }
    }

    const makeOnEnd = (currentRec) => () => {
      if (S.micOn && S.mounted && !S.processing) {
        let nextRec
        try {
          nextRec = new SR()
        } catch {
          S.micOn = false
          try { stopLevelTracking() } catch {}
          safe(() => setMicOpen(false))
          return
        }
        nextRec.continuous = false
        nextRec.interimResults = true
        nextRec.lang = 'en-US'
        nextRec.maxAlternatives = 1
        nextRec.onresult = currentRec.onresult
        nextRec.onerror = currentRec.onerror
        nextRec.onend = makeOnEnd(nextRec)
        recRef.current = nextRec
        try { nextRec.start() } catch {}
      }
    }

    rec.onend = makeOnEnd(rec)

    rec.onerror = (e) => {
      if (!S.micOn || !S.mounted) return
      if (!e || e.error === 'no-speech' || e.error === 'aborted') return
      console.error('rec error:', e.error)
    }

    recRef.current = rec
    try {
      rec.start()
    } catch (err) {
      console.error('rec.start failed:', err)
      S.micOn = false
      try { stopLevelTracking() } catch {}
      safe(() => { setMicOpen(false); setError('Could not start mic. Tap to retry.') })
    }
  }

  useEffect(() => {
    state.current.mounted = true

    const begin = () => {
      if (!S.mounted) return
      S.speaking = true
      speakText(opening_message || '', () => {
        S.speaking = false
        setTimeout(() => { if (S.mounted) listenOnce() }, 1000)
      })
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
        if (S.mounted && !S.speaking) begin()
      }, 2000)
    }

    return () => {
      state.current.mounted = false
      state.current.speaking = false
      state.current.processing = false
      state.current.micOn = false
      clearTimeout(state.current.silTimer)
      clearTimeout(state.current.warnTimer)
      try { recRef.current?.stop() } catch {}
      try { stopLevelTracking() } catch {}
      try { window.speechSynthesis.cancel() } catch {}
    }
  }, [])

  const handleMicClick = () => {
    if (S.processing) return
    if (S.speaking || window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel()
      S.speaking = false
      setTimeout(() => { if (S.mounted) listenOnce() }, 400)
      return
    }
    if (S.micOn) {
      const toSend = S.collected
      sendAnswer(toSend)
    } else {
      listenOnce()
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
            ? 'Mic open — sends after 5s silence'
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
