import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { SidebarChat } from '../lib/supabase'
import { useConfirmDialog } from './ConfirmDialog'

interface ChatContextMenuProps {
  chat: SidebarChat | null
  x: number
  y: number
  onAction: (action: string) => void
  onClose: () => void
}

export default function ChatContextMenu({ chat, x, y, onAction, onClose }: ChatContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x, y })
  const { confirm, dialog } = useConfirmDialog()

  useLayoutEffect(() => {
    const menu = menuRef.current
    if (!menu) return
    const rect = menu.getBoundingClientRect()
    let nx = x
    let ny = y
    if (nx + rect.width > window.innerWidth) nx = window.innerWidth - rect.width - 8
    if (ny + rect.height > window.innerHeight) ny = window.innerHeight - rect.height - 8
    if (nx < 8) nx = 8
    if (ny < 8) ny = 8
    setPos({ x: nx, y: ny })
  }, [x, y])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!chat) return null

  const isGroup = chat.type === 'group' || chat.type === 'room'

  const handle = (action: string) => {
    onAction(action)
    onClose()
  }

  const handleDelete = () => {
    confirm({
      title: 'Delete Chat',
      message: 'Are you sure you want to delete this chat? This action cannot be undone.',
      confirmLabel: 'Delete',
      danger: true,
      onConfirm: () => handle('delete'),
    })
  }

  const handleLeave = () => {
    confirm({
      title: 'Leave Group',
      message: 'Are you sure you want to leave this group? You will need a new invite to rejoin.',
      confirmLabel: 'Leave',
      danger: true,
      onConfirm: () => handle('leave'),
    })
  }

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose() }} />
      <div
        ref={menuRef}
        style={{ left: pos.x, top: pos.y }}
        className="fixed z-50 w-52 bg-night-900 border border-night-800 rounded-xl shadow-2xl overflow-hidden origin-top-left animate-scale-in"
      >
        <MenuItem icon={<OpenIcon />} label="Open" onClick={() => handle('open')} />
        <MenuItem icon={<PinIcon />} label={chat.is_pinned ? 'Unpin' : 'Pin'} onClick={() => handle('toggle_pin')} />
        <MenuItem icon={<ArchiveIcon />} label={chat.is_archived ? 'Unarchive' : 'Archive'} onClick={() => handle('toggle_archive')} />
        <MenuItem icon={<ReadIcon />} label="Mark as Read" onClick={() => handle('mark_read')} />
        <MenuItem icon={<MuteIcon />} label={chat.is_muted ? 'Unmute' : 'Mute'} onClick={() => handle('toggle_mute')} />
        {isGroup && chat.invite_code && (
          <MenuItem icon={<CopyIcon />} label="Copy Invite Code" onClick={() => handle('copy_invite')} />
        )}
        <div className="my-1 h-px bg-night-800" />
        {isGroup ? (
          <MenuItem icon={<LeaveIcon />} label="Leave Group" danger onClick={handleLeave} />
        ) : (
          <MenuItem icon={<DeleteIcon />} label="Delete Chat" danger onClick={handleDelete} />
        )}
        {isGroup && (
          <MenuItem icon={<DeleteIcon />} label="Delete Chat" danger onClick={handleDelete} />
        )}
      </div>
      {dialog}
    </>
  )
}

function MenuItem({ icon, label, onClick, danger }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2 text-sm transition-colors ${danger ? 'text-red-400 hover:bg-red-950/40' : 'text-night-200 hover:bg-night-800 hover:text-night-50'}`}
    >
      <span className="flex-shrink-0">{icon}</span>
      <span>{label}</span>
    </button>
  )
}

function OpenIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  )
}

function PinIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 17v5" /><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" />
    </svg>
  )
}

function ArchiveIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="5" rx="1" /><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" /><path d="M10 12h4" />
    </svg>
  )
}

function ReadIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function MuteIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 5L6 9H2v6h4l5 4V5z" /><line x1="22" y1="9" x2="16" y2="15" /><line x1="16" y1="9" x2="22" y2="15" />
    </svg>
  )
}

function CopyIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  )
}

function DeleteIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  )
}

function LeaveIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  )
}
