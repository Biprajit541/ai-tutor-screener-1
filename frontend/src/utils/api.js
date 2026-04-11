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

export function speakText(text, onEnd) {
  return new Promise((resolve) => {
    // Cancel anything currently playing
    window.speechSynthesis.cancel()

    // Small pause after cancel before speaking
    setTimeout(() => {
      const utt = new SpeechSynthesisUtterance(text)

      const voices = window.speechSynthesis.getVoices()
      const preferred = voices.find(v =>
        /female|woman|zira|samantha|karen|moira|victoria|fiona/i.test(v.name)
      ) || voices.find(v => v.lang.startsWith('en')) || voices[0]

      if (preferred) utt.voice = preferred
      utt.rate = 0.92
      utt.pitch = 1.05
      utt.volume = 1

      utt.onend = () => {
        // Wait 1.2 seconds after speech ends before calling onEnd
        // This ensures the sound fully clears the speakers before mic opens
        setTimeout(() => {
          onEnd?.()
          resolve()
        }, 1200)
      }

      utt.onerror = () => {
        setTimeout(() => {
          onEnd?.()
          resolve()
        }, 1200)
      }

      window.speechSynthesis.speak(utt)

      // Chrome bug: sometimes onend never fires if tab loses focus
      // Fallback: estimate duration and resolve anyway
      const wordCount = text.split(' ').length
      const estimatedMs = (wordCount / 2.5) * 1000 + 3000 // ~2.5 words/sec + buffer
      setTimeout(() => {
        if (window.speechSynthesis.speaking) return // still speaking, let onend handle it
        onEnd?.()
        resolve()
      }, estimatedMs)

    }, 150)
  })
}

export function createSpeechRecognizer(onResult, onEnd, onError) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition
  if (!SR) { onError('Speech recognition not supported. Please use Chrome.'); return null }
  const rec = new SR()
  rec.continuous = false
  rec.interimResults = true
  rec.lang = 'en-US'
  rec.onresult = (e) => {
    let interim = '', final = ''
    for (const r of e.results) {
      if (r.isFinal) final += r[0].transcript
      else interim += r[0].transcript
    }
    onResult(final || interim, !!final)
  }
  rec.onend = onEnd
  rec.onerror = (e) => onError(e.error)
  return rec
}

export const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8000'
