import { useState, useRef, useCallback } from 'react'

export function useAudioRecorder({ onSilence, silenceMs = 4000, speechThreshold = 0.05 } = {}) {
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

  // Always keep onSilence ref current
  onSilenceRef.current = onSilence

  const startRecording = useCallback(async () => {
    if (activeRef.current) return

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false
    })

    streamRef.current      = stream
    activeRef.current      = true
    speechDetected.current = false
    silenceStart.current   = null
    silenceFired.current   = false
    smoothedRef.current    = 0

    const ctx = new AudioContext()
    ctxRef.current = ctx
    const source = ctx.createMediaStreamSource(stream)
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 256
    analyser.smoothingTimeConstant = 0.6  // faster response than before
    source.connect(analyser)
    analyserRef.current = analyser

    // Visual level for orb animation
    const tick = () => {
      if (!activeRef.current) return
      const data = new Uint8Array(analyser.frequencyBinCount)
      analyser.getByteFrequencyData(data)
      const avg = data.reduce((a, b) => a + b, 0) / data.length / 128
      // Light smoothing so orb responds quickly
      smoothedRef.current = smoothedRef.current * 0.7 + avg * 0.3
      setAudioLevel(smoothedRef.current)
      animRef.current = requestAnimationFrame(tick)
    }
    tick()

    // Silence detection — runs every 100ms independent of React
    intervalRef.current = setInterval(() => {
      if (!activeRef.current) return
      const level = smoothedRef.current

      if (level > speechThreshold) {
        // Speech is happening — reset silence tracking
        speechDetected.current = true
        silenceStart.current   = null
        silenceFired.current   = false
      } else {
        // Below threshold
        if (!speechDetected.current) return  // haven't spoken yet, ignore
        if (silenceFired.current) return      // already fired, don't repeat

        if (silenceStart.current === null) {
          // Start counting silence from now
          silenceStart.current = Date.now()
        } else {
          const elapsed = Date.now() - silenceStart.current
          if (elapsed >= silenceMs) {
            // Silence threshold reached — fire callback
            silenceFired.current = true
            try { onSilenceRef.current?.() } catch(e) { console.error('onSilence error:', e) }
          }
        }
      }
    }, 100)

    // MediaRecorder for capturing audio
    chunksRef.current = []
    const mr = new MediaRecorder(stream, { mimeType: 'audio/webm' })
    mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
    mr.start(200)
    mediaRecorderRef.current = mr
    setIsRecording(true)
  }, [silenceMs, speechThreshold])

  const stopRecording = useCallback(() => {
    return new Promise((resolve) => {
      // Stop everything
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
