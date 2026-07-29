import { useState, useEffect } from 'react'
import { X, Type, Check, RotateCcw } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useStore } from '../lib/store'

const FONTS: { id: string; label: string; css: string; sample: string }[] = [
  {
    id: 'comic-sans',
    label: 'Comic Sans MS',
    css: "'Comic Sans MS', 'Comic Sans', 'Comic Neue', cursive",
    sample: 'Cozy woodland vibes 🌿',
  },
  {
    id: 'lulu',
    label: 'Lulu',
    css: "'Nunito', 'Comic Neue', 'Comic Sans MS', cursive",
    sample: 'Friendly & warm strokes ✨',
  },
  {
    id: 'comic-neue',
    label: 'Comic Neue',
    css: "'Comic Neue', 'Comic Sans MS', cursive",
    sample: 'Light-hearted & friendly',
  },
  {
    id: 'fredoka',
    label: 'Fredoka One',
    css: "'Fredoka One', 'Fredoka', 'Nunito', sans-serif",
    sample: 'Rounded, playful fun!',
  },
  {
    id: 'nunito',
    label: 'Nunito',
    css: "'Nunito', 'Comic Neue', sans-serif",
    sample: 'Soft and super readable',
  },
  {
    id: 'system',
    label: 'System Default',
    css: 'system-ui, -apple-system, sans-serif',
    sample: 'Clean & native feel',
  },
  {
    id: 'georgia',
    label: 'Georgia',
    css: 'Georgia, serif',
    sample: 'Classic and elegant serif',
  },
  {
    id: 'mono',
    label: 'Monospace',
    css: "'Courier New', Courier, monospace",
    sample: 'Developer aesthetic 💻',
  },
  {
    id: 'atkinson',
    label: 'Atkinson Hyperlegible',
    css: "'Atkinson Hyperlegible', 'Nunito', sans-serif",
    sample: 'Maximum readability',
  },
]

const DEFAULT_FONT_ID = 'comic-sans'

interface FontPreferencesProps {
  onClose: () => void
}

export default function FontPreferences({ onClose }: FontPreferencesProps) {
  const fontPref = useStore((s) => s.fontPref)
  const setFontPref = useStore((s) => s.setFontPref)
  const [selected, setSelected] = useState(fontPref)
  const [preview, setPreview] = useState(fontPref)

  useEffect(() => {
    // Apply preview font to root
    document.documentElement.style.setProperty(
      '--font-sans',
      FONTS.find((f) => f.id === preview)?.css ?? FONTS[0].css
    )
  }, [preview])

  const handleApply = () => {
    setFontPref(selected)
    document.documentElement.style.setProperty(
      '--font-sans',
      FONTS.find((f) => f.id === selected)?.css ?? FONTS[0].css
    )
    onClose()
  }

  const handleCancel = () => {
    // Revert preview
    document.documentElement.style.setProperty(
      '--font-sans',
      FONTS.find((f) => f.id === fontPref)?.css ?? FONTS[0].css
    )
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ type: 'spring', damping: 28, stiffness: 280 }}
        className="bg-bg-surface border border-border rounded-3xl shadow-2xl w-full max-w-md overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Type className="w-4 h-4 text-accent" />
            <span className="font-bold text-text">Font Preferences</span>
          </div>
          <button onClick={handleCancel} className="p-1.5 rounded-xl hover:bg-bg-hover text-text-muted transition-all">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-2 max-h-[60vh] overflow-y-auto">
          {FONTS.map((font) => (
            <button
              key={font.id}
              onClick={() => { setSelected(font.id); setPreview(font.id) }}
              className={`w-full flex items-center justify-between p-4 rounded-2xl border transition-all text-left ${
                selected === font.id
                  ? 'border-accent bg-accent/8 shadow-sm'
                  : 'border-border/60 bg-bg hover:bg-bg-hover hover:border-accent/30'
              }`}
            >
              <div>
                <div className="text-sm font-bold text-text mb-1">{font.label}</div>
                <div className="text-base text-text-secondary" style={{ fontFamily: font.css }}>
                  {font.sample}
                </div>
              </div>
              <AnimatePresence>
                {selected === font.id && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0 }}
                    className="w-6 h-6 rounded-full bg-accent flex items-center justify-center shrink-0 ml-3"
                  >
                    <Check className="w-3.5 h-3.5 text-white" />
                  </motion.div>
                )}
              </AnimatePresence>
            </button>
          ))}
        </div>

        {/* Live preview */}
        <div className="px-5 py-3 border-t border-border bg-bg">
          <div className="text-xs text-text-muted mb-2 font-bold">Live Preview</div>
          <div
            className="p-3 rounded-2xl bg-bg-surface border border-border text-sm text-text"
            style={{ fontFamily: FONTS.find((f) => f.id === preview)?.css }}
          >
            Hey there! 🌿 Just wanted to say hello and check in. Hope your day is going well!
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-border">
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setSelected(DEFAULT_FONT_ID); setPreview(DEFAULT_FONT_ID) }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs text-text-muted hover:bg-bg-hover transition-all"
              title="Restore default font"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Restore Default
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleCancel} className="px-4 py-2 rounded-xl text-sm text-text-muted hover:bg-bg-hover transition-all">Cancel</button>
            <button onClick={handleApply} className="px-5 py-2 rounded-xl bg-accent text-white text-sm font-bold hover:bg-accent-hover transition-all shadow-sm">Apply Font</button>
          </div>
        </div>
        <div className="px-5 pb-4">
          <p className="text-xs text-text-muted/70">Font changes only affect your local interface and are not visible to others.</p>
        </div>
      </motion.div>
    </div>
  )
}

// Helper to apply saved font on app load
export function applyFont(fontId: string) {
  const font = FONTS.find((f) => f.id === fontId)
  if (font) document.documentElement.style.setProperty('--font-sans', font.css)
}
