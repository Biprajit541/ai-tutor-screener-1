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
  const smoothedLevel    = useRef(0)
  const speechDetected   = useRef(false)
  const silenceStart     = useRef(null)
  const silenceFired     = useRef(false)

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
    streamRef.current = stream
    activeRef.current = true
    speechDetected.current = false
    silenceStart.current = null
    silenceFired.current = false
    smoothedLevel.current = 0

    const ctx = new AudioContext()
    ctxRef.current = ctx
    const source = ctx.createMediaStreamSource(stream)
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 512
    analyser.smoothingTimeConstant = 0.8
    source.connect(analyser)
    analyserRef.current = analyser

    // Animation frame for visual level only
    const tick = () => {
      if (!activeRef.current) return
      const data = new Uint8Array(analyser.frequencyBinCount)
      analyser.getByteFrequencyData(data)
      const speechBins = Array.from(data).slice(10, 110)
      const raw = speechBins.reduce((a, b) => a + b, 0) / speechBins.length / 128
      smoothedLevel.current = smoothedLevel.current * 0.85 + raw * 0.15
      setAudioLevel(smoothedLevel.current)
      animRef.current = requestAnimationFrame(tick)
    }
    tick()

    // Separate interval for silence detection — not affected by React batching
    intervalRef.current = setInterval(() => {
      if (!activeRef.current) return
      const level = smoothedLevel.current

      if (level > speechThreshold) {
        // Speech detected
        speechDetected.current = true
        silenceStart.current = null
      } else if (speechDetected.current) {
        // Below threshold after speech — start silence timer
        if (silenceStart.current === null) {
          silenceStart.current = Date.now()
        } else {
          const elapsed = Date.now() - silenceStart.current
          if (elapsed >= silenceMs && !silenceFired.current) {
            silenceFired.current = true
            onSilence?.()
          }
        }
      }
    }, 100) // check every 100ms

    chunksRef.current = []
    const mr = new MediaRecorder(stream, { mimeType: 'audio/webm' })
    mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
    mr.start(250)
    mediaRecorderRef.current = mr
    setIsRecording(true)
  }, [onSilence, silenceMs, speechThreshold])

  const stopRecording = useCallback(() => {
    return new Promise((resolve) => {
      if (!activeRef.current && chunksRef.current.length === 0) {
        resolve(null)
        return
      }
      activeRef.current = false
      cancelAnimationFrame(animRef.current)
      clearInterval(intervalRef.current)
      smoothedLevel.current = 0
      speechDetected.current = false
      silenceStart.current = null
      silenceFired.current = false
      setAudioLevel(0)

      const finish = () => {
        streamRef.current?.getTracks().forEach(t => t.stop())
        streamRef.current = null
        try { ctxRef.current?.close() } catch {}
        ctxRef.current = null
        setIsRecording(false)
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
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
