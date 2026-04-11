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

    // Poll until speechSynthesis is truly idle before starting
    const waitUntilIdle = (cb) => {
      if (!window.speechSynthesis.speaking) { cb(); return }
      setTimeout(() => waitUntilIdle(cb), 100)
    }

    waitUntilIdle(() => {
      const utt = new SpeechSynthesisUtterance(text)

      const voices = window.speechSynthesis.getVoices()
      const preferred = voices.find(v =>
        /female|woman|zira|samantha|karen|moira|victoria|fiona/i.test(v.name)
      ) || voices.find(v => v.lang.startsWith('en')) || voices[0]

      if (preferred) utt.voice = preferred
      utt.rate = 0.92
      utt.pitch = 1.05
      utt.volume = 1

      let finished = false

      const finish = () => {
        if (finished) return
        finished = true

        // Poll until browser confirms speech has truly stopped
        const waitForSilence = () => {
          if (window.speechSynthesis.speaking) {
            setTimeout(waitForSilence, 100)
            return
          }
          // Extra 1.5s after confirmed stopped — clears speaker echo
          setTimeout(() => {
            onEnd?.()
            resolve()
          }, 1500)
        }
        waitForSilence()
      }

      utt.onend = finish
      utt.onerror = finish

      // Fallback timer in case onend never fires
      const wordCount = text.trim().split(/\s+/).length
      const estimatedMs = Math.max((wordCount / 2.5) * 1000 + 3000, 5000)
      setTimeout(finish, estimatedMs)

      window.speechSynthesis.speak(utt)
    })
  })
}

export const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8000'
