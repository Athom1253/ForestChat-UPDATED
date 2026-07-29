import { useState, useRef } from 'react'
import { X, Volume2, VolumeX, Play } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

interface SoundboardProps {
  onClose: () => void
  onSendSound?: (name: string) => void
}

const SOUNDS = [
  { id: 'boop', label: 'Boop', emoji: '🔵', color: 'bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400', frequency: 880, duration: 0.15, wave: 'sine' as OscillatorType },
  { id: 'ding', label: 'Ding', emoji: '🔔', color: 'bg-yellow-500/10 border-yellow-500/30 text-yellow-600 dark:text-yellow-400', frequency: 1100, duration: 0.6, wave: 'sine' as OscillatorType },
  { id: 'pop', label: 'Pop', emoji: '💫', color: 'bg-pink-500/10 border-pink-500/30 text-pink-600 dark:text-pink-400', frequency: 600, duration: 0.1, wave: 'triangle' as OscillatorType },
  { id: 'woosh', label: 'Woosh', emoji: '💨', color: 'bg-cyan-500/10 border-cyan-500/30 text-cyan-600 dark:text-cyan-400', frequency: 200, duration: 0.4, wave: 'sawtooth' as OscillatorType },
  { id: 'chime', label: 'Chime', emoji: '🎵', color: 'bg-accent/10 border-accent/30 text-accent', frequency: 1320, duration: 1.0, wave: 'sine' as OscillatorType },
  { id: 'nom', label: 'Nom', emoji: '😋', color: 'bg-orange-500/10 border-orange-500/30 text-orange-600 dark:text-orange-400', frequency: 440, duration: 0.2, wave: 'square' as OscillatorType },
  { id: 'sparkle', label: 'Sparkle', emoji: '✨', color: 'bg-purple-500/10 border-purple-500/30 text-purple-600 dark:text-purple-400', frequency: 2000, duration: 0.3, wave: 'sine' as OscillatorType },
  { id: 'thud', label: 'Thud', emoji: '💥', color: 'bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400', frequency: 80, duration: 0.3, wave: 'square' as OscillatorType },
]

function playSound(frequency: number, duration: number, wave: OscillatorType) {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    const oscillator = ctx.createOscillator()
    const gainNode = ctx.createGain()

    oscillator.connect(gainNode)
    gainNode.connect(ctx.destination)

    oscillator.type = wave
    oscillator.frequency.setValueAtTime(frequency, ctx.currentTime)

    gainNode.gain.setValueAtTime(0.4, ctx.currentTime)
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration)

    oscillator.start(ctx.currentTime)
    oscillator.stop(ctx.currentTime + duration)

    oscillator.onended = () => ctx.close()
    return true
  } catch (e) {
    console.error('Soundboard playback error:', e)
    return false
  }
}

export default function Soundboard({ onClose, onSendSound }: SoundboardProps) {
  const [playing, setPlaying] = useState<string | null>(null)
  const [muted, setMuted] = useState(false)
  const [lastError, setLastError] = useState<string | null>(null)

  const handlePlay = (sound: typeof SOUNDS[0]) => {
    setLastError(null)
    if (muted) {
      onSendSound?.(sound.label)
      return
    }
    setPlaying(sound.id)
    const ok = playSound(sound.frequency, sound.duration, sound.wave)
    if (!ok) {
      setLastError(`Could not play ${sound.label}. Check browser audio permissions.`)
    }
    setTimeout(() => setPlaying(null), sound.duration * 1000 + 50)
    console.log(`[Soundboard] Playing: ${sound.label} (${sound.frequency}Hz, ${sound.duration}s, ${sound.wave})`)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ type: 'spring', damping: 28, stiffness: 280 }}
        className="bg-bg-surface border border-border rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Volume2 className="w-4 h-4 text-accent" />
            <span className="font-bold text-text text-sm">Soundboard</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setMuted((m) => !m)}
              className={`p-1.5 rounded-xl transition-all text-xs ${muted ? 'bg-error-light text-error' : 'hover:bg-bg-hover text-text-muted'}`}
              title={muted ? 'Unmute' : 'Mute sounds'}
            >
              {muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
            </button>
            <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-bg-hover text-text-muted transition-all">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-4">
          {lastError && (
            <div className="mb-3 px-3 py-2 rounded-xl bg-error-light text-error text-xs">
              {lastError}
            </div>
          )}
          <div className="grid grid-cols-4 gap-2">
            {SOUNDS.map((sound) => (
              <motion.button
                key={sound.id}
                whileTap={{ scale: 0.9 }}
                onClick={() => handlePlay(sound)}
                className={`flex flex-col items-center gap-1.5 p-3 rounded-2xl border transition-all ${sound.color} ${
                  playing === sound.id ? 'scale-95 shadow-inner' : 'hover:scale-105 hover:shadow-sm'
                }`}
              >
                <span className="text-2xl">{sound.emoji}</span>
                <span className="text-xs font-bold leading-tight">{sound.label}</span>
                <AnimatePresence>
                  {playing === sound.id && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      exit={{ scale: 0 }}
                      className="flex gap-0.5 items-end h-3"
                    >
                      {[1, 2, 3].map((i) => (
                        <motion.div
                          key={i}
                          animate={{ scaleY: [1, 2, 1] }}
                          transition={{ duration: 0.4, repeat: Infinity, delay: i * 0.1 }}
                          className="w-0.5 rounded-full bg-current"
                          style={{ height: 4 + i }}
                        />
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.button>
            ))}
          </div>
          <p className="text-xs text-text-muted/60 text-center mt-3">
            Click to play a sound
          </p>
        </div>
      </motion.div>
    </div>
  )
}
