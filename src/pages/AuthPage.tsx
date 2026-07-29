import { useState } from 'react'
import { motion } from 'framer-motion'
import { useAuthStore } from '@/stores/auth'
import { toast } from '@/stores/toast'
import { cn } from '@/lib/utils'

export default function AuthPage() {
  const { signIn, signUp } = useAuthStore()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    if (mode === 'signin') {
      const { error } = await signIn(email, password)
      if (error) {
        setError(error)
        toast.error(error)
      } else {
        toast.success('Welcome back!')
      }
    } else {
      if (!username.trim()) {
        setError('Username is required')
        setLoading(false)
        return
      }
      if (!inviteCode.trim()) {
        setError('Invite code is required')
        setLoading(false)
        return
      }
      const { error } = await signUp(email, password, username, inviteCode)
      if (error) {
        setError(error)
        toast.error(error)
      } else {
        toast.success('Account created! Check your email to confirm.')
        setMode('signin')
      }
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-bg">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md"
      >
        <div className="text-center mb-8">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.1, type: 'spring' }}
            className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-primary/20 mb-4"
          >
            <svg viewBox="0 0 32 32" className="w-12 h-12">
              <path d="M16 6C12 6 9 9 9 13c0 1 .3 2 .8 2.8L8 18l3-1c1 .7 2.2 1 3.5 1 .5 0 1 0 1.5-.1V18c0-2.2 1.8-4 4-4h.2C20 9 18 6 16 6z" fill="#4ade80"/>
              <path d="M20 16c-1.7 0-3 1.3-3 3v2c0 1.7 1.3 3 3 3h1l2 2v-2c1.7 0 3-1.3 3-3v-2c0-1.7-1.3-3-3-3h-3z" fill="#86efac"/>
            </svg>
          </motion.div>
          <h1 className="text-3xl font-bold text-text">ForestChat</h1>
          <p className="text-text-muted mt-2">Your forest-themed chat sanctuary</p>
        </div>

        <div className="card p-6">
          <div className="flex gap-2 mb-6 p-1 bg-bg/50 rounded-lg">
            <button
              onClick={() => setMode('signin')}
              className={cn(
                'flex-1 py-2 rounded-md text-sm font-medium transition-all',
                mode === 'signin' ? 'bg-primary text-bg' : 'text-text-muted hover:text-text',
              )}
            >
              Sign In
            </button>
            <button
              onClick={() => setMode('signup')}
              className={cn(
                'flex-1 py-2 rounded-md text-sm font-medium transition-all',
                mode === 'signup' ? 'bg-primary text-bg' : 'text-text-muted hover:text-text',
              )}
            >
              Sign Up
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && (
              <div>
                <label className="block text-sm text-text-muted mb-1.5">Username</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="input"
                  placeholder="forest_explorer"
                  required
                />
              </div>
            )}
            <div>
              <label className="block text-sm text-text-muted mb-1.5">Email or Username</label>
              <input
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input"
                placeholder="you@example.com or your username"
                required
              />
            </div>
            <div>
              <label className="block text-sm text-text-muted mb-1.5">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input"
                placeholder="••••••••"
                required
                minLength={6}
              />
            </div>
            {mode === 'signup' && (
              <div>
                <label className="block text-sm text-text-muted mb-1.5">Invite Code</label>
                <input
                  type="text"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                  className="input font-mono tracking-wider"
                  placeholder="FOREST01"
                  required
                />
                <p className="text-xs text-text-muted mt-1">Required for sign-up. Contact an admin.</p>
              </div>
            )}

            {error && (
              <div className="text-sm text-error bg-error/10 border border-error/30 rounded-lg px-3 py-2">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Please wait...' : mode === 'signin' ? 'Sign In' : 'Create Account'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-text-muted mt-6">
          ForestChat v1.0 · Invite-only community
        </p>
      </motion.div>
    </div>
  )
}
