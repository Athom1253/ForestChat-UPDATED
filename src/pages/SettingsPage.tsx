import { useState } from 'react'
import { motion } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { toast } from '@/stores/toast'
import { cn } from '@/lib/utils'

const THEMES = [
  { id: 'forest', name: 'Forest', preview: ['#0f1a14', '#4ade80'] },
  { id: 'dark', name: 'Dark', preview: ['#0a0a0a', '#6366f1'] },
  { id: 'light', name: 'Light', preview: ['#f5f5f5', '#059669'] },
  { id: 'ocean', name: 'Ocean', preview: ['#0c1929', '#0ea5e9'] },
  { id: 'sunset', name: 'Sunset', preview: ['#1a0f0a', '#f97316'] },
  { id: 'aurora', name: 'Aurora', preview: ['#0a0e1a', '#10b981'] },
  { id: 'space', name: 'Space', preview: ['#050510', '#6366f1'] },
  { id: 'minimal', name: 'Minimal', preview: ['#fafafa', '#171717'] },
]

const BACKGROUNDS = [
  { id: 'none', name: 'None', icon: '∅' },
  { id: 'fireflies', name: 'Fireflies', icon: '✦' },
  { id: 'leaves', name: 'Leaves', icon: '🍂' },
  { id: 'snow', name: 'Snow', icon: '❄️' },
  { id: 'rain', name: 'Rain', icon: '🌧️' },
  { id: 'stars', name: 'Stars', icon: '⭐' },
  { id: 'particles', name: 'Particles', icon: '●' },
  { id: 'waves', name: 'Waves', icon: '🌊' },
  { id: 'gradients', name: 'Gradients', icon: '◐' },
]

export default function SettingsPage() {
  const { settings, updateSettings, profile, user } = useAuthStore()
  const [showEmailChange, setShowEmailChange] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [emailPassword, setEmailPassword] = useState('')
  const [emailSaving, setEmailSaving] = useState(false)

  const handleUpdate = async (updates: Record<string, unknown>) => {
    const { error } = await updateSettings(updates as any)
    if (error) toast.error('Failed to update settings')
  }

  const handleChangeEmail = async () => {
    if (!newEmail.trim() || !emailPassword) return
    setEmailSaving(true)
    try {
      const { error } = await supabase.auth.updateUser({ email: newEmail.trim() }, { password: emailPassword })
      if (error) {
        toast.error(error.message)
      } else {
        toast.success('Email updated! You may need to verify the new email.')
        setShowEmailChange(false)
        setNewEmail('')
        setEmailPassword('')
      }
    } catch {
      toast.error('Failed to update email')
    } finally {
      setEmailSaving(false)
    }
  }

  return (
    <div className="flex-1 flex flex-col bg-bg overflow-hidden">
      <div className="h-14 flex items-center px-6 border-b border-border bg-surface">
        <h1 className="text-lg font-semibold text-text">Settings</h1>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl mx-auto space-y-8">
          {/* Themes */}
          <Section title="Themes" description="Choose your preferred color scheme">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {THEMES.map((theme) => (
                <button
                  key={theme.id}
                  onClick={() => handleUpdate({ theme: theme.id })}
                  className={cn(
                    'relative p-3 rounded-xl border-2 transition-all hover:scale-105',
                    settings?.theme === theme.id ? 'border-primary' : 'border-border',
                  )}
                >
                  <div className="w-full h-16 rounded-lg mb-2" style={{ background: `linear-gradient(135deg, ${theme.preview[0]}, ${theme.preview[1]})` }} />
                  <p className="text-sm text-text text-center">{theme.name}</p>
                  {settings?.theme === theme.id && (
                    <div className="absolute top-1 right-1 w-5 h-5 bg-primary rounded-full flex items-center justify-center">
                      <svg className="w-3 h-3 text-bg" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                    </div>
                  )}
                </button>
              ))}
            </div>
          </Section>

          {/* Animated backgrounds */}
          <Section title="Animated Background" description="Add ambient effects to your chat">
            <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
              {BACKGROUNDS.map((bg) => (
                <button
                  key={bg.id}
                  onClick={() => handleUpdate({ animated_background: bg.id })}
                  className={cn(
                    'p-3 rounded-xl border-2 transition-all hover:scale-105 flex flex-col items-center gap-1',
                    settings?.animated_background === bg.id ? 'border-primary bg-primary/10' : 'border-border bg-surface',
                  )}
                >
                  <span className="text-2xl">{bg.icon}</span>
                  <span className="text-xs text-text">{bg.name}</span>
                </button>
              ))}
            </div>
          </Section>

          {/* Notifications */}
          <Section title="Notifications" description="Manage how you receive alerts">
            <div className="space-y-3">
              <Toggle
                label="Enable notifications"
                description="Show toast notifications for new messages"
                value={settings?.notifications_enabled ?? true}
                onChange={(v) => handleUpdate({ notifications_enabled: v })}
              />
              <Toggle
                label="Notification sound"
                description="Play a sound when you receive a message"
                value={settings?.notification_sound ?? true}
                onChange={(v) => handleUpdate({ notification_sound: v })}
              />
              <Toggle
                label="Email notifications"
                description="Receive email updates about missed messages"
                value={settings?.email_notifications ?? false}
                onChange={(v) => handleUpdate({ email_notifications: v })}
              />
            </div>
          </Section>

          {/* Privacy */}
          <Section title="Privacy" description="Control your visibility and data">
            <div className="space-y-3">
              <Toggle
                label="Show online status"
                description="Let others see when you're online"
                value={settings?.show_online_status ?? true}
                onChange={(v) => handleUpdate({ show_online_status: v })}
              />
              <Toggle
                label="DM from friends only"
                description="Only allow friends to send you direct messages"
                value={settings?.allow_dm_from_friends_only ?? false}
                onChange={(v) => handleUpdate({ allow_dm_from_friends_only: v })}
              />
              <Toggle
                label="Read receipts"
                description="Send read receipts when you read messages"
                value={settings?.read_receipts_enabled ?? true}
                onChange={(v) => handleUpdate({ read_receipts_enabled: v })}
              />
              <Toggle
                label="Typing indicators"
                description="Show others when you're typing"
                value={settings?.typing_indicators_enabled ?? true}
                onChange={(v) => handleUpdate({ typing_indicators_enabled: v })}
              />
            </div>
          </Section>

          {/* Appearance */}
          <Section title="Appearance" description="Customize your chat experience">
            <div className="space-y-3">
              <Toggle
                label="Compact mode"
                description="Reduce spacing between messages"
                value={settings?.compact_mode ?? false}
                onChange={(v) => handleUpdate({ compact_mode: v })}
              />
              <Toggle
                label="Reduced motion"
                description="Minimize animations and transitions"
                value={settings?.reduced_motion ?? false}
                onChange={(v) => handleUpdate({ reduced_motion: v })}
              />
            </div>
          </Section>

          {/* Account / Email change */}
          <Section title="Account" description="Manage your account email">
            <div className="card p-4 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-text-muted">Current email</span>
                <span className="text-text">{user?.email}</span>
              </div>
              {showEmailChange ? (
                <div className="space-y-3 pt-2">
                  <input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    className="input"
                    placeholder="new-email@example.com"
                  />
                  <input
                    type="password"
                    value={emailPassword}
                    onChange={(e) => setEmailPassword(e.target.value)}
                    className="input"
                    placeholder="Enter your password to confirm"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleChangeEmail}
                      disabled={emailSaving || !newEmail.trim() || !emailPassword}
                      className="btn-primary disabled:opacity-40"
                    >
                      {emailSaving ? 'Saving...' : 'Save new email'}
                    </button>
                    <button onClick={() => { setShowEmailChange(false); setNewEmail(''); setEmailPassword('') }} className="btn-ghost">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setShowEmailChange(true)} className="btn-ghost text-sm">
                  Change email
                </button>
              )}
            </div>
          </Section>

          {/* Sync panel */}
          <Section title="Sync" description="Data synchronization status">
            <div className="card p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-text-muted">Account</span>
                <span className="text-text">{profile?.username}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-text-muted">Theme</span>
                <span className="text-text capitalize">{settings?.theme}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-text-muted">Background</span>
                <span className="text-text capitalize">{settings?.animated_background}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-text-muted">Last settings update</span>
                <span className="text-text">{settings?.updated_at ? new Date(settings.updated_at).toLocaleString() : 'N/A'}</span>
              </div>
            </div>
          </Section>

          {/* Debug panel */}
          <Section title="Debug" description="Technical information for troubleshooting">
            <div className="card p-4 space-y-2 font-mono text-xs">
              <div className="flex justify-between">
                <span className="text-text-muted">User ID:</span>
                <span className="text-text">{profile?.id?.slice(0, 8) || 'N/A'}...</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">Admin:</span>
                <span className="text-text">{profile?.is_admin ? 'Yes' : 'No'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">Supabase URL:</span>
                <span className="text-text truncate ml-2">{import.meta.env.VITE_SUPABASE_URL?.slice(0, 30) || 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">Settings ID:</span>
                <span className="text-text">{settings?.id?.slice(0, 8) || 'N/A'}...</span>
              </div>
            </div>
          </Section>
        </div>
      </div>
    </div>
  )
}

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <h2 className="text-lg font-semibold text-text mb-1">{title}</h2>
      <p className="text-sm text-text-muted mb-4">{description}</p>
      {children}
    </motion.div>
  )
}

function Toggle({ label, description, value, onChange }: { label: string; description: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between p-3 bg-surface rounded-lg">
      <div>
        <p className="text-sm font-medium text-text">{label}</p>
        <p className="text-xs text-text-muted">{description}</p>
      </div>
      <button
        onClick={() => onChange(!value)}
        className={cn(
          'relative w-12 h-6 rounded-full transition-colors flex-shrink-0',
          value ? 'bg-primary' : 'bg-border',
        )}
      >
        <motion.div
          layout
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          className={cn('absolute top-0.5 w-5 h-5 rounded-full bg-white', value ? 'left-6' : 'left-0.5')}
        />
      </button>
    </div>
  )
}
