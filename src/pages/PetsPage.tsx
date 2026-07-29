import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { toast } from '@/stores/toast'
import type { Pet, PetItem, PetAchievement } from '@/types'

const SPECIES = [
  { id: 'forest_sprite', name: 'Forest Sprite', emoji: '🌿', color: '#4ade80' },
  { id: 'leaf_fox', name: 'Leaf Fox', emoji: '🦊', color: '#f97316' },
  { id: 'moss_bear', name: 'Moss Bear', emoji: '🐻', color: '#92400e' },
  { id: 'mushroom_pal', name: 'Mushroom Pal', emoji: '🍄', color: '#dc2626' },
  { id: 'firefly_sprite', name: 'Firefly Sprite', emoji: '✨', color: '#fbbf24' },
  { id: 'river_otter', name: 'River Otter', emoji: '🦦', color: '#06b6d4' },
]

const ACHIEVEMENTS = [
  { id: 'first_steps', name: 'First Steps', desc: 'Adopt your first pet' },
  { id: 'well_fed', name: 'Well Fed', desc: 'Feed your pet 10 times' },
  { id: 'playful', name: 'Playful', desc: 'Play with your pet 10 times' },
  { id: 'level_5', name: 'Growing Up', desc: 'Reach level 5' },
  { id: 'level_10', name: 'Forest Guardian', desc: 'Reach level 10' },
  { id: 'happy_pet', name: 'Happy Pet', desc: 'Keep happiness above 90 for a day' },
]

export default function PetsPage() {
  const { user } = useAuthStore()
  const [pet, setPet] = useState<Pet | null>(null)
  const [items, setItems] = useState<PetItem[]>([])
  const [achievements, setAchievements] = useState<PetAchievement[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [petAction, setPetAction] = useState<'idle' | 'walking' | 'eating' | 'playing' | 'sleeping'>('idle')
  const [petPos, setPetPos] = useState({ x: 50, y: 50 })
  const [petDirection, setPetDirection] = useState(1)
  const walkTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    loadPet()
  }, [user?.id])

  // Pet walking animation
  useEffect(() => {
    if (!pet) return
    walkTimerRef.current = setInterval(() => {
      setPetPos((prev) => {
        const newX = prev.x + (Math.random() - 0.5) * 20
        const clampedX = Math.max(10, Math.min(90, newX))
        setPetDirection(clampedX > prev.x ? 1 : -1)
        return { x: clampedX, y: Math.max(20, Math.min(80, prev.y + (Math.random() - 0.5) * 10)) }
      })
      setPetAction(Math.random() > 0.7 ? 'walking' : 'idle')
    }, 3000)
    return () => { if (walkTimerRef.current) clearInterval(walkTimerRef.current) }
  }, [pet?.id])

  async function loadPet() {
    if (!user) return
    setLoading(true)
    const { data: petData } = await supabase.from('pets').select('*').eq('owner_id', user.id).maybeSingle()
    setPet(petData)
    if (petData) {
      const [{ data: itemsData }, { data: achData }] = await Promise.all([
        supabase.from('pet_items').select('*').eq('pet_id', petData.id),
        supabase.from('pet_achievements').select('*').eq('pet_id', petData.id),
      ])
      setItems(itemsData || [])
      setAchievements(achData || [])
    }
    setLoading(false)
  }

  const createPet = async (speciesId: string) => {
    if (!user) return
    const species = SPECIES.find((s) => s.id === speciesId)!
    const { data, error } = await supabase.from('pets').insert({
      owner_id: user.id,
      name: `${species.name}`,
      species: speciesId,
      color: species.color,
    }).select().single()

    if (error) { toast.error('Failed to create pet'); return }
    // Award first steps achievement
    await supabase.from('pet_achievements').insert({
      pet_id: data.id,
      owner_id: user.id,
      achievement_id: 'first_steps',
      achievement_name: 'First Steps',
    })
    toast.success(`${species.name} adopted!`)
    setShowCreate(false)
    loadPet()
  }

  const feedPet = async () => {
    if (!pet || !user) return
    setPetAction('eating')
    const newHunger = Math.max(0, pet.hunger - 20)
    const newHappiness = Math.min(100, pet.happiness + 5)
    const newEnergy = Math.min(100, pet.energy + 10)
    const xpGain = 5
    const newXp = pet.xp + xpGain
    const newLevel = Math.floor(newXp / 100) + 1

    await supabase.from('pets').update({
      hunger: newHunger,
      happiness: newHappiness,
      energy: newEnergy,
      xp: newXp,
      level: newLevel,
      last_fed: new Date().toISOString(),
      last_updated: new Date().toISOString(),
    }).eq('id', pet.id)

    setPet({ ...pet, hunger: newHunger, happiness: newHappiness, energy: newEnergy, xp: newXp, level: newLevel })
    toast.success(`${pet.name} enjoyed the food!`)
    setTimeout(() => setPetAction('idle'), 2000)
  }

  const playWithPet = async () => {
    if (!pet || !user) return
    if (pet.energy < 20) { toast.warning(`${pet.name} is too tired to play`); return }
    setPetAction('playing')
    const newHappiness = Math.min(100, pet.happiness + 15)
    const newEnergy = Math.max(0, pet.energy - 20)
    const xpGain = 10
    const newXp = pet.xp + xpGain
    const newLevel = Math.floor(newXp / 100) + 1

    await supabase.from('pets').update({
      happiness: newHappiness,
      energy: newEnergy,
      xp: newXp,
      level: newLevel,
      last_played: new Date().toISOString(),
      last_updated: new Date().toISOString(),
    }).eq('id', pet.id)

    setPet({ ...pet, happiness: newHappiness, energy: newEnergy, xp: newXp, level: newLevel })
    toast.success(`${pet.name} had fun playing!`)
    setTimeout(() => setPetAction('idle'), 2000)
  }

  const sleepPet = async () => {
    if (!pet) return
    setPetAction('sleeping')
    const newEnergy = Math.min(100, pet.energy + 40)
    await supabase.from('pets').update({
      energy: newEnergy,
      last_updated: new Date().toISOString(),
    }).eq('id', pet.id)
    setPet({ ...pet, energy: newEnergy })
    toast.success(`${pet.name} is resting...`)
    setTimeout(() => setPetAction('idle'), 3000)
  }

  const renamePet = async () => {
    if (!pet) return
    const name = prompt('New name for your pet:', pet.name)
    if (!name || !name.trim()) return
    await supabase.from('pets').update({ name: name.trim() }).eq('id', pet.id)
    setPet({ ...pet, name: name.trim() })
    toast.success('Pet renamed!')
  }

  const changePetSpecies = async (speciesId: string) => {
    if (!pet) return
    const species = SPECIES.find((s) => s.id === speciesId)!
    await supabase.from('pets').update({ species: speciesId, color: species.color }).eq('id', pet.id)
    setPet({ ...pet, species: speciesId, color: species.color })
    toast.success(`Your pet is now a ${species.name}!`)
    setShowChangeSpecies(false)
  }

  const [showChangeSpecies, setShowChangeSpecies] = useState(false)

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-bg">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!pet) {
    return (
      <div className="flex-1 flex flex-col bg-bg">
        <div className="h-14 flex items-center px-6 border-b border-border bg-surface">
          <h1 className="text-lg font-semibold text-text">My Pet</h1>
        </div>
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center max-w-md">
            <div className="w-24 h-24 mx-auto mb-6 rounded-2xl bg-primary/10 flex items-center justify-center text-5xl">🐾</div>
            <h2 className="text-xl font-semibold text-text mb-2">Adopt a Forest Pet</h2>
            <p className="text-text-muted mb-6">Choose a companion to join you on your ForestChat journey.</p>
            <button onClick={() => setShowCreate(true)} className="btn-primary">Choose Your Pet</button>
          </div>
        </div>

        <AnimatePresence>
          {showCreate && (
            <div className="fixed inset-0 bg-black/60 z-[200] flex items-center justify-center p-4" onClick={() => setShowCreate(false)}>
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-surface border border-border rounded-2xl p-6 max-w-lg w-full"
                onClick={(e) => e.stopPropagation()}
              >
                <h2 className="text-lg font-semibold text-text mb-4">Choose a Species</h2>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {SPECIES.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => createPet(s.id)}
                      className="p-4 rounded-xl border-2 border-border hover:border-primary transition-all hover:scale-105 text-center"
                    >
                      <div className="text-4xl mb-2">{s.emoji}</div>
                      <p className="text-sm text-text">{s.name}</p>
                    </button>
                  ))}
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    )
  }

  const species = SPECIES.find((s) => s.id === pet.species) || SPECIES[0]
  const moodEmoji = pet.mood === 'happy' ? '😊' : pet.mood === 'sad' ? '😢' : pet.mood === 'excited' ? '🤩' : pet.mood === 'sleepy' ? '😴' : '😐'

  return (
    <div className="flex-1 flex flex-col bg-bg overflow-hidden">
      <div className="h-14 flex items-center justify-between px-6 border-b border-border bg-surface">
        <h1 className="text-lg font-semibold text-text">My Pet</h1>
        <div className="flex gap-2">
          <button onClick={() => setShowChangeSpecies(true)} className="btn-ghost text-sm">Change Species</button>
          <button onClick={renamePet} className="btn-ghost text-sm">Rename</button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl mx-auto">
          {/* Pet display area */}
          <div className="card relative h-64 mb-6 overflow-hidden bg-gradient-to-b from-primary/10 to-transparent">
            {/* Walking area */}
            <motion.div
              animate={{ left: `${petPos.x}%`, top: `${petPos.y}%` }}
              transition={{ duration: 2, ease: 'easeInOut' }}
              className="absolute"
              style={{ transform: `translate(-50%, -50%) scaleX(${petDirection})` }}
            >
              <motion.div
                animate={petAction === 'idle' ? { y: [0, -5, 0] } : petAction === 'sleeping' ? { rotate: [0, 5, 0] } : { y: [0, -10, 0] }}
                transition={{ repeat: Infinity, duration: petAction === 'sleeping' ? 3 : 1 }}
                className="text-6xl"
              >
                {petAction === 'sleeping' ? '💤' : petAction === 'eating' ? '🍽️' : species.emoji}
              </motion.div>
            </motion.div>

            {/* Status badge */}
            <div className="absolute top-3 left-3 flex items-center gap-2 px-3 py-1.5 bg-bg/80 backdrop-blur rounded-full">
              <span className="text-lg">{moodEmoji}</span>
              <span className="text-sm text-text capitalize">{petAction}</span>
            </div>
          </div>

          {/* Pet info */}
          <div className="card p-4 mb-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-14 h-14 rounded-xl flex items-center justify-center text-3xl" style={{ backgroundColor: `${pet.color}30` }}>
                {species.emoji}
              </div>
              <div>
                <h2 className="text-xl font-bold text-text">{pet.name}</h2>
                <p className="text-sm text-text-muted">{species.name} · Level {pet.level}</p>
              </div>
            </div>

            {/* Stats */}
            <div className="space-y-3">
              <StatBar label="Energy" value={pet.energy} max={100} color="var(--color-warning)" />
              <StatBar label="Happiness" value={pet.happiness} max={100} color="var(--color-primary)" />
              <StatBar label="Hunger" value={pet.hunger} max={100} color="var(--color-error)" />
              <StatBar label="XP" value={pet.xp % 100} max={100} color="var(--color-accent)" labelExtra={`Level ${pet.level} · ${pet.xp % 100}/100 XP`} />
            </div>
          </div>

          {/* Actions */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            <button onClick={feedPet} className="btn-primary flex flex-col items-center gap-1 py-4">
              <span className="text-2xl">🍎</span>
              <span className="text-sm">Feed</span>
            </button>
            <button onClick={playWithPet} className="btn-primary flex flex-col items-center gap-1 py-4">
              <span className="text-2xl">🎾</span>
              <span className="text-sm">Play</span>
            </button>
            <button onClick={sleepPet} className="btn-primary flex flex-col items-center gap-1 py-4">
              <span className="text-2xl">😴</span>
              <span className="text-sm">Sleep</span>
            </button>
          </div>

          {/* Inventory */}
          <div className="card p-4 mb-4">
            <h3 className="font-semibold text-text mb-3">Inventory ({items.length})</h3>
            {items.length === 0 ? (
              <p className="text-sm text-text-muted text-center py-4">No items yet. Play and feed your pet to earn items!</p>
            ) : (
              <div className="grid grid-cols-4 gap-2">
                {items.map((item) => (
                  <div key={item.id} className="p-2 bg-bg rounded-lg text-center">
                    <div className="text-2xl">
                      {item.item_type === 'food' ? '🍎' : item.item_type === 'toy' ? '🎾' : item.item_type === 'accessory' ? '🎩' : '🧪'}
                    </div>
                    <p className="text-xs text-text-muted truncate">{item.item_name}</p>
                    <p className="text-xs text-text-muted">x{item.quantity}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Achievements */}
          <div className="card p-4">
            <h3 className="font-semibold text-text mb-3">Achievements ({achievements.length}/{ACHIEVEMENTS.length})</h3>
            <div className="grid grid-cols-2 gap-2">
              {ACHIEVEMENTS.map((ach) => {
                const unlocked = achievements.find((a) => a.achievement_id === ach.id)
                return (
                  <div key={ach.id} className={`p-3 rounded-lg ${unlocked ? 'bg-primary/10 border border-primary/30' : 'bg-bg opacity-50'}`}>
                    <p className="text-sm font-medium text-text">{unlocked ? '🏆' : '🔒'} {ach.name}</p>
                    <p className="text-xs text-text-muted">{ach.desc}</p>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Change Species Modal */}
      {showChangeSpecies && pet && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setShowChangeSpecies(false)}>
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-surface rounded-2xl p-6 max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-text mb-4">Change your pet's species</h2>
            <p className="text-sm text-text-muted mb-4">Pick a new species for {pet.name}. This will change their appearance.</p>
            <div className="grid grid-cols-3 gap-3">
              {SPECIES.map((s) => (
                <button
                  key={s.id}
                  onClick={() => changePetSpecies(s.id)}
                  className={`p-4 rounded-xl border-2 transition-all hover:scale-105 ${pet.species === s.id ? 'border-primary bg-primary/10' : 'border-border bg-bg'}`}
                >
                  <div className="text-3xl mb-1">{s.emoji}</div>
                  <div className="text-xs text-text">{s.name}</div>
                </button>
              ))}
            </div>
            <button onClick={() => setShowChangeSpecies(false)} className="btn-ghost w-full mt-4">Cancel</button>
          </motion.div>
        </div>
      )}
    </div>
  )
}

function StatBar({ label, value, max, color, labelExtra }: { label: string; value: number; max: number; color: string; labelExtra?: string }) {
  const pct = Math.min(100, (value / max) * 100)
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-text-muted">{label}</span>
        <span className="text-text">{labelExtra || `${value}/${max}`}</span>
      </div>
      <div className="h-2 bg-bg rounded-full overflow-hidden">
        <motion.div
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.5 }}
          className="h-full rounded-full"
          style={{ backgroundColor: color }}
        />
      </div>
    </div>
  )
}
