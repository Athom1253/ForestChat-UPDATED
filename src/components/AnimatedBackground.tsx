import { useEffect, useRef, useCallback } from 'react'
import type { AnimationTheme, AnimationIntensity, AnimationSpeed } from '../lib/store'

interface AnimatedBackgroundProps {
  theme: AnimationTheme
  intensity: AnimationIntensity
  speed: AnimationSpeed
  paused: boolean
}

const INTENSITY_MAP: Record<AnimationIntensity, number> = { low: 0.4, medium: 1, high: 2 }
const SPEED_MAP: Record<AnimationSpeed, number> = { slow: 0.5, medium: 1, fast: 2 }

// Full-bleed background gradient per theme — this is what changes the chat colour
const THEME_BG: Partial<Record<AnimationTheme, string>> = {
  'forest-breeze':    'linear-gradient(160deg, #1a3326 0%, #2d5a3d 60%, #3d7a52 100%)',
  'paw-parade':       'linear-gradient(160deg, #3d2010 0%, #6b3820 50%, #9a5a30 100%)',
  'rainy-window':     'linear-gradient(160deg, #1a2a38 0%, #2a4258 60%, #3a5a78 100%)',
  'starry-night':     'linear-gradient(160deg, #020210 0%, #0a0a2a 50%, #12122e 100%)',
  'cherry-blossom':   'linear-gradient(160deg, #4a1828 0%, #8a3050 50%, #c06080 100%)',
  'cloud-drift':      'linear-gradient(160deg, #1a4060 0%, #2a6090 50%, #4a90c0 100%)',
  'ocean-waves':      'linear-gradient(160deg, #041820 0%, #0a3040 60%, #104858 100%)',
  'campfire-glow':    'linear-gradient(160deg, #0e0500 0%, #2a1000 50%, #4a1a00 100%)',
  'autumn-leaves':    'linear-gradient(160deg, #200800 0%, #4a1800 50%, #7a2800 100%)',
  'winter-snow':      'linear-gradient(160deg, #080e18 0%, #10203a 50%, #1a3055 100%)',
  'butterfly-garden': 'linear-gradient(160deg, #140820 0%, #2a1040 50%, #481860 100%)',
  'aurora-dreams':    'linear-gradient(160deg, #020c0a 0%, #051a14 40%, #08101e 70%, #100520 100%)',
}

export default function AnimatedBackground({ theme, intensity, speed, paused }: AnimatedBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const particlesRef = useRef<Particle[]>([])
  const lastTimeRef = useRef<number>(0)

  const reduceMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const buildParticles = useCallback((w: number, h: number) => {
    particlesRef.current = THEMES[theme]?.init(w, h, INTENSITY_MAP[intensity]) ?? []
  }, [theme, intensity])

  const draw = useCallback((ctx: CanvasRenderingContext2D, dt: number, w: number, h: number) => {
    const speedMult = SPEED_MAP[speed]
    const themeImpl = THEMES[theme]
    if (!themeImpl) return
    themeImpl.render(ctx, particlesRef.current, dt * speedMult, w, h, INTENSITY_MAP[intensity])
  }, [theme, speed, intensity])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || theme === 'none') return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const resize = () => {
      canvas.width = canvas.offsetWidth
      canvas.height = canvas.offsetHeight
      buildParticles(canvas.width, canvas.height)
    }

    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    let animating = true
    const loop = (time: number) => {
      if (!animating) return
      const dt = Math.min((time - lastTimeRef.current) / 1000, 0.1)
      lastTimeRef.current = time
      if (!paused && !reduceMotion) {
        const c = canvas.getContext('2d')!
        c.clearRect(0, 0, canvas.width, canvas.height)
        draw(c, dt, canvas.width, canvas.height)
      }
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)

    return () => {
      animating = false
      cancelAnimationFrame(rafRef.current)
      ro.disconnect()
    }
  }, [theme, paused, reduceMotion, buildParticles, draw])

  if (theme === 'none' || reduceMotion) return null

  const bg = THEME_BG[theme]

  return (
    <>
      {/* Colour layer — fills the background with the theme's palette */}
      {bg && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: bg, zIndex: 0, opacity: 0.92, transition: 'background 0.6s ease' }}
        />
      )}
      {/* Particle animation layer on top */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{ zIndex: 1, opacity: getThemeOpacity(theme) }}
      />
    </>
  )
}

function getThemeOpacity(theme: AnimationTheme): number {
  const opacities: Partial<Record<AnimationTheme, number>> = {
    'campfire-glow': 0.6,
    'aurora-dreams': 0.7,
    'ocean-waves':   0.5,
    'starry-night':  0.8,
    'rainy-window':  0.5,
    'cloud-drift':   0.5,
  }
  return opacities[theme] ?? 0.55
}

// ─── Particle type ────────────────────────────────────────────────────────────

interface Particle {
  x: number; y: number; vx: number; vy: number
  size: number; opacity: number; rotation: number; vrot: number
  color: string; life: number; maxLife: number; data?: any
}

function makeParticle(w: number, h: number, overrides: Partial<Particle> = {}): Particle {
  return {
    x: Math.random() * w,
    y: Math.random() * h,
    vx: 0, vy: 0,
    size: 8 + Math.random() * 8,
    opacity: 0.4 + Math.random() * 0.6,
    rotation: Math.random() * Math.PI * 2,
    vrot: (Math.random() - 0.5) * 0.02,
    color: '#5a8c6e',
    life: Math.random(),
    maxLife: 1,
    ...overrides,
  }
}

// ─── Theme implementations ────────────────────────────────────────────────────

type ThemeImpl = {
  init: (w: number, h: number, intensity: number) => Particle[]
  render: (ctx: CanvasRenderingContext2D, particles: Particle[], dt: number, w: number, h: number, intensity: number) => void
}

const THEMES: Partial<Record<AnimationTheme, ThemeImpl>> = {

  // 🍃 Forest Breeze
  'forest-breeze': {
    init: (w, h, i) => Array.from({ length: Math.floor(18 * i) }, () =>
      makeParticle(w, h, {
        vy: 0.3 + Math.random() * 0.7, vx: (Math.random() - 0.5) * 0.4,
        vrot: (Math.random() - 0.5) * 0.03,
        color: ['#5a8c6e', '#4a7a5e', '#7eb592', '#3d6b52', '#6aaa7e'][Math.floor(Math.random() * 5)],
        size: 6 + Math.random() * 10, y: -20 - Math.random() * h,
      })
    ),
    render: (ctx, particles, dt, w, h) => {
      particles.forEach((p) => {
        p.x += p.vx * 60 * dt + Math.sin(p.life * 4) * 0.3
        p.y += p.vy * 60 * dt
        p.rotation += p.vrot * 60 * dt
        p.life += dt * 0.3
        if (p.y > h + 20) { p.y = -20; p.x = Math.random() * w; p.life = 0 }
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rotation)
        ctx.globalAlpha = p.opacity * Math.min(1, (h - p.y) / 80) * Math.min(1, (p.y + 20) / 40)
        drawLeaf(ctx, p.size, p.color)
        ctx.restore()
      })
    },
  },

  // 🐾 Paw Print Parade
  'paw-parade': {
    init: (w, h, i) => Array.from({ length: Math.floor(12 * i) }, (_, idx) =>
      makeParticle(w, h, {
        vx: (Math.random() * 0.8 + 0.3) * (Math.random() > 0.5 ? 1 : -1),
        vy: (Math.random() - 0.5) * 0.3,
        size: 10 + Math.random() * 14,
        color: '#5a8c6e', opacity: 0, life: idx / 12,
        maxLife: 4 + Math.random() * 4,
        data: { phase: Math.random() * Math.PI * 2 },
      })
    ),
    render: (ctx, particles, dt, w, h) => {
      particles.forEach((p) => {
        p.life += dt * 0.25
        p.x += p.vx * 60 * dt
        p.y += Math.sin(p.data.phase + p.life * 2) * 0.5
        const fade = Math.sin((p.life % 1) * Math.PI)
        p.opacity = 0.3 * fade
        if (p.x < -30 || p.x > w + 30) {
          p.x = p.vx > 0 ? -20 : w + 20
          p.y = 30 + Math.random() * (h - 60)
        }
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.globalAlpha = p.opacity
        drawPaw(ctx, p.size, p.color)
        ctx.restore()
      })
    },
  },

  // 🌧️ Rainy Window
  'rainy-window': {
    init: (w, h, i) => Array.from({ length: Math.floor(60 * i) }, () =>
      makeParticle(w, h, {
        vy: 4 + Math.random() * 6, vx: -0.5 - Math.random() * 0.5,
        size: 1 + Math.random() * 1.5,
        color: '#a8c4d4', opacity: 0.2 + Math.random() * 0.4,
        y: Math.random() * h,
      })
    ),
    render: (ctx, particles, dt, w, h) => {
      particles.forEach((p) => {
        p.x += p.vx * 60 * dt
        p.y += p.vy * 60 * dt
        if (p.y > h) { p.y = -10; p.x = Math.random() * w }
        ctx.save()
        ctx.strokeStyle = p.color
        ctx.globalAlpha = p.opacity
        ctx.lineWidth = p.size
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.moveTo(p.x, p.y)
        ctx.lineTo(p.x + p.vx * 4, p.y + p.vy * 4)
        ctx.stroke()
        ctx.restore()
      })
      // Occasional splat droplets
      if (Math.random() < dt * 3) {
        const sx = Math.random() * w
        const sy = Math.random() * (h * 0.3) + h * 0.7
        ctx.save()
        ctx.globalAlpha = 0.15
        ctx.strokeStyle = '#a8c4d4'
        ctx.lineWidth = 1
        for (let a = 0; a < Math.PI * 2; a += Math.PI / 3) {
          ctx.beginPath()
          ctx.moveTo(sx, sy)
          ctx.lineTo(sx + Math.cos(a) * 4, sy + Math.sin(a) * 2)
          ctx.stroke()
        }
        ctx.restore()
      }
    },
  },

  // ✨ Starry Night
  'starry-night': {
    init: (w, h, i) => Array.from({ length: Math.floor(60 * i) }, () =>
      makeParticle(w, h, {
        size: 0.5 + Math.random() * 2.5,
        color: '#ffffff',
        vx: 0, vy: 0,
        opacity: 0.3 + Math.random() * 0.7,
        maxLife: 2 + Math.random() * 4,
        life: Math.random() * Math.PI * 2,
      })
    ),
    render: (ctx, particles, dt, w, h) => {
      // Drifting sparkles
      particles.forEach((p) => {
        p.life += dt * 0.8
        const twinkle = 0.3 + 0.7 * Math.abs(Math.sin(p.life))
        ctx.save()
        ctx.globalAlpha = p.opacity * twinkle
        ctx.fillStyle = p.color
        ctx.shadowColor = '#ffffff'
        ctx.shadowBlur = p.size * 2
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
        ctx.fill()
        // Draw cross sparkle for larger stars
        if (p.size > 1.5) {
          ctx.globalAlpha = p.opacity * twinkle * 0.4
          ctx.lineWidth = 0.5
          ctx.strokeStyle = '#ffffff'
          const sl = p.size * 3
          ctx.beginPath()
          ctx.moveTo(p.x - sl, p.y); ctx.lineTo(p.x + sl, p.y)
          ctx.moveTo(p.x, p.y - sl); ctx.lineTo(p.x, p.y + sl)
          ctx.stroke()
        }
        ctx.restore()
      })
      // Occasional shooting star
      if (Math.random() < dt * 0.3) {
        const sx = Math.random() * w, sy = Math.random() * h * 0.5
        ctx.save()
        ctx.globalAlpha = 0.4
        const grad = ctx.createLinearGradient(sx, sy, sx + 80, sy + 30)
        grad.addColorStop(0, 'rgba(255,255,255,0.9)')
        grad.addColorStop(1, 'rgba(255,255,255,0)')
        ctx.strokeStyle = grad
        ctx.lineWidth = 1.5
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.moveTo(sx, sy); ctx.lineTo(sx + 80, sy + 30)
        ctx.stroke()
        ctx.restore()
      }
    },
  },

  // 🌸 Cherry Blossom
  'cherry-blossom': {
    init: (w, h, i) => Array.from({ length: Math.floor(25 * i) }, () =>
      makeParticle(w, h, {
        vy: 0.5 + Math.random() * 1,
        vx: (Math.random() - 0.5) * 0.6,
        vrot: (Math.random() - 0.5) * 0.05,
        color: ['#f9c5d0', '#f4a8b8', '#f7d4dc', '#e891a8', '#fce4ec'][Math.floor(Math.random() * 5)],
        size: 5 + Math.random() * 7, y: -20 - Math.random() * h,
      })
    ),
    render: (ctx, particles, dt, w, h) => {
      particles.forEach((p) => {
        p.x += (p.vx + Math.sin(p.life * 3) * 0.4) * 60 * dt
        p.y += p.vy * 60 * dt
        p.rotation += p.vrot * 60 * dt
        p.life += dt * 0.5
        if (p.y > h + 20) { p.y = -20; p.x = Math.random() * w; p.life = 0 }
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rotation)
        ctx.globalAlpha = p.opacity
        drawPetal(ctx, p.size, p.color)
        ctx.restore()
      })
    },
  },

  // ☁️ Cloud Drift
  'cloud-drift': {
    init: (w, h, i) => Array.from({ length: Math.floor(8 * i) }, () =>
      makeParticle(w, h, {
        vx: 0.1 + Math.random() * 0.2, vy: 0,
        size: 40 + Math.random() * 60,
        color: '#ffffff', opacity: 0.08 + Math.random() * 0.12,
        y: Math.random() * h * 0.6,
      })
    ),
    render: (ctx, particles, dt, w, h) => {
      particles.forEach((p) => {
        p.x += p.vx * 60 * dt
        if (p.x > w + p.size * 2) p.x = -p.size * 2
        ctx.save()
        ctx.globalAlpha = p.opacity
        ctx.fillStyle = p.color
        drawCloud(ctx, p.x, p.y, p.size)
        ctx.restore()
      })
    },
  },

  // 🌊 Ocean Waves
  'ocean-waves': {
    init: (w, h, i) => Array.from({ length: Math.floor(4 * i) }, (_, idx) =>
      makeParticle(w, h, {
        y: h * 0.5 + idx * 30, x: 0,
        color: '#4a8fa8', opacity: 0.06 + idx * 0.02,
        life: idx * 1.2,
        size: 30 + idx * 15,
        data: { amp: 15 + idx * 10, freq: 0.008 - idx * 0.0015, phase: idx * 1.2 },
      })
    ),
    render: (ctx, particles, dt, w, h) => {
      particles.forEach((p) => {
        p.data.phase += dt * 0.6
        ctx.save()
        ctx.globalAlpha = p.opacity
        ctx.beginPath()
        ctx.moveTo(0, h)
        for (let x = 0; x <= w; x += 4) {
          const y = p.y + Math.sin(x * p.data.freq + p.data.phase) * p.data.amp
          x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
        }
        ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath()
        const grad = ctx.createLinearGradient(0, p.y - p.data.amp, 0, h)
        grad.addColorStop(0, p.color + '66')
        grad.addColorStop(1, p.color + '22')
        ctx.fillStyle = grad
        ctx.fill()
        ctx.restore()
      })
    },
  },

  // 🔥 Campfire Glow
  'campfire-glow': {
    init: (w, h, i) => Array.from({ length: Math.floor(30 * i) }, () =>
      makeParticle(w, h, {
        x: w / 2 + (Math.random() - 0.5) * 40,
        y: h - 20 + Math.random() * 20,
        vy: -(0.8 + Math.random() * 2),
        vx: (Math.random() - 0.5) * 0.4,
        size: 3 + Math.random() * 6,
        color: ['#ff8c00', '#ff6600', '#ffaa00', '#ff4400', '#ffcc44'][Math.floor(Math.random() * 5)],
        opacity: 0.4 + Math.random() * 0.5,
        life: Math.random(),
      })
    ),
    render: (ctx, particles, dt, w, h, intensity) => {
      // Warm glow halo at bottom center
      const glowR = 80 + 20 * Math.sin(Date.now() / 400)
      const grad = ctx.createRadialGradient(w / 2, h, 0, w / 2, h, glowR * intensity)
      grad.addColorStop(0, 'rgba(255, 140, 0, 0.15)')
      grad.addColorStop(0.5, 'rgba(255, 80, 0, 0.06)')
      grad.addColorStop(1, 'rgba(255, 60, 0, 0)')
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, w, h)
      particles.forEach((p) => {
        p.x += (p.vx + Math.sin(p.life * 8) * 0.3) * 60 * dt
        p.y += p.vy * 60 * dt
        p.life += dt * 0.8
        p.opacity = (1 - p.life) * 0.7
        if (p.life > 1) {
          p.x = w / 2 + (Math.random() - 0.5) * 40
          p.y = h - 20 + Math.random() * 20
          p.life = 0
          p.opacity = 0.5
        }
        ctx.save()
        ctx.globalAlpha = p.opacity
        ctx.shadowColor = p.color
        ctx.shadowBlur = 8
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size * (1 - p.life * 0.5), 0, Math.PI * 2)
        ctx.fillStyle = p.color
        ctx.fill()
        ctx.restore()
      })
    },
  },

  // 🍂 Autumn Leaves
  'autumn-leaves': {
    init: (w, h, i) => Array.from({ length: Math.floor(22 * i) }, () =>
      makeParticle(w, h, {
        vy: 0.6 + Math.random() * 1.2,
        vx: (Math.random() - 0.5) * 0.8,
        vrot: (Math.random() - 0.5) * 0.06,
        color: ['#c4732a', '#d4944a', '#b85a2a', '#e0a050', '#8b3a1a', '#cc6030'][Math.floor(Math.random() * 6)],
        size: 7 + Math.random() * 10, y: -30 - Math.random() * h,
      })
    ),
    render: (ctx, particles, dt, w, h) => {
      particles.forEach((p) => {
        p.x += (p.vx + Math.sin(p.life * 2.5) * 0.5) * 60 * dt
        p.y += p.vy * 60 * dt
        p.rotation += p.vrot * 60 * dt
        p.life += dt * 0.3
        if (p.y > h + 30) { p.y = -30; p.x = Math.random() * w; p.life = 0 }
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rotation)
        ctx.globalAlpha = p.opacity
        drawAutumnLeaf(ctx, p.size, p.color)
        ctx.restore()
      })
    },
  },

  // ❄️ Winter Snow
  'winter-snow': {
    init: (w, h, i) => Array.from({ length: Math.floor(55 * i) }, () =>
      makeParticle(w, h, {
        vy: 0.3 + Math.random() * 0.8,
        vx: (Math.random() - 0.5) * 0.3,
        size: 2 + Math.random() * 4,
        color: '#ffffff',
        opacity: 0.4 + Math.random() * 0.5,
        life: Math.random() * Math.PI * 2,
      })
    ),
    render: (ctx, particles, dt, w, h) => {
      particles.forEach((p) => {
        p.life += dt * 1.2
        p.x += (p.vx + Math.sin(p.life) * 0.2) * 60 * dt
        p.y += p.vy * 60 * dt
        if (p.y > h + 10) { p.y = -10; p.x = Math.random() * w }
        ctx.save()
        ctx.globalAlpha = p.opacity * (0.7 + 0.3 * Math.sin(p.life))
        ctx.fillStyle = p.color
        ctx.shadowColor = '#d0eeff'
        ctx.shadowBlur = 4
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      })
    },
  },

  // 🦋 Butterfly Garden
  'butterfly-garden': {
    init: (w, h, i) => Array.from({ length: Math.floor(8 * i) }, () =>
      makeParticle(w, h, {
        vx: (Math.random() - 0.5) * 1.5,
        vy: (Math.random() - 0.5) * 1,
        size: 10 + Math.random() * 14,
        color: ['#f9a8d4', '#86efac', '#93c5fd', '#fcd34d', '#c4b5fd'][Math.floor(Math.random() * 5)],
        opacity: 0.5 + Math.random() * 0.4,
        life: Math.random() * Math.PI * 2,
        data: { flapSpeed: 3 + Math.random() * 5 },
      })
    ),
    render: (ctx, particles, dt, w, h) => {
      particles.forEach((p) => {
        p.life += dt * p.data.flapSpeed
        p.x += (p.vx + Math.sin(p.life * 0.3) * 0.8) * 60 * dt
        p.y += (p.vy + Math.cos(p.life * 0.4) * 0.6) * 60 * dt
        // Bounce off edges
        if (p.x < -30) { p.x = -30; p.vx = Math.abs(p.vx) }
        if (p.x > w + 30) { p.x = w + 30; p.vx = -Math.abs(p.vx) }
        if (p.y < -30) { p.y = -30; p.vy = Math.abs(p.vy) }
        if (p.y > h + 30) { p.y = h + 30; p.vy = -Math.abs(p.vy) }
        const flapAngle = Math.sin(p.life) * 0.7
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.globalAlpha = p.opacity
        drawButterfly(ctx, p.size, p.color, flapAngle)
        ctx.restore()
      })
    },
  },

  // 🌌 Aurora Dreams
  'aurora-dreams': {
    init: (w, h) => Array.from({ length: 4 }, (_, i) =>
      makeParticle(w, h, {
        y: h * 0.1 + i * h * 0.12,
        life: i * 1.5,
        color: ['#00d4aa', '#00aaff', '#aa00ff', '#00ff88'][i],
        opacity: 0.08 + Math.random() * 0.08,
        size: h * 0.15,
        data: { phase: i * 1.2, waveSpeed: 0.3 + i * 0.1 },
      })
    ),
    render: (ctx, particles, dt, w, h) => {
      particles.forEach((p) => {
        p.data.phase += dt * p.data.waveSpeed
        ctx.save()
        ctx.globalAlpha = p.opacity * (0.6 + 0.4 * Math.sin(p.data.phase))
        const grad = ctx.createLinearGradient(0, p.y - p.size, 0, p.y + p.size)
        grad.addColorStop(0, p.color + '00')
        grad.addColorStop(0.5, p.color + 'aa')
        grad.addColorStop(1, p.color + '00')
        ctx.fillStyle = grad
        ctx.beginPath()
        for (let x = 0; x <= w; x += 6) {
          const wave = Math.sin(x * 0.005 + p.data.phase) * p.size * 0.5
            + Math.sin(x * 0.008 + p.data.phase * 1.3) * p.size * 0.25
          x === 0
            ? ctx.moveTo(x, p.y + wave)
            : ctx.lineTo(x, p.y + wave)
        }
        // Close curtain shape
        for (let x = w; x >= 0; x -= 6) {
          const wave = Math.sin(x * 0.005 + p.data.phase) * p.size * 0.5
            + Math.sin(x * 0.008 + p.data.phase * 1.3) * p.size * 0.25
          ctx.lineTo(x, p.y + wave + p.size * 1.2)
        }
        ctx.closePath()
        ctx.fill()
        ctx.restore()
      })
    },
  },
}

// ─── Drawing helpers ──────────────────────────────────────────────────────────

function drawLeaf(ctx: CanvasRenderingContext2D, size: number, color: string) {
  ctx.beginPath()
  ctx.moveTo(0, -size)
  ctx.bezierCurveTo(size * 0.6, -size * 0.8, size * 0.8, size * 0.2, 0, size)
  ctx.bezierCurveTo(-size * 0.8, size * 0.2, -size * 0.6, -size * 0.8, 0, -size)
  ctx.fillStyle = color
  ctx.fill()
  ctx.strokeStyle = color
  ctx.globalAlpha *= 0.5
  ctx.lineWidth = 0.8
  ctx.beginPath()
  ctx.moveTo(0, -size)
  ctx.lineTo(0, size)
  ctx.stroke()
}

function drawPetal(ctx: CanvasRenderingContext2D, size: number, color: string) {
  ctx.beginPath()
  ctx.ellipse(0, 0, size * 0.5, size, 0, 0, Math.PI * 2)
  ctx.fillStyle = color
  ctx.fill()
}

function drawAutumnLeaf(ctx: CanvasRenderingContext2D, size: number, color: string) {
  ctx.beginPath()
  ctx.moveTo(0, -size)
  ctx.bezierCurveTo(size * 0.8, -size * 0.6, size * 0.9, size * 0.4, 0, size * 0.8)
  ctx.bezierCurveTo(-size * 0.9, size * 0.4, -size * 0.8, -size * 0.6, 0, -size)
  ctx.fillStyle = color
  ctx.fill()
  ctx.strokeStyle = color
  ctx.globalAlpha *= 0.4
  ctx.lineWidth = 0.8
  ctx.beginPath()
  ctx.moveTo(0, -size); ctx.lineTo(0, size * 0.8)
  for (let i = -2; i <= 2; i++) {
    const t = i / 2
    ctx.moveTo(t * size * 0.3, t * size * 0.3)
    ctx.lineTo(t * size * 0.8, t * size * 0.3 + size * 0.4 * Math.sign(i || 1))
  }
  ctx.stroke()
}

function drawPaw(ctx: CanvasRenderingContext2D, size: number, color: string) {
  ctx.fillStyle = color
  // Main pad
  ctx.beginPath()
  ctx.ellipse(0, 0, size * 0.5, size * 0.4, 0, 0, Math.PI * 2)
  ctx.fill()
  // Toes
  const toePositions = [[-size * 0.5, -size * 0.45], [0, -size * 0.55], [size * 0.5, -size * 0.45], [-size * 0.25, -size * 0.5]]
  toePositions.forEach(([tx, ty]) => {
    ctx.beginPath()
    ctx.ellipse(tx, ty, size * 0.18, size * 0.18, 0, 0, Math.PI * 2)
    ctx.fill()
  })
}

function drawCloud(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  const r = size * 0.3
  ctx.beginPath()
  ctx.arc(x, y, r * 1.2, 0, Math.PI * 2)
  ctx.arc(x - r * 1.1, y + r * 0.3, r * 0.9, 0, Math.PI * 2)
  ctx.arc(x + r * 1.1, y + r * 0.3, r * 0.9, 0, Math.PI * 2)
  ctx.arc(x - r * 0.4, y + r * 0.6, r * 1, 0, Math.PI * 2)
  ctx.arc(x + r * 0.4, y + r * 0.6, r * 1, 0, Math.PI * 2)
  ctx.fill()
}

function drawButterfly(ctx: CanvasRenderingContext2D, size: number, color: string, flapAngle: number) {
  ctx.save()
  // Left wing
  ctx.save()
  ctx.scale(Math.cos(flapAngle), 1)
  ctx.beginPath()
  ctx.ellipse(-size * 0.5, -size * 0.2, size * 0.7, size * 0.5, -0.4, 0, Math.PI * 2)
  ctx.fillStyle = color
  ctx.globalAlpha = 0.8
  ctx.fill()
  ctx.restore()
  // Right wing
  ctx.save()
  ctx.scale(-Math.cos(flapAngle), 1)
  ctx.beginPath()
  ctx.ellipse(-size * 0.5, -size * 0.2, size * 0.7, size * 0.5, -0.4, 0, Math.PI * 2)
  ctx.fillStyle = color
  ctx.globalAlpha = 0.8
  ctx.fill()
  ctx.restore()
  // Body
  ctx.fillStyle = '#4a3a2a'
  ctx.globalAlpha = 0.9
  ctx.beginPath()
  ctx.ellipse(0, 0, size * 0.1, size * 0.45, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}
