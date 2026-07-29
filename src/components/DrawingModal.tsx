import { useEffect, useRef, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

interface DrawingModalProps {
  onClose: () => void
  chatId: string
  userId?: string
  onSent?: () => void
}

const COLORS = [
  '#ffffff', '#ef4444', '#f97316', '#facc15',
  '#22c55e', '#06b6d4', '#3b82f6', '#a855f7',
]

const BRUSH_SIZES = [2, 4, 8, 12]

export default function DrawingModal({ onClose, chatId, userId, onSent }: DrawingModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null)
  const drawingRef = useRef(false)
  const lastPointRef = useRef<{ x: number; y: number } | null>(null)
  const [color, setColor] = useState(COLORS[0])
  const [brushSize, setBrushSize] = useState(4)
  const [sending, setSending] = useState(false)
  const [visible, setVisible] = useState(false)
  const [hasDrawn, setHasDrawn] = useState(false)

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true))
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.scale(dpr, dpr)
    ctx.fillStyle = '#0f131c'
    ctx.fillRect(0, 0, rect.width, rect.height)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctxRef.current = ctx
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !sending) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, sending])

  const getPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const startDraw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    const ctx = ctxRef.current
    if (!ctx) return
    drawingRef.current = true
    lastPointRef.current = getPoint(e)
    ctx.beginPath()
    ctx.arc(lastPointRef.current.x, lastPointRef.current.y, brushSize / 2, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.fill()
    setHasDrawn(true)
    ;(e.target as HTMLCanvasElement).setPointerCapture(e.pointerId)
  }

  const draw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return
    e.preventDefault()
    const ctx = ctxRef.current
    const last = lastPointRef.current
    if (!ctx || !last) return
    const point = getPoint(e)
    ctx.strokeStyle = color
    ctx.lineWidth = brushSize
    ctx.beginPath()
    ctx.moveTo(last.x, last.y)
    ctx.lineTo(point.x, point.y)
    ctx.stroke()
    lastPointRef.current = point
  }

  const endDraw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    drawingRef.current = false
    lastPointRef.current = null
    try { (e.target as HTMLCanvasElement).releasePointerCapture(e.pointerId) } catch { /* noop */ }
  }

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current
    const ctx = ctxRef.current
    if (!canvas || !ctx) return
    const rect = canvas.getBoundingClientRect()
    ctx.fillStyle = '#0f131c'
    ctx.fillRect(0, 0, rect.width, rect.height)
    setHasDrawn(false)
  }, [])

  const handleSend = async () => {
    const canvas = canvasRef.current
    if (!canvas || !hasDrawn || sending) return
    setSending(true)
    try {
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), 'image/png')
      )
      if (!blob) throw new Error('Failed to render drawing')
      const fileName = `${Date.now()}.png`
      const filePath = `drawings/${chatId}/${fileName}`
      const { error: uploadError } = await supabase.storage
        .from('chat-attachments')
        .upload(filePath, blob, { contentType: 'image/png' })
      if (uploadError) throw uploadError
      const { data: urlData } = supabase.storage
        .from('chat-attachments')
        .getPublicUrl(filePath)
      const imageUrl = urlData.publicUrl
      const { error: msgError } = await supabase.from('messages').insert({
        chat_id: chatId,
        user_id: userId ?? null,
        content: 'Shared a drawing',
        message_type: 'drawing',
        attachments: [{ type: 'drawing', url: imageUrl }],
      })
      if (msgError) throw msgError
      onSent?.()
      onClose()
    } catch (err) {
      console.error('Failed to send drawing:', err)
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className={`absolute inset-0 bg-black/60 transition-opacity duration-200 ${visible ? 'opacity-100' : 'opacity-0'}`}
        onClick={() => !sending && onClose()}
      />
      <div
        className={`relative bg-night-900 border border-night-800 rounded-2xl shadow-2xl w-full max-w-2xl transition-all duration-200 ${visible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-night-800">
          <h3 className="text-lg font-semibold text-night-50 flex items-center gap-2">
            <BrushIcon />
            Drawing
          </h3>
          <button
            onClick={() => !sending && onClose()}
            disabled={sending}
            className="p-1.5 rounded-lg text-night-400 hover:text-night-100 hover:bg-night-800 transition-colors disabled:opacity-50"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5">
              {COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`w-7 h-7 rounded-full border-2 transition-transform duration-150 hover:scale-110 ${color === c ? 'border-forest-400 scale-110' : 'border-night-700'}`}
                  style={{ backgroundColor: c }}
                  aria-label={`Color ${c}`}
                />
              ))}
            </div>
            <div className="h-6 w-px bg-night-800" />
            <div className="flex items-center gap-1.5">
              {BRUSH_SIZES.map((s) => (
                <button
                  key={s}
                  onClick={() => setBrushSize(s)}
                  className={`w-9 h-9 rounded-lg flex items-center justify-center border transition-all duration-150 hover:scale-105 ${brushSize === s ? 'border-forest-400 bg-forest-950/40' : 'border-night-700 bg-night-800 hover:bg-night-700'}`}
                  aria-label={`Brush size ${s}`}
                >
                  <span
                    className="rounded-full bg-night-100"
                    style={{ width: `${s + 1}px`, height: `${s + 1}px` }}
                  />
                </button>
              ))}
            </div>
            <div className="h-6 w-px bg-night-800" />
            <button
              onClick={clearCanvas}
              disabled={sending || !hasDrawn}
              className="px-3 py-2 text-sm font-medium text-night-200 hover:text-night-50 bg-night-800 hover:bg-night-700 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              <ClearIcon />
              Clear
            </button>
          </div>

          <div className="relative rounded-xl overflow-hidden border border-night-800">
            <canvas
              ref={canvasRef}
              onPointerDown={startDraw}
              onPointerMove={draw}
              onPointerUp={endDraw}
              onPointerCancel={endDraw}
              onPointerLeave={endDraw}
              className="w-full h-80 touch-none cursor-crosshair block"
              style={{ backgroundColor: '#0f131c' }}
            />
          </div>

          <div className="flex justify-end gap-3">
            <button
              onClick={() => !sending && onClose()}
              disabled={sending}
              className="px-4 py-2 text-sm font-medium text-night-300 hover:text-night-100 bg-night-800 hover:bg-night-700 rounded-lg transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSend}
              disabled={!hasDrawn || sending}
              className="px-5 py-2 text-sm font-medium text-white bg-forest-600 hover:bg-forest-500 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {sending ? (
                <>
                  <SpinnerIcon />
                  Sending...
                </>
              ) : (
                <>
                  <SendIcon />
                  Send Drawing
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function BrushIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-forest-400">
      <path d="M9.06 11.9l8.07-8.06a2.85 2.85 0 1 1 4.03 4.03l-8.06 8.08" />
      <path d="M7.07 14.94c-1.66 0-3 1.35-3 3.02 0 1.33-2.5 1.52-2 2.02 1.08 1.1 2.49 2.02 4 2.02 2.2 0 4-1.8 4-4.04a3.01 3.01 0 0 0-3-3.02z" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

function ClearIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  )
}

function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  )
}

function SpinnerIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-spin">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  )
}
