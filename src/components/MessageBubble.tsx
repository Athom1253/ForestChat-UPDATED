import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { format } from 'date-fns'
import { User, Reply, CreditCard as Edit2, Trash2, MoveHorizontal as MoreHorizontal, Copy, Bookmark, Forward, Flag, Pin } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import type { Message, AppUser, ReactionSummary } from '../lib/types'
import VoiceMessagePlayer from './VoiceMessagePlayer'
import { useStore } from '../lib/store'

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '🎉', '🔥', '😢', '🙏']

interface MessageBubbleProps {
  message: Message
  isOwn: boolean
  user: AppUser | null
  parentUser?: AppUser | null
  parentMessage?: Message | null
  onContextMenu: (e: React.MouseEvent) => void
  onReaction: (id: string, emoji: string) => void
  onReply: (msg: Message) => void
  onEdit: (msg: Message) => void
  onDelete: (msg: Message) => void
  onPin: (msg: Message) => void
  onCopy: (text: string) => void
  onBookmark: (msg: Message) => void
  onForward: (msg: Message) => void
  onImageClick: (url: string) => void
  isAdmin: boolean
  currentUserId: string
  onAvatarClick?: (userId: string) => void
  readStatus?: 'sent' | 'delivered' | 'read'
}

export default function MessageBubble({
  message,
  isOwn,
  user,
  parentUser,
  parentMessage,
  onContextMenu,
  onReaction,
  onReply,
  onEdit,
  onDelete,
  onPin,
  onCopy,
  onBookmark,
  onForward,
  onImageClick,
  isAdmin,
  currentUserId,
  onAvatarClick,
  readStatus,
}: MessageBubbleProps) {
  const [hovered, setHovered] = useState(false)
  const [showMoreActions, setShowMoreActions] = useState(false)
  const [moreMenuPos, setMoreMenuPos] = useState({ x: 0, y: 0 })
  const moreButtonRef = useRef<HTMLButtonElement>(null)
  const moreMenuRef = useRef<HTMLDivElement>(null)
  const lastTapRef = useRef(0)
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isDeleted = message.is_deleted
  const isPinned = message.is_pinned

  // Close more menu on outside click or Escape
  useEffect(() => {
    if (!showMoreActions) return
    const onDown = (e: MouseEvent) => {
      if (
        moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node) &&
        moreButtonRef.current && !moreButtonRef.current.contains(e.target as Node)
      ) {
        setShowMoreActions(false)
      }
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowMoreActions(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [showMoreActions])

  const openMoreMenu = () => {
    if (!moreButtonRef.current) return
    const rect = moreButtonRef.current.getBoundingClientRect()
    // Position below the button, flip up if near bottom
    const spaceBelow = window.innerHeight - rect.bottom
    const menuH = 220
    const x = isOwn ? rect.right - 160 : rect.left
    const y = spaceBelow > menuH ? rect.bottom + 4 : rect.top - menuH - 4
    setMoreMenuPos({ x: Math.max(8, Math.min(x, window.innerWidth - 168)), y: Math.max(8, y) })
    setShowMoreActions(true)
  }

  const handleDoubleClick = () => onReaction(message.id, '❤️')

  const handleTouchStart = () => {
    longPressRef.current = setTimeout(() => {
      onContextMenu({ clientX: 0, clientY: 0, preventDefault: () => {} } as any)
    }, 500)
  }
  const handleTouchEnd = () => {
    if (longPressRef.current) clearTimeout(longPressRef.current)
    const now = Date.now()
    if (now - lastTapRef.current < 300) onReaction(message.id, '❤️')
    lastTapRef.current = now
  }

  if (isDeleted) {
    return (
      <div className="flex items-center justify-center py-2">
        <span className="text-xs text-text-muted/50 italic select-none">Message deleted</span>
      </div>
    )
  }

  const isVoice = message.message_type === 'voice'
  const images = (message.attachments || []).filter((a) => a.type.startsWith('image/'))
  const videos = (message.attachments || []).filter((a) => a.type.startsWith('video/'))
  const voiceAtts = (message.attachments || []).filter((a) => a.type.startsWith('audio/'))
  const files = (message.attachments || []).filter(
    (a) => !a.type.startsWith('image/') && !a.type.startsWith('video/') && !a.type.startsWith('audio/')
  )

  const moreMenuItems = [
    { icon: <Copy className="w-3.5 h-3.5" />, label: 'Copy text', onClick: () => { onCopy(message.content); setShowMoreActions(false) } },
    { icon: <Forward className="w-3.5 h-3.5" />, label: 'Forward', onClick: () => { onForward(message); setShowMoreActions(false) } },
    ...((isAdmin || isOwn) ? [{ icon: <Pin className="w-3.5 h-3.5" />, label: message.is_pinned ? 'Unpin' : 'Pin', onClick: () => { onPin(message); setShowMoreActions(false) } }] : []),
    { icon: <Flag className="w-3.5 h-3.5" />, label: 'Report', onClick: () => setShowMoreActions(false) },
    ...((isAdmin || isOwn) ? [{ icon: <Trash2 className="w-3.5 h-3.5" />, label: 'Delete', danger: true, onClick: () => { onDelete(message); setShowMoreActions(false) } }] : []),
  ]

  return (
    <motion.div
      id={`msg-${message.id}`}
      initial={{ opacity: 0, y: 6, scale: 0.99 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className={`flex gap-3 mb-1 group relative ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}
      onContextMenu={onContextMenu}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onDoubleClick={handleDoubleClick}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Avatar */}
      <button
        className="w-9 h-9 rounded-full bg-accent/10 flex items-center justify-center shrink-0 mt-0.5 overflow-hidden hover:ring-2 hover:ring-accent/20 transition-all duration-200"
        onClick={() => onAvatarClick?.(message.user_id)}
      >
        {user?.avatar_url ? (
          <img src={user.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover" />
        ) : (
          <User className="w-4 h-4 text-accent/60" />
        )}
      </button>

      {/* Content + Action bar */}
      <div className={`max-w-[75%] min-w-0 relative flex flex-col ${isOwn ? 'items-end' : 'items-start'}`}>
        {/* Name + time row */}
        <div className={`flex items-center gap-2 mb-1 px-0.5 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
          <span className="text-xs font-bold text-text-secondary">{user?.display_name || user?.username || 'Unknown'}</span>
          {isPinned && <Pin className="w-3 h-3 text-accent" />}
          <span className="text-xs text-text-muted/60">{format(new Date(message.created_at || ''), 'h:mm a')}</span>
          {message.is_edited && <span className="text-xs text-text-muted/40 italic">(edited)</span>}
          {isOwn && readStatus && (
            <span className={`text-xs ${readStatus === 'read' ? 'text-accent' : readStatus === 'delivered' ? 'text-text-muted/60' : 'text-text-muted/50'}`} title={readStatus === 'read' ? 'Read' : readStatus === 'delivered' ? 'Delivered' : 'Sent'}>
              {readStatus === 'read' ? '✓✓' : readStatus === 'delivered' ? '✓✓' : '✓'}
            </span>
          )}
        </div>

        {/* Reply quote */}
        {parentMessage && (
          <div className="mb-1.5 max-w-full flex">
            <div
              className={`px-3 py-1.5 rounded-2xl rounded-b-sm text-xs border-l-4 cursor-pointer hover:opacity-80 transition-opacity ${isOwn ? 'bg-white/10 border-white/40 text-white/80' : 'bg-accent/5 border-accent/40 text-text-muted'}`}
              onClick={() => document.getElementById(`msg-${parentMessage.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
            >
              <span className="font-bold opacity-90 mr-1">{parentUser?.display_name || parentUser?.username || 'Unknown'}:</span>
              <span className="truncate">{parentMessage.is_deleted ? '(deleted)' : parentMessage.content || (parentMessage.attachments?.length ? '[attachment]' : '')}</span>
            </div>
          </div>
        )}

        {/* Bubble */}
        <div
          className={`relative px-4 py-2.5 text-sm ${
            isOwn
              ? 'bg-accent text-white rounded-3xl rounded-br-sm'
              : 'bg-bg-surface text-text rounded-3xl rounded-bl-sm border border-border/50'
          } ${isPinned ? 'ring-2 ring-accent/30' : ''}`}
          style={
            isOwn
              ? { boxShadow: '0 2px 12px rgba(90,140,110,0.2)' }
              : { boxShadow: '0 2px 8px rgba(74,58,38,0.07)' }
          }
        >
          {isVoice && voiceAtts.length > 0 && (
            <VoiceMessagePlayer url={voiceAtts[0].url} duration={voiceAtts[0].duration || 0} isOwn={isOwn} />
          )}

          {message.content && (
            <p className="whitespace-pre-wrap break-words leading-relaxed">
              {renderTextWithMentions(message.content, currentUserId)}
            </p>
          )}

          {images.length > 0 && (
            <div className={`grid gap-1 mt-2 ${images.length === 1 ? '' : 'grid-cols-2'}`}>
              {images.map((img, i) => (
                <img key={i} src={img.url} alt={img.name} className="rounded-2xl object-cover cursor-pointer hover:opacity-90 transition-opacity max-h-64 w-full" onClick={() => onImageClick(img.url)} />
              ))}
            </div>
          )}

          {videos.length > 0 && (
            <div className="mt-2 space-y-1">
              {videos.map((vid, i) => <video key={i} src={vid.url} controls className="rounded-2xl max-h-64 w-full" />)}
            </div>
          )}

          {files.length > 0 && (
            <div className="mt-2 space-y-1">
              {files.map((file, i) => (
                <a key={i} href={file.url} target="_blank" rel="noopener noreferrer"
                  className={`flex items-center gap-2 p-2.5 rounded-2xl transition-all ${isOwn ? 'bg-white/10 hover:bg-white/20' : 'bg-accent/5 hover:bg-accent/10 border border-accent/10'}`}>
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${isOwn ? 'bg-white/20' : 'bg-accent/10'}`}>
                    <span className="text-xs font-bold">{getFileIcon(file.name)}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold truncate">{file.name}</div>
                    {file.size && <div className="text-xs opacity-60">{formatFileSize(file.size)}</div>}
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>

        {/* Reactions */}
        {message.reactions && message.reactions.length > 0 && (
          <div className={`flex gap-1 mt-1.5 flex-wrap ${isOwn ? 'justify-end' : ''}`}>
            {message.reactions.map((r) => (
              <ReactionButton
                key={r.emoji}
                reaction={r}
                onReact={() => onReaction(message.id, r.emoji)}
              />
            ))}
          </div>
        )}

        {/* Hover action bar — stays visible while showMoreActions is open */}
        <AnimatePresence>
          {(hovered || showMoreActions) && (
            <motion.div
              initial={{ opacity: 0, y: 4, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 4, scale: 0.95 }}
              transition={{ duration: 0.12 }}
              className={`absolute -top-10 ${isOwn ? 'right-0' : 'left-0'} flex items-center gap-0.5 bg-bg-surface border border-border/60 rounded-2xl px-1.5 py-1 shadow-lg z-20 backdrop-blur-sm`}
            >
              {QUICK_REACTIONS.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => onReaction(message.id, emoji)}
                  className="w-7 h-7 flex items-center justify-center text-sm hover:bg-accent/10 rounded-full transition-all hover:scale-125"
                >
                  {emoji}
                </button>
              ))}
              <div className="w-px h-5 bg-border/60 mx-0.5" />
              <button onClick={() => onReply(message)} className="w-7 h-7 flex items-center justify-center text-text-muted hover:text-accent hover:bg-accent/10 rounded-full transition-all" title="Reply">
                <Reply className="w-3.5 h-3.5" />
              </button>
              {isOwn && (
                <button onClick={() => onEdit(message)} className="w-7 h-7 flex items-center justify-center text-text-muted hover:text-accent hover:bg-accent/10 rounded-full transition-all" title="Edit">
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
              )}
              <button onClick={() => onBookmark(message)} className="w-7 h-7 flex items-center justify-center text-text-muted hover:text-accent hover:bg-accent/10 rounded-full transition-all" title="Bookmark">
                <Bookmark className="w-3.5 h-3.5" />
              </button>
              <button
                ref={moreButtonRef}
                onClick={openMoreMenu}
                className={`w-7 h-7 flex items-center justify-center rounded-full transition-all ${showMoreActions ? 'text-accent bg-accent/10' : 'text-text-muted hover:text-accent hover:bg-accent/10'}`}
                title="More"
              >
                <MoreHorizontal className="w-3.5 h-3.5" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* More menu — rendered in a portal so it's never clipped */}
      {showMoreActions && createPortal(
        <div
          ref={moreMenuRef}
          className="fixed z-[9999] bg-bg-surface border border-border rounded-2xl shadow-xl py-1 min-w-[160px]"
          style={{ left: moreMenuPos.x, top: moreMenuPos.y }}
        >
          {moreMenuItems.map((item, i) => (
            <button
              key={i}
              onClick={item.onClick}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium transition-all ${(item as any).danger ? 'text-error hover:bg-error-light' : 'text-text hover:bg-bg-hover'}`}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>,
        document.body
      )}
    </motion.div>
  )
}

function renderTextWithMentions(text: string, currentUserId: string) {
  const parts = text.split(/(@\w+)/g)
  return parts.map((part, i) => {
    if (part.startsWith('@')) {
      return (
        <span key={i} className="font-bold text-accent-2 bg-accent-2/10 rounded px-0.5">
          {part}
        </span>
      )
    }
    return part
  })
}

function getFileIcon(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase()
  const icons: Record<string, string> = {
    pdf: '📄', doc: '📝', docx: '📝', xls: '📊', xlsx: '📊',
    ppt: '📊', pptx: '📊', zip: '📦', rar: '📦', mp3: '🎵',
    wav: '🎵', mp4: '🎬', mov: '🎬', txt: '📃', csv: '📊',
  }
  return icons[ext || ''] || '📎'
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / 1048576).toFixed(1) + ' MB'
}

function ReactionButton({ reaction, onReact }: { reaction: ReactionSummary; onReact: () => void }) {
  const [showTooltip, setShowTooltip] = useState(false)
  const users = useStore((s) => s.users)

  const names = reaction.users.map((uid) => {
    const u = users[uid]
    return u?.display_name || u?.username || uid.slice(0, 8)
  })

  return (
    <div className="relative" onMouseEnter={() => setShowTooltip(true)} onMouseLeave={() => setShowTooltip(false)}>
      <motion.button
        whileTap={{ scale: 0.9 }}
        whileHover={{ scale: 1.08 }}
        onClick={onReact}
        className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs border transition-all duration-200 ${
          reaction.me
            ? 'bg-accent/15 border-accent/30 text-accent shadow-sm'
            : 'bg-bg-surface border-border/60 text-text-muted hover:bg-accent/5 hover:border-accent/20'
        }`}
      >
        <span>{reaction.emoji}</span>
        <span className="font-semibold">{reaction.count}</span>
      </motion.button>
      <AnimatePresence>
        {showTooltip && names.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.95 }}
            transition={{ duration: 0.12 }}
            className="absolute bottom-full mb-1.5 left-1/2 -translate-x-1/2 z-50 bg-bg-surface border border-border rounded-xl px-2.5 py-1.5 shadow-lg text-xs text-text whitespace-nowrap max-w-[160px]"
          >
            {names.slice(0, 5).join(', ')}{names.length > 5 ? ` +${names.length - 5}` : ''}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export function summarizeReactions(
  reactions: { emoji: string; user_id: string }[],
  currentUserId: string
): ReactionSummary[] {
  const map = new Map<string, { count: number; users: string[]; me: boolean }>()
  for (const r of reactions) {
    const e = map.get(r.emoji) || { count: 0, users: [], me: false }
    e.count++
    e.users.push(r.user_id)
    if (r.user_id === currentUserId) e.me = true
    map.set(r.emoji, e)
  }
  return Array.from(map.entries()).map(([emoji, d]) => ({ emoji, count: d.count, users: d.users, me: d.me }))
}
