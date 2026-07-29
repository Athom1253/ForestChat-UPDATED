import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, type SidebarChat, type SidebarData } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { formatTimestamp, getInitials, getAvatarUrl, getDisplayName, isOnline, truncate } from '../lib/utils'
import ChatContextMenu from './ChatContextMenu'
import ChatCardSkeleton from './ChatCardSkeleton'

interface SidebarProps {
  searchQuery: string
  setSearchQuery: (q: string) => void
  onClose: () => void
}

const REALTIME_TABLES = ['messages', 'chats', 'chat_memberships', 'read_receipts', 'app_users']

export default function Sidebar({ searchQuery, setSearchQuery, onClose }: SidebarProps) {
  const navigate = useNavigate()
  const { profile } = useAuth()

  const [data, setData] = useState<SidebarData | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [archivedOpen, setArchivedOpen] = useState(false)
  const [menuChat, setMenuChat] = useState<SidebarChat | null>(null)
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 })

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useRef(true)

  const fetchSidebar = useCallback(async () => {
    const { data: result, error } = await supabase.rpc('get_sidebar_data')
    if (error) return
    if (!mountedRef.current) return
    setData(result as SidebarData)
    setLoading(false)
  }, [])

  useEffect(() => {
    mountedRef.current = true
    fetchSidebar()
    return () => {
      mountedRef.current = false
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
    }
  }, [fetchSidebar])

  useEffect(() => {
    const channel = supabase
      .channel('sidebar-realtime')
      .on('postgres_changes', { event: '*', schema: 'public' }, (payload) => {
        const table = (payload as { table?: string }).table
        if (!table || !REALTIME_TABLES.includes(table)) return
        if (debounceTimer.current) clearTimeout(debounceTimer.current)
        debounceTimer.current = setTimeout(() => {
          fetchSidebar()
        }, 300)
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
    }
  }, [fetchSidebar])

  const dedupedChats = useMemo(() => {
    if (!data?.chats) return []
    const seen = new Set<string>()
    const out: SidebarChat[] = []
    for (const c of data.chats) {
      if (seen.has(c.id)) continue
      seen.add(c.id)
      out.push(c)
    }
    return out
  }, [data])

  const filteredChats = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return dedupedChats
    return dedupedChats.filter((c) => {
      const name = (c.name || getDisplayName(c.dm_partner) || '').toLowerCase()
      const preview = (c.last_message_preview || '').toLowerCase()
      return name.includes(q) || preview.includes(q)
    })
  }, [dedupedChats, searchQuery])

  const sections = useMemo(() => {
    const pinned: SidebarChat[] = []
    const dms: SidebarChat[] = []
    const rooms: SidebarChat[] = []
    const groups: SidebarChat[] = []
    const archived: SidebarChat[] = []
    for (const c of filteredChats) {
      if (c.is_archived) archived.push(c)
      else if (c.is_pinned) pinned.push(c)
      else if (c.type === 'dm') dms.push(c)
      else if (c.type === 'room') rooms.push(c)
      else if (c.type === 'group') groups.push(c)
    }
    return { pinned, dms, rooms, groups, archived }
  }, [filteredChats])

  const totalUnread = useMemo(
    () => dedupedChats.reduce((sum, c) => sum + (c.unread_count || 0), 0),
    [dedupedChats]
  )

  const handleAction = useCallback(
    async (action: string, chat: SidebarChat) => {
      if (actionLoading) return
      setActionLoading(true)
      try {
        switch (action) {
          case 'open':
            navigate(`/chat/${chat.id}`)
            onClose()
            break
          case 'toggle_pin': {
            const rpc = chat.is_pinned
              ? supabase.rpc('unpin_chat', { p_chat_id: chat.id })
              : supabase.rpc('pin_chat', { p_chat_id: chat.id })
            await rpc
            break
          }
          case 'toggle_archive': {
            const rpc = chat.is_archived
              ? supabase.rpc('unarchive_chat', { p_chat_id: chat.id })
              : supabase.rpc('archive_chat', { p_chat_id: chat.id })
            await rpc
            break
          }
          case 'mark_read':
            await supabase.rpc('mark_chat_read', { p_chat_id: chat.id })
            break
          case 'toggle_mute':
            if (profile) {
              await supabase
                .from('chat_memberships')
                .update({ is_muted: !chat.is_muted })
                .eq('chat_id', chat.id)
                .eq('user_id', profile.id)
            }
            break
          case 'delete':
            await supabase.rpc('delete_chat_for_user', { p_chat_id: chat.id })
            break
          case 'leave':
            await supabase.rpc('leave_chat', { p_chat_id: chat.id })
            break
          case 'copy_invite':
            if (chat.invite_code) {
              try {
                await navigator.clipboard.writeText(chat.invite_code)
              } catch {
                void 0
              }
            }
            break
        }
        if (action !== 'open') await fetchSidebar()
      } finally {
        setActionLoading(false)
      }
    },
    [actionLoading, navigate, onClose, profile, fetchSidebar]
  )

  const openMenu = useCallback((chat: SidebarChat, x: number, y: number) => {
    setMenuChat(chat)
    setMenuPos({ x, y })
  }, [])

  const closeMenu = useCallback(() => {
    setMenuChat(null)
  }, [])

  const onMenuAction = useCallback(
    (action: string) => {
      if (menuChat) handleAction(action, menuChat)
    },
    [menuChat, handleAction]
  )

  return (
    <div className="flex flex-col h-full w-full sm:w-80 bg-night-950 border-r border-night-900">
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-night-50">Chats</h2>
          {totalUnread > 0 && (
            <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-forest-600 text-night-50">
              {totalUnread}
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="sm:hidden p-1.5 rounded-lg text-night-400 hover:bg-night-800 hover:text-night-100 transition-colors"
          aria-label="Close sidebar"
        >
          <CloseIcon />
        </button>
      </div>

      <div className="px-3 pb-2">
        <div className="relative">
          <SearchIcon />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search chats..."
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg bg-night-900 border border-night-800 text-night-100 placeholder-night-500 focus:outline-none focus:border-forest-600 transition-colors"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin px-2 pb-4">
        {loading ? (
          <div className="space-y-1">
            {Array.from({ length: 6 }).map((_, i) => (
              <ChatCardSkeleton key={i} />
            ))}
          </div>
        ) : filteredChats.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-6 text-night-500">
            <div className="mb-3 opacity-50">
              {searchQuery ? <SearchLargeIcon /> : <ChatLargeIcon />}
            </div>
            <p className="text-sm">
              {searchQuery ? 'No chats found' : 'No chats yet'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {sections.pinned.length > 0 && (
              <Section title="Pinned" icon={<StarIcon />} count={sections.pinned.length}>
                {sections.pinned.map((c) => (
                  <ChatCard
                    key={c.id}
                    chat={c}
                    onOpen={() => handleAction('open', c)}
                    onMenu={(x, y) => openMenu(c, x, y)}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      openMenu(c, e.clientX, e.clientY)
                    }}
                  />
                ))}
              </Section>
            )}
            {sections.dms.length > 0 && (
              <Section title="Direct Messages" icon={<DmIcon />} count={sections.dms.length}>
                {sections.dms.map((c) => (
                  <ChatCard
                    key={c.id}
                    chat={c}
                    onOpen={() => handleAction('open', c)}
                    onMenu={(x, y) => openMenu(c, x, y)}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      openMenu(c, e.clientX, e.clientY)
                    }}
                  />
                ))}
              </Section>
            )}
            {sections.rooms.length > 0 && (
              <Section title="Rooms" icon={<RoomIcon />} count={sections.rooms.length}>
                {sections.rooms.map((c) => (
                  <ChatCard
                    key={c.id}
                    chat={c}
                    onOpen={() => handleAction('open', c)}
                    onMenu={(x, y) => openMenu(c, x, y)}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      openMenu(c, e.clientX, e.clientY)
                    }}
                  />
                ))}
              </Section>
            )}
            {sections.groups.length > 0 && (
              <Section title="Groups" icon={<GroupIcon />} count={sections.groups.length}>
                {sections.groups.map((c) => (
                  <ChatCard
                    key={c.id}
                    chat={c}
                    onOpen={() => handleAction('open', c)}
                    onMenu={(x, y) => openMenu(c, x, y)}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      openMenu(c, e.clientX, e.clientY)
                    }}
                  />
                ))}
              </Section>
            )}
            {sections.archived.length > 0 && (
              <div>
                <button
                  onClick={() => setArchivedOpen((v) => !v)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-night-500 hover:text-night-300 transition-colors"
                >
                  <ArchiveIcon />
                  <span>Archived</span>
                  <span className="ml-0.5 text-night-600">{sections.archived.length}</span>
                  <span className="ml-auto">
                    <ChevronIcon open={archivedOpen} />
                  </span>
                </button>
                {archivedOpen && (
                  <div className="mt-1 space-y-1 animate-fade-in">
                    {sections.archived.map((c) => (
                      <ChatCard
                        key={c.id}
                        chat={c}
                        onOpen={() => handleAction('open', c)}
                        onMenu={(x, y) => openMenu(c, x, y)}
                        onContextMenu={(e) => {
                          e.preventDefault()
                          openMenu(c, e.clientX, e.clientY)
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {menuChat && (
        <ChatContextMenu
          chat={menuChat}
          x={menuPos.x}
          y={menuPos.y}
          onAction={onMenuAction}
          onClose={closeMenu}
        />
      )}
    </div>
  )
}

interface SectionProps {
  title: string
  icon: React.ReactNode
  count: number
  children: React.ReactNode
}

function Section({ title, icon, count, children }: SectionProps) {
  return (
    <div className="animate-fade-in">
      <div className="flex items-center gap-2 px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-night-500">
        <span className="text-night-400">{icon}</span>
        <span>{title}</span>
        <span className="text-night-600">{count}</span>
      </div>
      <div className="mt-1 space-y-1">{children}</div>
    </div>
  )
}

interface ChatCardProps {
  chat: SidebarChat
  onOpen: () => void
  onMenu: (x: number, y: number) => void
  onContextMenu: (e: React.MouseEvent) => void
}

function ChatCard({ chat, onOpen, onMenu, onContextMenu }: ChatCardProps) {
  const [hovered, setHovered] = useState(false)
  const name = chat.name || getDisplayName(chat.dm_partner)
  const avatarUrl = getAvatarUrl(chat.avatar_url || chat.dm_partner?.avatar_url || null)
  const online = chat.type === 'dm' && chat.dm_partner ? isOnline(chat.dm_partner.last_seen, chat.dm_partner.status) : false
  const isGroup = chat.type === 'group' || chat.type === 'room'

  let preview = chat.last_message_preview || 'No messages yet'
  if (isGroup && chat.last_message_sender_name) {
    preview = `${chat.last_message_sender_name}: ${preview}`
  }
  preview = truncate(preview, 42)

  const menuRef = useRef<HTMLButtonElement>(null)

  const handleMenuClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    const rect = menuRef.current?.getBoundingClientRect()
    if (rect) onMenu(rect.right, rect.bottom + 4)
    else onMenu(e.clientX, e.clientY)
  }

  return (
    <div
      onClick={onOpen}
      onContextMenu={onContextMenu}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="group relative flex items-center gap-3 px-2.5 py-2.5 rounded-lg cursor-pointer hover:bg-night-900 transition-colors"
    >
      <div className="relative flex-shrink-0">
        {avatarUrl ? (
          <img src={avatarUrl} alt={name} className="w-11 h-11 rounded-full object-cover" />
        ) : (
          <div className="w-11 h-11 rounded-full bg-forest-700 flex items-center justify-center text-sm font-semibold text-night-50">
            {getInitials(name)}
          </div>
        )}
        {online && (
          <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-green-500 border-2 border-night-950" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1 min-w-0">
            {chat.is_pinned && <PinIndicator />}
            <span className="truncate text-sm font-medium text-night-100">{name}</span>
          </div>
          <span className="flex-shrink-0 text-xs text-night-500">
            {formatTimestamp(chat.last_message_at)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2 mt-0.5">
          <div className="flex items-center gap-1 min-w-0">
            {chat.is_muted && <MuteIndicator />}
            <span className="truncate text-xs text-night-400">{preview}</span>
          </div>
          {chat.unread_count > 0 && (
            <span className="flex-shrink-0 min-w-[20px] h-5 px-1.5 rounded-full bg-forest-600 text-night-50 text-xs font-semibold flex items-center justify-center">
              {chat.unread_count > 99 ? '99+' : chat.unread_count}
            </span>
          )}
        </div>
      </div>

      <button
        ref={menuRef}
        onClick={handleMenuClick}
        className={`absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-night-400 hover:bg-night-800 hover:text-night-100 transition-opacity ${
          hovered ? 'opacity-100' : 'opacity-0'
        }`}
        aria-label="Chat options"
      >
        <DotsIcon />
      </button>
    </div>
  )
}

function PinIndicator() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className="text-forest-400 flex-shrink-0">
      <path d="M12 17v5M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" />
    </svg>
  )
}

function MuteIndicator() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-night-500 flex-shrink-0">
      <path d="M11 5L6 9H2v6h4l5 4V5z" /><line x1="22" y1="9" x2="16" y2="15" /><line x1="16" y1="9" x2="22" y2="15" />
    </svg>
  )
}

function DotsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute left-3 top-1/2 -translate-y-1/2 text-night-500">
      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  )
}

function StarIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="text-forest-400">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  )
}

function DmIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  )
}

function RoomIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  )
}

function GroupIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  )
}

function ArchiveIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="5" rx="1" /><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" /><path d="M10 12h4" />
    </svg>
  )
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform ${open ? 'rotate-180' : ''}`}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

function SearchLargeIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  )
}

function ChatLargeIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  )
}
