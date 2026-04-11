import { useState, useRef, useCallback } from 'react'

export function useAudioRecorder() {
  const [audioLevel, setAudioLevel] = useState(0)
  const animFrameRef = useRef(null)
  const streamRef = useRef(null)
  const ctxRef = useRef(null)
  const analyserRef = useRef(null)
  const activeRef = useRef(false)

  const startLevelTracking = useCallback(async () => {
    if (activeRef.current) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      // Reuse existing AudioContext if possible — never close and recreate
      if (!ctxRef.current || ctxRef.current.state === 'closed') {
        ctxRef.current = new AudioContext()
      }
      if (ctxRef.current.state === 'suspended') {
        await ctxRef.current.resume()
      }

      const source = ctxRef.current.createMediaStreamSource(stream)
      const analyser = ctxRef.current.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)
      analyserRef.current = analyser
      activeRef.current = true

      const tick = () => {
        if (!activeRef.current) return
        const data = new Uint8Array(analyser.frequencyBinCount)
        analyser.getByteFrequencyData(data)
        const avg = data.reduce((a, b) => a + b, 0) / data.length
        setAudioLevel(avg / 128)
        animFrameRef.current = requestAnimationFrame(tick)
      }
      tick()
    } catch (err) {
      throw err
    }
  }, [])

  const stopLevelTracking = useCallback(() => {
    activeRef.current = false
    cancelAnimationFrame(animFrameRef.current)
    // Stop mic stream tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    // Suspend context instead of closing — avoids InvalidStateError on reuse
    if (ctxRef.current && ctxRef.current.state === 'running') {
      ctxRef.current.suspend().catch(() => {})
    }
    setAudioLevel(0)
  }, [])

  return { audioLevel, startLevelTracking, stopLevelTracking }
}
