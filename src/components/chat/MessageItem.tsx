import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { toast } from '@/stores/toast'
import { cn, timestampLabel } from '@/lib/utils'
import type { Message, Profile, Reaction } from '@/types'

interface MessageItemProps {
  message: Message & { author: Profile | null; reply_message: Message | null; reactions: Reaction[] }
  showAuthor: boolean
  isOwn: boolean
  onReply: () => void
  onEdit: () => void
  currentUserId: string
}

const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🎉']

export function MessageItem({ message, showAuthor, isOwn, onReply, onEdit, currentUserId }: MessageItemProps) {
  const [showActions, setShowActions] = useState(false)
  const [showReactions, setShowReactions] = useState(false)
  const [showImageViewer, setShowImageViewer] = useState<string | null>(null)

  const handleDelete = async () => {
    if (!confirm('Delete this message?')) return
    const { error } = await supabase.from('messages')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', message.id)
    if (error) toast.error('Failed to delete')
    else toast.success('Message deleted')
  }

  const toggleReaction = async (emoji: string) => {
    const existing = message.reactions.find((r) => r.emoji === emoji && r.user_id === currentUserId)
    if (existing) {
      await supabase.from('reactions').delete().eq('id', existing.id)
    } else {
      await supabase.from('reactions').insert({
        message_id: message.id,
        user_id: currentUserId,
        emoji,
      })
    }
    setShowReactions(false)
  }

  if (message.deleted_at) {
    return (
      <div className="flex items-center gap-2 py-1 px-2 group">
        <div className="w-10 flex-shrink-0" />
        <span className="text-xs text-text-muted italic">Message deleted</span>
      </div>
    )
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className={cn(
          'flex gap-2.5 py-0.5 px-2 rounded-lg group hover:bg-surface-hover/50 relative',
          showAuthor && 'mt-2',
        )}
        onMouseEnter={() => setShowActions(true)}
        onMouseLeave={() => { setShowActions(false); setShowReactions(false) }}
      >
        {/* Avatar */}
        {showAuthor ? (
          message.author?.avatar_url ? (
            <img src={message.author.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0 mt-0.5" />
          ) : (
            <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-sm flex-shrink-0 mt-0.5">
              {(message.author?.username || '?')[0]?.toUpperCase()}
            </div>
          )
        ) : (
          <div className="w-10 flex-shrink-0" />
        )}

        {/* Content */}
        <div className="flex-1 min-w-0">
          {showAuthor && (
            <div className="flex items-baseline gap-2 mb-0.5">
              <span className="font-semibold text-text text-sm">
                {message.author?.display_name || message.author?.username || 'Unknown'}
              </span>
              <span className="text-xs text-text-muted">{timestampLabel(message.created_at)}</span>
              {message.edited_at && <span className="text-xs text-text-muted">(edited)</span>}
            </div>
          )}

          {/* Reply indicator */}
          {message.reply_to && message.reply_message && (
            <div className="mb-1 flex items-center gap-2 text-xs text-text-muted border-l-2 border-primary/40 pl-2">
              <span>Replying to</span>
              <span className="font-medium text-text">{message.reply_message.content?.slice(0, 40) || 'Attachment'}</span>
            </div>
          )}

          {/* Message content by type */}
          {message.message_type === 'text' && (
            <p className="text-text text-sm leading-relaxed break-words whitespace-pre-wrap">{message.content}</p>
          )}

          {message.message_type === 'image' && message.attachment_url && (
            <button onClick={() => setShowImageViewer(message.attachment_url!)} className="block">
              <img
                src={message.attachment_url}
                alt={message.attachment_name || 'image'}
                className="max-w-sm max-h-80 rounded-lg border border-border cursor-pointer hover:opacity-90 transition-opacity"
              />
            </button>
          )}

          {message.message_type === 'file' && message.attachment_url && (
            <a href={message.attachment_url} download={message.attachment_name || undefined} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-3 p-3 bg-surface rounded-lg border border-border hover:border-primary transition-colors max-w-sm">
              <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div className="min-w-0">
                <p className="text-sm text-text truncate">{message.attachment_name}</p>
                {message.attachment_size && <p className="text-xs text-text-muted">{formatFileSize(message.attachment_size)}</p>}
              </div>
            </a>
          )}

          {message.message_type === 'drawing' && message.attachment_url && (
            <button onClick={() => setShowImageViewer(message.attachment_url!)} className="block">
              <img
                src={message.attachment_url}
                alt="Drawing"
                className="max-w-sm max-h-80 rounded-lg border border-border cursor-pointer hover:opacity-90 transition-opacity"
              />
            </button>
          )}

          {message.message_type === 'voice' && message.attachment_url && (
            <VoiceMessagePlayer url={message.attachment_url} metadata={message.attachment_metadata} />
          )}

          {/* Reactions */}
          {message.reactions.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {Object.entries(
                message.reactions.reduce((acc, r) => {
                  acc[r.emoji] = (acc[r.emoji] || 0) + 1
                  return acc
                }, {} as Record<string, number>)
              ).map(([emoji, count]) => {
                const hasReacted = message.reactions.some((r) => r.emoji === emoji && r.user_id === currentUserId)
                return (
                  <button
                    key={emoji}
                    onClick={() => toggleReaction(emoji)}
                    className={cn(
                      'flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-colors',
                      hasReacted ? 'bg-primary/20 border-primary/50 text-primary' : 'bg-surface border-border text-text-muted hover:text-text',
                    )}
                  >
                    {emoji} {count}
                  </button>
                )
              })}
            </div>
          )}

          {/* Hover actions */}
          <AnimatePresence>
            {showActions && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="absolute -top-3 right-2 flex items-center gap-0.5 bg-surface border border-border rounded-lg shadow-lg p-0.5 z-10"
              >
                <ActionButton onClick={() => setShowReactions(!showReactions)} title="React">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 00-5.656 0M7 10v4m3-3v4m-3-8l.01.01M7 6h.01M7 20h10a2 2 0 002-2V8a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </ActionButton>
                <ActionButton onClick={onReply} title="Reply">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                  </svg>
                </ActionButton>
                {isOwn && message.message_type === 'text' && (
                  <ActionButton onClick={onEdit} title="Edit">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </ActionButton>
                )}
                {isOwn && (
                  <ActionButton onClick={handleDelete} title="Delete" danger>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </ActionButton>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Quick reactions popover */}
          <AnimatePresence>
            {showReactions && (
              <motion.div
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 5 }}
                className="absolute top-4 right-2 flex gap-1 bg-surface border border-border rounded-lg shadow-xl p-1.5 z-20"
              >
                {QUICK_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => toggleReaction(emoji)}
                    className="w-8 h-8 flex items-center justify-center rounded hover:bg-surface-hover text-lg transition-transform hover:scale-125"
                  >
                    {emoji}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* Image viewer modal */}
      {showImageViewer && (
        <div
          className="fixed inset-0 bg-black/80 z-[200] flex items-center justify-center p-4"
          onClick={() => setShowImageViewer(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            <img src={showImageViewer} alt="viewer" className="max-w-full max-h-[90vh] rounded-lg" />
            <a
              href={showImageViewer}
              download
              className="absolute bottom-4 right-4 px-4 py-2 bg-primary text-bg rounded-lg font-medium hover:bg-primary-hover"
            >
              Download
            </a>
            <button
              onClick={() => setShowImageViewer(null)}
              className="absolute top-4 right-4 w-10 h-10 bg-surface/80 rounded-full flex items-center justify-center text-text hover:bg-surface"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </>
  )
}

function ActionButton({ children, onClick, title, danger }: { children: React.ReactNode; onClick: () => void; title: string; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        'w-7 h-7 flex items-center justify-center rounded transition-colors',
        danger ? 'text-error hover:bg-error/20' : 'text-text-muted hover:bg-surface-hover hover:text-text',
      )}
    >
      {children}
    </button>
  )
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function VoiceMessagePlayer({ url, metadata }: { url: string; metadata: Record<string, unknown> | null }) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)

  const togglePlay = () => {
    if (!audioRef.current) return
    if (isPlaying) audioRef.current.pause()
    else audioRef.current.play()
  }

  const waveform = (metadata?.waveform as number[]) || []

  return (
    <div className="flex items-center gap-3 p-3 bg-surface rounded-lg border border-border max-w-md">
      <button
        onClick={togglePlay}
        className="w-10 h-10 rounded-full bg-primary flex items-center justify-center flex-shrink-0 hover:bg-primary-hover"
      >
        {isPlaying ? (
          <svg className="w-5 h-5 text-bg" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" /></svg>
        ) : (
          <svg className="w-5 h-5 text-bg ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
        )}
      </button>

      <div className="flex-1">
        {/* Waveform */}
        <div className="flex items-center gap-0.5 h-8">
          {waveform.length > 0 ? waveform.map((h, i) => (
            <div
              key={i}
              className="flex-1 rounded-full transition-colors"
              style={{
                height: `${Math.max(h * 100, 10)}%`,
                background: i / waveform.length < currentTime / duration ? 'var(--color-primary)' : 'var(--color-border)',
              }}
            />
          )) : (
            <div className="flex-1 h-1 bg-border rounded-full" />
          )}
        </div>
        <div className="flex justify-between text-xs text-text-muted mt-1">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      <audio
        ref={audioRef}
        src={url}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        onEnded={() => setIsPlaying(false)}
      />
    </div>
  )
}

function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds)) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}
