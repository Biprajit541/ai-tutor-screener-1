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

// ── Browser TTS — free, works everywhere, no server needed ───────────────────
let currentUtterance = null

export function stopSpeaking() {
  try { window.speechSynthesis.cancel() } catch {}
  currentUtterance = null
}

export function speakText(text) {
  return new Promise((resolve) => {
    stopSpeaking()

    // Small delay so cancel() takes effect
    setTimeout(() => {
      const utt = new SpeechSynthesisUtterance(text)

      // Pick best available voice
      const voices = window.speechSynthesis.getVoices()
      const preferred = (
        voices.find(v => v.name.includes('Samantha')) ||
        voices.find(v => v.name.includes('Karen')) ||
        voices.find(v => v.name.includes('Zira')) ||
        voices.find(v => v.name.includes('Jenny')) ||
        voices.find(v => v.lang === 'en-US' && v.localService) ||
        voices.find(v => v.lang.startsWith('en') && v.localService) ||
        voices.find(v => v.lang.startsWith('en')) ||
        voices[0]
      )

      if (preferred) utt.voice = preferred
      utt.rate   = 0.88
      utt.pitch  = 1.05
      utt.volume = 1

      let resolved = false
      const done = () => {
        if (resolved) return
        resolved = true
        currentUtterance = null
        // 600ms gap after speech before mic opens
        setTimeout(resolve, 600)
      }

      utt.onend   = done
      utt.onerror = (e) => {
        console.error('TTS error:', e)
        done()
      }

      // Fallback — estimate word duration + buffer
      const words = text.trim().split(/\s+/).length
      const estimatedMs = Math.max((words / 2.2) * 1000 + 1000, 3000)
      setTimeout(done, estimatedMs)

      currentUtterance = utt
      try {
        window.speechSynthesis.speak(utt)
      } catch (e) {
        console.error('speak() error:', e)
        done()
      }
    }, 100)
  })
}

// Chrome bug: speechSynthesis pauses after ~15s in background tabs
// Keep it alive with a periodic resume
setInterval(() => {
  if (window.speechSynthesis.speaking) {
    window.speechSynthesis.pause()
    window.speechSynthesis.resume()
  }
}, 10000)
