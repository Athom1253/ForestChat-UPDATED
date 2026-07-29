import { supabase } from './supabase'
import type { PetState, PetSpecies, PetPersonality } from './types'

export async function loadPet(userId: string): Promise<PetState | null> {
  const { data, error } = await supabase
    .from('user_pets')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  return data as PetState | null
}

export async function createPet(userId: string, species: PetSpecies, name: string): Promise<PetState> {
  const { data: existing } = await supabase
    .from('user_pets')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()
  if (existing) return existing as PetState

  const { data, error } = await supabase
    .from('user_pets')
    .insert({ user_id: userId, species, name, personality: 'playful' })
    .select()
    .single()
  if (error) throw error
  return data as PetState
}

export async function updatePet(userId: string, updates: Partial<PetState>): Promise<void> {
  const { error } = await supabase.rpc('upsert_pet', {
    p_user_id: userId,
    p_patch: updates as Record<string, unknown>,
  })
  if (error) throw error
}

export async function petAnimal(userId: string): Promise<void> {
  const { data: pet } = await supabase.from('user_pets').select('stats, happiness, xp, level, friendship').eq('user_id', userId).maybeSingle()
  if (!pet) return
  const stats = pet.stats || { pets: 0, feeds: 0, plays: 0, baths: 0, tricks: 0 }
  stats.pets = (stats.pets || 0) + 1
  const xp = (pet.xp || 0) + 2
  await updatePet(userId, {
    stats,
    happiness: Math.min(100, (pet.happiness || 80) + 3),
    friendship: Math.min(100, (pet.friendship || 50) + 1),
    xp, level: Math.floor(xp / 100) + 1,
  } as any)
}

export async function feedAnimal(userId: string, nutrition = 25): Promise<void> {
  const { data: pet } = await supabase.from('user_pets').select('stats, hunger, happiness, xp, level, last_fed_at').eq('user_id', userId).maybeSingle()
  if (!pet) return
  const stats = pet.stats || { pets: 0, feeds: 0, plays: 0, baths: 0, tricks: 0 }
  stats.feeds = (stats.feeds || 0) + 1
  const xp = (pet.xp || 0) + 5
  await updatePet(userId, {
    stats,
    hunger: Math.min(100, (pet.hunger || 60) + nutrition),
    happiness: Math.min(100, (pet.happiness || 80) + 2),
    xp, level: Math.floor(xp / 100) + 1,
    last_fed_at: new Date().toISOString(),
  } as any)
}

export async function giveWater(userId: string): Promise<void> {
  await updatePet(userId, { energy: 90, happiness: 85 } as any)
}

export async function playAnimal(userId: string): Promise<void> {
  const { data: pet } = await supabase.from('user_pets').select('stats, energy, happiness, xp, level, friendship, last_played_at').eq('user_id', userId).maybeSingle()
  if (!pet) return
  const stats = pet.stats || { pets: 0, feeds: 0, plays: 0, baths: 0, tricks: 0 }
  stats.plays = (stats.plays || 0) + 1
  const xp = (pet.xp || 0) + 8
  await updatePet(userId, {
    stats,
    energy: Math.max(0, (pet.energy || 80) - 15),
    happiness: Math.min(100, (pet.happiness || 80) + 8),
    friendship: Math.min(100, (pet.friendship || 50) + 2),
    xp, level: Math.floor(xp / 100) + 1,
    last_played_at: new Date().toISOString(),
  } as any)
}

export async function bathAnimal(userId: string): Promise<void> {
  const { data: pet } = await supabase.from('user_pets').select('stats, cleanliness, happiness').eq('user_id', userId).maybeSingle()
  if (!pet) return
  const stats = pet.stats || { pets: 0, feeds: 0, plays: 0, baths: 0, tricks: 0 }
  stats.baths = (stats.baths || 0) + 1
  await updatePet(userId, {
    stats,
    cleanliness: 100,
    happiness: Math.min(100, (pet.happiness || 80) + 5),
    last_bathed_at: new Date().toISOString(),
  } as any)
}

export async function teachTrick(userId: string, trickName: string): Promise<void> {
  const { data: pet } = await supabase.from('user_pets').select('tricks_learned, stats, xp, level').eq('user_id', userId).maybeSingle()
  if (!pet) return
  const tricks = pet.tricks_learned || []
  if (tricks.includes(trickName)) return
  tricks.push(trickName)
  const stats = pet.stats || { pets: 0, feeds: 0, plays: 0, baths: 0, tricks: 0 }
  stats.tricks = (stats.tricks || 0) + 1
  const xp = (pet.xp || 0) + 15
  await updatePet(userId, { tricks_learned: tricks, stats, xp, level: Math.floor(xp / 100) + 1 } as any)
}

export async function putToSleep(userId: string): Promise<void> {
  await updatePet(userId, { is_sleeping: true, last_slept_at: new Date().toISOString() } as any)
}

export async function wakeUp(userId: string): Promise<void> {
  await updatePet(userId, { is_sleeping: false, energy: 100 } as any)
}

export async function customizePet(userId: string, updates: {
  species?: PetSpecies
  name?: string
  color_variant?: string
  accessories?: string[]
  personality?: PetPersonality
}): Promise<void> {
  await updatePet(userId, updates as any)
}
