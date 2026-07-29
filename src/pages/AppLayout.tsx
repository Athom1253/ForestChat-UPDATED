import { useEffect, useRef, useState } from 'react'
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuthStore } from '@/stores/auth'
import { useChatStore } from '@/stores/chat'
import { supabase } from '@/lib/supabase'
import { toast } from '@/stores/toast'
import { cn, relativeTime } from '@/lib/utils'
import type { Channel, ChannelMember } from '@/types'
import { AccountMenu } from '@/components/sidebar/AccountMenu'
import { ChannelItem } from '@/components/sidebar/ChannelItem'

interface ChannelWithMeta extends Channel {
  last_message?: string
  last_message_at?: string
  member?: ChannelMember
  unread_count?: number
}

export default function AppLayout() {
  const { profile, user } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()
  const [channels, setChannels] = useState<ChannelWithMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [showAccountMenu, setShowAccountMenu] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const accountMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadChannels()
    const interval = setInterval(loadChannels, 15000)
    return () => clearInterval(interval)
  }, [user?.id])

  // Presence heartbeat — set online on mount, offline on unmount/leave
  useEffect(() => {
    if (!user) return
    supabase.rpc('update_presence', { p_status: 'online' }).then()
    const heartbeat = setInterval(() => {
      supabase.rpc('update_presence', { p_status: 'online' }).then()
    }, 60000)
    const onUnload = () => { supabase.rpc('update_presence', { p_status: 'offline' }).then() }
    window.addEventListener('beforeunload', onUnload)
    return () => {
      clearInterval(heartbeat)
      window.removeEventListener('beforeunload', onUnload)
      supabase.rpc('update_presence', { p_status: 'offline' }).then()
    }
  }, [user?.id])

  // Close account menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (accountMenuRef.current && !accountMenuRef.current.contains(e.target as Node)) {
        setShowAccountMenu(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Realtime subscription for channel members changes
  useEffect(() => {
    if (!user) return
    const channel = supabase
      .channel('channel-members-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'channel_members', filter: `user_id=eq.${user.id}` },
        () => loadChannels()
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' },
        () => loadChannels()
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [user?.id])

  async function loadChannels() {
    if (!user) return
    try {
      const { data: members, error } = await supabase
        .from('channel_members')
        .select(`
          *,
          channel:channels(*)
        `)
        .eq('user_id', user.id)

      if (error) throw error

      const channelList: ChannelWithMeta[] = []
      for (const m of members || []) {
        const channel = m.channel as Channel
        if (!channel) continue

        // Get last message
        const { data: lastMsg } = await supabase
          .from('messages')
          .select('content, message_type, created_at, deleted_at')
          .eq('channel_id', channel.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        let preview = 'No messages yet'
        if (lastMsg) {
          if (lastMsg.deleted_at) preview = 'Message deleted'
          else if (lastMsg.message_type === 'image') preview = '📷 Photo'
          else if (lastMsg.message_type === 'file') preview = '📎 File'
          else if (lastMsg.message_type === 'drawing') preview = '🎨 Drawing'
          else if (lastMsg.message_type === 'voice') preview = '🎤 Voice message'
          else preview = lastMsg.content?.slice(0, 50) || ''
        }

        channelList.push({
          ...channel,
          member: m,
          last_message: preview,
          last_message_at: lastMsg?.created_at || channel.created_at,
          unread_count: m.unread_count,
        })
      }

      channelList.sort((a, b) => {
        const ta = new Date(a.last_message_at || 0).getTime()
        const tb = new Date(b.last_message_at || 0).getTime()
        return tb - ta
      })

      setChannels(channelList)
    } catch (err) {
      console.error('Failed to load channels:', err)
    } finally {
      setLoading(false)
    }
  }

  const pinnedChannels = channels.filter((c) => c.member?.is_pinned && !c.member?.is_archived)
  const dmChannels = channels.filter((c) => c.type === 'dm' && !c.member?.is_pinned && !c.member?.is_archived)
  const groupChannels = channels.filter((c) => (c.type === 'group' || c.type === 'room') && !c.member?.is_pinned && !c.member?.is_archived)
  const archivedChannels = channels.filter((c) => c.member?.is_archived)

  const navItems = [
    { to: '/', icon: ChatIcon, label: 'Chat' },
    { to: '/friends', icon: FriendsIcon, label: 'Friends' },
    { to: '/rooms', icon: RoomsIcon, label: 'Rooms' },
    { to: '/pets', icon: PetIcon, label: 'Pets' },
    { to: '/drawing', icon: DrawIcon, label: 'Drawing' },
    ...(profile?.is_admin ? [{ to: '/admin', icon: AdminIcon, label: 'Admin' }] : []),
  ]

  return (
    <div className="flex h-screen bg-bg overflow-hidden">
      {/* Icon rail */}
      <div className="w-16 flex-shrink-0 bg-surface border-r border-border flex flex-col items-center py-3 gap-2">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                'w-11 h-11 flex items-center justify-center rounded-xl transition-all hover:bg-surface-hover group relative',
                isActive && 'bg-primary/20',
              )
            }
            title={item.label}
            end={item.to === '/'}
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <motion.div
                    layoutId="nav-indicator"
                    className="absolute left-0 w-1 h-7 bg-primary rounded-r-full"
                  />
                )}
                <item.icon className="w-5 h-5 text-text-muted group-hover:text-text" active={isActive} />
              </>
            )}
          </NavLink>
        ))}

        <div className="flex-1" />

        {/* Settings */}
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            cn(
              'w-11 h-11 flex items-center justify-center rounded-xl transition-all hover:bg-surface-hover',
              isActive && 'bg-primary/20',
            )
          }
          title="Settings"
        >
          <SettingsIcon className="w-5 h-5 text-text-muted" />
        </NavLink>

        {/* Profile / Account menu */}
        <div className="relative" ref={accountMenuRef}>
          <button
            onClick={() => setShowAccountMenu(!showAccountMenu)}
            className="w-11 h-11 rounded-xl overflow-hidden border-2 border-border hover:border-primary transition-colors"
            title="Account"
          >
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt="avatar" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-primary/30 flex items-center justify-center text-primary font-bold text-sm">
                {profile?.username?.[0]?.toUpperCase() || '?'}
              </div>
            )}
          </button>

          <AnimatePresence>
            {showAccountMenu && (
              <AccountMenu onClose={() => setShowAccountMenu(false)} />
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Sidebar - only show on chat page */}
      {location.pathname === '/' && (
        <div className={cn(
          'w-72 flex-shrink-0 bg-surface border-r border-border flex flex-col transition-transform',
          'md:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
          'absolute md:relative h-full z-20',
        )}>
          <div className="p-3 border-b border-border">
            <input
              type="text"
              placeholder="Search..."
              className="input text-sm"
              onFocus={() => navigate('/')}
            />
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-4">
            {loading ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="skeleton h-12" />
                ))}
              </div>
            ) : (
              <>
                {pinnedChannels.length > 0 && (
                  <SidebarSection title="Pinned" icon="⭐">
                    {pinnedChannels.map((ch) => (
                      <ChannelItem key={ch.id} channel={ch} onUpdated={loadChannels} />
                    ))}
                  </SidebarSection>
                )}

                {dmChannels.length > 0 && (
                  <SidebarSection title="Direct Messages" icon="💬">
                    {dmChannels.map((ch) => (
                      <ChannelItem key={ch.id} channel={ch} onUpdated={loadChannels} />
                    ))}
                  </SidebarSection>
                )}

                {groupChannels.length > 0 && (
                  <SidebarSection title="Groups / Rooms" icon="👥">
                    {groupChannels.map((ch) => (
                      <ChannelItem key={ch.id} channel={ch} onUpdated={loadChannels} />
                    ))}
                  </SidebarSection>
                )}

                {archivedChannels.length > 0 && (
                  <SidebarSection title="Archived" icon="📦">
                    {archivedChannels.map((ch) => (
                      <ChannelItem key={ch.id} channel={ch} onUpdated={loadChannels} />
                    ))}
                  </SidebarSection>
                )}

                {channels.length === 0 && (
                  <div className="text-center py-12 text-text-muted">
                    <p className="text-sm">No channels yet</p>
                    <button
                      onClick={() => navigate('/rooms')}
                      className="btn-primary mt-3 text-sm"
                    >
                      Join or create a room
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        {/* Mobile menu button */}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="md:hidden absolute top-3 left-3 z-30 w-10 h-10 flex items-center justify-center rounded-lg bg-surface border border-border"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        <Outlet />
      </div>
    </div>
  )
}

function SidebarSection({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 px-2 mb-1 text-xs font-semibold text-text-muted uppercase tracking-wider">
        <span>{icon}</span>
        <span>{title}</span>
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  )
}

// Icons
function ChatIcon({ className, active }: { className?: string; active?: boolean }) {
  return (
    <svg className={className} fill={active ? 'var(--color-primary)' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
  )
}
function FriendsIcon({ className, active }: { className?: string; active?: boolean }) {
  return (
    <svg className={className} fill={active ? 'var(--color-primary)' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  )
}
function RoomsIcon({ className, active }: { className?: string; active?: boolean }) {
  return (
    <svg className={className} fill={active ? 'var(--color-primary)' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
    </svg>
  )
}
function PetIcon({ className, active }: { className?: string; active?: boolean }) {
  return (
    <svg className={className} fill={active ? 'var(--color-primary)' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
    </svg>
  )
}
function DrawIcon({ className, active }: { className?: string; active?: boolean }) {
  return (
    <svg className={className} fill={active ? 'var(--color-primary)' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
    </svg>
  )
}
function AdminIcon({ className, active }: { className?: string; active?: boolean }) {
  return (
    <svg className={className} fill={active ? 'var(--color-primary)' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  )
}
function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  )
}
