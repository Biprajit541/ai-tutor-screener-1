import { useState, useRef, useCallback } from 'react'

export function useAudioRecorder() {
  const [isRecording, setIsRecording] = useState(false)
  const [audioLevel, setAudioLevel]   = useState(0)

  const mediaRecorderRef = useRef(null)
  const chunksRef        = useRef([])
  const streamRef        = useRef(null)
  const ctxRef           = useRef(null)
  const analyserRef      = useRef(null) // exposed so InterviewScreen can read it directly
  const animRef          = useRef(null)
  const activeRef        = useRef(false)

  const startRecording = useCallback(async () => {
    if (activeRef.current) return

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: false
    })

    streamRef.current = stream
    activeRef.current = true

    const ctx = new AudioContext()
    ctxRef.current = ctx
    const source = ctx.createMediaStreamSource(stream)
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 256
    analyser.smoothingTimeConstant = 0.3
    source.connect(analyser)
    analyserRef.current = analyser // store so it can be read externally

    // Animation frame just for the orb visual
    const tick = () => {
      if (!activeRef.current) return
      const data = new Uint8Array(analyser.frequencyBinCount)
      analyser.getByteFrequencyData(data)
      const avg = data.reduce((a, b) => a + b, 0) / data.length / 128
      setAudioLevel(avg)
      animRef.current = requestAnimationFrame(tick)
    }
    tick()

    chunksRef.current = []
    const mr = new MediaRecorder(stream, { mimeType: 'audio/webm' })
    mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
    mr.start(200)
    mediaRecorderRef.current = mr
    setIsRecording(true)
  }, [])

  const stopRecording = useCallback(() => {
    return new Promise((resolve) => {
      activeRef.current = false
      cancelAnimationFrame(animRef.current)
      analyserRef.current = null
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

  // Expose analyser so InterviewScreen can read raw levels directly
  return { isRecording, audioLevel, analyserRef, startRecording, stopRecording }
}
