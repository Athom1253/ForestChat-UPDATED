import { create } from 'zustand'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Profile, UserSettings } from '@/types'

interface AuthState {
  session: Session | null
  user: User | null
  profile: Profile | null
  settings: UserSettings | null
  loading: boolean
  error: string | null
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signUp: (email: string, password: string, username: string, inviteCode: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
  updateProfile: (updates: Partial<Profile>) => Promise<{ error: string | null }>
  updateSettings: (updates: Partial<UserSettings>) => Promise<{ error: string | null }>
  setPresence: (status: 'online' | 'away' | 'offline') => Promise<void>
  init: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  user: null,
  profile: null,
  settings: null,
  loading: true,
  error: null,

  init: async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (session) {
      set({ session, user: session.user })
      await loadProfileAndSettings(set, session.user.id)
    }
    set({ loading: false })

    supabase.auth.onAuthStateChange((event, session) => {
      (async () => {
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          set({ session, user: session?.user ?? null })
          if (session?.user) {
            await loadProfileAndSettings(set, session.user.id)
            await get().setPresence('online')
          }
        } else if (event === 'SIGNED_OUT') {
          set({ session: null, user: null, profile: null, settings: null })
        }
      })()
    })

    // Presence heartbeat
    setInterval(async () => {
      const state = get()
      if (state.user) {
        const { data: { session } } = await supabase.auth.getSession()
        if (session) {
          await supabase.from('profiles')
            .update({ last_seen: new Date().toISOString() })
            .eq('id', state.user.id)
        }
      }
    }, 30000)
  },

  signIn: async (emailOrUsername, password) => {
    let email = emailOrUsername
    // If the input doesn't look like an email, treat it as a username and look up the email
    if (!emailOrUsername.includes('@')) {
      const { data, error: lookupError } = await supabase.rpc('get_email_by_username', { p_username: emailOrUsername })
      if (lookupError) return { error: 'Failed to look up username' }
      if (!data) return { error: 'No account found with that username' }
      email = data
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return { error: error.message }
    return { error: null }
  },

  signUp: async (email, password, username, inviteCode) => {
    // Validate invite code first
    const { data: invite, error: inviteError } = await supabase
      .from('master_invites')
      .select('*')
      .eq('code', inviteCode)
      .eq('is_active', true)
      .maybeSingle()

    if (inviteError || !invite) {
      return { error: 'Invalid or expired invite code' }
    }

    if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
      return { error: 'This invite code has expired' }
    }

    if (invite.max_uses !== null && invite.use_count >= invite.max_uses) {
      return { error: 'This invite code has reached its maximum uses' }
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { username } },
    })

    if (error) return { error: error.message }

    // Increment invite use count
    if (data.user) {
      await supabase.from('master_invites')
        .update({ use_count: invite.use_count + 1 })
        .eq('id', invite.id)
    }

    return { error: null }
  },

  signOut: async () => {
    await get().setPresence('offline')
    await supabase.auth.signOut()
    set({ session: null, user: null, profile: null, settings: null })
  },

  refreshProfile: async () => {
    const user = get().user
    if (!user) return
    await loadProfileAndSettings(set, user.id)
  },

  updateProfile: async (updates) => {
    const user = get().user
    if (!user) return { error: 'Not authenticated' }
    const { error } = await supabase.from('profiles')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', user.id)
    if (error) return { error: error.message }
    await get().refreshProfile()
    return { error: null }
  },

  updateSettings: async (updates) => {
    const user = get().user
    if (!user) return { error: 'Not authenticated' }
    const { error } = await supabase.from('user_settings')
      .upsert({ user_id: user.id, ...updates, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
    if (error) return { error: error.message }
    const { data } = await supabase.from('user_settings')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle()
    if (data) set({ settings: data })
    return { error: null }
  },

  setPresence: async (status) => {
    const user = get().user
    if (!user) return
    await supabase.rpc('update_presence', { p_status: status })
  },
}))

async function loadProfileAndSettings(set: (partial: Partial<AuthState>) => void, userId: string) {
  const { data: profile } = await supabase.from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle()

  const { data: settings } = await supabase.from('user_settings')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  set({ profile, settings })
}
