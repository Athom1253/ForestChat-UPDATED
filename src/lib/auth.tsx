import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase, type AppUser } from './supabase'

interface SavedAccount {
  email: string
  username: string
  avatar_url: string | null
  display_name: string | null
}

interface AuthContextValue {
  session: Session | null
  user: User | null
  profile: AppUser | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signUp: (email: string, password: string, username: string, inviteCode: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
  switchAccount: (email: string, password: string) => Promise<{ error: string | null }>
  savedAccounts: SavedAccount[]
  removeSavedAccount: (email: string) => void
  autoStatus: string
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

function getSavedAccounts(): SavedAccount[] {
  try { return JSON.parse(localStorage.getItem('forestchat-saved-accounts') || '[]') } catch { return [] }
}

function addSavedAccount(acc: SavedAccount) {
  const accounts = getSavedAccounts().filter(a => a.email !== acc.email)
  accounts.unshift(acc)
  localStorage.setItem('forestchat-saved-accounts', JSON.stringify(accounts.slice(0, 5)))
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<AppUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [autoStatus, setAutoStatus] = useState('online')
  const [savedAccounts, setSavedAccounts] = useState<SavedAccount[]>(getSavedAccounts)

  const loadProfile = useCallback(async (uid: string) => {
    const { data, error } = await supabase.from('app_users').select('*').eq('id', uid).maybeSingle()
    if (error) { console.error('Failed to load profile:', error); return }
    setProfile(data as AppUser | null)
    if (data) {
      addSavedAccount({
        email: data.username,
        username: data.username,
        avatar_url: data.avatar_url,
        display_name: data.display_name,
      })
      setSavedAccounts(getSavedAccounts())
    }
  }, [])

  const refreshProfile = useCallback(async () => {
    if (user) await loadProfile(user.id)
  }, [user, loadProfile])

  useEffect(() => {
    let mounted = true
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) {
        loadProfile(session.user.id).finally(() => { if (mounted) setLoading(false) })
      } else { setLoading(false) }
    })

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) {
        (async () => { await loadProfile(session.user.id) })()
      } else { setProfile(null) }
    })

    return () => { mounted = false; authListener.subscription.unsubscribe() }
  }, [loadProfile])

  // Auto status detection
  useEffect(() => {
    let idleTimer: ReturnType<typeof setTimeout> | null = null
    let awayTimer: ReturnType<typeof setTimeout> | null = null

    const updateActivity = () => {
      setAutoStatus('online')
      if (idleTimer) clearTimeout(idleTimer)
      if (awayTimer) clearTimeout(awayTimer)
      idleTimer = setTimeout(() => setAutoStatus('idle'), 5 * 60 * 1000) // 5 min idle
      awayTimer = setTimeout(() => setAutoStatus('offline'), 15 * 60 * 1000) // 15 min away
    }

    const events = ['mousemove', 'keydown', 'click', 'touchstart', 'scroll']
    events.forEach(e => window.addEventListener(e, updateActivity, { passive: true }))
    updateActivity()

    // Update presence on status change
    if (profile && autoStatus !== 'offline') {
      supabase.rpc('update_presence', { p_status: autoStatus }).then()
    }

    return () => {
      events.forEach(e => window.removeEventListener(e, updateActivity))
      if (idleTimer) clearTimeout(idleTimer)
      if (awayTimer) clearTimeout(awayTimer)
    }
  }, [profile, autoStatus])

  // Update last seen on unload
  useEffect(() => {
    const handler = () => {
      if (user) {
        supabase.rpc('update_last_seen').then()
      }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [user])

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error?.message ?? null }
  }

  const signUp = async (email: string, password: string, username: string, inviteCode: string) => {
    // Validate invite code first (before creating the auth account)
    const { data: validation, error: validationError } = await supabase.rpc('validate_invite_code', { p_code: inviteCode })
    if (validationError) return { error: 'Failed to validate invite code. Please try again.' }
    if (!validation?.valid) return { error: validation.reason || 'Invalid invite code' }

    const { data, error } = await supabase.auth.signUp({ email, password })
    if (error) return { error: error.message }
    if (data.user) {
      const { error: profileError } = await supabase
        .from('app_users')
        .insert({ id: data.user.id, username, invite_code_used: inviteCode })
      if (profileError) return { error: profileError.message }

      // Redeem the invite code now that the user is authenticated
      const { error: redeemError } = await supabase.rpc('redeem_invite_code', { p_code: inviteCode })
      if (redeemError) console.error('Invite redemption failed:', redeemError.message)
    }
    return { error: null }
  }

  const signOut = async () => {
    if (user) await supabase.rpc('update_presence', { p_status: 'offline' }).then()
    await supabase.auth.signOut()
    setProfile(null)
  }

  const switchAccount = async (email: string, password: string) => {
    await signOut()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error?.message ?? null }
  }

  const removeSavedAccount = (email: string) => {
    const accounts = getSavedAccounts().filter(a => a.email !== email)
    localStorage.setItem('forestchat-saved-accounts', JSON.stringify(accounts))
    setSavedAccounts(accounts)
  }

  return (
    <AuthContext.Provider value={{ session, user, profile, loading, signIn, signUp, signOut, refreshProfile, switchAccount, savedAccounts, removeSavedAccount, autoStatus }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
