import { useState } from 'react'
import { X, Play, Pause, SlidersHorizontal, RotateCcw, Check, Sparkles } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useStore } from '../lib/store'
import type { AnimationTheme, AnimationIntensity, AnimationSpeed, AnimationPrefs } from '../lib/store'
import { saveAnimationPrefs } from '../lib/api'
import AnimatedBackground from './AnimatedBackground'

interface AnimationSettingsProps {
  onClose: () => void
  chatId?: string
}

interface ThemeDef {
  id: AnimationTheme
  label: string
  emoji: string
  description: string
  /** CSS gradient for the swatch card */
  gradient: string
  /** Text/icon colour on the card */
  textColor: string
}

const THEMES: ThemeDef[] = [
  {
    id: 'none',
    label: 'None',
    emoji: '⬜',
    description: 'Plain background',
    gradient: 'linear-gradient(135deg, #e8e4dc 0%, #d4cfc5 100%)',
    textColor: '#6b6b5e',
  },
  {
    id: 'forest-breeze',
    label: 'Forest Breeze',
    emoji: '🍃',
    description: 'Leaves drifting',
    gradient: 'linear-gradient(135deg, #2d5a3d 0%, #4a8c5e 50%, #6aaa7e 100%)',
    textColor: '#d4f0dc',
  },
  {
    id: 'paw-parade',
    label: 'Paw Parade',
    emoji: '🐾',
    description: 'Paw prints strolling',
    gradient: 'linear-gradient(135deg, #c4956a 0%, #d4aa80 50%, #e8c89a 100%)',
    textColor: '#5a3020',
  },
  {
    id: 'rainy-window',
    label: 'Rainy Window',
    emoji: '🌧️',
    description: 'Soft falling rain',
    gradient: 'linear-gradient(135deg, #3a5a78 0%, #5a7898 50%, #8aaac4 100%)',
    textColor: '#d4eaf8',
  },
  {
    id: 'starry-night',
    label: 'Starry Night',
    emoji: '✨',
    description: 'Twinkling stars',
    gradient: 'linear-gradient(135deg, #0a0a2a 0%, #1a1a4e 50%, #2a2a6e 100%)',
    textColor: '#c8d8ff',
  },
  {
    id: 'cherry-blossom',
    label: 'Cherry Blossom',
    emoji: '🌸',
    description: 'Petals floating',
    gradient: 'linear-gradient(135deg, #f4a8b8 0%, #f9c5d0 50%, #fde8ec 100%)',
    textColor: '#8a2040',
  },
  {
    id: 'cloud-drift',
    label: 'Cloud Drift',
    emoji: '☁️',
    description: 'Fluffy clouds',
    gradient: 'linear-gradient(135deg, #6ab0d8 0%, #90c8e8 50%, #c8e8f8 100%)',
    textColor: '#1a4060',
  },
  {
    id: 'ocean-waves',
    label: 'Ocean Waves',
    emoji: '🌊',
    description: 'Gentle waves',
    gradient: 'linear-gradient(135deg, #0e4d6e 0%, #1a7a9a 50%, #2aaaca 100%)',
    textColor: '#c0f0ff',
  },
  {
    id: 'campfire-glow',
    label: 'Campfire Glow',
    emoji: '🔥',
    description: 'Warm flickering',
    gradient: 'linear-gradient(135deg, #2a1000 0%, #8b3000 50%, #e05800 100%)',
    textColor: '#ffe0a0',
  },
  {
    id: 'autumn-leaves',
    label: 'Autumn Leaves',
    emoji: '🍂',
    description: 'Leaves falling',
    gradient: 'linear-gradient(135deg, #6b2800 0%, #b85a2a 50%, #e0944a 100%)',
    textColor: '#ffecd0',
  },
  {
    id: 'winter-snow',
    label: 'Winter Snow',
    emoji: '❄️',
    description: 'Drifting snowflakes',
    gradient: 'linear-gradient(135deg, #1a3a5a 0%, #4a7aaa 50%, #b8d8f8 100%)',
    textColor: '#e8f4ff',
  },
  {
    id: 'butterfly-garden',
    label: 'Butterfly Garden',
    emoji: '🦋',
    description: 'Butterflies flutter',
    gradient: 'linear-gradient(135deg, #3a1a5a 0%, #7a4aaa 50%, #c090e0 100%)',
    textColor: '#f0e0ff',
  },
  {
    id: 'aurora-dreams',
    label: 'Aurora Dreams',
    emoji: '🌌',
    description: 'Northern lights',
    gradient: 'linear-gradient(135deg, #0a1a20 0%, #0a4a3a 40%, #1a2a4a 70%, #2a0a3a 100%)',
    textColor: '#a0ffcc',
  },
]

const DEFAULT_PREFS = {
  enabled: false,
  theme: 'none' as AnimationTheme,
  intensity: 'medium' as AnimationIntensity,
  speed: 'medium' as AnimationSpeed,
  paused: false,
}

export default function AnimationSettings({ onClose, chatId }: AnimationSettingsProps) {
  const currentUser = useStore((s) => s.currentUser)
  const prefs = useStore((s) => s.animationPrefs)
  const setAnimationPrefs = useStore((s) => s.setAnimationPrefs)
  const setChatOverride = useStore((s) => s.setChatAnimationOverride)

  const isChat = Boolean(chatId)
  const existingOverride = chatId ? prefs.chatOverrides[chatId] : undefined

  const [draftTheme, setDraftTheme]         = useState<AnimationTheme>(existingOverride?.theme ?? prefs.theme)
  const [draftIntensity, setDraftIntensity] = useState<AnimationIntensity>(prefs.intensity)
  const [draftSpeed, setDraftSpeed]         = useState<AnimationSpeed>(prefs.speed)
  const [draftPaused, setDraftPaused]       = useState<boolean>(prefs.paused)
  const [useChatOverride, setUseChatOverride] = useState<boolean>(Boolean(existingOverride))
  const [saving, setSaving] = useState(false)
  const [saved, setSaved]   = useState(false)

  const handleApply = async () => {
    setSaving(true)
    let newPrefs: AnimationPrefs

    if (isChat && chatId && useChatOverride) {
      setChatOverride(chatId, { theme: draftTheme, enabled: draftTheme !== 'none' })
      newPrefs = {
        ...prefs,
        intensity: draftIntensity,
        speed: draftSpeed,
        paused: draftPaused,
        chatOverrides: {
          ...prefs.chatOverrides,
          [chatId]: { theme: draftTheme, enabled: draftTheme !== 'none' },
        },
      }
    } else {
      if (isChat && chatId) setChatOverride(chatId, null)
      newPrefs = {
        ...prefs,
        enabled: draftTheme !== 'none',
        theme: draftTheme,
        intensity: draftIntensity,
        speed: draftSpeed,
        paused: draftPaused,
        chatOverrides: isChat && chatId
          ? (() => { const o = { ...prefs.chatOverrides }; delete o[chatId]; return o })()
          : prefs.chatOverrides,
      }
      setAnimationPrefs({ enabled: draftTheme !== 'none', theme: draftTheme, intensity: draftIntensity, speed: draftSpeed, paused: draftPaused })
    }

    setAnimationPrefs({ intensity: draftIntensity, speed: draftSpeed, paused: draftPaused })

    if (currentUser) {
      try { await saveAnimationPrefs(currentUser.id, newPrefs) }
      catch (e) { console.error('Failed to save animation prefs', e) }
    }

    setSaving(false)
    setSaved(true)
    setTimeout(() => { setSaved(false); onClose() }, 1000)
  }

  const handleReset = async () => {
    setDraftTheme('none')
    setDraftIntensity('medium')
    setDraftSpeed('medium')
    setDraftPaused(false)
    setUseChatOverride(false)
    const reset: AnimationPrefs = {
      ...DEFAULT_PREFS,
      chatOverrides: chatId
        ? (() => { const o = { ...prefs.chatOverrides }; delete o[chatId]; return o })()
        : {},
    }
    if (chatId) setChatOverride(chatId, null)
    setAnimationPrefs({ enabled: false, theme: 'none', intensity: 'medium', speed: 'medium', paused: false })
    if (currentUser) {
      try { await saveAnimationPrefs(currentUser.id, reset) }
      catch (e) { console.error('Failed to reset animation prefs', e) }
    }
  }

  const activeDef = THEMES.find((t) => t.id === draftTheme) ?? THEMES[0]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 24 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94 }}
        transition={{ type: 'spring', damping: 28, stiffness: 280 }}
        className="bg-bg-surface border border-border rounded-3xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[92vh]"
      >
        {/* ── Header ─────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2.5">
            <Sparkles className="w-5 h-5 text-accent" />
            <h2 className="font-bold text-text text-lg">Animated Backgrounds</h2>
            {isChat && (
              <span className="px-2 py-0.5 rounded-full bg-accent/10 text-accent text-xs font-bold">This Chat</span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-bg-hover text-text-muted transition-all"
            title="Cancel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-col lg:flex-row flex-1 overflow-hidden min-h-0 min-w-0">

          {/* ── Left: colour-coded theme grid ─────────────────────────── */}
          <div className="lg:w-72 border-b lg:border-b-0 lg:border-r border-border overflow-y-auto shrink-0 max-h-52 lg:max-h-none">
            <div className="p-3 grid grid-cols-3 lg:grid-cols-2 gap-2">
              {THEMES.map((t) => {
                const isActive = draftTheme === t.id
                return (
                  <motion.button
                    key={t.id}
                    onClick={() => setDraftTheme(t.id)}
                    whileTap={{ scale: 0.95 }}
                    className="relative rounded-2xl overflow-hidden text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    style={{ background: t.gradient }}
                  >
                    {/* Selection ring */}
                    {isActive && (
                      <motion.div
                        layoutId="theme-ring"
                        className="absolute inset-0 rounded-2xl ring-2 ring-white ring-offset-1 ring-offset-transparent"
                        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                      />
                    )}

                    {/* Card content */}
                    <div className="p-3 flex flex-col gap-1.5 h-full min-h-[80px]">
                      <div className="flex items-start justify-between">
                        <span className="text-2xl leading-none">{t.emoji}</span>
                        {isActive && (
                          <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            className="w-5 h-5 rounded-full bg-white/90 flex items-center justify-center shrink-0 shadow-sm"
                          >
                            <Check className="w-3 h-3" style={{ color: '#1a1a1a' }} />
                          </motion.div>
                        )}
                      </div>
                      <div>
                        <div
                          className="text-xs font-bold leading-tight"
                          style={{ color: t.textColor }}
                        >
                          {t.label}
                        </div>
                        <div
                          className="text-[10px] leading-tight mt-0.5 opacity-75"
                          style={{ color: t.textColor }}
                        >
                          {t.description}
                        </div>
                      </div>
                    </div>
                  </motion.button>
                )
              })}
            </div>
          </div>

          {/* ── Right: Preview + Controls ──────────────────────────────── */}
          <div className="flex-1 flex flex-col overflow-hidden min-h-0">

            {/* Live preview */}
            <div
              className="relative shrink-0 overflow-hidden border-b border-border"
              style={{
                height: '200px',
                background: draftTheme === 'none'
                  ? 'var(--bg)'
                  : activeDef.gradient,
                transition: 'background 0.5s ease',
              }}
            >
              {/* Canvas animation */}
              {draftTheme !== 'none' && (
                <AnimatedBackground
                  theme={draftTheme}
                  intensity={draftIntensity}
                  speed={draftSpeed}
                  paused={draftPaused}
                />
              )}

              {/* Simulated chat bubbles */}
              <div className="absolute inset-0 flex flex-col justify-end p-3 pointer-events-none gap-2">
                <div className="flex items-end gap-2 self-start max-w-[65%]">
                  <div className="w-6 h-6 rounded-full bg-white/20 shrink-0 border border-white/30" />
                  <div className="bg-white/75 backdrop-blur-sm rounded-3xl rounded-bl-sm px-3 py-2 shadow-sm">
                    <p className="text-xs font-medium text-gray-800">Hey, nice vibe! ✨</p>
                  </div>
                </div>
                <div className="flex items-end gap-2 self-end max-w-[65%] flex-row-reverse">
                  <div className="w-6 h-6 rounded-full bg-white/20 shrink-0 border border-white/30" />
                  <div className="bg-black/30 backdrop-blur-sm rounded-3xl rounded-br-sm px-3 py-2 shadow-sm">
                    <p className="text-xs font-medium text-white">So cozy 🌿</p>
                  </div>
                </div>
              </div>

              {/* Pause / play */}
              <button
                onClick={() => setDraftPaused(!draftPaused)}
                className="absolute top-3 right-3 p-2 rounded-xl bg-black/30 backdrop-blur-sm text-white/80 hover:text-white hover:bg-black/50 transition-all border border-white/10"
              >
                {draftPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
              </button>

              {/* Active theme pill */}
              <div
                className="absolute top-3 left-3 px-3 py-1.5 rounded-2xl backdrop-blur-sm border border-white/20 flex items-center gap-1.5"
                style={{ background: 'rgba(0,0,0,0.3)' }}
              >
                <span className="text-sm leading-none">{activeDef.emoji}</span>
                <span className="text-xs font-bold text-white">{activeDef.label}</span>
              </div>

              {draftTheme === 'none' && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <p className="text-text-muted/60 text-sm">Select a theme to preview</p>
                </div>
              )}
            </div>

            {/* Controls */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">

              {/* Chat override */}
              {isChat && (
                <div
                  className="flex items-center justify-between p-3 rounded-2xl bg-bg border border-border/60 cursor-pointer select-none"
                  onClick={() => setUseChatOverride(!useChatOverride)}
                >
                  <div>
                    <div className="text-sm font-bold text-text">Chat-specific background</div>
                    <div className="text-xs text-text-muted">Override the global setting for this chat only</div>
                  </div>
                  <div className={`w-10 h-5 rounded-full transition-all duration-300 shrink-0 ${useChatOverride ? 'bg-accent' : 'bg-bg-surface-2'}`}>
                    <div className={`w-4 h-4 rounded-full bg-white shadow-sm mt-0.5 transition-all duration-300 ${useChatOverride ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </div>
                </div>
              )}

              {/* Intensity */}
              <div>
                <div className="flex items-center gap-2 mb-2.5">
                  <SlidersHorizontal className="w-3.5 h-3.5 text-accent" />
                  <span className="text-sm font-bold text-text">Intensity</span>
                  <span className="ml-auto text-xs font-bold capitalize px-2 py-0.5 rounded-full bg-accent/10 text-accent">{draftIntensity}</span>
                </div>
                <div className="flex gap-2">
                  {(['low', 'medium', 'high'] as AnimationIntensity[]).map((v) => (
                    <button
                      key={v}
                      onClick={() => setDraftIntensity(v)}
                      className={`flex-1 py-2.5 rounded-2xl text-xs font-bold capitalize transition-all border ${
                        draftIntensity === v
                          ? 'bg-accent text-white border-accent shadow-sm'
                          : 'bg-bg border-border text-text-muted hover:bg-bg-hover hover:text-text'
                      }`}
                    >
                      {v === 'low' ? '🌱 Low' : v === 'medium' ? '🌿 Medium' : '🌳 High'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Speed */}
              <div>
                <div className="flex items-center gap-2 mb-2.5">
                  <span className="text-sm leading-none">⚡</span>
                  <span className="text-sm font-bold text-text">Speed</span>
                  <span className="ml-auto text-xs font-bold capitalize px-2 py-0.5 rounded-full bg-accent/10 text-accent">{draftSpeed}</span>
                </div>
                <div className="flex gap-2">
                  {(['slow', 'medium', 'fast'] as AnimationSpeed[]).map((v) => (
                    <button
                      key={v}
                      onClick={() => setDraftSpeed(v)}
                      className={`flex-1 py-2.5 rounded-2xl text-xs font-bold capitalize transition-all border ${
                        draftSpeed === v
                          ? 'bg-accent text-white border-accent shadow-sm'
                          : 'bg-bg border-border text-text-muted hover:bg-bg-hover hover:text-text'
                      }`}
                    >
                      {v === 'slow' ? '🐢 Slow' : v === 'medium' ? '🐇 Medium' : '🚀 Fast'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Start paused */}
              <div
                className="flex items-center justify-between p-3 rounded-2xl bg-bg border border-border/60 cursor-pointer select-none"
                onClick={() => setDraftPaused(!draftPaused)}
              >
                <div>
                  <div className="text-sm font-bold text-text">Start paused</div>
                  <div className="text-xs text-text-muted">Background loads frozen — click to animate</div>
                </div>
                <div className={`w-10 h-5 rounded-full transition-all duration-300 shrink-0 ${draftPaused ? 'bg-accent' : 'bg-bg-surface-2'}`}>
                  <div className={`w-4 h-4 rounded-full bg-white shadow-sm mt-0.5 transition-all duration-300 ${draftPaused ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </div>
              </div>

              <p className="text-xs text-text-muted bg-accent/5 border border-accent/10 rounded-2xl px-3 py-2.5 leading-relaxed">
                💡 Animations respect your system's reduced-motion setting and sync across sessions.
              </p>
            </div>

            {/* Footer */}
            <div className="flex gap-2 p-4 border-t border-border shrink-0">
              <button
                onClick={handleReset}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2.5 rounded-2xl border border-border text-text-muted hover:bg-bg-hover text-sm font-bold transition-all disabled:opacity-50"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset
              </button>
              <button
                onClick={handleApply}
                disabled={saving}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-2xl font-bold text-sm transition-all shadow-sm disabled:opacity-70"
                style={{ background: activeDef.gradient, color: activeDef.textColor }}
              >
                <AnimatePresence mode="wait">
                  {saved ? (
                    <motion.span
                      key="saved"
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0 }}
                      className="flex items-center gap-2"
                    >
                      <Check className="w-4 h-4" /> Theme applied!
                    </motion.span>
                  ) : saving ? (
                    <motion.span key="saving" className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                      Applying…
                    </motion.span>
                  ) : (
                    <motion.span key="idle" className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4" />
                      Apply — {activeDef.label}
                    </motion.span>
                  )}
                </AnimatePresence>
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
