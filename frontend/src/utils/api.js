const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export async function startSession(candidateName) {
  const res = await fetch(`${API_URL}/session/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ candidate_name: candidateName })
  })
  if (!res.ok) throw new Error('Failed to start session')
  return res.json()
}

export async function transcribeAudio(audioBlob) {
  const formData = new FormData()
  formData.append('audio', audioBlob, 'recording.webm')
  const res = await fetch(`${API_URL}/transcribe`, {
    method: 'POST',
    body: formData
  })
  if (!res.ok) throw new Error('Transcription failed')
  return res.json()
}

export async function sendChatMessage(sessionId, userMessage) {
  const res = await fetch(`${API_URL}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, user_message: userMessage })
  })
  if (!res.ok) throw new Error('Chat failed')
  return res.json()
}

export async function assessCandidate(sessionId) {
  const res = await fetch(`${API_URL}/assess`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId })
  })
  if (!res.ok) throw new Error('Assessment failed')
  return res.json()
}

export async function speakText(text, onEnd) {
  try {
    const res = await fetch(`${API_URL}/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    })
    if (!res.ok) throw new Error('TTS failed')
    const { audio_b64 } = await res.json()
    const audio = new Audio(`data:audio/mp3;base64,${audio_b64}`)
    return new Promise((resolve) => {
      audio.onended = () => { setTimeout(() => { try { onEnd?.() } catch {} resolve(audio) }, 300) }
      audio.onerror = () => { try { onEnd?.() } catch {} resolve(null) }
      audio.play().catch(() => { try { onEnd?.() } catch {} resolve(null) })
    })
  } catch (err) {
    console.error('speakText error:', err)
    try { onEnd?.() } catch {}
    return null
  }
}
