import { useRef, useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { toast } from '@/stores/toast'

const COLORS = ['#ffffff', '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#a855f7', '#ec4899', '#000000']
const BRUSH_SIZES = [2, 4, 8, 16, 32]
const CANVAS_BG = ['#1a2a20', '#0c1929', '#1a0f0a', '#050510', '#fafafa', '#0a0a0a']

export default function DrawingPage() {
  const { user } = useAuthStore()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null)
  const [color, setColor] = useState('#22c55e')
  const [brushSize, setBrushSize] = useState(4)
  const [bgColor, setBgColor] = useState('#1a2a20')
  const [isDrawing, setIsDrawing] = useState(false)
  const [saving, setSaving] = useState(false)
  const lastPointRef = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.width = 800
    canvas.height = 600
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = bgColor
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctxRef.current = ctx
  }, [])

  const getPos = (e: React.MouseEvent) => {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    }
  }

  const startDraw = (e: React.MouseEvent) => {
    setIsDrawing(true)
    lastPointRef.current = getPos(e)
  }

  const draw = (e: React.MouseEvent) => {
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
    ctx.fillStyle = bgColor
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }

  const changeBg = (c: string) => {
    setBgColor(c)
    const canvas = canvasRef.current
    const ctx = ctxRef.current
    if (!canvas || !ctx) return
    // Save current drawing
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = c
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.putImageData(imageData, 0, 0)
  }

  const downloadDrawing = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const link = document.createElement('a')
    link.download = `forestchat-drawing-${Date.now()}.png`
    link.href = canvas.toDataURL('image/png')
    link.click()
    toast.success('Drawing downloaded!')
  }

  const saveDrawing = async () => {
    const canvas = canvasRef.current
    if (!canvas || !user) return
    setSaving(true)
    canvas.toBlob(async (blob) => {
      if (!blob) { setSaving(false); return }
      const fileName = `${user.id}/gallery-${Date.now()}.png`
      try {
        const { data, error } = await supabase.storage.from('drawings').upload(fileName, blob, { contentType: 'image/png' })
        if (error) throw error
        toast.success('Drawing saved to your gallery!')
      } catch (err) {
        toast.error('Failed to save drawing')
      } finally {
        setSaving(false)
      }
    }, 'image/png')
  }

  return (
    <div className="flex-1 flex flex-col bg-bg overflow-hidden">
      <div className="h-14 flex items-center justify-between px-6 border-b border-border bg-surface">
        <h1 className="text-lg font-semibold text-text">Drawing Studio</h1>
        <div className="flex gap-2">
          <button onClick={downloadDrawing} className="btn-ghost text-sm">Download</button>
          <button onClick={saveDrawing} disabled={saving} className="btn-primary text-sm disabled:opacity-50">
            {saving ? 'Saving...' : 'Save to Gallery'}
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Tools sidebar */}
        <div className="w-56 bg-surface border-r border-border p-4 space-y-4 overflow-y-auto">
          {/* Colors */}
          <div>
            <h3 className="text-sm font-semibold text-text-muted uppercase mb-2">Colors</h3>
            <div className="grid grid-cols-5 gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`w-8 h-8 rounded-full border-2 transition-transform ${color === c ? 'border-primary scale-110' : 'border-border'}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          {/* Brush size */}
          <div>
            <h3 className="text-sm font-semibold text-text-muted uppercase mb-2">Brush Size</h3>
            <div className="flex gap-2">
              {BRUSH_SIZES.map((s) => (
                <button
                  key={s}
                  onClick={() => setBrushSize(s)}
                  className={`w-10 h-10 rounded-lg border-2 flex items-center justify-center transition-all ${brushSize === s ? 'border-primary bg-primary/10' : 'border-border'}`}
                >
                  <div className="rounded-full bg-text" style={{ width: Math.min(s, 20), height: Math.min(s, 20) }} />
                </button>
              ))}
            </div>
          </div>

          {/* Background */}
          <div>
            <h3 className="text-sm font-semibold text-text-muted uppercase mb-2">Background</h3>
            <div className="grid grid-cols-3 gap-2">
              {CANVAS_BG.map((c) => (
                <button
                  key={c}
                  onClick={() => changeBg(c)}
                  className={`h-10 rounded-lg border-2 transition-all ${bgColor === c ? 'border-primary' : 'border-border'}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="pt-4 border-t border-border">
            <button onClick={clearCanvas} className="btn-ghost w-full">Clear Canvas</button>
          </div>
        </div>

        {/* Canvas area */}
        <div className="flex-1 flex items-center justify-center p-6 overflow-auto">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="rounded-xl overflow-hidden shadow-2xl border border-border"
          >
            <canvas
              ref={canvasRef}
              onMouseDown={startDraw}
              onMouseMove={draw}
              onMouseUp={endDraw}
              onMouseLeave={endDraw}
              className="cursor-crosshair touch-none"
              style={{ width: '100%', maxWidth: '800px', height: 'auto' }}
            />
          </motion.div>
        </div>
      </div>
    </div>
  )
}
