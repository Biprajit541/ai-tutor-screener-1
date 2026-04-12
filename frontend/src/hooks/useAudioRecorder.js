import { useState, useRef, useCallback } from 'react'

export function useAudioRecorder({ onSilence, silenceMs = 4000 } = {}) {
  const [isRecording, setIsRecording] = useState(false)
  const [audioLevel, setAudioLevel]   = useState(0)

  const mediaRecorderRef = useRef(null)
  const chunksRef        = useRef([])
  const streamRef        = useRef(null)
  const ctxRef           = useRef(null)
  const analyserRef      = useRef(null)
  const animRef          = useRef(null)
  const intervalRef      = useRef(null)
  const activeRef        = useRef(false)
  const lastSpeechTime   = useRef(null)
  const hasSpeech        = useRef(false)
  const firedRef         = useRef(false)
  const onSilenceRef     = useRef(onSilence)
  onSilenceRef.current   = onSilence

  const startRecording = useCallback(async () => {
    if (activeRef.current) return

    // Request mic WITHOUT noise processing so levels are natural
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: false
    })

    streamRef.current    = stream
    activeRef.current    = true
    lastSpeechTime.current = null
    hasSpeech.current    = false
    firedRef.current     = false

    const ctx = new AudioContext()
    ctxRef.current = ctx
    const source = ctx.createMediaStreamSource(stream)
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 256
    analyser.smoothingTimeConstant = 0.5
    source.connect(analyser)
    analyserRef.current = analyser

    // Animation frame — just for the orb visual
    const tick = () => {
      if (!activeRef.current) return
      const data = new Uint8Array(analyser.frequencyBinCount)
      analyser.getByteFrequencyData(data)
      const avg = data.reduce((a, b) => a + b, 0) / data.length / 128
      setAudioLevel(avg)
      animRef.current = requestAnimationFrame(tick)
    }
    tick()

    // Silence detection — every 200ms
    // Any audio above 0.01 counts as speech (very low threshold)
    // After speech has been detected, if 4s passes with nothing → fire
    intervalRef.current = setInterval(() => {
      if (!activeRef.current || firedRef.current) return

      const data = new Uint8Array(analyser.frequencyBinCount)
      analyser.getByteFrequencyData(data)
      const avg = data.reduce((a, b) => a + b, 0) / data.length / 128

      const THRESHOLD = 0.01 // extremely low — catches even quiet speech

      if (avg > THRESHOLD) {
        // Sound detected — update last speech time
        lastSpeechTime.current = Date.now()
        hasSpeech.current = true
      } else if (hasSpeech.current && lastSpeechTime.current) {
        // We had speech before — check how long silence has been
        const silentFor = Date.now() - lastSpeechTime.current
        if (silentFor >= silenceMs) {
          firedRef.current = true
          console.log(`Auto-send triggered after ${silentFor}ms silence`)
          try { onSilenceRef.current?.() } catch(e) { console.error(e) }
        }
      }
    }, 200)

    // MediaRecorder
    chunksRef.current = []
    const mr = new MediaRecorder(stream, { mimeType: 'audio/webm' })
    mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
    mr.start(200)
    mediaRecorderRef.current = mr
    setIsRecording(true)
  }, [silenceMs])

  const stopRecording = useCallback(() => {
    return new Promise((resolve) => {
      activeRef.current      = false
      hasSpeech.current      = false
      lastSpeechTime.current = null
      firedRef.current       = false

      cancelAnimationFrame(animRef.current)
      clearInterval(intervalRef.current)
      setAudioLevel(0)

      const finish = () => {
        streamRef.current?.getTracks().forEach(t => t.stop())
        streamRef.current = null
        try { ctxRef.current?.close() } catch {}
        ctxRef.current = null
        setIsRecording(false)
        const blob = chunksRef.current.length > 0
          ? new Blob(chunksRef.current, { type: 'audio/webm' })
          : null
        chunksRef.current = []
        resolve(blob)
      }

      const mr = mediaRecorderRef.current
      if (mr && mr.state !== 'inactive') {
        mr.onstop = finish
        try { mr.stop() } catch { finish() }
      } else {
        finish()
      }
    })
  }, [])

  return { isRecording, audioLevel, startRecording, stopRecording }
}
