import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { toast } from '@/stores/toast'
import { cn, relativeTime } from '@/lib/utils'
import type { Channel, ChannelMember } from '@/types'

interface ChannelWithMeta extends Channel {
  last_message?: string
  last_message_at?: string
  member?: ChannelMember
  unread_count?: number
}

interface ChannelItemProps {
  channel: ChannelWithMeta
  onUpdated: () => void
}

export function ChannelItem({ channel, onUpdated }: ChannelItemProps) {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const [showMenu, setShowMenu] = useState(false)
  const [dmProfile, setDmProfile] = useState<{ username: string; avatar_url: string | null; status: string } | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const isActive = location.pathname === '/' && new URLSearchParams(location.search).get('c') === channel.id

  useEffect(() => {
    if (channel.type === 'dm' && user) {
      loadDmProfile()
    }
  }, [channel.id, channel.type, user?.id])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  async function loadDmProfile() {
    const { data: members } = await supabase
      .from('channel_members')
      .select('user_id')
      .eq('channel_id', channel.id)
      .neq('user_id', user!.id)

    if (members && members.length > 0) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('username, avatar_url, status')
        .eq('id', members[0].user_id)
        .maybeSingle()
      if (profile) setDmProfile(profile)
    }
  }

  const handleClick = () => {
    navigate(`/?c=${channel.id}`)
  }

  const togglePin = async () => {
    if (!channel.member) return
    await supabase.from('channel_members')
      .update({ is_pinned: !channel.member.is_pinned })
      .eq('id', channel.member.id)
    toast.success(channel.member.is_pinned ? 'Unpinned' : 'Pinned')
    setShowMenu(false)
    onUpdated()
  }

  const toggleArchive = async () => {
    if (!channel.member) return
    await supabase.from('channel_members')
      .update({ is_archived: !channel.member.is_archived })
      .eq('id', channel.member.id)
    toast.success(channel.member.is_archived ? 'Unarchived' : 'Archived')
    setShowMenu(false)
    onUpdated()
  }

  const leaveChannel = async () => {
    if (!channel.member) return
    await supabase.from('channel_members').delete().eq('id', channel.member.id)
    toast.success('Left channel')
    setShowMenu(false)
    onUpdated()
  }

  const displayName = channel.type === 'dm'
    ? dmProfile?.username || 'Direct Message'
    : channel.name || 'Unnamed Channel'

  const avatar = channel.type === 'dm' ? dmProfile?.avatar_url : channel.icon_url

  return (
    <motion.div
      layout
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="relative"
    >
      <div
        onClick={handleClick}
        onContextMenu={(e) => { e.preventDefault(); setShowMenu(true) }}
        className={cn(
          'flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer transition-colors group',
          isActive ? 'bg-primary/15' : 'hover:bg-surface-hover',
        )}
      >
        {/* Avatar */}
        <div className="relative flex-shrink-0">
          {avatar ? (
            <img src={avatar} alt="" className="w-9 h-9 rounded-full object-cover" />
          ) : channel.type === 'group' || channel.type === 'room' ? (
            <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center text-primary text-sm font-bold">
              {(displayName || '?')[0]?.toUpperCase()}
            </div>
          ) : (
            <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center text-primary text-sm font-bold">
              {(dmProfile?.username || '?')[0]?.toUpperCase()}
            </div>
          )}
          {channel.type === 'dm' && dmProfile?.status === 'online' && (
            <div className="absolute bottom-0 right-0 w-3 h-3 bg-success rounded-full border-2 border-surface" />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-text truncate">{displayName}</span>
            {channel.last_message_at && (
              <span className="text-xs text-text-muted flex-shrink-0 ml-1">
                {relativeTime(channel.last_message_at)}
              </span>
            )}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-text-muted truncate">
              {channel.last_message || 'No messages yet'}
            </span>
            {(channel.unread_count ?? 0) > 0 && (
              <span className="flex-shrink-0 ml-1 min-w-[18px] h-[18px] px-1 bg-error text-white text-xs font-bold rounded-full flex items-center justify-center">
                {channel.unread_count}
              </span>
            )}
          </div>
        </div>

        {/* Menu trigger */}
        <button
          onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu) }}
          className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-text p-1"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01" />
          </svg>
        </button>
      </div>

      {/* Context menu */}
      <AnimatePresence>
        {showMenu && (
          <motion.div
            ref={menuRef}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.1 }}
            className="absolute right-0 top-full mt-1 w-44 bg-surface border border-border rounded-lg shadow-xl z-50 py-1"
          >
            <MenuButton onClick={togglePin}>
              {channel.member?.is_pinned ? '📌 Unpin' : '📌 Pin'}
            </MenuButton>
            <MenuButton onClick={toggleArchive}>
              {channel.member?.is_archived ? '📦 Unarchive' : '📦 Archive'}
            </MenuButton>
            <div className="h-px bg-border my-1" />
            <MenuButton onClick={leaveChannel} danger>
              🚪 Leave
            </MenuButton>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

function MenuButton({ children, onClick, danger }: { children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left px-3 py-1.5 text-sm transition-colors hover:bg-surface-hover',
        danger ? 'text-error' : 'text-text',
      )}
    >
      {children}
    </button>
  )
}
