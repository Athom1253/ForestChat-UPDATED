import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { toast } from '@/stores/toast'

export default function ResetPasswordPage() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        // session is now available from the recovery token
      }
    })
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }

    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)

    if (error) {
      setError(error.message)
      toast.error('Failed to reset password')
    } else {
      toast.success('Password updated! You can now sign in.')
      navigate('/auth')
    }
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
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-primary/20 mb-4">
            <svg viewBox="0 0 32 32" className="w-12 h-12">
              <path d="M16 6C12 6 9 9 9 13c0 1 .3 2 .8 2.8L8 18l3-1c1 .7 2.2 1 3.5 1 .5 0 1 0 1.5-.1V18c0-2.2 1.8-4 4-4h.2C20 9 18 6 16 6z" fill="#4ade80"/>
              <path d="M20 16c-1.7 0-3 1.3-3 3v2c0 1.7 1.3 3 3 3h1l2 2v-2c1.7 0 3-1.3 3-3v-2c0-1.7-1.3-3-3-3h-3z" fill="#86efac"/>
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-text">Reset Password</h1>
          <p className="text-text-muted mt-2">Set a new password for your account</p>
        </div>

        <div className="card p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-text-muted mb-1.5">New Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input"
                placeholder="••••••••"
                required
                minLength={6}
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm text-text-muted mb-1.5">Confirm Password</label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="input"
                placeholder="••••••••"
                required
                minLength={6}
              />
            </div>

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
              {loading ? 'Please wait...' : 'Update Password'}
            </button>

            <button
              type="button"
              onClick={() => navigate('/auth')}
              className="w-full text-sm text-text-muted hover:text-text transition-colors text-center"
            >
              Back to sign in
            </button>
          </form>
        </div>
      </motion.div>
    </div>
  )
}
