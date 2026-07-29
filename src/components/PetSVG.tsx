import { motion } from 'framer-motion'
import type { PetSpecies, PetBehavior } from '../lib/types'

/**
 * PetSVG renders a vector-illustrated pet for each species.
 * Animations are driven by Framer Motion based on the current behavior.
 * Each species has a distinct body shape, ears, tail, eyes, and color palette.
 * Accessories (hats, glasses, scarves, collars, wings) are overlaid as SVG layers.
 */

type Props = {
  species: PetSpecies
  behavior: PetBehavior
  colorVariant?: string
  accessories?: string[]
  size?: number
}

const COLORS: Record<string, { body: string; dark: string; light: string; belly: string }> = {
  default: { body: '#d4a574', dark: '#a67c4f', light: '#e8c89a', belly: '#f5e6d3' },
  orange: { body: '#e89150', dark: '#c46d2a', light: '#f2b886', belly: '#fce0c2' },
  black: { body: '#4a4a4a', dark: '#2a2a2a', light: '#6a6a6a', belly: '#888' },
  white: { body: '#e8e4e0', dark: '#c0bbb6', light: '#f5f2ef', belly: '#fff' },
  brown: { body: '#8b6f47', dark: '#6b5234', light: '#a8916e', belly: '#d4c4a8' },
  gray: { body: '#9ca3af', dark: '#6b7280', light: '#c0c6cf', belly: '#dde2e8' },
  cream: { body: '#f5deb3', dark: '#deb887', light: '#faf0d7', belly: '#fffaf0' },
  pink: { body: '#f0a0b0', dark: '#d07080', light: '#f5c0cd', belly: '#fde0e8' },
  blue: { body: '#7bb4d9', dark: '#5491c0', light: '#a0c8e8', belly: '#d0e8f5' },
  green: { body: '#7bc97b', dark: '#5491c0', light: '#a0e0a0', belly: '#d0f5d0' },
  red: { body: '#e07070', dark: '#c04040', light: '#f0a0a0', belly: '#f5d0d0' },
  purple: { body: '#b08bc7', dark: '#8a5fa8', light: '#d0b0e0', belly: '#e8d5f0' },
  gold: { body: '#ffd700', dark: '#daa520', light: '#ffe860', belly: '#fff8d0' },
  rainbow: { body: '#e89150', dark: '#a67c4f', light: '#f2b886', belly: '#f5e6d3' },
}

function getColor(colorVariant: string) {
  return COLORS[colorVariant] || COLORS.default
}

function AnimatedEyes({ behavior, size }: { behavior: PetBehavior; size: number }) {
  const isSleeping = behavior === 'sleeping'
  const isBlinking = behavior === 'blinking'
  const eyeY = size * 0.35

  if (isSleeping) {
    return (
      <>
        <path d={`M ${size * 0.28} ${eyeY} Q ${size * 0.35} ${eyeY + 4} ${size * 0.42} ${eyeY}`} stroke="#333" strokeWidth="2" fill="none" strokeLinecap="round" />
        <path d={`M ${size * 0.58} ${eyeY} Q ${size * 0.65} ${eyeY + 4} ${size * 0.72} ${eyeY}`} stroke="#333" strokeWidth="2" fill="none" strokeLinecap="round" />
      </>
    )
  }

  return (
    <>
      <motion.g
        animate={isBlinking ? { scaleY: [1, 0.1, 1] } : {}}
        transition={{ duration: 0.15 }}
        style={{ originX: `${size * 0.35}px`, originY: `${eyeY}px` }}
      >
        <ellipse cx={size * 0.35} cy={eyeY} rx={size * 0.06} ry={size * 0.08} fill="#1a1a2e" />
        <circle cx={size * 0.37} cy={eyeY - size * 0.02} r={size * 0.02} fill="#fff" />
      </motion.g>
      <motion.g
        animate={isBlinking ? { scaleY: [1, 0.1, 1] } : {}}
        transition={{ duration: 0.15 }}
        style={{ originX: `${size * 0.65}px`, originY: `${eyeY}px` }}
      >
        <ellipse cx={size * 0.65} cy={eyeY} rx={size * 0.06} ry={size * 0.08} fill="#1a1a2e" />
        <circle cx={size * 0.67} cy={eyeY - size * 0.02} r={size * 0.02} fill="#fff" />
      </motion.g>
    </>
  )
}

function AnimatedTail({ species, behavior, color, size }: { species: PetSpecies; behavior: PetBehavior; color: any; size: number }) {
  if (species === 'rabbit' || species === 'hamster' || species === 'penguin' || species === 'bee' || species === 'duck' || species === 'turtle') return null

  const wagging = behavior === 'wagging' || behavior === 'happy' as any || behavior === 'playing'
  const tailY = size * 0.55
  const tailX = size * 0.85

  const tailPath = (() => {
    switch (species) {
      case 'cat': return `M ${tailX} ${tailY} Q ${size * 1.0} ${size * 0.3} ${size * 0.95} ${size * 0.15}`
      case 'dog': return `M ${tailX} ${tailY} Q ${size * 1.05} ${size * 0.4} ${size * 1.1} ${size * 0.25}`
      case 'fox': return `M ${tailX} ${tailY} Q ${size * 1.05} ${size * 0.25} ${size * 0.95} ${size * 0.1} L ${size * 1.0} ${size * 0.15} Z`
      case 'redpanda': return `M ${tailX} ${tailY} Q ${size * 1.1} ${size * 0.35} ${size * 1.05} ${size * 0.15}`
      case 'dragon': return `M ${tailX} ${tailY} Q ${size * 1.15} ${size * 0.45} ${size * 1.05} ${size * 0.1}`
      case 'dinosaur': return `M ${tailX} ${tailY} Q ${size * 1.2} ${size * 0.6} ${size * 1.1} ${size * 0.3}`
      case 'axolotl': return `M ${tailX} ${tailY} Q ${size * 1.05} ${size * 0.7} ${size * 0.95} ${size * 0.85}`
      case 'owl': return null
      default: return `M ${tailX} ${tailY} Q ${size * 1.0} ${size * 0.35} ${size * 0.95} ${size * 0.2}`
    }
  })()

  if (!tailPath) return null

  return (
    <motion.path
      d={tailPath}
      stroke={color.dark}
      strokeWidth={size * 0.08}
      fill={species === 'fox' || species === 'redpanda' ? color.body : 'none'}
      strokeLinecap="round"
      animate={wagging ? { rotate: [0, 15, -10, 15, 0] } : behavior === 'walking' ? { rotate: [0, 8, 0] } : {}}
      transition={{ duration: wagging ? 0.8 : 1, repeat: wagging ? Infinity : 0 }}
      style={{ originX: `${tailX}px`, originY: `${tailY}px` }}
    />
  )
}

function BackAccessories({ accessories, size }: { accessories: string[]; size: number }) {
  return (
    <>
      {accessories.includes('wings') && (
        <motion.g
          animate={{ y: [0, -3, 0], scaleY: [1, 0.92, 1] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
        >
          <path d={`M ${size * 0.3} ${size * 0.45} Q ${size * 0.05} ${size * 0.3} ${size * 0.0} ${size * 0.5} Q ${size * 0.1} ${size * 0.55} ${size * 0.25} ${size * 0.5} Z`} fill="#e8f0ff" opacity="0.85" stroke="#b0d0f0" strokeWidth="1" />
          <path d={`M ${size * 0.15} ${size * 0.38} L ${size * 0.12} ${size * 0.5}`} stroke="#b0d0f0" strokeWidth="0.8" fill="none" />
          <path d={`M ${size * 0.22} ${size * 0.4} L ${size * 0.18} ${size * 0.52}`} stroke="#b0d0f0" strokeWidth="0.8" fill="none" />
          <path d={`M ${size * 0.7} ${size * 0.45} Q ${size * 0.95} ${size * 0.3} ${size * 1.0} ${size * 0.5} Q ${size * 0.9} ${size * 0.55} ${size * 0.75} ${size * 0.5} Z`} fill="#e8f0ff" opacity="0.85" stroke="#b0d0f0" strokeWidth="1" />
          <path d={`M ${size * 0.85} ${size * 0.38} L ${size * 0.88} ${size * 0.5}`} stroke="#b0d0f0" strokeWidth="0.8" fill="none" />
          <path d={`M ${size * 0.78} ${size * 0.4} L ${size * 0.82} ${size * 0.52}`} stroke="#b0d0f0" strokeWidth="0.8" fill="none" />
        </motion.g>
      )}
    </>
  )
}

function FrontAccessories({ accessories, size }: { accessories: string[]; size: number }) {
  return (
    <>
      {accessories.includes('hat_top') && (
        <g>
          <ellipse cx={size * 0.5} cy={size * 0.05} rx={size * 0.18} ry={size * 0.04} fill="#333" />
          <rect x={size * 0.38} y={size * 0.02} width={size * 0.24} height={size * 0.12} rx={2} fill="#333" />
        </g>
      )}
      {accessories.includes('hat_party') && (
        <g>
          <polygon points={`${size * 0.35},${size * 0.1} ${size * 0.5},${size * -0.1} ${size * 0.65},${size * 0.1}`} fill="#e89150" />
          <circle cx={size * 0.5} cy={size * -0.08} r={size * 0.03} fill="#ffd700" />
        </g>
      )}
      {accessories.includes('hat_crown') && (
        <g>
          <polygon points={`${size * 0.3},${size * 0.1} ${size * 0.4},${size * -0.05} ${size * 0.5},${size * 0.05} ${size * 0.6},${size * -0.05} ${size * 0.7},${size * 0.1}`} fill="#ffd700" stroke="#daa520" strokeWidth="1" />
        </g>
      )}
      {accessories.includes('glasses') && (
        <g>
          <circle cx={size * 0.35} cy={size * 0.35} r={size * 0.1} fill="none" stroke="#333" strokeWidth="2" />
          <circle cx={size * 0.65} cy={size * 0.35} r={size * 0.1} fill="none" stroke="#333" strokeWidth="2" />
          <line x1={size * 0.45} y1={size * 0.35} x2={size * 0.55} y2={size * 0.35} stroke="#333" strokeWidth="2" />
        </g>
      )}
      {accessories.includes('scarf') && (
        <g>
          <ellipse cx={size * 0.5} cy={size * 0.5} rx={size * 0.28} ry={size * 0.06} fill="#c44" />
          <path d={`M ${size * 0.35} ${size * 0.52} L ${size * 0.3} ${size * 0.72} L ${size * 0.38} ${size * 0.68} Z`} fill="#a33" />
          <path d={`M ${size * 0.65} ${size * 0.52} L ${size * 0.7} ${size * 0.72} L ${size * 0.62} ${size * 0.68} Z`} fill="#a33" />
        </g>
      )}
      {accessories.includes('collar') && (
        <g>
          <ellipse cx={size * 0.5} cy={size * 0.48} rx={size * 0.24} ry={size * 0.05} fill="#8b4513" stroke="#6b3010" strokeWidth="1" />
          <circle cx={size * 0.5} cy={size * 0.51} r={size * 0.03} fill="#ffd700" />
        </g>
      )}
      {accessories.includes('bow') && (
        <g>
          <polygon points={`${size * 0.35},${size * 0.46} ${size * 0.48},${size * 0.42} ${size * 0.48},${size * 0.52} ${size * 0.35},${size * 0.46}`} fill="#e8555e" />
          <polygon points={`${size * 0.65},${size * 0.46} ${size * 0.52},${size * 0.42} ${size * 0.52},${size * 0.52} ${size * 0.65},${size * 0.46}`} fill="#e8555e" />
          <circle cx={size * 0.5} cy={size * 0.47} r={size * 0.04} fill="#c44" />
        </g>
      )}
    </>
  )
}

function BodyShape({ species, color, size }: { species: PetSpecies; color: any; size: number }) {
  const cx = size * 0.5
  const cy = size * 0.55

  switch (species) {
    case 'cat':
      return (
        <g>
          {/* Ears */}
          <polygon points={`${size * 0.25},${size * 0.18} ${size * 0.32},${size * 0.02} ${size * 0.4},${size * 0.15}`} fill={color.body} />
          <polygon points={`${size * 0.6},${size * 0.15} ${size * 0.68},${size * 0.02} ${size * 0.75},${size * 0.18}`} fill={color.body} />
          <polygon points={`${size * 0.28},${size * 0.15} ${size * 0.32},${size * 0.06} ${size * 0.36},${size * 0.13}`} fill={color.light} />
          <polygon points={`${size * 0.64},${size * 0.13} ${size * 0.68},${size * 0.06} ${size * 0.72},${size * 0.15}`} fill={color.light} />
          {/* Head */}
          <ellipse cx={cx} cy={size * 0.32} rx={size * 0.28} ry={size * 0.24} fill={color.body} />
          {/* Body */}
          <ellipse cx={cx} cy={cy + size * 0.05} rx={size * 0.26} ry={size * 0.28} fill={color.body} />
          {/* Belly */}
          <ellipse cx={cx} cy={cy + size * 0.08} rx={size * 0.16} ry={size * 0.18} fill={color.belly} />
          {/* Legs */}
          <rect x={size * 0.34} y={cy + size * 0.2} width={size * 0.08} height={size * 0.12} rx={4} fill={color.dark} />
          <rect x={size * 0.58} y={cy + size * 0.2} width={size * 0.08} height={size * 0.12} rx={4} fill={color.dark} />
          {/* Whiskers */}
          <line x1={size * 0.2} y1={size * 0.38} x2={size * 0.32} y2={size * 0.4} stroke={color.dark} strokeWidth="1" opacity="0.5" />
          <line x1={size * 0.2} y1={size * 0.42} x2={size * 0.32} y2={size * 0.42} stroke={color.dark} strokeWidth="1" opacity="0.5" />
          <line x1={size * 0.8} y1={size * 0.38} x2={size * 0.68} y2={size * 0.4} stroke={color.dark} strokeWidth="1" opacity="0.5" />
          <line x1={size * 0.8} y1={size * 0.42} x2={size * 0.68} y2={size * 0.42} stroke={color.dark} strokeWidth="1" opacity="0.5" />
        </g>
      )
    case 'dog':
      return (
        <g>
          {/* Floppy ears */}
          <ellipse cx={size * 0.22} cy={size * 0.3} rx={size * 0.1} ry={size * 0.18} fill={color.dark} />
          <ellipse cx={size * 0.78} cy={size * 0.3} rx={size * 0.1} ry={size * 0.18} fill={color.dark} />
          {/* Head */}
          <ellipse cx={cx} cy={size * 0.32} rx={size * 0.26} ry={size * 0.24} fill={color.body} />
          {/* Snout */}
          <ellipse cx={cx} cy={size * 0.42} rx={size * 0.14} ry={size * 0.1} fill={color.light} />
          {/* Nose */}
          <ellipse cx={cx} cy={size * 0.38} rx={size * 0.04} ry={size * 0.03} fill="#1a1a2e" />
          {/* Body */}
          <ellipse cx={cx} cy={cy + size * 0.08} rx={size * 0.28} ry={size * 0.26} fill={color.body} />
          {/* Belly */}
          <ellipse cx={cx} cy={cy + size * 0.1} rx={size * 0.16} ry={size * 0.16} fill={color.belly} />
          {/* Legs */}
          <rect x={size * 0.32} y={cy + size * 0.22} width={size * 0.09} height={size * 0.12} rx={4} fill={color.dark} />
          <rect x={size * 0.59} y={cy + size * 0.22} width={size * 0.09} height={size * 0.12} rx={4} fill={color.dark} />
        </g>
      )
    case 'rabbit':
      return (
        <g>
          {/* Long ears */}
          <ellipse cx={size * 0.38} cy={size * 0.05} rx={size * 0.06} ry={size * 0.2} fill={color.body} />
          <ellipse cx={size * 0.62} cy={size * 0.05} rx={size * 0.06} ry={size * 0.2} fill={color.body} />
          <ellipse cx={size * 0.38} cy={size * 0.08} rx={size * 0.03} ry={size * 0.14} fill={color.light} />
          <ellipse cx={size * 0.62} cy={size * 0.08} rx={size * 0.03} ry={size * 0.14} fill={color.light} />
          {/* Head */}
          <ellipse cx={cx} cy={size * 0.32} rx={size * 0.24} ry={size * 0.22} fill={color.body} />
          {/* Body */}
          <ellipse cx={cx} cy={cy + size * 0.08} rx={size * 0.25} ry={size * 0.3} fill={color.body} />
          {/* Belly */}
          <ellipse cx={cx} cy={cy + size * 0.12} rx={size * 0.14} ry={size * 0.18} fill={color.belly} />
          {/* Legs */}
          <ellipse cx={size * 0.38} cy={cy + size * 0.28} rx={size * 0.07} ry={size * 0.08} fill={color.dark} />
          <ellipse cx={size * 0.62} cy={cy + size * 0.28} rx={size * 0.07} ry={size * 0.08} fill={color.dark} />
          {/* Tail (puffball) */}
          <circle cx={size * 0.82} cy={cy + size * 0.05} r={size * 0.07} fill={color.light} />
        </g>
      )
    case 'fox':
      return (
        <g>
          {/* Pointed ears */}
          <polygon points={`${size * 0.25},${size * 0.18} ${size * 0.3},${size * 0.0} ${size * 0.38},${size * 0.15}`} fill={color.body} />
          <polygon points={`${size * 0.62},${size * 0.15} ${size * 0.7},${size * 0.0} ${size * 0.75},${size * 0.18}`} fill={color.body} />
          <polygon points={`${size * 0.28},${size * 0.14} ${size * 0.3},${size * 0.04} ${size * 0.34},${size * 0.12}`} fill="#1a1a2e" />
          <polygon points={`${size * 0.66},${size * 0.12} ${size * 0.7},${size * 0.04} ${size * 0.72},${size * 0.14}`} fill="#1a1a2e" />
          {/* Head */}
          <ellipse cx={cx} cy={size * 0.33} rx={size * 0.25} ry={size * 0.22} fill={color.body} />
          {/* Snout (pointed) */}
          <polygon points={`${size * 0.4},${size * 0.4} ${size * 0.5},${size * 0.52} ${size * 0.6},${size * 0.4}`} fill={color.light} />
          {/* Body */}
          <ellipse cx={cx} cy={cy + size * 0.06} rx={size * 0.26} ry={size * 0.26} fill={color.body} />
          <ellipse cx={cx} cy={cy + size * 0.1} rx={size * 0.15} ry={size * 0.16} fill={color.belly} />
          {/* Legs */}
          <rect x={size * 0.34} y={cy + size * 0.2} width={size * 0.08} height={size * 0.12} rx={4} fill="#1a1a2e" />
          <rect x={size * 0.58} y={cy + size * 0.2} width={size * 0.08} height={size * 0.12} rx={4} fill="#1a1a2e" />
        </g>
      )
    case 'redpanda':
      return (
        <g>
          {/* Rounded ears */}
          <circle cx={size * 0.28} cy={size * 0.18} r={size * 0.08} fill={color.body} />
          <circle cx={size * 0.72} cy={size * 0.18} r={size * 0.08} fill={color.body} />
          <circle cx={size * 0.28} cy={size * 0.18} r={size * 0.05} fill={color.light} />
          <circle cx={size * 0.72} cy={size * 0.18} r={size * 0.05} fill={color.light} />
          {/* Head */}
          <ellipse cx={cx} cy={size * 0.33} rx={size * 0.26} ry={size * 0.22} fill={color.body} />
          {/* Face mask */}
          <path d={`M ${size * 0.3} ${size * 0.35} Q ${size * 0.38} ${size * 0.42} ${size * 0.42} ${size * 0.38}`} stroke={color.dark} strokeWidth="3" fill="none" />
          <path d={`M ${size * 0.58} ${size * 0.38} Q ${size * 0.62} ${size * 0.42} ${size * 0.7} ${size * 0.35}`} stroke={color.dark} strokeWidth="3" fill="none" />
          {/* Body */}
          <ellipse cx={cx} cy={cy + size * 0.06} rx={size * 0.25} ry={size * 0.26} fill={color.body} />
          <ellipse cx={cx} cy={cy + size * 0.1} rx={size * 0.14} ry={size * 0.16} fill={color.belly} />
          <rect x={size * 0.35} y={cy + size * 0.2} width={size * 0.08} height={size * 0.12} rx={4} fill={color.dark} />
          <rect x={size * 0.57} y={cy + size * 0.2} width={size * 0.08} height={size * 0.12} rx={4} fill={color.dark} />
        </g>
      )
    case 'hamster':
      return (
        <g>
          {/* Round ears */}
          <circle cx={size * 0.3} cy={size * 0.2} r={size * 0.06} fill={color.light} />
          <circle cx={size * 0.7} cy={size * 0.2} r={size * 0.06} fill={color.light} />
          {/* Big round body (hamster is chubby) */}
          <ellipse cx={cx} cy={size * 0.45} rx={size * 0.35} ry={size * 0.38} fill={color.body} />
          {/* Belly */}
          <ellipse cx={cx} cy={size * 0.5} rx={size * 0.2} ry={size * 0.22} fill={color.belly} />
          {/* Cheeks */}
          <circle cx={size * 0.25} cy={size * 0.45} r={size * 0.08} fill={color.light} opacity="0.6" />
          <circle cx={size * 0.75} cy={size * 0.45} r={size * 0.08} fill={color.light} opacity="0.6" />
          {/* Tiny legs */}
          <rect x={size * 0.38} y={size * 0.78} width={size * 0.08} height={size * 0.08} rx={3} fill={color.dark} />
          <rect x={size * 0.54} y={size * 0.78} width={size * 0.08} height={size * 0.08} rx={3} fill={color.dark} />
        </g>
      )
    case 'penguin':
      return (
        <g>
          {/* Body (oval) */}
          <ellipse cx={cx} cy={size * 0.5} rx={size * 0.3} ry={size * 0.38} fill={color.dark} />
          {/* White belly */}
          <ellipse cx={cx} cy={size * 0.52} rx={size * 0.2} ry={size * 0.3} fill={color.belly} />
          {/* Head */}
          <circle cx={cx} cy={size * 0.22} r={size * 0.18} fill={color.dark} />
          {/* Beak */}
          <polygon points={`${size * 0.45},${size * 0.24} ${size * 0.55},${size * 0.24} ${size * 0.5},${size * 0.3}`} fill="#e89150" />
          {/* Feet */}
          <ellipse cx={size * 0.4} cy={size * 0.88} rx={size * 0.07} ry={size * 0.04} fill="#e89150" />
          <ellipse cx={size * 0.6} cy={size * 0.88} rx={size * 0.07} ry={size * 0.04} fill="#e89150" />
          {/* Flippers */}
          <ellipse cx={size * 0.2} cy={size * 0.5} rx={size * 0.05} ry={size * 0.15} fill={color.dark} />
          <ellipse cx={size * 0.8} cy={size * 0.5} rx={size * 0.05} ry={size * 0.15} fill={color.dark} />
        </g>
      )
    case 'owl':
      return (
        <g>
          {/* Body */}
          <ellipse cx={cx} cy={size * 0.5} rx={size * 0.32} ry={size * 0.36} fill={color.body} />
          {/* Big eyes circles */}
          <circle cx={size * 0.35} cy={size * 0.32} r={size * 0.12} fill={color.light} />
          <circle cx={size * 0.65} cy={size * 0.32} r={size * 0.12} fill={color.light} />
          {/* Ear tufts */}
          <polygon points={`${size * 0.3},${size * 0.1} ${size * 0.35},${size * 0.0} ${size * 0.38},${size * 0.12}`} fill={color.body} />
          <polygon points={`${size * 0.62},${size * 0.12} ${size * 0.65},${size * 0.0} ${size * 0.7},${size * 0.1}`} fill={color.body} />
          {/* Beak */}
          <polygon points={`${size * 0.46},${size * 0.42} ${size * 0.54},${size * 0.42} ${size * 0.5},${size * 0.5}`} fill="#e89150" />
          {/* Wings */}
          <ellipse cx={size * 0.22} cy={size * 0.55} rx={size * 0.1} ry={size * 0.2} fill={color.dark} />
          <ellipse cx={size * 0.78} cy={size * 0.55} rx={size * 0.1} ry={size * 0.2} fill={color.dark} />
          {/* Feather pattern */}
          <path d={`M ${size * 0.4} ${size * 0.6} Q ${size * 0.5} ${size * 0.65} ${size * 0.6} ${size * 0.6}`} stroke={color.dark} strokeWidth="1.5" fill="none" opacity="0.5" />
          <path d={`M ${size * 0.4} ${size * 0.7} Q ${size * 0.5} ${size * 0.75} ${size * 0.6} ${size * 0.7}`} stroke={color.dark} strokeWidth="1.5" fill="none" opacity="0.5" />
        </g>
      )
    case 'dragon':
      return (
        <g>
          {/* Horns */}
          <polygon points={`${size * 0.32},${size * 0.15} ${size * 0.35},${size * 0.0} ${size * 0.38},${size * 0.15}`} fill="#daa520" />
          <polygon points={`${size * 0.62},${size * 0.15} ${size * 0.65},${size * 0.0} ${size * 0.68},${size * 0.15}`} fill="#daa520" />
          {/* Head */}
          <ellipse cx={cx} cy={size * 0.3} rx={size * 0.26} ry={size * 0.22} fill={color.body} />
          {/* Snout */}
          <polygon points={`${size * 0.38},${size * 0.38} ${size * 0.55},${size * 0.38} ${size * 0.5},${size * 0.48}`} fill={color.light} />
          {/* Body */}
          <ellipse cx={cx} cy={cy + size * 0.06} rx={size * 0.26} ry={size * 0.26} fill={color.body} />
          {/* Belly scales */}
          <ellipse cx={cx} cy={cy + size * 0.1} rx={size * 0.15} ry={size * 0.16} fill={color.belly} />
          {/* Spikes along back */}
          <polygon points={`${size * 0.3},${size * 0.5} ${size * 0.35},${size * 0.42} ${size * 0.4},${size * 0.5}`} fill={color.dark} />
          <polygon points={`${size * 0.5},${size * 0.48} ${size * 0.55},${size * 0.4} ${size * 0.6},${size * 0.48}`} fill={color.dark} />
          <polygon points={`${size * 0.65},${size * 0.5} ${size * 0.7},${size * 0.42} ${size * 0.75},${size * 0.5}`} fill={color.dark} />
          {/* Legs */}
          <rect x={size * 0.34} y={cy + size * 0.2} width={size * 0.08} height={size * 0.12} rx={4} fill={color.dark} />
          <rect x={size * 0.58} y={cy + size * 0.2} width={size * 0.08} height={size * 0.12} rx={4} fill={color.dark} />
        </g>
      )
    case 'dinosaur':
      return (
        <g>
          {/* Head */}
          <ellipse cx={cx} cy={size * 0.28} rx={size * 0.24} ry={size * 0.2} fill={color.body} />
          {/* Back plates */}
          <polygon points={`${size * 0.3},${size * 0.35} ${size * 0.33},${size * 0.2} ${size * 0.38},${size * 0.33}`} fill={color.dark} />
          <polygon points={`${size * 0.45},${size * 0.4} ${size * 0.5},${size * 0.22} ${size * 0.55},${size * 0.4}`} fill={color.dark} />
          <polygon points={`${size * 0.6},${size * 0.35} ${size * 0.65},${size * 0.22} ${size * 0.7},${size * 0.35}`} fill={color.dark} />
          {/* Body */}
          <ellipse cx={cx} cy={cy + size * 0.06} rx={size * 0.28} ry={size * 0.24} fill={color.body} />
          <ellipse cx={cx} cy={cy + size * 0.1} rx={size * 0.16} ry={size * 0.16} fill={color.belly} />
          {/* Big legs */}
          <ellipse cx={size * 0.35} cy={cy + size * 0.24} rx={size * 0.06} ry={size * 0.1} fill={color.dark} />
          <ellipse cx={size * 0.65} cy={cy + size * 0.24} rx={size * 0.06} ry={size * 0.1} fill={color.dark} />
        </g>
      )
    case 'axolotl':
      return (
        <g>
          {/* Head */}
          <ellipse cx={cx} cy={size * 0.35} rx={size * 0.26} ry={size * 0.2} fill={color.body} />
          {/* Gills (frilly) */}
          <motion.g animate={{ rotate: [0, 5, -5, 0] }} transition={{ duration: 2, repeat: Infinity }} style={{ originX: `${size * 0.25}px`, originY: `${size * 0.35}px` }}>
            <path d={`M ${size * 0.25} ${size * 0.35} Q ${size * 0.15} ${size * 0.25} ${size * 0.1} ${size * 0.3} Q ${size * 0.12} ${size * 0.4} ${size * 0.22} ${size * 0.42}`} fill="#f08bc7" />
          </motion.g>
          <motion.g animate={{ rotate: [0, -5, 5, 0] }} transition={{ duration: 2, repeat: Infinity }} style={{ originX: `${size * 0.75}px`, originY: `${size * 0.35}px` }}>
            <path d={`M ${size * 0.75} ${size * 0.35} Q ${size * 0.85} ${size * 0.25} ${size * 0.9} ${size * 0.3} Q ${size * 0.88} ${size * 0.4} ${size * 0.78} ${size * 0.42}`} fill="#f08bc7" />
          </motion.g>
          {/* Body */}
          <ellipse cx={cx} cy={cy + size * 0.08} rx={size * 0.22} ry={size * 0.26} fill={color.body} />
          <ellipse cx={cx} cy={cy + size * 0.12} rx={size * 0.12} ry={size * 0.16} fill={color.belly} />
          {/* Tiny legs */}
          <circle cx={size * 0.38} cy={cy + size * 0.26} r={size * 0.04} fill={color.dark} />
          <circle cx={size * 0.62} cy={cy + size * 0.26} r={size * 0.04} fill={color.dark} />
        </g>
      )
    case 'bee':
      return (
        <g>
          {/* Body (striped) */}
          <ellipse cx={cx} cy={size * 0.45} rx={size * 0.28} ry={size * 0.32} fill="#ffd700" />
          <rect x={size * 0.25} y={size * 0.38} width={size * 0.5} height={size * 0.06} fill="#1a1a2e" opacity="0.8" />
          <rect x={size * 0.25} y={size * 0.52} width={size * 0.5} height={size * 0.06} fill="#1a1a2e" opacity="0.8" />
          {/* Wings (transparent) */}
          <motion.ellipse cx={size * 0.3} cy={size * 0.25} rx={size * 0.12} ry={size * 0.18} fill="#e8f0ff" opacity="0.6"
            animate={{ scaleY: [1, 0.7, 1] }} transition={{ duration: 0.1, repeat: Infinity }} style={{ originY: `${size * 0.3}px` }} />
          <motion.ellipse cx={size * 0.7} cy={size * 0.25} rx={size * 0.12} ry={size * 0.18} fill="#e8f0ff" opacity="0.6"
            animate={{ scaleY: [1, 0.7, 1] }} transition={{ duration: 0.1, repeat: Infinity }} style={{ originY: `${size * 0.3}px` }} />
          {/* Antennae */}
          <line x1={size * 0.42} y1={size * 0.2} x2={size * 0.38} y2={size * 0.08} stroke="#1a1a2e" strokeWidth="1.5" />
          <line x1={size * 0.58} y1={size * 0.2} x2={size * 0.62} y2={size * 0.08} stroke="#1a1a2e" strokeWidth="1.5" />
          <circle cx={size * 0.38} cy={size * 0.07} r={size * 0.02} fill="#1a1a2e" />
          <circle cx={size * 0.62} cy={size * 0.07} r={size * 0.02} fill="#1a1a2e" />
        </g>
      )
    case 'duck':
      return (
        <g>
          {/* Head */}
          <circle cx={cx} cy={size * 0.28} r={size * 0.18} fill={color.body} />
          {/* Beak */}
          <ellipse cx={size * 0.62} cy={size * 0.3} rx={size * 0.1} ry={size * 0.05} fill="#e89150" />
          {/* Body */}
          <ellipse cx={cx} cy={cy + size * 0.08} rx={size * 0.3} ry={size * 0.28} fill={color.body} />
          <ellipse cx={cx} cy={cy + size * 0.12} rx={size * 0.18} ry={size * 0.16} fill={color.belly} />
          {/* Feet */}
          <polygon points={`${size * 0.38},${size * 0.85} ${size * 0.32},${size * 0.9} ${size * 0.44},${size * 0.9}`} fill="#e89150" />
          <polygon points={`${size * 0.62},${size * 0.85} ${size * 0.56},${size * 0.9} ${size * 0.68},${size * 0.9}`} fill="#e89150" />
          {/* Wing */}
          <ellipse cx={size * 0.3} cy={cy + size * 0.08} rx={size * 0.08} ry={size * 0.18} fill={color.dark} />
        </g>
      )
    case 'turtle':
      return (
        <g>
          {/* Shell */}
          <ellipse cx={cx} cy={size * 0.5} rx={size * 0.34} ry={size * 0.3} fill={color.body} />
          {/* Shell pattern (hexagons) */}
          <polygon points={`${size * 0.4},${size * 0.42} ${size * 0.5},${size * 0.38} ${size * 0.6},${size * 0.42} ${size * 0.6},${size * 0.5} ${size * 0.5},${size * 0.54} ${size * 0.4},${size * 0.5}`} fill={color.dark} opacity="0.3" />
          {/* Head */}
          <ellipse cx={cx} cy={size * 0.2} rx={size * 0.14} ry={size * 0.12} fill={color.light} />
          {/* Legs */}
          <ellipse cx={size * 0.22} cy={size * 0.65} rx={size * 0.07} ry={size * 0.06} fill={color.light} />
          <ellipse cx={size * 0.78} cy={size * 0.65} rx={size * 0.07} ry={size * 0.06} fill={color.light} />
          <ellipse cx={size * 0.25} cy={size * 0.8} rx={size * 0.06} ry={size * 0.05} fill={color.light} />
          <ellipse cx={size * 0.75} cy={size * 0.8} rx={size * 0.06} ry={size * 0.05} fill={color.light} />
        </g>
      )
    default:
      return <ellipse cx={cx} cy={cy} rx={size * 0.25} ry={size * 0.25} fill={color.body} />
  }
}

function mapBehavior(behavior: string): PetBehavior {
  switch (behavior) {
    case 'yawning': case 'belly-rub': return 'sitting'
    case 'scratching': return 'stretching'
    case 'sneezing': return 'idle'
    case 'head-tilt': return 'looking'
    case 'tail-chase': return 'rolling'
    case 'stretching-long': return 'stretching'
    case 'shaking': return 'walking'
    case 'prancing': return 'hopping'
    case 'pouncing': return 'playing'
    case 'running': return 'walking'
    default: return behavior as PetBehavior
  }
}

export default function PetSVG({ species, behavior, colorVariant = 'default', accessories = [], size = 120 }: Props) {
  const color = getColor(colorVariant)
  const b = behavior as string
  const mapped = mapBehavior(b)
  const isWalking = mapped === 'walking'
  const isSleeping = mapped === 'sleeping'
  const isHopping = mapped === 'hopping'
  const isRolling = mapped === 'rolling'
  const isSneezing = b === 'sneezing'
  const isHappyBounce = b === 'prancing' || b === 'pouncing' || b === 'belly-rub'

  const bodyAnim = isSneezing
    ? { x: [0, -4, 4, -4, 0], y: [0, -2, 0] }
    : isWalking ? { y: [0, -3, 0] }
    : isHopping ? { y: [0, -15, 0] }
    : isRolling ? { rotate: [0, 360] }
    : isSleeping ? { y: [0, 2, 0] }
    : isHappyBounce ? { y: [0, -10, 0] }
    : { y: [0, -2, 0] }

  return (
    <motion.svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      animate={bodyAnim}
      transition={{
        duration: isSneezing ? 0.4 : isWalking ? 0.5 : isHopping ? 0.6 : isRolling ? 1 : isHappyBounce ? 0.5 : 3,
        repeat: Infinity,
        ease: 'easeInOut',
      }}
      style={{ overflow: 'visible' }}
    >
      <BackAccessories accessories={accessories} size={120} />
      <BodyShape species={species} color={color} size={120} />
      <AnimatedEyes behavior={mapped} size={120} />
      <AnimatedTail species={species} behavior={b === 'tail-chase' ? 'wagging' : mapped} color={color} size={120} />
      <FrontAccessories accessories={accessories} size={120} />
      {isSleeping && (
        <text x={90} y={20} fontSize="16" opacity="0.7">z</text>
      )}
      {isSneezing && (
        <text x={84} y={28} fontSize="14" opacity="0.8">achoo!</text>
      )}
      {b === 'yawning' && (
        <ellipse cx={60} cy={48} rx={6} ry={5} fill="#1a1a2e" opacity="0.7" />
      )}
    </motion.svg>
  )
}
