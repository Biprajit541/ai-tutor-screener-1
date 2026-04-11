import React, { useEffect, useRef } from 'react'

export default function OrbAnimation({ state, audioLevel = 0 }) {
  // state: 'idle' | 'listening' | 'thinking' | 'speaking'
  const canvasRef = useRef(null)
  const frameRef = useRef(null)
  const timeRef = useRef(0)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const SIZE = 240
    canvas.width = SIZE
    canvas.height = SIZE
    const cx = SIZE / 2
    const cy = SIZE / 2

    const colors = {
      idle:      ['#7c6ff7', '#5b4bd8', '#9c8ffa'],
      listening: ['#6ff7b8', '#3dd68f', '#a8ffd8'],
      thinking:  ['#f7a26f', '#e07b3a', '#ffc49a'],
      speaking:  ['#7c6ff7', '#f7a26f', '#6ff7b8'],
    }

    function draw(t) {
      ctx.clearRect(0, 0, SIZE, SIZE)
      const cols = colors[state] || colors.idle
      const boost = state === 'listening' ? audioLevel * 28 : 0
      const baseR = 72 + boost * 0.5

      // Outer glow rings
      for (let i = 3; i >= 1; i--) {
        const r = baseR + i * 22 + boost * 0.3
        const alpha = (0.08 - i * 0.02) + (state === 'speaking' ? Math.sin(t * 4 + i) * 0.03 : 0)
        const grad = ctx.createRadialGradient(cx, cy, r * 0.5, cx, cy, r)
        grad.addColorStop(0, cols[0] + '40')
        grad.addColorStop(1, 'transparent')
        ctx.beginPath()
        ctx.arc(cx, cy, r, 0, Math.PI * 2)
        ctx.fillStyle = grad
        ctx.fill()
      }

      // Morphing blob
      ctx.save()
      ctx.translate(cx, cy)
      const points = 7
      ctx.beginPath()
      for (let i = 0; i <= points * 2; i++) {
        const angle = (i / points) * Math.PI
        const noise = Math.sin(i * 2.3 + t * (state === 'speaking' ? 3.5 : 1.8)) * (8 + boost)
                    + Math.cos(i * 1.7 + t * 2.1) * (4 + boost * 0.5)
        const r = baseR + noise
        const x = r * Math.cos(angle)
        const y = r * Math.sin(angle)
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
      }
      ctx.closePath()

      const blobGrad = ctx.createRadialGradient(-20, -20, 10, 0, 0, baseR + 30)
      blobGrad.addColorStop(0, cols[2])
      blobGrad.addColorStop(0.5, cols[0])
      blobGrad.addColorStop(1, cols[1])
      ctx.fillStyle = blobGrad
      ctx.fill()
      ctx.restore()

      // Inner shine
      const shineGrad = ctx.createRadialGradient(cx - 22, cy - 22, 4, cx, cy, baseR)
      shineGrad.addColorStop(0, 'rgba(255,255,255,0.22)')
      shineGrad.addColorStop(1, 'transparent')
      ctx.beginPath()
      ctx.arc(cx, cy, baseR, 0, Math.PI * 2)
      ctx.fillStyle = shineGrad
      ctx.fill()

      // Waveform bars when speaking
      if (state === 'speaking') {
        for (let i = 0; i < 12; i++) {
          const angle = (i / 12) * Math.PI * 2 - Math.PI / 2
          const barH = 10 + Math.sin(t * 5 + i * 0.8) * 10 + Math.cos(t * 3 + i) * 5
          const r1 = baseR + 8
          const r2 = r1 + barH
          const x1 = cx + Math.cos(angle) * r1
          const y1 = cy + Math.sin(angle) * r1
          const x2 = cx + Math.cos(angle) * r2
          const y2 = cy + Math.sin(angle) * r2
          ctx.beginPath()
          ctx.moveTo(x1, y1)
          ctx.lineTo(x2, y2)
          ctx.strokeStyle = cols[0] + 'cc'
          ctx.lineWidth = 2.5
          ctx.lineCap = 'round'
          ctx.stroke()
        }
      }

      // Mic icon when listening
      if (state === 'listening') {
        ctx.save()
        ctx.translate(cx, cy)
        const pulse = 1 + Math.sin(t * 4) * 0.06
        ctx.scale(pulse, pulse)
        ctx.fillStyle = 'rgba(255,255,255,0.9)'
        // Simple mic shape
        ctx.beginPath()
        ctx.roundRect(-7, -18, 14, 22, 7)
        ctx.fill()
        ctx.beginPath()
        ctx.arc(0, 4, 13, 0, Math.PI)
        ctx.strokeStyle = 'rgba(255,255,255,0.9)'
        ctx.lineWidth = 3
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(0, 17)
        ctx.lineTo(0, 24)
        ctx.strokeStyle = 'rgba(255,255,255,0.9)'
        ctx.lineWidth = 3
        ctx.stroke()
        ctx.restore()
      }
    }

    const animate = (ts) => {
      timeRef.current = ts * 0.001
      draw(timeRef.current)
      frameRef.current = requestAnimationFrame(animate)
    }
    frameRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(frameRef.current)
  }, [state, audioLevel])

  return (
    <div style={{
      position: 'relative',
      width: 240,
      height: 240,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      animation: 'float 4s ease-in-out infinite'
    }}>
      <canvas ref={canvasRef} style={{ borderRadius: '50%' }} />
    </div>
  )
}