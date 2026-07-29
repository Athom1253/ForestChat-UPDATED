import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { toast } from '@/stores/toast'
import { cn, formatFileSize } from '@/lib/utils'
import type { Message } from '@/types'

interface MessageInputProps {
  channelId: string
  replyTo: Message | null
  editingMessage: Message | null
  onReplyCleared: () => void
  onEditCleared: () => void
  onTyping: (isTyping: boolean) => void
  onDrawingOpen: () => void
  onVoiceOpen: () => void
}

export function MessageInput({ channelId, replyTo, editingMessage, onReplyCleared, onEditCleared, onTyping, onDrawingOpen, onVoiceOpen }: MessageInputProps) {
  const { user } = useAuthStore()
  const [text, setText] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastTypingSentRef = useRef<boolean>(false)

  useEffect(() => {
    if (editingMessage) {
      setText(editingMessage.content || '')
      inputRef.current?.focus()
    }
  }, [editingMessage])

  useEffect(() => {
    if (replyTo) {
      inputRef.current?.focus()
    }
  }, [replyTo])

  const handleTyping = () => {
    if (!lastTypingSentRef.current) {
      onTyping(true)
      lastTypingSentRef.current = true
    }
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    typingTimeoutRef.current = setTimeout(() => {
      onTyping(false)
      lastTypingSentRef.current = false
    }, 2000)
  }

  const sendTextMessage = async () => {
    if (!text.trim() || !user) return

    if (editingMessage) {
      const { error } = await supabase.from('messages')
        .update({ content: text.trim(), edited_at: new Date().toISOString() })
        .eq('id', editingMessage.id)
      if (error) {
        toast.error('Failed to edit message')
        return
      }
      onEditCleared()
    } else {
      const { error } = await supabase.from('messages').insert({
        chat_id: channelId,
        user_id: user.id,
        content: text.trim(),
        message_type: 'text',
        reply_to: replyTo?.id || null,
      })
      if (error) {
        toast.error('Failed to send message')
        return
      }
      onReplyCleared()
    }

    setText('')
    onTyping(false)
    lastTypingSentRef.current = false
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendTextMessage()
    }
    if (e.key === 'Escape') {
      if (editingMessage) onEditCleared()
      if (replyTo) onReplyCleared()
      setText('')
    }
  }

  const uploadFile = async (file: File) => {
    if (!user) return
    setUploading(true)
    setUploadProgress(0)

    const isImage = file.type.startsWith('image/')
    const bucket = isImage ? 'attachments' : 'attachments'
    const fileName = `${user.id}/${Date.now()}-${file.name.replace(/\s/g, '_')}`

    try {
      const { data, error } = await supabase.storage
        .from(bucket)
        .upload(fileName, file, { upsert: false })

      if (error) throw error

      const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(data.path)

      const { error: msgError } = await supabase.from('messages').insert({
        chat_id: channelId,
        user_id: user.id,
        content: '',
        message_type: isImage ? 'image' : 'file',
        attachment_url: publicUrl,
        attachment_name: file.name,
        attachment_size: file.size,
        attachment_metadata: isImage ? { width: 0, height: 0 } : null,
        reply_to: replyTo?.id || null,
      })

      if (msgError) throw msgError
      onReplyCleared()
      toast.success('File sent')
    } catch (err) {
      toast.error('Failed to upload file')
    } finally {
      setUploading(false)
      setUploadProgress(0)
    }
  }

  const handleFiles = (files: FileList | File[]) => {
    const fileArray = Array.from(files)
    fileArray.forEach(uploadFile)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    if (e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files)
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }

  return (
    <div
      className="border-t border-border bg-surface p-3"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      {isDragging && (
        <div className="absolute inset-0 bg-primary/10 border-2 border-dashed border-primary rounded-lg flex items-center justify-center z-50 pointer-events-none">
          <p className="text-primary font-medium text-lg">Drop files to send</p>
        </div>
      )}

      {uploading && (
        <div className="mb-2 px-3 py-2 bg-surface-hover rounded-lg">
          <div className="flex items-center gap-2 text-sm text-text-muted mb-1">
            <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Uploading...
          </div>
          <div className="h-1 bg-bg rounded-full overflow-hidden">
            <div className="h-full bg-primary transition-all" style={{ width: `${uploadProgress}%` }} />
          </div>
        </div>
      )}

      <div className="flex items-end gap-2">
        {/* File input button */}
        <label className="btn-ghost p-2 cursor-pointer" title="Upload file">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
          </svg>
          <input
            type="file"
            multiple
            className="hidden"
            onChange={(e) => e.target.files && handleFiles(e.target.files)}
          />
        </label>

        {/* Drawing button */}
        <button onClick={onDrawingOpen} className="btn-ghost p-2" title="Draw">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </svg>
        </button>

        {/* Voice button */}
        <button onClick={onVoiceOpen} className="btn-ghost p-2" title="Voice message">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
          </svg>
        </button>

        {/* Text input */}
        <textarea
          ref={inputRef}
          value={text}
          onChange={(e) => { setText(e.target.value); handleTyping() }}
          onKeyDown={handleKeyDown}
          placeholder={editingMessage ? 'Edit message...' : 'Type a message...'}
          rows={1}
          className="flex-1 bg-bg border border-border rounded-xl px-4 py-2.5 text-text placeholder:text-text-muted focus:outline-none focus:border-primary resize-none max-h-32"
          style={{ minHeight: '42px' }}
        />

        {/* Send button */}
        <button
          onClick={sendTextMessage}
          disabled={!text.trim()}
          className="btn-primary p-2.5 disabled:opacity-30 disabled:cursor-not-allowed"
          title={editingMessage ? 'Save edit' : 'Send'}
        >
          {editingMessage ? (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          )}
        </button>
      </div>
    </div>
  )
}
