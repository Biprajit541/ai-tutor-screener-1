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
    window.speechSynthesis.cancel()

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

      let resolved = false
      const finish = () => {
        if (resolved) return
        resolved = true
        // 1.2s buffer after speech ends — lets sound fully clear speakers
        // before mic opens
        setTimeout(() => {
          onEnd?.()
          resolve()
        }, 1200)
      }

      utt.onend = finish
      utt.onerror = finish

      // Fallback: if onend never fires (Chrome bug when tab loses focus)
      // estimate duration from word count and resolve anyway
      const wordCount = text.trim().split(/\s+/).length
      const estimatedMs = Math.max((wordCount / 2.5) * 1000 + 2000, 4000)
      setTimeout(finish, estimatedMs)

      window.speechSynthesis.speak(utt)
    }, 150)
  })
}

export const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8000'
