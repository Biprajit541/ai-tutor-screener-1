import { useState, useRef, useCallback } from 'react'

export function useAudioRecorder() {
  const [isRecording, setIsRecording] = useState(false)
  const [audioLevel, setAudioLevel]   = useState(0)

  const mediaRecorderRef = useRef(null)
  const chunksRef        = useRef([])
  const streamRef        = useRef(null)
  const ctxRef           = useRef(null)
  const analyserRef      = useRef(null)
  const animRef          = useRef(null)
  const activeRef        = useRef(false)
  const smoothedLevel    = useRef(0)

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

    const ctx = new AudioContext()
    ctxRef.current = ctx
    const source = ctx.createMediaStreamSource(stream)
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 512
    analyser.smoothingTimeConstant = 0.8
    source.connect(analyser)
    analyserRef.current = analyser
    smoothedLevel.current = 0

    const tick = () => {
      if (!activeRef.current) return
      const data = new Uint8Array(analyser.frequencyBinCount)
      analyser.getByteFrequencyData(data)

      // Only measure speech frequencies (300Hz-3400Hz)
      // bin width = sampleRate / fftSize = 16000 / 512 = 31.25Hz
      // speech range = bins 10 to 109
      const speechBins = Array.from(data).slice(10, 110)
      const raw = speechBins.reduce((a, b) => a + b, 0) / speechBins.length / 128

      // Exponential smoothing prevents brief noise spikes from triggering
      smoothedLevel.current = smoothedLevel.current * 0.85 + raw * 0.15
      setAudioLevel(smoothedLevel.current)

      animRef.current = requestAnimationFrame(tick)
    }
    tick()

    chunksRef.current = []
    const mr = new MediaRecorder(stream, { mimeType: 'audio/webm' })
    mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
    mr.start(250)
    mediaRecorderRef.current = mr
    setIsRecording(true)
  }, [])

  const stopRecording = useCallback(() => {
    return new Promise((resolve) => {
      if (!activeRef.current && chunksRef.current.length === 0) {
        resolve(null)
        return
      }
      activeRef.current = false
      cancelAnimationFrame(animRef.current)
      smoothedLevel.current = 0
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
