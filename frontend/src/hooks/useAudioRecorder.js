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

  const startRecording = useCallback(async () => {
    if (activeRef.current) return

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
    streamRef.current = stream
    activeRef.current = true

    const ctx = new AudioContext()
    ctxRef.current = ctx
    const source = ctx.createMediaStreamSource(stream)
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 512
    analyser.smoothingTimeConstant = 0.3
    source.connect(analyser)
    analyserRef.current = analyser

    const tick = () => {
      if (!activeRef.current) return
      const data = new Uint8Array(analyser.frequencyBinCount)
      analyser.getByteFrequencyData(data)
      const avg = data.reduce((a, b) => a + b, 0) / data.length
      setAudioLevel(avg / 128)
      animRef.current = requestAnimationFrame(tick)
    }
    tick()

    chunksRef.current = []
    const mr = new MediaRecorder(stream, { mimeType: 'audio/webm' })
    mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
    mr.start(250) // collect chunks every 250ms
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
