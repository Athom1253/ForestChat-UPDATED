import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

export type ThemeName = 'forest' | 'dark' | 'light' | 'ocean' | 'sunset' | 'aurora' | 'space' | 'minimal'
export type AnimationName = 'none' | 'leaves' | 'snow' | 'rain' | 'fireflies' | 'stars' | 'particles' | 'gradient' | 'waves'

interface ThemeContextValue {
  theme: ThemeName
  animation: AnimationName
  setTheme: (t: ThemeName) => void
  setAnimation: (a: AnimationName) => void
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined)

export const THEMES: { name: ThemeName; label: string; colors: string[] }[] = [
  { name: 'forest', label: 'Forest', colors: ['#14532d', '#22c55e', '#0f131c'] },
  { name: 'dark', label: 'Dark', colors: ['#000000', '#1a1a1a', '#333333'] },
  { name: 'light', label: 'Light', colors: ['#f8fafc', '#e2e8f0', '#cbd5e1'] },
  { name: 'ocean', label: 'Ocean', colors: ['#0c4a6e', '#0ea5e9', '#082f49'] },
  { name: 'sunset', label: 'Sunset', colors: ['#7c2d12', '#f97316', '#431407'] },
  { name: 'aurora', label: 'Aurora', colors: ['#042f2e', '#14b8a6', '#115e59'] },
  { name: 'space', label: 'Space', colors: ['#0f0f23', '#6366f1', '#1e1b4b'] },
  { name: 'minimal', label: 'Minimal', colors: ['#ffffff', '#f3f4f6', '#e5e7eb'] },
]

export const ANIMATIONS: { name: AnimationName; label: string }[] = [
  { name: 'none', label: 'None' },
  { name: 'leaves', label: 'Falling Leaves' },
  { name: 'snow', label: 'Snow' },
  { name: 'rain', label: 'Rain' },
  { name: 'fireflies', label: 'Fireflies' },
  { name: 'stars', label: 'Stars' },
  { name: 'particles', label: 'Floating Particles' },
  { name: 'gradient', label: 'Soft Gradient' },
  { name: 'waves', label: 'Gentle Waves' },
]

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeName>(() => (localStorage.getItem('forestchat-theme') as ThemeName) || 'forest')
  const [animation, setAnimationState] = useState<AnimationName>(() => (localStorage.getItem('forestchat-animation') as AnimationName) || 'none')

  useEffect(() => {
    document.body.className = document.body.className.replace(/theme-\w+/g, '').trim()
    document.body.classList.add(`theme-${theme}`)
    localStorage.setItem('forestchat-theme', theme)
  }, [theme])

  useEffect(() => {
    document.body.classList.remove(...ANIMATIONS.map(a => `bg-animation-${a.name}`))
    if (animation !== 'none') document.body.classList.add(`bg-animation-${animation}`)
    localStorage.setItem('forestchat-animation', animation)
  }, [animation])

  return (
    <ThemeContext.Provider value={{ theme, animation, setTheme: setThemeState, setAnimation: setAnimationState }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
