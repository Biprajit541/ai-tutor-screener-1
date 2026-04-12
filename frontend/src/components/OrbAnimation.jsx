import React, { useEffect, useRef } from 'react'

export default function OrbAnimation({ state, audioLevel = 0 }) {
  const canvasRef = useRef(null)
  const frameRef  = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx    = canvas.getContext('2d')
    const SIZE   = 200
    canvas.width  = SIZE
    canvas.height = SIZE
    const cx = SIZE / 2
    const cy = SIZE / 2

    const colors = {
      idle:      ['#7c6ff7', '#5b4bd8', '#9c8ffa'],
      listening: ['#6ff7b8', '#3dd68f', '#a8ffd8'],
      thinking:  ['#f7a26f', '#e07b3a', '#ffc49a'],
      speaking:  ['#7c6ff7', '#f7a26f', '#6ff7b8'],
    }

    let t = 0
    const draw = () => {
      t += 0.016
      ctx.clearRect(0, 0, SIZE, SIZE)
      const cols  = colors[state] || colors.idle
      const boost = state === 'listening' ? audioLevel * 24 : 0
      const baseR = 64 + boost * 0.5

      for (let i = 3; i >= 1; i--) {
        const r    = baseR + i * 18 + boost * 0.2
        const grad = ctx.createRadialGradient(cx, cy, r * 0.4, cx, cy, r)
        grad.addColorStop(0, cols[0] + '30')
        grad.addColorStop(1, 'transparent')
        ctx.beginPath()
        ctx.arc(cx, cy, r, 0, Math.PI * 2)
        ctx.fillStyle = grad
        ctx.fill()
      }

      ctx.save()
      ctx.translate(cx, cy)
      ctx.beginPath()
      const pts = 7
      for (let i = 0; i <= pts * 2; i++) {
        const angle = (i / pts) * Math.PI
        const spd   = state === 'speaking' ? 3.2 : 1.6
        const noise = Math.sin(i * 2.3 + t * spd) * (7 + boost)
                    + Math.cos(i * 1.7 + t * 2.0) * (3 + boost * 0.4)
        const r = baseR + noise
        const x = r * Math.cos(angle)
        const y = r * Math.sin(angle)
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
      }
      ctx.closePath()
      const bg = ctx.createRadialGradient(-18, -18, 8, 0, 0, baseR + 24)
      bg.addColorStop(0, cols[2])
      bg.addColorStop(0.5, cols[0])
      bg.addColorStop(1, cols[1])
      ctx.fillStyle = bg
      ctx.fill()
      ctx.restore()

      const shine = ctx.createRadialGradient(cx - 18, cy - 18, 3, cx, cy, baseR)
      shine.addColorStop(0, 'rgba(255,255,255,0.2)')
      shine.addColorStop(1, 'transparent')
      ctx.beginPath()
      ctx.arc(cx, cy, baseR, 0, Math.PI * 2)
      ctx.fillStyle = shine
      ctx.fill()

      if (state === 'speaking') {
        for (let i = 0; i < 10; i++) {
          const angle = (i / 10) * Math.PI * 2 - Math.PI / 2
          const h  = 8 + Math.sin(t * 5 + i * 0.9) * 9 + Math.cos(t * 3 + i) * 4
          const r1 = baseR + 6
          const r2 = r1 + h
          ctx.beginPath()
          ctx.moveTo(cx + Math.cos(angle) * r1, cy + Math.sin(angle) * r1)
          ctx.lineTo(cx + Math.cos(angle) * r2, cy + Math.sin(angle) * r2)
          ctx.strokeStyle = cols[0] + 'bb'
          ctx.lineWidth   = 2.5
          ctx.lineCap     = 'round'
          ctx.stroke()
        }
      }

      if (state === 'listening') {
        ctx.save()
        ctx.translate(cx, cy)
        const p = 1 + Math.sin(t * 4) * 0.06
        ctx.scale(p, p)
        ctx.fillStyle = 'rgba(255,255,255,0.88)'
        ctx.beginPath()
        ctx.roundRect(-6, -16, 12, 20, 6)
        ctx.fill()
        ctx.beginPath()
        ctx.arc(0, 4, 11, 0, Math.PI)
        ctx.strokeStyle = 'rgba(255,255,255,0.88)'
        ctx.lineWidth = 2.5
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(0, 15)
        ctx.lineTo(0, 21)
        ctx.strokeStyle = 'rgba(255,255,255,0.88)'
        ctx.lineWidth = 2.5
        ctx.stroke()
        ctx.restore()
      }

      if (state === 'thinking') {
        for (let i = 0; i < 3; i++) {
          const angle  = (t * 2 + (i * Math.PI * 2) / 3)
          const dotR   = baseR - 12
          const x = cx + Math.cos(angle) * dotR
          const y = cy + Math.sin(angle) * dotR
          const alpha  = 0.4 + Math.sin(t * 3 + i) * 0.4
          ctx.beginPath()
          ctx.arc(x, y, 4, 0, Math.PI * 2)
          ctx.fillStyle = `rgba(247,162,111,${alpha})`
          ctx.fill()
        }
      }

      frameRef.current = requestAnimationFrame(draw)
    }

    frameRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frameRef.current)
  }, [state, audioLevel])

  return (
    <div style={{
      width: 200, height: 200,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      animation: 'float 4s ease-in-out infinite'
    }}>
      <canvas ref={canvasRef} />
    </div>
  )
}
