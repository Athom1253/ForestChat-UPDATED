import { useEffect, useRef } from 'react'
import { useAuthStore } from '@/stores/auth'

export function AnimatedBackground() {
  const { settings } = useAuthStore()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef<number>(0)

  useEffect(() => {
    const bg = settings?.animated_background || 'fireflies'
    const reduced = settings?.reduced_motion

    if (reduced) {
      return
    }

    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let particles: Particle[] = []
    let width = 0
    let height = 0

    const resize = () => {
      width = canvas.width = window.innerWidth
      height = canvas.height = window.innerHeight
      initParticles()
    }

    interface Particle {
      x: number
      y: number
      vx: number
      vy: number
      size: number
      opacity: number
      angle: number
      color: string
      phase: number
    }

    const initParticles = () => {
      const count = bg === 'particles' ? 60 : bg === 'stars' ? 100 : 40
      particles = []
      for (let i = 0; i < count; i++) {
        particles.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: (Math.random() - 0.5) * 0.5,
          vy: (Math.random() - 0.5) * 0.5,
          size: Math.random() * 3 + 1,
          opacity: Math.random() * 0.5 + 0.2,
          angle: Math.random() * Math.PI * 2,
          color: getParticleColor(bg),
          phase: Math.random() * Math.PI * 2,
        })
      }
    }

    const getParticleColor = (bg: string): string => {
      switch (bg) {
        case 'fireflies': return '#4ade80'
        case 'stars': return '#ffffff'
        case 'snow': return '#ffffff'
        case 'rain': return '#7dd3fc'
        case 'leaves': return ['#f97316', '#eab308', '#22c55e', '#dc2626'][Math.floor(Math.random() * 4)]
        case 'particles': return '#6366f1'
        case 'waves': return '#0ea5e9'
        case 'gradients': return '#a78bfa'
        default: return '#4ade80'
      }
    }

    const draw = () => {
      ctx.clearRect(0, 0, width, height)

      if (bg === 'gradients') {
        const grad = ctx.createRadialGradient(
          width / 2 + Math.sin(Date.now() / 5000) * 200,
          height / 2 + Math.cos(Date.now() / 4000) * 150,
          0,
          width / 2,
          height / 2,
          Math.max(width, height) / 1.5,
        )
        grad.addColorStop(0, 'rgba(99, 102, 241, 0.08)')
        grad.addColorStop(0.5, 'rgba(139, 92, 246, 0.04)')
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)')
        ctx.fillStyle = grad
        ctx.fillRect(0, 0, width, height)
      } else if (bg === 'waves') {
        ctx.strokeStyle = 'rgba(14, 165, 233, 0.15)'
        ctx.lineWidth = 2
        for (let i = 0; i < 3; i++) {
          ctx.beginPath()
          const offset = Date.now() / 2000 + i * 2
          for (let x = 0; x <= width; x += 10) {
            const y = height / 2 + Math.sin(x / 100 + offset) * 50 + i * 80
            if (x === 0) ctx.moveTo(x, y)
            else ctx.lineTo(x, y)
          }
          ctx.stroke()
        }
      } else {
        particles.forEach((p) => {
          if (bg === 'rain') {
            p.y += 8
            p.x += p.vx
            if (p.y > height) { p.y = -10; p.x = Math.random() * width }
            ctx.strokeStyle = `rgba(125, 211, 252, ${p.opacity})`
            ctx.lineWidth = 1
            ctx.beginPath()
            ctx.moveTo(p.x, p.y)
            ctx.lineTo(p.x + p.vx * 2, p.y + 15)
            ctx.stroke()
          } else if (bg === 'snow') {
            p.y += 0.8
            p.x += Math.sin(p.phase) * 0.5
            p.phase += 0.01
            if (p.y > height) { p.y = -10; p.x = Math.random() * width }
            ctx.fillStyle = `rgba(255, 255, 255, ${p.opacity})`
            ctx.beginPath()
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
            ctx.fill()
          } else if (bg === 'leaves') {
            p.x += Math.sin(p.phase) * 0.8
            p.y += 0.5
            p.phase += 0.02
            p.angle += 0.02
            if (p.y > height) { p.y = -10; p.x = Math.random() * width }
            ctx.save()
            ctx.translate(p.x, p.y)
            ctx.rotate(p.angle)
            ctx.fillStyle = p.color
            ctx.globalAlpha = p.opacity
            ctx.beginPath()
            ctx.ellipse(0, 0, p.size * 2, p.size, 0, 0, Math.PI * 2)
            ctx.fill()
            ctx.restore()
          } else if (bg === 'stars') {
            p.opacity = (Math.sin(p.phase) + 1) / 2 * 0.8 + 0.2
            p.phase += 0.02
            ctx.fillStyle = `rgba(255, 255, 255, ${p.opacity})`
            ctx.beginPath()
            ctx.arc(p.x, p.y, p.size * 0.5, 0, Math.PI * 2)
            ctx.fill()
          } else if (bg === 'fireflies') {
            p.opacity = (Math.sin(p.phase) + 1) / 2 * 0.6 + 0.1
            p.phase += 0.03
            p.x += p.vx
            p.y += p.vy
            if (p.x < 0 || p.x > width) p.vx *= -1
            if (p.y < 0 || p.y > height) p.vy *= -1
            ctx.fillStyle = `rgba(74, 222, 128, ${p.opacity})`
            ctx.shadowBlur = 10
            ctx.shadowColor = '#4ade80'
            ctx.beginPath()
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
            ctx.fill()
            ctx.shadowBlur = 0
          } else {
            // particles
            p.x += p.vx
            p.y += p.vy
            if (p.x < 0 || p.x > width) p.vx *= -1
            if (p.y < 0 || p.y > height) p.vy *= -1
            ctx.fillStyle = `rgba(99, 102, 241, ${p.opacity})`
            ctx.beginPath()
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
            ctx.fill()
          }
        })
      }

      animationRef.current = requestAnimationFrame(draw)
    }

    resize()
    window.addEventListener('resize', resize)
    draw()

    return () => {
      window.removeEventListener('resize', resize)
      cancelAnimationFrame(animationRef.current)
    }
  }, [settings?.animated_background, settings?.reduced_motion])

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 -z-10 pointer-events-none"
      style={{ width: '100vw', height: '100vh' }}
    />
  )
}
