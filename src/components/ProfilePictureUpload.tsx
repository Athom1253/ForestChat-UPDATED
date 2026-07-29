import { useState, useRef, useCallback } from 'react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { useToast } from '../lib/toast'

interface ProfilePictureUploadProps {
  currentUrl: string | null
  onUpload: (url: string) => void
}

export default function ProfilePictureUpload({ currentUrl, onUpload }: ProfilePictureUploadProps) {
  const { user } = useAuth()
  const { toast } = useToast()
  const [preview, setPreview] = useState<string | null>(currentUrl)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [dragging, setDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const compressImage = useCallback((file: File): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        const img = new Image()
        img.onload = () => {
          const maxDim = 512
          let { width, height } = img
          if (width > height) {
            if (width > maxDim) {
              height = Math.round((height * maxDim) / width)
              width = maxDim
            }
          } else {
            if (height > maxDim) {
              width = Math.round((width * maxDim) / height)
              height = maxDim
            }
          }
          const canvas = document.createElement('canvas')
          canvas.width = width
          canvas.height = height
          const ctx = canvas.getContext('2d')
          if (!ctx) {
            reject(new Error('Canvas context unavailable'))
            return
          }
          ctx.drawImage(img, 0, 0, width, height)
          canvas.toBlob(
            (blob) => {
              if (blob) resolve(blob)
              else reject(new Error('Compression failed'))
            },
            'image/jpeg',
            0.8,
          )
        }
        img.onerror = () => reject(new Error('Image load failed'))
        img.src = e.target?.result as string
      }
      reader.onerror = () => reject(new Error('File read failed'))
      reader.readAsDataURL(file)
    })
  }, [])

  const handleFile = useCallback(
    async (file: File) => {
      if (!user) return
      if (!file.type.startsWith('image/')) {
        toast('Please select an image file', 'error')
        return
      }
      setUploading(true)
      setProgress(0)
      try {
        const compressed = await compressImage(file)
        const previewUrl = URL.createObjectURL(compressed)
        setPreview(previewUrl)

        const path = `${user.id}/${Date.now()}.jpg`
        setProgress(20)

        const { error: uploadError } = await supabase.storage
          .from('avatars')
          .upload(path, compressed, { contentType: 'image/jpeg', upsert: true })

        if (uploadError) {
          toast(uploadError.message, 'error')
          setUploading(false)
          setProgress(0)
          return
        }

        setProgress(70)

        const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path)
        const publicUrl = urlData.publicUrl

        setProgress(100)
        onUpload(publicUrl)
        toast('Profile picture uploaded', 'success')
      } catch (err) {
        toast(err instanceof Error ? err.message : 'Upload failed', 'error')
      } finally {
        setUploading(false)
        setTimeout(() => setProgress(0), 1000)
      }
    },
    [user, compressImage, onUpload, toast],
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragging(false)
      const file = e.dataTransfer.files?.[0]
      if (file) handleFile(file)
    },
    [handleFile],
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
  }, [])

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) handleFile(file)
      e.target.value = ''
    },
    [handleFile],
  )

  return (
    <div className="flex flex-col items-center gap-3">
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current?.click()}
        className={`relative flex h-32 w-32 cursor-pointer items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed transition-all ${
          dragging
            ? 'border-forest-500 bg-forest-900/30 scale-105'
            : 'border-night-600 bg-night-900/50 hover:border-forest-600 hover:bg-night-800/50'
        }`}
      >
        {preview ? (
          <img src={preview} alt="Avatar preview" className="h-full w-full object-cover" />
        ) : (
          <div className="flex flex-col items-center gap-2 text-night-400">
            <svg viewBox="0 0 24 24" fill="none" className="h-8 w-8" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <span className="text-xs font-medium">Drop or click</span>
          </div>
        )}
        {uploading && (
          <div className="absolute inset-0 flex items-center justify-center bg-night-950/80 backdrop-blur-sm">
            <svg className="h-8 w-8 animate-spin text-forest-500" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
      />

      {progress > 0 && progress < 100 && (
        <div className="w-32">
          <div className="h-1.5 overflow-hidden rounded-full bg-night-700">
            <div
              className="h-full rounded-full bg-forest-500 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="mt-1 text-center text-xs text-night-400">{progress}%</p>
        </div>
      )}

      <p className="text-xs text-night-400">
        Drag &amp; drop or click to upload
      </p>
    </div>
  )
}
