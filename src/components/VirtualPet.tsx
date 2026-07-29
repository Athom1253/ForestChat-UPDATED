import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Heart, Utensils, Droplets, Play, Bath, Sparkles, Moon, Sun,
  Music, Footprints, Eye, Settings, X, Award, Star, Smile,
  Zap, Coffee, Bone, Disc, Feather, Crosshair, Gift, Puzzle,
  Lock, ChevronRight, Keyboard, Trophy,
} from 'lucide-react'
import { useStore } from '../lib/store'
import PetSVG from './PetSVG'
import {
  loadPet, createPet, updatePet,
  petAnimal, feedAnimal, giveWater, playAnimal, bathAnimal,
  putToSleep, wakeUp, teachTrick, customizePet,
} from '../lib/petApi'
import type { PetState, PetSpecies, PetBehavior, PetMood, PetPersonality } from '../lib/types'

type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'

const SPECIES: { id: PetSpecies; label: string; emoji: string; rarity: Rarity }[] = [
  { id: 'cat', label: 'Cat', emoji: '🐱', rarity: 'common' }, { id: 'dog', label: 'Dog', emoji: '🐶', rarity: 'common' },
  { id: 'rabbit', label: 'Rabbit', emoji: '🐰', rarity: 'common' }, { id: 'hamster', label: 'Hamster', emoji: '🐹', rarity: 'common' },
  { id: 'duck', label: 'Duck', emoji: '🦆', rarity: 'common' }, { id: 'turtle', label: 'Turtle', emoji: '🐢', rarity: 'common' },
  { id: 'fox', label: 'Fox', emoji: '🦊', rarity: 'uncommon' }, { id: 'redpanda', label: 'Red Panda', emoji: '🐾', rarity: 'uncommon' },
  { id: 'penguin', label: 'Penguin', emoji: '🐧', rarity: 'uncommon' }, { id: 'owl', label: 'Owl', emoji: '🦉', rarity: 'uncommon' },
  { id: 'bee', label: 'Bee', emoji: '🐝', rarity: 'uncommon' }, { id: 'dinosaur', label: 'Dinosaur', emoji: '🦕', rarity: 'rare' },
  { id: 'axolotl', label: 'Axolotl', emoji: '🦎', rarity: 'rare' }, { id: 'dragon', label: 'Dragon', emoji: '🐲', rarity: 'epic' },
]
const RARITY_INFO: Record<Rarity, { label: string; color: string }> = {
  common: { label: 'Common', color: '#9ca3af' }, uncommon: { label: 'Uncommon', color: '#22c55e' },
  rare: { label: 'Rare', color: '#3b82f6' }, epic: { label: 'Epic', color: '#a855f7' }, legendary: { label: 'Legendary', color: '#f59e0b' },
}
const COLORS = ['default', 'orange', 'black', 'white', 'brown', 'gray', 'cream', 'pink', 'blue', 'green', 'gold']
const ACCESSORIES = [
  { id: 'hat_top', label: 'Top Hat' }, { id: 'hat_party', label: 'Party Hat' }, { id: 'hat_crown', label: 'Crown' },
  { id: 'glasses', label: 'Glasses' }, { id: 'scarf', label: 'Scarf' }, { id: 'collar', label: 'Collar' },
  { id: 'bow', label: 'Bow' }, { id: 'wings', label: 'Wings' },
]
const PERSONALITIES: { id: PetPersonality; label: string }[] = [
  { id: 'lazy', label: 'Lazy' }, { id: 'energetic', label: 'Energetic' }, { id: 'curious', label: 'Curious' },
  { id: 'shy', label: 'Shy' }, { id: 'playful', label: 'Playful' }, { id: 'mischievous', label: 'Mischievous' }, { id: 'affectionate', label: 'Affectionate' },
]
const TRICKS = ['sit', 'roll over', 'shake paw', 'spin', 'high five', 'fetch', 'dance', 'play dead']
const TOYS = [
  { id: 'toy_ball', label: 'Ball', icon: Disc }, { id: 'toy_yarn', label: 'Yarn', icon: Sparkles }, { id: 'toy_frisbee', label: 'Frisbee', icon: Disc },
  { id: 'toy_bone', label: 'Bone', icon: Bone }, { id: 'toy_feather', label: 'Feather', icon: Feather }, { id: 'toy_laser', label: 'Laser', icon: Crosshair },
  { id: 'toy_plushie', label: 'Plushie', icon: Gift }, { id: 'toy_puzzle', label: 'Puzzle', icon: Puzzle },
]
const FOODS = [
  { id: 'food_kibble', label: 'Kibble', emoji: '🥘', nutrition: 20 }, { id: 'food_fish', label: 'Fish', emoji: '🐟', nutrition: 35 },
  { id: 'food_vegetable', label: 'Vegetable', emoji: '🥕', nutrition: 15 }, { id: 'food_fruit', label: 'Fruit', emoji: '🍎', nutrition: 18 },
  { id: 'food_treat', label: 'Treat', emoji: '🍪', nutrition: 25 }, { id: 'food_bone', label: 'Bone', emoji: '🦴', nutrition: 30 },
]
const COLLECTIBLES = [
  { id: 'coll_ribbon', label: 'Friendship Ribbon', emoji: '🎀', level: 10 }, { id: 'coll_medal', label: 'Loyalty Medal', emoji: '🥇', level: 25 },
  { id: 'coll_crystal', label: 'Bond Crystal', emoji: '💎', level: 40 }, { id: 'coll_cape', label: 'Hero Cape', emoji: '🦸', level: 55 },
  { id: 'coll_diary', label: 'Memory Diary', emoji: '📔', level: 70 }, { id: 'coll_trophy', label: 'Golden Trophy', emoji: '🏆', level: 85 },
  { id: 'coll_crown', label: 'Eternal Crown', emoji: '👑', level: 100 },
]
const SEASONAL = [
  { id: 'season_pumpkin', label: 'Pumpkin', months: [9, 10], emoji: '🎃' }, { id: 'season_santahat', label: 'Santa Hat', months: [11, 0], emoji: '🎅' },
  { id: 'season_heart', label: 'Love Bow', months: [1], emoji: '💝' }, { id: 'season_shamrock', label: 'Shamrock', months: [2], emoji: '🍀' },
  { id: 'season_egg', label: 'Easter Egg', months: [3], emoji: '🥚' }, { id: 'season_sunflower', label: 'Sunflower', months: [6, 7], emoji: '🌻' },
  { id: 'season_ghost', label: 'Ghost', months: [9], emoji: '👻' }, { id: 'season_firework', label: 'Firework', months: [0, 11], emoji: '🎆' },
]
const FRIENDSHIP_MILESTONES = [10, 25, 40, 55, 70, 85, 100]
const SPEECH_LINES: Record<string, string[]> = {
  happy: ['I love you!', 'Yay!', 'Hehe that tickles!', '*happy noises*', 'Best day ever!', 'My heart is full!', 'You make me smile!', '*wags happily*'],
  sleepy: ['Yawn... so tired...', 'Zzz...', 'Need a nap...', '*dozes off*', 'My eyes are heavy...', 'Just five more minutes...'],
  hungry: ['I\'m hungry...', 'Got any snacks?', 'My tummy is rumbling...', 'Feed me please!', 'Is it dinner time?', '*stares at food bowl*'],
  excited: ['WOW!', 'Let\'s play!', 'This is amazing!', '*zoomies*', 'I can\'t contain myself!', 'Best feeling ever!'],
  bored: ['Nothing to do...', 'Booored...', 'Entertain me?', '*sigh*', 'Is that all?', 'I need stimulation...'],
  curious: ['What\'s that?', 'Ooh interesting!', '*sniff sniff*', 'Let me see!', 'Why? How? When?', '*tilts head*'],
  playful: ['Catch me!', 'Tag you\'re it!', 'Throw the ball!', '*play bow*', 'Let\'s go crazy!', 'Wanna play fetch?'],
  sleeping: ['Zzz... dreamland...', '...so cozy...', '*soft purr*', '...chasing dream butterflies...', 'mmmm... treats...'],
  sick: ['*cough*', 'I don\'t feel well...', 'Ugh...', 'Need some care...', 'My tummy hurts...', '*sneeze*'],
  lonely: ['Where did you go?', 'I miss you...', 'Don\'t leave me...', 'It\'s too quiet...', 'Please come back...', '*whimpers*'],
  grateful: ['Thank you!', 'You\'re the best!', 'I appreciate you!', 'You always take care of me!', 'Bless you!', '*grateful nuzzle*'],
}
const PERSONALITY_SPEED: Record<PetPersonality, number> = { lazy: 0.3, energetic: 1.5, curious: 1.0, shy: 0.5, playful: 1.2, mischievous: 1.3, affectionate: 0.8 }
const NEW_BEHAVIORS: PetBehavior[] = ['yawning', 'scratching', 'sneezing', 'head-tilt', 'tail-chase', 'belly-rub', 'stretching-long', 'shaking', 'prancing', 'pouncing'] as unknown as PetBehavior[]
const IDLE_BEHAVIORS: PetBehavior[] = ['idle', 'walking', 'sitting', 'stretching', 'blinking', 'wagging', 'sniffing', 'looking', 'hopping', ...NEW_BEHAVIORS]

const pickNext = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v))

function getMood(pet: PetState | null): PetMood {
  if (!pet) return 'happy'
  if (pet.is_sleeping) return 'sleeping'
  if (pet.hunger < 30) return 'hungry'
  if (pet.happiness < 20) return 'sick' as PetMood
  if (pet.energy < 20) return 'sleepy'
  if (pet.happiness > 85) return 'happy'
  if (pet.happiness < 40) return 'bored'
  return 'playful'
}

function getBehaviorForMood(mood: PetMood, isWalking: boolean): PetBehavior {
  if (isWalking) return 'walking'
  if (mood === 'sleeping') return 'sleeping'
  if (mood === 'happy') return pickNext(['wagging', 'playing', 'hopping', 'dancing', 'prancing', 'belly-rub'] as PetBehavior[])
  if (mood === 'sleepy') return pickNext(['sitting', 'stretching', 'idle', 'yawning'] as PetBehavior[])
  if (mood === 'hungry') return pickNext(['sniffing', 'idle', 'sitting', 'head-tilt'] as PetBehavior[])
  if (mood === 'excited') return pickNext(['hopping', 'playing', 'dancing', 'rolling', 'pouncing', 'prancing'] as PetBehavior[])
  if (mood === 'bored') return pickNext(['idle', 'sitting', 'stretching', 'scratching', 'tail-chase'] as PetBehavior[])
  if (mood === 'curious') return pickNext(['looking', 'sniffing', 'idle', 'head-tilt'] as PetBehavior[])
  if (mood === 'playful') return pickNext(['playing', 'hopping', 'chasing', 'rolling', 'pouncing', 'prancing'] as PetBehavior[])
  if (mood === 'sick') return pickNext(['sneezing', 'shaking', 'sitting', 'idle'] as PetBehavior[])
  if (mood === 'lonely') return pickNext(['sitting', 'looking', 'idle', 'head-tilt'] as PetBehavior[])
  if (mood === 'grateful') return pickNext(['wagging', 'sitting', 'belly-rub', 'idle'] as PetBehavior[])
  return 'idle'
}

export default function VirtualPet() {
  const petName = useStore((s) => s.petName)
  const currentUser = useStore((s) => s.currentUser)
  const petEnabled = useStore((s) => s.petEnabled)
  const [pet, setPet] = useState<PetState | null>(null)
  const [x, setX] = useState(() => Math.random() * (window.innerWidth * 0.5))
  const [y, setY] = useState(0)
  const [behavior, setBehavior] = useState<PetBehavior>('idle')
  const [dir, setDir] = useState<'left' | 'right'>('right')
  const [showSpeech, setShowSpeech] = useState(false)
  const [speechText, setSpeechText] = useState('')
  const [showMenu, setShowMenu] = useState(false)
  const [showCustomize, setShowCustomize] = useState(false)
  const [showStats, setShowStats] = useState(false)
  const [loading, setLoading] = useState(true)
  const [manualControl, setManualControl] = useState(false)
  const [footprints, setFootprints] = useState<{ id: number; x: number; y: number; dir: 'left' | 'right' }[]>([])
  const [hearts, setHearts] = useState<{ id: number }[]>([])
  const [submenu, setSubmenu] = useState<null | 'toys' | 'food'>(null)
  const [fetchGame, setFetchGame] = useState<{ active: boolean; phase: 'throw' | 'fetch' | 'return'; ballX: number; petX: number; score: number }>({ active: false, phase: 'throw', ballX: 0, petX: 0, score: 0 })

  const targetXRef = useRef(x)
  const animFrameRef = useRef<number | null>(null)
  const behaviorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const speechTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const footprintIdRef = useRef(0)
  const heartIdRef = useRef(0)
  const followCursorRef = useRef(false)
  const cursorXRef = useRef(0)
  const petRef = useRef<PetState | null>(null)
  const userIdRef = useRef<string | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const keyStateRef = useRef<Record<string, boolean>>({})
  const keysActiveRef = useRef(false)
  const keyReleaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const keyRafRef = useRef<number | null>(null)
  const manualControlRef = useRef(false)
  const petEnabledRef = useRef(petEnabled)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)

  const mood = getMood(pet)
  const personality = pet?.personality || 'playful'

  useEffect(() => { petRef.current = pet }, [pet])
  useEffect(() => { userIdRef.current = currentUser?.id ?? null }, [currentUser])
  useEffect(() => { manualControlRef.current = manualControl }, [manualControl])
  useEffect(() => { petEnabledRef.current = petEnabled }, [petEnabled])

  const savePetState = useCallback((overrides?: Partial<PetState>) => {
    const cur = petRef.current
    const uid = userIdRef.current
    if (!cur || !uid) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    const snapshot = overrides ? { ...cur, ...overrides } : cur
    saveTimerRef.current = setTimeout(() => {
      void updatePet(uid, { hunger: snapshot.hunger, energy: snapshot.energy, cleanliness: snapshot.cleanliness, happiness: snapshot.happiness }).catch(() => {})
    }, 600)
  }, [])

  const refreshFromApi = useCallback(async () => {
    const uid = userIdRef.current
    if (!uid) return
    try { const p = await loadPet(uid); if (p) { setPet(p); petRef.current = p } } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    if (!currentUser) return
    setLoading(true)
    loadPet(currentUser.id).then(async (p) => {
      if (!p) { const newPet = await createPet(currentUser.id, 'cat', petName || 'Companion'); setPet(newPet); petRef.current = newPet }
      else { setPet(p); petRef.current = p }
      setLoading(false)
    }).catch(() => { setLoading(false); setPet(null) })
  }, [currentUser]) // eslint-disable-line

  const scheduleBehavior = useCallback(() => {
    if (behaviorTimerRef.current) clearTimeout(behaviorTimerRef.current)
    const speed = PERSONALITY_SPEED[personality]
    const delay = (3000 + Math.random() * 5000) / speed
    behaviorTimerRef.current = setTimeout(() => {
      const cur = petRef.current
      if (keysActiveRef.current) { scheduleBehavior(); return }
      if (cur?.is_sleeping) { setBehavior('sleeping'); scheduleBehavior(); return }
      const isWalkingNow = Math.random() < 0.3
      if (isWalkingNow) {
        const newTarget = Math.random() * Math.max(100, window.innerWidth - 140)
        targetXRef.current = newTarget
        setX((px) => { setDir(newTarget > px ? 'right' : 'left'); return px })
        setBehavior('walking')
      } else setBehavior(getBehaviorForMood(getMood(cur), false))
      scheduleBehavior()
    }, delay)
  }, [personality])

  useEffect(() => {
    scheduleBehavior()
    return () => {
      if (behaviorTimerRef.current) clearTimeout(behaviorTimerRef.current)
      if (speechTimerRef.current) clearTimeout(speechTimerRef.current)
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    }
  }, [scheduleBehavior])

  useEffect(() => {
    if (behavior !== 'walking' && !followCursorRef.current && !fetchGame.active) {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
      return
    }
    const speed = (behavior === 'walking' ? 0.8 : 0.5) * PERSONALITY_SPEED[personality]
    let last = performance.now()
    let lastFootprint = 0
    const step = (now: number) => {
      if (keysActiveRef.current) { animFrameRef.current = requestAnimationFrame(step); return }
      const dt = now - last
      last = now
      setX((prev) => {
        const target = followCursorRef.current ? cursorXRef.current : targetXRef.current
        const diff = target - prev
        if (Math.abs(diff) < 2) {
          if (followCursorRef.current) { followCursorRef.current = false; setBehavior(getBehaviorForMood(getMood(petRef.current), false)) }
          return prev
        }
        const move = Math.sign(diff) * Math.min(Math.abs(diff), speed * dt)
        setDir(move > 0 ? 'right' : 'left')
        if (now - lastFootprint > 400) {
          lastFootprint = now
          const fpId = footprintIdRef.current++
          const moveDir: 'left' | 'right' = move > 0 ? 'right' : 'left'
          setFootprints((f) => [...f, { id: fpId, x: prev, y, dir: moveDir }].slice(-8))
          setTimeout(() => setFootprints((f) => f.filter((p) => p.id !== fpId)), 2000)
        }
        return prev + move
      })
      animFrameRef.current = requestAnimationFrame(step)
    }
    animFrameRef.current = requestAnimationFrame(step)
    return () => { if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current) }
  }, [behavior, personality, fetchGame.active, y])

  useEffect(() => {
    const handler = (e: MouseEvent) => { cursorXRef.current = e.clientX }
    window.addEventListener('mousemove', handler)
    return () => window.removeEventListener('mousemove', handler)
  }, [])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!manualControlRef.current || !petEnabledRef.current) return
      if (e.key === 'Escape') { setShowMenu(false); setSubmenu(null); return }
      const k = e.key
      if (k === 'ArrowUp' || k === 'ArrowDown' || k === 'ArrowLeft' || k === 'ArrowRight') {
        e.preventDefault()
        keyStateRef.current[k] = true
        keysActiveRef.current = true
        if (keyReleaseTimerRef.current) { clearTimeout(keyReleaseTimerRef.current); keyReleaseTimerRef.current = null }
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      const k = e.key
      if (k === 'ArrowUp' || k === 'ArrowDown' || k === 'ArrowLeft' || k === 'ArrowRight') {
        keyStateRef.current[k] = false
        const anyDown = keyStateRef.current['ArrowUp'] || keyStateRef.current['ArrowDown'] || keyStateRef.current['ArrowLeft'] || keyStateRef.current['ArrowRight']
        if (!anyDown) {
          keyReleaseTimerRef.current = setTimeout(() => {
            keysActiveRef.current = false
            setBehavior(getBehaviorForMood(getMood(petRef.current), false))
          }, 500)
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      if (keyReleaseTimerRef.current) clearTimeout(keyReleaseTimerRef.current)
    }
  }, [])

  useEffect(() => {
    const tick = () => {
      if (keysActiveRef.current && manualControlRef.current && petEnabledRef.current) {
        const ks = keyStateRef.current
        const maxX = window.innerWidth - 100
        const maxY = window.innerHeight - 150
        setX((px) => {
          let nx = px
          if (ks['ArrowLeft']) { nx = clamp(px - 2, 0, maxX); setDir('left') }
          if (ks['ArrowRight']) { nx = clamp(px + 2, 0, maxX); setDir('right') }
          return nx
        })
        setY((py) => {
          let ny = py
          if (ks['ArrowUp']) ny = clamp(py + 2, 0, maxY)
          if (ks['ArrowDown']) ny = clamp(py - 2, 0, maxY)
          return ny
        })
        setBehavior('walking')
      }
      keyRafRef.current = requestAnimationFrame(tick)
    }
    keyRafRef.current = requestAnimationFrame(tick)
    return () => { if (keyRafRef.current) cancelAnimationFrame(keyRafRef.current) }
  }, [])

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!showMenu) return
      const t = e.target as Node | null
      if (menuRef.current && t && !menuRef.current.contains(t) && containerRef.current && !containerRef.current.contains(t)) {
        setShowMenu(false); setSubmenu(null)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [showMenu])

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setShowMenu(false); setSubmenu(null); setShowStats(false); setShowCustomize(false) }
    }
    window.addEventListener('keydown', onEsc)
    return () => window.removeEventListener('keydown', onEsc)
  }, [])

  useEffect(() => {
    const hour = new Date().getHours()
    const cur = petRef.current
    if (hour >= 22 && cur && !cur.is_sleeping) {
      void putToSleep(cur.user_id).then(() => { setPet({ ...cur, is_sleeping: true }); petRef.current = { ...cur, is_sleeping: true } }).catch(() => {})
    }
  }, [pet?.user_id]) // eslint-disable-line

  useEffect(() => {
    if (!pet || !currentUser) return
    const interval = setInterval(() => {
      const cur = petRef.current
      if (!cur) return
      const next = {
        ...cur,
        hunger: Math.max(0, (cur.hunger || 60) - 5),
        energy: Math.max(0, (cur.energy || 80) - 3),
        cleanliness: Math.max(0, (cur.cleanliness || 90) - 2),
        happiness: Math.max(0, (cur.happiness || 80) - 2),
      }
      setPet(next); petRef.current = next
      void updatePet(currentUser.id, { hunger: next.hunger, energy: next.energy, cleanliness: next.cleanliness, happiness: next.happiness } as any).catch(() => {})
    }, 60000)
    return () => clearInterval(interval)
  }, [pet?.user_id, currentUser]) // eslint-disable-line

  const fetchStateRef = useRef<{ startPetX: number; ballEndX: number; t0: number; phase: string; ballX: number }>({ startPetX: 0, ballEndX: 0, t0: 0, phase: 'throw', ballX: 0 })

  useEffect(() => {
    if (!fetchGame.active) return
    const startPetX = x
    const throwDist = Math.min(300, Math.max(120, window.innerWidth * 0.3))
    const ballEndX = clamp(startPetX + throwDist, 50, window.innerWidth - 50)
    fetchStateRef.current = { startPetX, ballEndX, t0: performance.now(), phase: 'throw', ballX: startPetX }
    let raf: number
    const tick = (now: number) => {
      const fs = fetchStateRef.current
      const elapsed = (now - fs.t0) / 1000
      if (fs.phase === 'throw') {
        const p = Math.min(1, elapsed / 0.8)
        fs.ballX = startPetX + (ballEndX - startPetX) * p
        setFetchGame((g) => g.active ? { ...g, ballX: fs.ballX } : g)
        if (p >= 1) {
          fs.phase = 'fetch'
          targetXRef.current = ballEndX - 5
          setDir(ballEndX > startPetX ? 'right' : 'left')
          setBehavior('running' as PetBehavior)
        }
      } else if (fs.phase === 'fetch') {
        const targetX = ballEndX - 5
        setX((px) => {
          const diff = targetX - px
          if (Math.abs(diff) > 4) {
            targetXRef.current = targetX
            setDir(targetX > px ? 'right' : 'left')
            setBehavior('running' as PetBehavior)
            return px
          }
          fs.phase = 'return'
          return px
        })
      } else if (fs.phase === 'return') {
        const targetX = startPetX
        setX((px) => {
          const diff = targetX - px
          if (Math.abs(diff) > 4) {
            targetXRef.current = targetX
            setDir(targetX > px ? 'right' : 'left')
            setBehavior('running' as PetBehavior)
            return px
          }
          setBehavior('happy' as PetBehavior)
          showSpeechBubble('grateful' as PetMood)
          setFetchGame((g) => ({ active: false, phase: 'throw', ballX: 0, petX: 0, score: g.score + 1 }))
          return px
        })
        fs.ballX = targetX
        setFetchGame((g) => g.active ? { ...g, ballX: targetX } : g)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    const timeout = setTimeout(() => {
      if (fetchStateRef.current.phase === 'done') return
      fetchStateRef.current.phase = 'done'
      setFetchGame((g) => ({ active: false, phase: 'throw', ballX: 0, petX: 0, score: g.score }))
      setBehavior(getBehaviorForMood(getMood(petRef.current), false))
    }, 15000)
    return () => { cancelAnimationFrame(raf); clearTimeout(timeout) }
  }, [fetchGame.active]) // eslint-disable-line

  const showSpeechBubble = useCallback((m: PetMood) => {
    const lines = SPEECH_LINES[m] || SPEECH_LINES.happy
    setSpeechText(pickNext(lines))
    setShowSpeech(true)
    if (speechTimerRef.current) clearTimeout(speechTimerRef.current)
    speechTimerRef.current = setTimeout(() => setShowSpeech(false), 2500)
  }, [])

  const spawnHearts = useCallback(() => {
    const ids: number[] = []
    for (let i = 0; i < 4; i++) {
      const id = heartIdRef.current++
      ids.push(id)
      setTimeout(() => setHearts((h) => [...h, { id }]), i * 120)
    }
    setTimeout(() => setHearts((h) => h.filter((hp) => !ids.includes(hp.id))), 1800)
  }, [])

  const handleClick = () => {
    if (!currentUser || !pet) return
    setShowMenu((s) => !s)
    setBehavior('happy' as PetBehavior)
    showSpeechBubble(mood)
    spawnHearts()
    void petAnimal(currentUser.id).then(() => { void refreshFromApi() }).catch(() => {})
  }

  const applyLocal = useCallback((patch: Partial<PetState>) => {
    setPet((p) => { if (!p) return p; const next = { ...p, ...patch }; petRef.current = next; return next })
  }, [])

  const handleAction = async (action: string) => {
    if (!currentUser || !pet) return
    setShowMenu(false); setSubmenu(null)
    const uid = currentUser.id
    try {
      switch (action) {
        case 'pet':
          await petAnimal(uid); applyLocal({ happiness: Math.min(100, pet.happiness + 3) })
          setBehavior('belly-rub' as PetBehavior); spawnHearts(); showSpeechBubble('grateful' as PetMood); void refreshFromApi(); break
        case 'feed':
          await feedAnimal(uid); applyLocal({ hunger: Math.min(100, pet.hunger + 25) })
          setBehavior('wagging' as PetBehavior); showSpeechBubble('happy'); void refreshFromApi(); break
        case 'water':
          await giveWater(uid); applyLocal({ energy: 90 })
          setBehavior('drinking' as PetBehavior); showSpeechBubble('happy'); void refreshFromApi(); break
        case 'play':
          await playAnimal(uid); applyLocal({ energy: Math.max(0, pet.energy - 15), happiness: Math.min(100, pet.happiness + 8) })
          setBehavior('playing'); showSpeechBubble('excited'); void refreshFromApi(); break
        case 'ball':
          await playAnimal(uid); setBehavior('chasing'); showSpeechBubble('excited'); void refreshFromApi(); break
        case 'bath':
          await bathAnimal(uid); applyLocal({ cleanliness: 100 })
          setBehavior('shaking' as PetBehavior); showSpeechBubble('happy'); void refreshFromApi(); break
        case 'sleep':
          await putToSleep(uid); applyLocal({ is_sleeping: true })
          setBehavior('sleeping'); showSpeechBubble('sleepy'); break
        case 'wake':
          await wakeUp(uid); applyLocal({ is_sleeping: false, energy: 100 })
          setBehavior('stretching' as PetBehavior); showSpeechBubble('happy'); void refreshFromApi(); break
        case 'dance':
          setBehavior('dancing'); showSpeechBubble('excited')
          applyLocal({ happiness: Math.min(100, pet.happiness + 2) }); savePetState({ happiness: Math.min(100, pet.happiness + 2) }); break
        case 'follow':
          followCursorRef.current = true; setBehavior('walking'); showSpeechBubble('playful'); break
        case 'stay':
          followCursorRef.current = false; targetXRef.current = x; setBehavior('sitting'); showSpeechBubble('curious'); break
        case 'hide':
          setBehavior('idle'); setShowMenu(false); showSpeechBubble('curious'); break
        case 'explore': {
          const newTarget = Math.random() * (window.innerWidth - 140)
          targetXRef.current = newTarget; setDir(newTarget > x ? 'right' : 'left'); setBehavior('walking'); showSpeechBubble('curious'); break
        }
        case 'trick': {
          const trick = pickNext(TRICKS)
          await teachTrick(uid, trick); applyLocal({ tricks_learned: [...(pet.tricks_learned || []), trick] })
          setBehavior('dancing'); showSpeechBubble('grateful' as PetMood); void refreshFromApi(); break
        }
        case 'fetch':
          setFetchGame({ active: true, phase: 'throw', ballX: x, petX: x, score: fetchGame.score })
          setBehavior('running' as PetBehavior); showSpeechBubble('excited'); break
        case 'toggleManual':
          setManualControl((m) => !m)
          if (!manualControl) { keysActiveRef.current = false; keyStateRef.current = {} }
          showSpeechBubble('curious'); break
        default:
          if (action.startsWith('toy_')) {
            await playAnimal(uid); applyLocal({ happiness: Math.min(100, pet.happiness + 6) })
            setBehavior(pickNext(['playing', 'chasing', 'pouncing', 'tail-chase'] as PetBehavior[]))
            showSpeechBubble('excited'); void refreshFromApi(); break
          }
          if (action.startsWith('food_')) {
            const f = FOODS.find((fd) => fd.id === action)
            if (f) {
              await feedAnimal(uid, f.nutrition); applyLocal({ hunger: Math.min(100, pet.hunger + f.nutrition) })
              setBehavior('wagging' as PetBehavior); showSpeechBubble('grateful' as PetMood); void refreshFromApi()
            }
            break
          }
      }
    } catch { /* ignore */ }
  }

  const menuActions = [
    { id: 'pet', label: 'Pet', icon: Heart }, { id: 'feed', label: 'Feed', icon: Utensils },
    { id: 'water', label: 'Water', icon: Droplets }, { id: 'play', label: 'Play', icon: Play },
    { id: 'fetch', label: 'Fetch', icon: Disc }, { id: 'bath', label: 'Bathe', icon: Bath },
    { id: 'trick', label: 'Trick', icon: Award },
    pet?.is_sleeping ? { id: 'wake', label: 'Wake', icon: Sun } : { id: 'sleep', label: 'Sleep', icon: Moon },
    { id: 'dance', label: 'Dance', icon: Music }, { id: 'follow', label: 'Follow', icon: Footprints },
    { id: 'stay', label: 'Stay', icon: Eye }, { id: 'explore', label: 'Explore', icon: Star },
  ]

  if (loading) return null
  if (!pet && !loading) return (
    <div className="fixed top-20 right-4 z-40 flex flex-col items-center gap-2 p-3 rounded-xl bg-bg-surface border border-border shadow-lg">
      <span className="text-xs text-text-muted">Pet failed to load</span>
      <button
        onClick={() => { if (currentUser) { setLoading(true); loadPet(currentUser.id).then(async (p) => { if (!p) { const np = await createPet(currentUser.id, 'cat', petName || 'Companion'); setPet(np); petRef.current = np } else { setPet(p); petRef.current = p } setLoading(false) }).catch(() => setLoading(false)) } }}
        className="px-3 py-1.5 rounded-lg bg-accent text-white text-xs hover:bg-accent-hover transition-all"
      >Retry pet load</button>
    </div>
  )

  const bStr = behavior as string
  const petAnim = mood === 'happy' ? { y: [0, -8, 0] } : bStr === 'sneezing' ? { x: [0, -3, 3, -3, 0] } : {}

  return (
    <div ref={containerRef} className="fixed z-30 select-none" style={{ left: x, bottom: y }}>
      {footprints.map((fp) => (
        <motion.div key={fp.id} initial={{ opacity: 0.6, y: 0 }} animate={{ opacity: 0 }} transition={{ duration: 2 }}
          className="absolute bottom-1 text-xs" style={{ left: fp.dir === 'left' ? 10 : -10, transform: fp.dir === 'left' ? 'scaleX(-1)' : '' }}>🐾</motion.div>
      ))}
      {hearts.map((h) => (
        <motion.div key={h.id} initial={{ opacity: 1, y: 0, x: Math.random() * 40 - 20, scale: 0.8 }} animate={{ opacity: 0, y: -80, scale: 1.4 }}
          transition={{ duration: 1.6, ease: 'easeOut' }} className="absolute bottom-24 left-1/2 text-lg pointer-events-none">❤️</motion.div>
      ))}
      {fetchGame.active && (
        <motion.div className="absolute bottom-20 rounded-full pointer-events-none" style={{ left: fetchGame.ballX - x, width: 18, height: 18, backgroundColor: '#e8555e' }}
          animate={{ y: [0, -40, 0] }} transition={{ duration: 0.6, repeat: Infinity }} />
      )}
      {fetchGame.active && (
        <div className="absolute bottom-44 left-1/2 -translate-x-1/2 text-xs font-bold text-accent bg-bg-surface px-2 py-0.5 rounded-full shadow">Fetch score: {fetchGame.score}</div>
      )}
      <AnimatePresence>
        {showSpeech && (
          <motion.div initial={{ opacity: 0, y: 8, scale: 0.85 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: 0.85 }}
            className="absolute bottom-32 left-1/2 -translate-x-1/2 bg-bg-surface border border-border rounded-2xl px-3 py-1.5 text-xs text-text font-bold shadow-lg whitespace-nowrap" style={{ pointerEvents: 'none' }}>
            {speechText}
            <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-bg-surface border-b border-r border-border rotate-45" />
          </motion.div>
        )}
      </AnimatePresence>
      <div className="absolute bottom-28 left-1/2 -translate-x-1/2 flex gap-1">
        {mood === 'happy' && <Smile className="w-4 h-4 text-green-500" />}
        {mood === 'sleepy' && <Coffee className="w-4 h-4 text-amber-500" />}
        {mood === 'hungry' && <Utensils className="w-4 h-4 text-orange-500" />}
        {mood === 'excited' && <Zap className="w-4 h-4 text-yellow-500" />}
        {mood === 'sleeping' && <Moon className="w-4 h-4 text-indigo-400" />}
        {(mood as string) === 'sick' && <Droplets className="w-4 h-4 text-red-400" />}
        {(mood as string) === 'lonely' && <Heart className="w-4 h-4 text-blue-400" />}
      </div>
      <motion.div className="cursor-pointer" style={{ scaleX: dir === 'left' ? -1 : 1 }} onClick={handleClick} onHoverStart={() => setShowMenu(true)}
        title={`${pet?.name || 'Pet'} — click to interact!`}>
        <motion.div animate={{ scaleY: [1, 1.03, 1] }} transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}>
          <motion.div animate={petAnim} transition={{ duration: 0.4, repeat: bStr === 'sneezing' ? 2 : Infinity }}>
            <PetSVG species={pet?.species || 'cat'} behavior={behavior} colorVariant={pet?.color_variant || 'default'} accessories={pet?.accessories || []} size={100} />
          </motion.div>
        </motion.div>
      </motion.div>
      <AnimatePresence>
        {showMenu && (
          <motion.div ref={menuRef} initial={{ opacity: 0, y: 10, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.9 }}
            className="absolute bottom-36 left-1/2 -translate-x-1/2 bg-bg-surface border border-border rounded-2xl shadow-xl p-2" style={{ pointerEvents: 'auto' }}>
            {submenu === null && (
              <>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[10px] text-text-muted px-1">Actions</span>
                  <button onClick={() => { setShowMenu(false); setSubmenu(null) }} className="p-0.5 rounded hover:bg-bg-hover text-text-muted" title="Close"><X className="w-3.5 h-3.5" /></button>
                </div>
                <div className="grid grid-cols-4 gap-1 w-56">
                  {menuActions.map((a) => (
                    <button key={a.id} onClick={() => handleAction(a.id)} className="flex flex-col items-center gap-1 p-2 rounded-lg hover:bg-bg-hover transition-colors" title={a.label}>
                      <a.icon className="w-4 h-4 text-accent" /><span className="text-[10px] text-text-muted">{a.label}</span>
                    </button>
                  ))}
                </div>
                <div className="flex gap-1 mt-1 pt-1 border-t border-border">
                  <button onClick={() => setSubmenu('toys')} className="flex-1 text-xs py-1.5 rounded-lg bg-bg-hover hover:bg-border transition-colors flex items-center justify-center gap-1"><Gift className="w-3 h-3" /> Toys</button>
                  <button onClick={() => setSubmenu('food')} className="flex-1 text-xs py-1.5 rounded-lg bg-bg-hover hover:bg-border transition-colors flex items-center justify-center gap-1"><Utensils className="w-3 h-3" /> Foods</button>
                </div>
                <div className="flex gap-1 mt-1 pt-1 border-t border-border">
                  <button onClick={() => { setShowMenu(false); setShowStats(true) }} className="flex-1 text-xs py-1.5 rounded-lg bg-bg-hover hover:bg-border transition-colors">Stats</button>
                  <button onClick={() => handleAction('toggleManual')}
                    className={`flex-1 text-xs py-1.5 rounded-lg transition-colors flex items-center justify-center gap-1 ${manualControl ? 'bg-accent text-white' : 'bg-bg-hover hover:bg-border'}`} title="Toggle arrow-key control">
                    <Keyboard className="w-3 h-3" /> {manualControl ? 'Keys On' : 'Keys Off'}
                  </button>
                  <button onClick={() => { setShowMenu(false); setShowCustomize(true) }} className="flex-1 text-xs py-1.5 rounded-lg bg-bg-hover hover:bg-border transition-colors flex items-center justify-center gap-1"><Settings className="w-3 h-3" /></button>
                </div>
              </>
            )}
            {submenu === 'toys' && (
              <SubmenuPanel title="Give Toy" onBack={() => setSubmenu(null)} items={TOYS.map((t) => ({ id: t.id, label: t.label, icon: t.icon }))} onPick={handleAction} />
            )}
            {submenu === 'food' && (
              <SubmenuPanel title="Feed" onBack={() => setSubmenu(null)} items={FOODS.map((f) => ({ id: f.id, label: `${f.emoji} ${f.label}`, icon: Utensils }))} onPick={handleAction} />
            )}
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>{showStats && pet && <PetStatsModal pet={pet} onClose={() => setShowStats(false)} />}</AnimatePresence>
      <AnimatePresence>{showCustomize && pet && currentUser && <PetCustomizeModal pet={pet} userId={currentUser.id} onClose={() => setShowCustomize(false)} onUpdate={setPet} />}</AnimatePresence>
    </div>
  )
}

function SubmenuPanel({ title, items, onPick, onBack }: {
  title: string; items: { id: string; label: string; icon: typeof Heart }[]; onPick: (id: string) => void; onBack: () => void
}) {
  return (
    <div className="w-56">
      <div className="flex items-center gap-2 mb-2 pb-2 border-b border-border">
        <button onClick={onBack} className="p-1 rounded-lg hover:bg-bg-hover"><ChevronRight className="w-4 h-4 rotate-180" /></button>
        <span className="text-xs font-bold">{title}</span>
      </div>
      <div className="grid grid-cols-2 gap-1">
        {items.map((it) => (
          <button key={it.id} onClick={() => onPick(it.id)} className="flex items-center gap-1.5 p-2 rounded-lg hover:bg-bg-hover transition-colors text-left">
            <it.icon className="w-4 h-4 text-accent shrink-0" /><span className="text-[11px] text-text truncate">{it.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function StatBar({ label, value, icon: Icon, color }: { label: string; value: number; icon: typeof Heart; color: string }) {
  return (
    <div className="mb-2">
      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-3.5 h-3.5" style={{ color }} /><span className="text-xs font-semibold">{label}</span>
        <span className="text-xs text-text-muted ml-auto">{value}/100</span>
      </div>
      <div className="h-2 rounded-full bg-bg-hover overflow-hidden">
        <motion.div className="h-full rounded-full" style={{ backgroundColor: color }} animate={{ width: `${value}%` }} transition={{ duration: 0.5 }} />
      </div>
    </div>
  )
}

function FriendshipBar({ value }: { value: number }) {
  const level = Math.floor(value / 10)
  return (
    <div className="mb-3">
      <div className="flex items-center gap-2 mb-1">
        <Heart className="w-3.5 h-3.5" style={{ color: '#e8555e' }} /><span className="text-xs font-semibold">Friendship · Lv {level}</span>
        <span className="text-xs text-text-muted ml-auto">{value}/100</span>
      </div>
      <div className="h-2.5 rounded-full bg-bg-hover overflow-hidden relative">
        <motion.div className="h-full rounded-full bg-gradient-to-r from-pink-400 to-rose-500" animate={{ width: `${value}%` }} transition={{ duration: 0.5 }} />
        {FRIENDSHIP_MILESTONES.map((m) => <div key={m} className="absolute top-0 h-full w-px bg-white/40" style={{ left: `${m}%` }} />)}
      </div>
      <div className="flex justify-between mt-1 text-[9px] text-text-muted">{FRIENDSHIP_MILESTONES.map((m) => <span key={m}>{m}</span>)}</div>
    </div>
  )
}

function PetStatsModal({ pet, onClose }: { pet: PetState; onClose: () => void }) {
  const sp = SPECIES.find((s) => s.id === pet.species)
  const rarity = sp ? RARITY_INFO[sp.rarity] : RARITY_INFO.common
  const unlocked = COLLECTIBLES.filter((c) => pet.friendship >= c.level)
  const locked = COLLECTIBLES.filter((c) => pet.friendship < c.level)
  const seasonNow = SEASONAL.filter((s) => s.months.includes(new Date().getMonth()))
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
        className="bg-bg-surface rounded-2xl border border-border p-6 max-w-xs w-full mx-4 shadow-2xl max-h-[85vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold">{pet.name}</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-bg-hover"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-16 h-16 rounded-xl bg-bg-hover flex items-center justify-center">
            <PetSVG species={pet.species} behavior="idle" colorVariant={pet.color_variant} accessories={pet.accessories} size={64} />
          </div>
          <div>
            <div className="text-sm font-semibold capitalize flex items-center gap-1.5">
              {pet.species}
              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold" style={{ color: rarity.color, backgroundColor: rarity.color + '22' }}>{rarity.label}</span>
            </div>
            <div className="text-xs text-text-muted">Level {pet.level} · {pet.xp % 100}/100 XP</div>
            <div className="text-xs text-text-muted capitalize">{pet.personality}</div>
          </div>
        </div>
        <StatBar label="Happiness" value={pet.happiness} icon={Smile} color="#10b981" />
        <StatBar label="Energy" value={pet.energy} icon={Zap} color="#f59e0b" />
        <StatBar label="Hunger" value={pet.hunger} icon={Utensils} color="#f97316" />
        <StatBar label="Cleanliness" value={pet.cleanliness} icon={Bath} color="#3b82f6" />
        <FriendshipBar value={pet.friendship} />
        {pet.tricks_learned.length > 0 && (
          <div className="mt-3 pt-3 border-t border-border">
            <div className="text-xs font-semibold mb-1">Tricks Learned ({pet.tricks_learned.length})</div>
            <div className="flex flex-wrap gap-1">
              {pet.tricks_learned.map((t) => <span key={t} className="text-xs px-2 py-0.5 rounded bg-accent/15 text-accent">{t}</span>)}
            </div>
          </div>
        )}
        <div className="mt-3 pt-3 border-t border-border">
          <div className="text-xs font-semibold mb-1 flex items-center gap-1"><Trophy className="w-3 h-3" /> Collectibles ({unlocked.length}/{COLLECTIBLES.length})</div>
          <div className="flex flex-wrap gap-1.5">
            {unlocked.map((c) => <span key={c.id} title={c.label} className="text-lg">{c.emoji}</span>)}
            {locked.map((c) => <span key={c.id} title={`${c.label} (unlocks at friendship ${c.level})`} className="text-lg opacity-30 grayscale"><Lock className="w-3.5 h-3.5" /></span>)}
          </div>
        </div>
        {seasonNow.length > 0 && (
          <div className="mt-3 pt-3 border-t border-border">
            <div className="text-xs font-semibold mb-1 flex items-center gap-1"><Sparkles className="w-3 h-3" /> Seasonal Accessories</div>
            <div className="flex flex-wrap gap-1.5">{seasonNow.map((s) => <span key={s.id} title={s.label} className="text-lg">{s.emoji}</span>)}</div>
          </div>
        )}
        <div className="mt-3 pt-3 border-t border-border grid grid-cols-2 gap-2 text-xs">
          <div><span className="text-text-muted">Pets:</span> {pet.stats?.pets || 0}</div>
          <div><span className="text-text-muted">Feeds:</span> {pet.stats?.feeds || 0}</div>
          <div><span className="text-text-muted">Plays:</span> {pet.stats?.plays || 0}</div>
          <div><span className="text-text-muted">Baths:</span> {pet.stats?.baths || 0}</div>
        </div>
      </motion.div>
    </div>
  )
}

function PetCustomizeModal({ pet, userId, onClose, onUpdate }: {
  pet: PetState; userId: string; onClose: () => void; onUpdate: (p: PetState) => void
}) {
  const [species, setSpecies] = useState<PetSpecies>(pet.species)
  const [colorVariant, setColorVariant] = useState(pet.color_variant)
  const [accessories, setAccessories] = useState<string[]>(pet.accessories || [])
  const [personality, setPersonality] = useState<PetPersonality>(pet.personality)
  const [name, setName] = useState(pet.name)
  const toggleAccessory = (id: string) => setAccessories((a) => a.includes(id) ? a.filter((x) => x !== id) : [...a, id])
  const handleSave = async () => {
    await customizePet(userId, { species, color_variant: colorVariant, accessories, personality, name })
    onUpdate({ ...pet, species, color_variant: colorVariant, accessories, personality, name })
    onClose()
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
        className="bg-bg-surface rounded-2xl border border-border p-6 max-w-md w-full mx-4 shadow-2xl max-h-[85vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold">Customize Your Pet</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-bg-hover"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex justify-center mb-4 bg-bg-hover rounded-xl p-4">
          <PetSVG species={species} behavior="idle" colorVariant={colorVariant} accessories={accessories} size={100} />
        </div>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Pet name"
          className="w-full px-3 py-2 rounded-lg bg-bg-hover border border-border text-sm mb-3 focus:border-accent outline-none" />
        <div className="mb-3">
          <label className="text-xs font-semibold text-text-muted mb-1 block">Species</label>
          <div className="flex flex-wrap gap-1">
            {SPECIES.map((s) => (
              <button key={s.id} onClick={() => setSpecies(s.id)} className={`px-2 py-1 rounded-lg text-xs flex items-center gap-1 ${species === s.id ? 'bg-accent text-white' : 'bg-bg-hover'}`}>
                {s.emoji} {s.label}<span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: RARITY_INFO[s.rarity].color }} />
              </button>
            ))}
          </div>
        </div>
        <div className="mb-3">
          <label className="text-xs font-semibold text-text-muted mb-1 block">Color</label>
          <div className="flex flex-wrap gap-1">
            {COLORS.map((c) => <button key={c} onClick={() => setColorVariant(c)} className={`px-2 py-1 rounded-lg text-xs capitalize ${colorVariant === c ? 'bg-accent text-white' : 'bg-bg-hover'}`}>{c}</button>)}
          </div>
        </div>
        <div className="mb-3">
          <label className="text-xs font-semibold text-text-muted mb-1 block">Accessories</label>
          <div className="flex flex-wrap gap-1">
            {ACCESSORIES.map((a) => (
              <button key={a.id} onClick={() => toggleAccessory(a.id)} className={`px-2 py-1 rounded-lg text-xs ${accessories.includes(a.id) ? 'bg-accent text-white' : 'bg-bg-hover'}`}>{a.label}</button>
            ))}
          </div>
        </div>
        <div className="mb-4">
          <label className="text-xs font-semibold text-text-muted mb-1 block">Personality</label>
          <div className="flex flex-wrap gap-1">
            {PERSONALITIES.map((p) => (
              <button key={p.id} onClick={() => setPersonality(p.id)} className={`px-2 py-1 rounded-lg text-xs ${personality === p.id ? 'bg-accent text-white' : 'bg-bg-hover'}`}>{p.label}</button>
            ))}
          </div>
        </div>
        <button onClick={handleSave} className="w-full py-2 rounded-lg bg-accent text-white text-sm font-semibold">Save</button>
      </motion.div>
    </div>
  )
}
