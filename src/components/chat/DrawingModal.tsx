import { useRef, useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { toast } from '@/stores/toast'

interface DrawingModalProps {
  channelId: string
  onClose: () => void
}

const COLORS = ['#ffffff', '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#a855f7', '#ec4899', '#000000']
const BRUSH_SIZES = [2, 4, 8, 16]

export function DrawingModal({ channelId, onClose }: DrawingModalProps) {
  const { user } = useAuthStore()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [color, setColor] = useState('#22c55e')
  const [brushSize, setBrushSize] = useState(4)
  const [isDrawing, setIsDrawing] = useState(false)
  const [sending, setSending] = useState(false)
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null)
  const lastPointRef = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.width = 600
    canvas.height = 400
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = '#1a2a20'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctxRef.current = ctx
  }, [])

  const getPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    if ('touches' in e) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY,
      }
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    }
  }

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault()
    setIsDrawing(true)
    lastPointRef.current = getPos(e)
  }

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault()
    if (!isDrawing || !ctxRef.current || !lastPointRef.current) return
    const pos = getPos(e)
    const ctx = ctxRef.current
    ctx.strokeStyle = color
    ctx.lineWidth = brushSize
    ctx.beginPath()
    ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y)
    ctx.lineTo(pos.x, pos.y)
    ctx.stroke()
    lastPointRef.current = pos
  }

  const endDraw = () => {
    setIsDrawing(false)
    lastPointRef.current = null
  }

  const clearCanvas = () => {
    const canvas = canvasRef.current
    const ctx = ctxRef.current
    if (!canvas || !ctx) return
    ctx.fillStyle = '#1a2a20'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }

  const sendDrawing = async () => {
    const canvas = canvasRef.current
    if (!canvas || !user) return
    setSending(true)

    canvas.toBlob(async (blob) => {
      if (!blob) { setSending(false); return }
      const fileName = `${user.id}/${Date.now()}-drawing.png`
      try {
        const { data, error } = await supabase.storage.from('drawings').upload(fileName, blob, { contentType: 'image/png' })
        if (error) throw error
        const { data: { publicUrl } } = supabase.storage.from('drawings').getPublicUrl(data.path)

        const { error: msgError } = await supabase.from('messages').insert({
          chat_id: channelId,
          user_id: user.id,
          content: '',
          message_type: 'drawing',
          attachment_url: publicUrl,
          attachment_name: 'drawing.png',
          attachment_size: blob.size,
          attachment_metadata: { width: canvas.width, height: canvas.height },
        })

        if (msgError) throw msgError
        toast.success('Drawing sent!')
        onClose()
      } catch (err) {
        toast.error('Failed to send drawing')
      } finally {
        setSending(false)
      }
    }, 'image/png')
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-[200] flex items-center justify-center p-4" onClick={onClose}>
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-surface border border-border rounded-2xl p-4 max-w-2xl w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-text">Drawing Canvas</h2>
          <button onClick={onClose} className="text-text-muted hover:text-text">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Color palette */}
        <div className="flex items-center gap-2 mb-3">
          <div className="flex gap-1.5">
            {COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={`w-7 h-7 rounded-full border-2 transition-transform ${color === c ? 'border-primary scale-110' : 'border-border'}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
          <div className="w-px h-6 bg-border mx-2" />
          <div className="flex gap-1.5">
            {BRUSH_SIZES.map((s) => (
              <button
                key={s}
                onClick={() => setBrushSize(s)}
                className={`w-7 h-7 rounded-lg border-2 flex items-center justify-center transition-all ${brushSize === s ? 'border-primary bg-primary/10' : 'border-border'}`}
              >
                <div className="rounded-full bg-text" style={{ width: s, height: s }} />
              </button>
            ))}
          </div>
        </div>

        {/* Canvas */}
        <div className="rounded-lg overflow-hidden border border-border mb-3 bg-bg">
          <canvas
            ref={canvasRef}
            onMouseDown={startDraw}
            onMouseMove={draw}
            onMouseUp={endDraw}
            onMouseLeave={endDraw}
            onTouchStart={startDraw}
            onTouchMove={draw}
            onTouchEnd={endDraw}
            className="w-full touch-none cursor-crosshair"
            style={{ aspectRatio: '3/2' }}
          />
        </div>

        {/* Actions */}
        <div className="flex justify-between">
          <button onClick={clearCanvas} className="btn-ghost">
            Clear
          </button>
          <button onClick={sendDrawing} disabled={sending} className="btn-primary disabled:opacity-50">
            {sending ? 'Sending...' : 'Send Drawing'}
          </button>
        </div>
      </motion.div>
    </div>
  )
}
