import { useEffect, useRef, useCallback } from 'react'
import { WS_URL } from '../utils/api'

export function useWebSocket(sessionId, onMessage) {
  const wsRef = useRef(null)
  const pingRef = useRef(null)

  useEffect(() => {
    if (!sessionId) return
    const ws = new WebSocket(`${WS_URL}/ws/${sessionId}`)
    wsRef.current = ws

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        onMessage(data)
      } catch {}
    }

    // Keep-alive ping
    pingRef.current = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.send('ping')
    }, 20000)

    return () => {
      clearInterval(pingRef.current)
      ws.close()
    }
  }, [sessionId])
}