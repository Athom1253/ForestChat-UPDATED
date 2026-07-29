import { useRef, useState, useEffect, useCallback } from 'react'
import { X, Pen, Eraser, RotateCcw, RotateCw, Trash2, Send, Download, Minus, Plus } from 'lucide-react'
import { motion } from 'framer-motion'

interface DrawingCanvasProps {
  onClose: () => void
  onSend: (dataUrl: string) => void
}

type Tool = 'pen' | 'eraser'
type HistoryEntry = ImageData

const PALETTE = [
  '#2a2a2a', '#ffffff', '#c46a5e', '#d4a44a', '#5a8c6e',
  '#4a90c8', '#9b6ab8', '#e87040', '#f0c040', '#60b8d8',
  '#d4607a', '#70c070', '#a08060', '#808080',
]

export default function DrawingCanvas({ onClose, onSend }: DrawingCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [tool, setTool] = useState<Tool>('pen')
  const [color, setColor] = useState('#2a2a2a')
  const [brushSize, setBrushSize] = useState(4)
  const [drawing, setDrawing] = useState(false)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [historyIdx, setHistoryIdx] = useState(-1)
  const lastPos = useRef<{ x: number; y: number } | null>(null)

  const getCtx = () => canvasRef.current?.getContext('2d') ?? null

  const getPos = (e: React.MouseEvent | React.TouchEvent): { x: number; y: number } | null => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    if ('touches' in e) {
      const t = e.touches[0] || e.changedTouches[0]
      return { x: (t.clientX - rect.left) * scaleX, y: (t.clientY - rect.top) * scaleY }
    }
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY }
  }

  // Initialize white canvas
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    saveHistory()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const saveHistory = useCallback(() => {
    const canvas = canvasRef.current
    const ctx = getCtx()
    if (!canvas || !ctx) return
    const snap = ctx.getImageData(0, 0, canvas.width, canvas.height)
    setHistory((h) => {
      const trimmed = h.slice(0, historyIdx + 1)
      const next = [...trimmed, snap]
      setHistoryIdx(next.length - 1)
      return next
    })
  }, [historyIdx])

  const undo = () => {
    const ctx = getCtx()
    const canvas = canvasRef.current
    if (!ctx || !canvas || historyIdx <= 0) return
    const prev = history[historyIdx - 1]
    ctx.putImageData(prev, 0, 0)
    setHistoryIdx(historyIdx - 1)
  }

  const redo = () => {
    const ctx = getCtx()
    const canvas = canvasRef.current
    if (!ctx || !canvas || historyIdx >= history.length - 1) return
    const next = history[historyIdx + 1]
    ctx.putImageData(next, 0, 0)
    setHistoryIdx(historyIdx + 1)
  }

  const clear = () => {
    const ctx = getCtx()
    const canvas = canvasRef.current
    if (!ctx || !canvas) return
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    saveHistory()
  }

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault()
    const pos = getPos(e)
    if (!pos) return
    const ctx = getCtx()
    if (!ctx) return
    setDrawing(true)
    lastPos.current = pos
    ctx.beginPath()
    ctx.moveTo(pos.x, pos.y)
  }

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault()
    if (!drawing) return
    const pos = getPos(e)
    if (!pos || !lastPos.current) return
    const ctx = getCtx()
    if (!ctx) return

    ctx.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over'
    ctx.strokeStyle = tool === 'eraser' ? 'rgba(0,0,0,1)' : color
    ctx.lineWidth = tool === 'eraser' ? brushSize * 3 : brushSize
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    ctx.beginPath()
    ctx.moveTo(lastPos.current.x, lastPos.current.y)
    ctx.lineTo(pos.x, pos.y)
    ctx.stroke()
    lastPos.current = pos
  }

  const endDraw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault()
    if (!drawing) return
    setDrawing(false)
    lastPos.current = null
    // Restore composite for eraser visual
    const ctx = getCtx()
    if (ctx) ctx.globalCompositeOperation = 'source-over'
    saveHistory()
  }

  const handleSend = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    // Render on white background (for transparency from eraser)
    const out = document.createElement('canvas')
    out.width = canvas.width
    out.height = canvas.height
    const ctx = out.getContext('2d')!
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, out.width, out.height)
    ctx.drawImage(canvas, 0, 0)
    onSend(out.toDataURL('image/png'))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ type: 'spring', damping: 28, stiffness: 280 }}
        className="bg-bg-surface border border-border rounded-3xl shadow-2xl flex flex-col w-full max-w-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
          <span className="font-bold text-text flex items-center gap-2">
            <Pen className="w-4 h-4 text-accent" /> Drawing Canvas
          </span>
          <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-bg-hover text-text-muted transition-all">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border flex-wrap bg-bg shrink-0">
          {/* Tool switcher */}
          <div className="flex items-center rounded-xl bg-bg-surface-2 border border-border p-0.5">
            <button
              onClick={() => setTool('pen')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${tool === 'pen' ? 'bg-accent text-white shadow' : 'text-text-muted hover:text-text'}`}
            >
              <Pen className="w-3.5 h-3.5" /> Pen
            </button>
            <button
              onClick={() => setTool('eraser')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${tool === 'eraser' ? 'bg-accent text-white shadow' : 'text-text-muted hover:text-text'}`}
            >
              <Eraser className="w-3.5 h-3.5" /> Eraser
            </button>
          </div>

          {/* Brush size */}
          <div className="flex items-center gap-2">
            <button onClick={() => setBrushSize((s) => Math.max(1, s - 1))} className="p-1 rounded-lg hover:bg-bg-hover text-text-muted transition-all">
              <Minus className="w-3.5 h-3.5" />
            </button>
            <div className="w-8 h-8 rounded-full bg-bg flex items-center justify-center border border-border">
              <div
                className="rounded-full bg-current"
                style={{
                  width: Math.min(brushSize * 2.5, 24),
                  height: Math.min(brushSize * 2.5, 24),
                  background: tool === 'eraser' ? '#ccc' : color,
                }}
              />
            </div>
            <button onClick={() => setBrushSize((s) => Math.min(40, s + 1))} className="p-1 rounded-lg hover:bg-bg-hover text-text-muted transition-all">
              <Plus className="w-3.5 h-3.5" />
            </button>
            <span className="text-xs text-text-muted w-6">{brushSize}px</span>
          </div>

          {/* Colour palette */}
          <div className="flex flex-wrap gap-1">
            {PALETTE.map((c) => (
              <button
                key={c}
                onClick={() => { setColor(c); setTool('pen') }}
                className={`w-6 h-6 rounded-full border-2 transition-all hover:scale-110 ${color === c && tool === 'pen' ? 'border-accent ring-2 ring-accent/30 scale-110' : 'border-border/60'}`}
                style={{ background: c }}
                title={c}
              />
            ))}
            {/* Custom colour */}
            <label className="w-6 h-6 rounded-full border-2 border-dashed border-border cursor-pointer hover:scale-110 transition-all overflow-hidden" title="Custom colour">
              <input type="color" value={color} onChange={(e) => { setColor(e.target.value); setTool('pen') }} className="w-8 h-8 -translate-x-1 -translate-y-1 opacity-0 absolute" />
              <div className="w-full h-full rounded-full" style={{ background: `conic-gradient(red, yellow, lime, cyan, blue, magenta, red)` }} />
            </label>
          </div>

          {/* History controls */}
          <div className="flex items-center gap-1 ml-auto">
            <button onClick={undo} disabled={historyIdx <= 0} className="p-1.5 rounded-xl hover:bg-bg-hover text-text-muted disabled:opacity-30 transition-all" title="Undo">
              <RotateCcw className="w-4 h-4" />
            </button>
            <button onClick={redo} disabled={historyIdx >= history.length - 1} className="p-1.5 rounded-xl hover:bg-bg-hover text-text-muted disabled:opacity-30 transition-all" title="Redo">
              <RotateCw className="w-4 h-4" />
            </button>
            <button onClick={clear} className="p-1.5 rounded-xl hover:bg-error-light text-text-muted hover:text-error transition-all" title="Clear canvas">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Canvas */}
        <div className="flex-1 p-4 bg-bg overflow-hidden flex items-center justify-center min-h-0">
          <canvas
            ref={canvasRef}
            width={720}
            height={400}
            className="rounded-2xl border border-border shadow-inner max-w-full max-h-full touch-none"
            style={{ cursor: tool === 'eraser' ? 'cell' : 'crosshair', background: '#fff' }}
            onMouseDown={startDraw}
            onMouseMove={draw}
            onMouseUp={endDraw}
            onMouseLeave={endDraw}
            onTouchStart={startDraw}
            onTouchMove={draw}
            onTouchEnd={endDraw}
          />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-border bg-bg shrink-0">
          <button
            onClick={() => {
              const canvas = canvasRef.current
              if (!canvas) return
              const a = document.createElement('a')
              a.download = `drawing-${Date.now()}.png`
              a.href = canvas.toDataURL('image/png')
              a.click()
            }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm text-text-muted hover:bg-bg-hover transition-all"
          >
            <Download className="w-4 h-4" /> Save
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-text-muted hover:bg-bg-hover transition-all">Cancel</button>
            <button onClick={handleSend} className="flex items-center gap-2 px-5 py-2 rounded-xl bg-accent text-white text-sm font-bold hover:bg-accent-hover transition-all shadow-sm">
              <Send className="w-4 h-4" /> Send Drawing
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
