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
    try { window.speechSynthesis.cancel() } catch {}

    const go = () => {
      const utt = new SpeechSynthesisUtterance(text)
      const voices = window.speechSynthesis.getVoices()
      const preferred = voices.find(v =>
        /female|woman|zira|samantha|karen|moira|victoria|fiona/i.test(v.name)
      ) || voices.find(v => v.lang.startsWith('en')) || voices[0]
      if (preferred) utt.voice = preferred
      utt.rate = 0.92
      utt.pitch = 1.05
      utt.volume = 1

      let done = false
      const finish = () => {
        if (done) return
        done = true
        // 300ms after speech ends — just enough to avoid echo, no noticeable delay
        setTimeout(() => { try { onEnd?.() } catch {} resolve() }, 300)
      }

      utt.onend = finish
      utt.onerror = finish

      // Fallback if onend never fires (Chrome background tab bug)
      const words = text.trim().split(/\s+/).length
      const ms = Math.max((words / 2.5) * 1000 + 1500, 3000)
      setTimeout(finish, ms)

      try { window.speechSynthesis.speak(utt) } catch { finish() }
    }

    // Wait for synthesis to be idle before starting
    if (!window.speechSynthesis.speaking) {
      go()
    } else {
      const wait = setInterval(() => {
        if (!window.speechSynthesis.speaking) { clearInterval(wait); go() }
      }, 100)
    }
  })
}

export const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8000'
