import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { MessageCircle, User, Plus, X, Leaf, Lock, Ticket, Mail } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { validateInviteCode, redeemInviteCode, getUserById } from '../lib/api'
import { useStore } from '../lib/store'
import { supabase } from '../lib/supabase'

export default function AuthScreen() {
  const navigate = useNavigate()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showAccounts, setShowAccounts] = useState(false)
  const [initializing, setInitializing] = useState(true)

  const { currentUser, accounts, setCurrentUser, addAccount, removeAccount } = useStore()

  // Check for existing session on mount
  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user) {
        const user = await getUserById(session.user.id)
        if (user) {
          setCurrentUser(user)
          addAccount(user)
          navigate('/chat')
          return
        }
      }
      setInitializing(false)
    }
    checkSession()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        (async () => {
          const user = await getUserById(session.user.id)
          if (user) {
            setCurrentUser(user)
            addAccount(user)
            navigate('/chat')
          }
        })()
      } else if (event === 'SIGNED_OUT') {
        setCurrentUser(null)
      }
    })
    return () => { subscription.unsubscribe() }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (useStore.getState().accounts.length > 0) setShowAccounts(true)
  }, [])

  const handleLogin = async () => {
    if (!email.trim()) { setError('Email is required'); return }
    if (!password.trim()) { setError('Password is required'); return }
    setLoading(true)
    setError('')
    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      })
      if (signInError) {
        if (signInError.message.includes('Invalid login credentials')) {
          setError('Invalid email or password. Please try again.')
        } else {
          setError(signInError.message)
        }
        return
      }
      if (data.user) {
        const user = await getUserById(data.user.id)
        if (user) {
          setCurrentUser(user)
          addAccount(user)
          navigate('/chat')
        } else {
          setError('Account not found. Please contact support.')
        }
      }
    } catch {
      setError('Login failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleRegister = async () => {
    if (!email.trim()) { setError('Email is required'); return }
    if (!password.trim()) { setError('Password is required'); return }
    if (password.length < 6) { setError('Password must be at least 6 characters'); return }
    if (!username.trim()) { setError('Username is required'); return }
    if (username.trim().length < 3) { setError('Username must be at least 3 characters'); return }
    if (!inviteCode.trim()) { setError('An invite code is required to create an account'); return }

    setLoading(true)
    setError('')
    try {
      const validation = await validateInviteCode(inviteCode.trim())
      if (!validation.valid) { setError(validation.reason); setLoading(false); return }

      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
      })
      if (signUpError) {
        if (signUpError.message.includes('already registered')) {
          setError('This email is already registered. Try signing in instead.')
        } else {
          setError(signUpError.message)
        }
        setLoading(false)
        return
      }

      // Check if we have a session (email confirmation disabled)
      // or if user exists but needs confirmation (email confirmation enabled)
      if (data.session?.user) {
        // Session is active - user is immediately signed in
        const userId = data.session.user.id

        // Create app_users entry with the same UUID
        const { error: createError } = await supabase
          .from('app_users')
          .insert({
            id: userId,
            username: username.trim().toLowerCase(),
            display_name: displayName.trim() || username.trim(),
            status: 'online',
            last_seen: new Date().toISOString(),
          })
          .select()
          .single()

        if (createError) {
          console.error('Failed to create app_users entry:', createError)
          setError('Failed to complete registration. Please try again.')
          setLoading(false)
          return
        }

        await redeemInviteCode(validation.inviteId, userId, inviteCode.trim())

        const user = await getUserById(userId)
        if (user) {
          setCurrentUser(user)
          addAccount(user)
          navigate('/chat')
        }
      } else if (data.user && !data.session) {
        // Email confirmation is enabled - user needs to verify email
        setError('Please check your email to confirm your account, then sign in.')
        setLoading(false)
        return
      }

      setLoading(false)
    } catch (e: any) {
      setError(e.message || 'Registration failed. Please try again.')
      setLoading(false)
    }
  }

  const switchAccount = async (accountId: string) => {
    const user = await getUserById(accountId)
    if (user) { setCurrentUser(user); navigate('/chat') }
  }

  if (initializing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg">
        <div className="w-8 h-8 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg p-4 relative overflow-hidden nature-bg">
      <div className="absolute top-8 left-8 text-accent/20 leaf-sway"><Leaf className="w-8 h-8" /></div>
      <div className="absolute bottom-12 right-12 text-accent/15 leaf-sway" style={{ animationDelay: '1s' }}>
        <Leaf className="w-10 h-10" style={{ transform: 'rotate(180deg)' }} />
      </div>
      <div className="absolute top-1/4 right-16 text-accent/10 soft-breathe">
        <Leaf className="w-6 h-6" style={{ transform: 'rotate(45deg)' }} />
      </div>
      <div className="absolute bottom-1/4 left-20 text-accent/10 soft-breathe" style={{ animationDelay: '1.5s' }}>
        <Leaf className="w-5 h-5" style={{ transform: 'rotate(-45deg)' }} />
      </div>

      <div className="w-full max-w-md relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="bg-bg-surface/90 backdrop-blur-md border border-border rounded-2xl shadow-lg p-8"
        >
          <div className="flex items-center justify-center gap-3 mb-8">
            <div className="w-14 h-14 rounded-2xl bg-accent/15 flex items-center justify-center shadow-sm">
              <MessageCircle className="w-7 h-7 text-accent" />
            </div>
            <div className="text-center">
              <h1 className="text-2xl font-bold text-text">ForestChat</h1>
              <p className="text-xs text-text-muted tracking-wide">cozy conversations, naturally</p>
            </div>
          </div>

          <AnimatePresence mode="wait">
            {showAccounts && accounts.length > 0 ? (
              <motion.div key="accounts" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
                <h2 className="text-sm font-bold text-text-muted mb-3">Choose account</h2>
                {accounts.map((acc) => (
                  <div
                    key={acc.id}
                    onClick={() => switchAccount(acc.id)}
                    className="w-full flex items-center gap-3 p-3 rounded-xl bg-bg hover:bg-bg-hover border border-border transition-all cursor-pointer"
                  >
                    <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center shrink-0 overflow-hidden">
                      {acc.avatar_url
                        ? <img src={acc.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover" />
                        : <User className="w-5 h-5 text-accent" />
                      }
                    </div>
                    <div className="flex-1 text-left">
                      <div className="font-bold text-text text-sm">{acc.display_name || acc.username}</div>
                      <div className="text-xs text-text-muted">@{acc.username}</div>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); removeAccount(acc.id); if (accounts.length === 1) setShowAccounts(false) }}
                      className="p-1.5 hover:bg-error-light rounded-lg text-error transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => { setShowAccounts(false); setMode('login') }}
                  className="w-full flex items-center justify-center gap-2 p-3 rounded-xl border border-dashed border-border text-text-muted hover:text-accent hover:border-accent/50 transition-all"
                >
                  <Plus className="w-4 h-4" />
                  <span className="text-sm">Use a different account</span>
                </button>
              </motion.div>
            ) : (
              <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
                <div className="flex gap-2 p-1 bg-bg-surface-2 rounded-xl mb-2">
                  {(['login', 'register'] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => { setMode(m); setError('') }}
                      className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all ${
                        mode === m ? 'bg-accent text-white shadow-sm' : 'text-text-muted hover:text-text'
                      }`}
                    >
                      {m === 'login' ? 'Sign In' : 'Create Account'}
                    </button>
                  ))}
                </div>

                {mode === 'register' && (
                  <div className="flex items-start gap-2.5 p-3 rounded-xl bg-accent/5 border border-accent/15">
                    <Lock className="w-4 h-4 text-accent mt-0.5 shrink-0" />
                    <p className="text-xs text-text-muted leading-relaxed">
                      This is a private, invite-only community. You'll need a valid invite code from an existing member to create an account.
                    </p>
                  </div>
                )}

                {/* Email */}
                <div>
                  <label className="block text-sm font-bold text-text-muted mb-1.5">
                    <span className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" /> Email</span>
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    autoComplete="email"
                    className="w-full px-4 py-3 rounded-xl bg-bg border border-border text-text placeholder:text-text-muted focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 transition-all"
                    onKeyDown={(e) => e.key === 'Enter' && (mode === 'login' ? handleLogin() : handleRegister())}
                  />
                </div>

                {/* Password */}
                <div>
                  <label className="block text-sm font-bold text-text-muted mb-1.5">
                    <span className="flex items-center gap-1.5"><Lock className="w-3.5 h-3.5" /> Password</span>
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={mode === 'register' ? 'At least 6 characters' : 'Your password'}
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    className="w-full px-4 py-3 rounded-xl bg-bg border border-border text-text placeholder:text-text-muted focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 transition-all"
                    onKeyDown={(e) => e.key === 'Enter' && (mode === 'login' ? handleLogin() : handleRegister())}
                  />
                </div>

                {/* Username (register only) */}
                {mode === 'register' && (
                  <div>
                    <label className="block text-sm font-bold text-text-muted mb-1.5">
                      <span className="flex items-center gap-1.5"><User className="w-3.5 h-3.5" /> Username</span>
                    </label>
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="your_username"
                      autoComplete="username"
                      className="w-full px-4 py-3 rounded-xl bg-bg border border-border text-text placeholder:text-text-muted focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 transition-all"
                      onKeyDown={(e) => e.key === 'Enter' && handleRegister()}
                    />
                  </div>
                )}

                {/* Display name (register only) */}
                {mode === 'register' && (
                  <div>
                    <label className="block text-sm font-bold text-text-muted mb-1.5">Display Name <span className="font-normal opacity-60">(optional)</span></label>
                    <input
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Your name"
                      className="w-full px-4 py-3 rounded-xl bg-bg border border-border text-text placeholder:text-text-muted focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 transition-all"
                      onKeyDown={(e) => e.key === 'Enter' && handleRegister()}
                    />
                  </div>
                )}

                {/* Invite code (register only) */}
                {mode === 'register' && (
                  <div>
                    <label className="block text-sm font-bold text-text-muted mb-1.5">
                      <span className="flex items-center gap-1.5"><Ticket className="w-3.5 h-3.5" /> Invite Code</span>
                    </label>
                    <input
                      type="text"
                      value={inviteCode}
                      onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                      placeholder="XXXX-XXXX"
                      autoComplete="off"
                      spellCheck={false}
                      className="w-full px-4 py-3 rounded-xl bg-bg border border-border text-text placeholder:text-text-muted focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 transition-all font-mono tracking-wider"
                      onKeyDown={(e) => e.key === 'Enter' && handleRegister()}
                    />
                  </div>
                )}

                {/* Error */}
                {error && (
                  <motion.p
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-sm text-error bg-error-light px-3 py-2.5 rounded-xl border border-error/20"
                  >
                    {error}
                  </motion.p>
                )}

                {/* Submit */}
                <button
                  onClick={mode === 'login' ? handleLogin : handleRegister}
                  disabled={loading}
                  className="w-full py-3 rounded-xl bg-accent text-white font-bold hover:bg-accent-hover transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-sm"
                >
                  {loading
                    ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    : mode === 'login' ? 'Sign In' : 'Create Account'
                  }
                </button>

                {/* Switch to saved accounts */}
                {accounts.length > 0 && (
                  <button onClick={() => setShowAccounts(true)} className="w-full text-sm text-accent hover:text-accent-hover transition-colors">
                    Switch to another account
                  </button>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        <p className="text-center text-xs text-text-muted mt-6 opacity-50">
          A private cozy space — for invited friends only
        </p>
      </div>
    </div>
  )
}
