import { useState, useRef, useCallback } from 'react'

export function useAudioRecorder({ onSilence, silenceMs = 2500, speechThreshold = 0.08 } = {}) {
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
  const smoothedRef      = useRef(0)
  const speechDetected   = useRef(false)
  const silenceStart     = useRef(null)
  const silenceFired     = useRef(false)
  const onSilenceRef     = useRef(onSilence)

  // Keep onSilence ref current without causing re-renders
  onSilenceRef.current = onSilence

  const startRecording = useCallback(async () => {
    if (activeRef.current) return

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: 16000
      },
      video: false
    })

    streamRef.current    = stream
    activeRef.current    = true
    speechDetected.current = false
    silenceStart.current = null
    silenceFired.current = false
    smoothedRef.current  = 0

    const ctx = new AudioContext()
    ctxRef.current = ctx
    const source = ctx.createMediaStreamSource(stream)
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 512
    analyser.smoothingTimeConstant = 0.8
    source.connect(analyser)
    analyserRef.current = analyser

    // Visual level via requestAnimationFrame
    const tick = () => {
      if (!activeRef.current) return
      const data = new Uint8Array(analyser.frequencyBinCount)
      analyser.getByteFrequencyData(data)
      // Speech frequency bins only (300Hz-3400Hz)
      const bins = Array.from(data).slice(10, 110)
      const raw = bins.reduce((a, b) => a + b, 0) / bins.length / 128
      smoothedRef.current = smoothedRef.current * 0.85 + raw * 0.15
      setAudioLevel(smoothedRef.current)
      animRef.current = requestAnimationFrame(tick)
    }
    tick()

    // Silence detection via setInterval — independent of React renders
    intervalRef.current = setInterval(() => {
      if (!activeRef.current) return
      const level = smoothedRef.current

      if (level > speechThreshold) {
        speechDetected.current = true
        silenceStart.current   = null
        silenceFired.current   = false
      } else if (speechDetected.current && !silenceFired.current) {
        if (silenceStart.current === null) {
          silenceStart.current = Date.now()
        } else if (Date.now() - silenceStart.current >= silenceMs) {
          silenceFired.current = true
          try { onSilenceRef.current?.() } catch(e) { console.error(e) }
        }
      }
    }, 100)

    chunksRef.current = []
    const mr = new MediaRecorder(stream, { mimeType: 'audio/webm' })
    mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
    mr.start(250)
    mediaRecorderRef.current = mr
    setIsRecording(true)
  }, [silenceMs, speechThreshold])

  const stopRecording = useCallback(() => {
    return new Promise((resolve) => {
      activeRef.current      = false
      speechDetected.current = false
      silenceStart.current   = null
      silenceFired.current   = false

      cancelAnimationFrame(animRef.current)
      clearInterval(intervalRef.current)
      smoothedRef.current = 0
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
