import { useEffect, useState, useRef } from 'react'
import { useAuth } from '../lib/auth'
import { supabase, type UserPet } from '../lib/supabase'

const SPECIES_EMOJI: Record<string, string> = {
  cat: '🐱',
  dog: '🐶',
  fox: '🦊',
  rabbit: '🐰',
}

const SLEEP_EMOJI = '😴'
const PET_SIZE = 48
const FLOOR_OFFSET = 16
const WALK_SPEED = 60
const TICK_MS = 50

type Mood = 'happy' | 'neutral' | 'sad'

function moodFromHappiness(h: number): Mood {
  if (h > 66) return 'happy'
  if (h < 33) return 'sad'
  return 'neutral'
}

export default function PetCompanion() {
  const { user } = useAuth()
  const [pet, setPet] = useState<UserPet | null>(null)
  const [x, setX] = useState(0)
  const [direction, setDirection] = useState<1 | -1>(1)
  const [isWalking, setIsWalking] = useState(false)
  const [isWiggling, setIsWiggling] = useState(false)
  const [showTooltip, setShowTooltip] = useState(false)
  const [viewportWidth, setViewportWidth] = useState(
    typeof window !== 'undefined' ? window.innerWidth : 1280,
  )

  const targetXRef = useRef<number | null>(null)
  const xRef = useRef(0)
  const directionRef = useRef<1 | -1>(1)
  const walkingRef = useRef(false)
  const petRef = useRef<UserPet | null>(null)
  const lastActionAtRef = useRef(0)

  useEffect(() => { petRef.current = pet }, [pet])
  useEffect(() => { xRef.current = x }, [x])
  useEffect(() => { directionRef.current = direction }, [direction])
  useEffect(() => { walkingRef.current = isWalking }, [isWalking])

  useEffect(() => {
    if (!user) return
    let cancelled = false
    supabase.rpc('get_pet').then(({ data, error }) => {
      if (cancelled || error || !data) return
      const p = data as UserPet
      setPet(p)
      const startX = Math.round((viewportWidth - PET_SIZE) / 2)
      setX(startX)
      xRef.current = startX
    })
    return () => { cancelled = true }
  }, [user, viewportWidth])

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    if (!pet) return
    const interval = setInterval(() => {
      const p = petRef.current
      if (!p) return
      const maxX = Math.max(0, viewportWidth - PET_SIZE)

      if (p.is_sleeping) {
        walkingRef.current = false
        setIsWalking(false)
        return
      }

      const now = Date.now()
      const idleFor = now - lastActionAtRef.current
      const shouldWander = targetXRef.current === null && idleFor > 3500 && Math.random() < 0.35
      if (shouldWander) {
        targetXRef.current = Math.round(Math.random() * maxX)
      }

      const target = targetXRef.current
      if (target !== null) {
        const current = xRef.current
        const diff = target - current
        const distance = Math.abs(diff)
        const energyFactor = Math.max(0.25, (p.energy ?? 50) / 100)
        const step = (WALK_SPEED * energyFactor * TICK_MS) / 1000

        if (distance <= step) {
          xRef.current = target
          setX(target)
          targetXRef.current = null
          walkingRef.current = false
          setIsWalking(false)
        } else {
          const dir = diff > 0 ? 1 : -1
          const next = Math.max(0, Math.min(maxX, current + dir * step))
          xRef.current = next
          setX(next)
          directionRef.current = dir
          setDirection(dir)
          if (!walkingRef.current) {
            walkingRef.current = true
            setIsWalking(true)
          }
        }
      } else {
        walkingRef.current = false
        setIsWalking(false)
      }
    }, TICK_MS)
    return () => clearInterval(interval)
  }, [pet, viewportWidth])

  const handlePetClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    const p = petRef.current
    if (!p || p.is_sleeping) return

    setIsWiggling(true)
    window.setTimeout(() => setIsWiggling(false), 500)

    const newHappiness = Math.min(100, (p.happiness ?? 50) + 3)
    setPet({ ...p, happiness: newHappiness })
    petRef.current = { ...p, happiness: newHappiness }
    lastActionAtRef.current = Date.now()

    supabase.rpc('upsert_pet', {
      p_patch: { happiness: newHappiness, last_played_at: new Date().toISOString() },
    }).then(({ error }) => {
      if (error) console.error('upsert_pet failed:', error.message)
    })
  }

  const handleFloorClick = (e: MouseEvent) => {
    const p = petRef.current
    if (!p || p.is_sleeping) return
    const maxX = Math.max(0, viewportWidth - PET_SIZE)
    const clickX = e.clientX - PET_SIZE / 2
    targetXRef.current = Math.max(0, Math.min(maxX, Math.round(clickX)))
    lastActionAtRef.current = Date.now()
  }

  useEffect(() => {
    window.addEventListener('click', handleFloorClick, { passive: true })
    return () => window.removeEventListener('click', handleFloorClick)
  }, [])

  if (!pet) return null

  const emoji = pet.is_sleeping ? SLEEP_EMOJI : (SPECIES_EMOJI[pet.species] ?? '🐱')
  const mood = moodFromHappiness(pet.happiness ?? 50)
  const energy = pet.energy ?? 50
  const energyFactor = Math.max(0.25, energy / 100)

  let animClass = 'pet-idle'
  if (pet.is_sleeping) animClass = 'pet-sleep'
  else if (isWiggling) animClass = 'pet-happy'
  else if (isWalking) animClass = 'pet-walk'

  const moodRing =
    mood === 'happy' ? 'ring-forest-400/50' :
    mood === 'sad' ? 'ring-red-400/40' :
    'ring-night-500/40'

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 pointer-events-none"
      style={{ height: `${PET_SIZE + FLOOR_OFFSET}px` }}
    >
      <div
        className="absolute pointer-events-auto cursor-pointer select-none"
        style={{
          left: `${x}px`,
          bottom: `${FLOOR_OFFSET}px`,
          width: `${PET_SIZE}px`,
          height: `${PET_SIZE}px`,
          transition: 'left 50ms linear',
          transform: `scaleX(${direction})`,
          animationDuration: pet.is_sleeping ? '3s' : `${1 / Math.max(0.25, energyFactor)}s`,
        }}
        onClick={handlePetClick}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        role="button"
        aria-label={`${pet.name} the ${pet.species}`}
        tabIndex={0}
      >
        <div
          className={`relative flex items-center justify-center rounded-full ring-2 ${moodRing} bg-night-900/30 backdrop-blur-sm ${animClass}`}
          style={{ width: `${PET_SIZE}px`, height: `${PET_SIZE}px`, fontSize: `${PET_SIZE * 0.66}px` }}
        >
          <span style={{ display: 'inline-block', transform: 'scaleX(-1)' }}>{emoji}</span>
          {showTooltip && (
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1 rounded-md bg-night-900 border border-night-700 text-night-50 text-xs font-medium whitespace-nowrap shadow-lg pointer-events-none">
              {pet.name}
              <span className="ml-1.5 text-night-400">· {mood}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
