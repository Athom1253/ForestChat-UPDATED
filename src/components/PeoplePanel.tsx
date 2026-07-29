import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { User, X, MessageCircle, UserPlus, Search, Circle } from 'lucide-react'
import { motion } from 'framer-motion'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { getAllUsers, createOrGetDM, getChatMembers, getChatMembership, sendFriendRequest } from '../lib/api'
import type { AppUser, ChatWithDetails } from '../lib/types'

interface PeoplePanelProps {
  onClose: () => void
}

export default function PeoplePanel({ onClose }: PeoplePanelProps) {
  const navigate = useNavigate()
  const currentUser = useStore((s) => s.currentUser)
  const setActiveChat = useStore((s) => s.setActiveChat)
  const setUser = useStore((s) => s.setUser)
  const [users, setUsers] = useState<AppUser[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  const loadUsers = useCallback(async () => {
    setLoading(true)
    try {
      const all = await getAllUsers(100)
      all.forEach((u) => setUser(u))
      setUsers(all)
    } catch (e) {
      console.error('Failed to load users', e)
    } finally {
      setLoading(false)
    }
  }, [setUser])

  useEffect(() => {
    loadUsers()

    // Real-time updates when any user changes status
    const channel = supabase.channel('global-presence')
    channel
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'app_users' }, (payload) => {
        const updated = payload.new as AppUser
        setUser(updated)
        setUsers((prev) =>
          prev.map((u) => (u.id === updated.id ? updated : u))
        )
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'app_users' }, (payload) => {
        const newUser = payload.new as AppUser
        setUser(newUser)
        setUsers((prev) => {
          if (prev.some((u) => u.id === newUser.id)) return prev
          return [newUser, ...prev]
        })
      })
      .subscribe()

    return () => { channel.unsubscribe() }
  }, [loadUsers])

  const handleMessage = async (user: AppUser) => {
    if (!currentUser) return
    const chat = await createOrGetDM(currentUser.id, user.id)
    const members = await getChatMembers(chat.id)
    const membership = await getChatMembership(chat.id, currentUser.id)
    const enriched: ChatWithDetails = {
      ...chat,
      membership: membership || { id: '', chat_id: chat.id, user_id: currentUser.id, role: 'member', is_muted: false, is_pinned: false, is_archived: false, joined_at: null },
      unread_count: 0,
      last_message: null,
      members,
    }
    setActiveChat(enriched)
    navigate('/chat')
    onClose()
  }

  const handleAddFriend = async (user: AppUser) => {
    if (!currentUser) return
    try {
      await sendFriendRequest(currentUser.id, user.id)
    } catch {
      // already friends
    }
  }

  const isOnline = (user: AppUser) => {
    if (!user.last_seen) return false
    return new Date(user.last_seen).getTime() > Date.now() - 60000
  }

  const filteredUsers = users.filter((u) => {
    if (u.id === currentUser?.id) return false
    if (!search) return true
    const q = search.toLowerCase()
    return u.username.toLowerCase().includes(q) || (u.display_name || '').toLowerCase().includes(q)
  })

  const online = filteredUsers.filter(isOnline)
  const offline = filteredUsers.filter((u) => !isOnline(u))

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="w-72 shrink-0 bg-bg-sidebar border-l border-border flex flex-col h-full z-20"
    >
      {/* Header */}
      <div className="p-4 flex items-center justify-between border-b border-border">
        <h2 className="font-bold text-text text-base">People</h2>
        <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-bg-hover text-text-muted transition-all">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Search */}
      <div className="px-3 py-2 border-b border-border">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search people..."
            className="w-full pl-8 pr-3 py-2 text-sm rounded-xl bg-bg border border-border text-text placeholder:text-text-muted focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 transition-all duration-200"
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-2">
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="text-center py-10 text-text-muted">
            <User className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No users found</p>
          </div>
        ) : (
          <>
            {online.length > 0 && (
              <div className="mb-2">
                <div className="px-2 py-1 text-xs font-bold text-accent/80 uppercase tracking-wider">
                  Online — {online.length}
                </div>
                {online.map((user) => (
                  <UserRow key={user.id} user={user} online={true} onMessage={handleMessage} onAddFriend={handleAddFriend} onProfile={() => { navigate(`/profile/${user.id}`); onClose() }} />
                ))}
              </div>
            )}
            {offline.length > 0 && (
              <div>
                <div className="px-2 py-1 text-xs font-bold text-text-muted uppercase tracking-wider">
                  Offline — {offline.length}
                </div>
                {offline.map((user) => (
                  <UserRow key={user.id} user={user} online={false} onMessage={handleMessage} onAddFriend={handleAddFriend} onProfile={() => { navigate(`/profile/${user.id}`); onClose() }} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </motion.div>
  )
}

function UserRow({ user, online, onMessage, onAddFriend, onProfile }: {
  user: AppUser
  online: boolean
  onMessage: (u: AppUser) => void
  onAddFriend: (u: AppUser) => void
  onProfile: () => void
}) {
  const [hover, setHover] = useState(false)
  return (
    <div
      className="flex items-center gap-2.5 p-2 rounded-xl hover:bg-bg-hover transition-all duration-200 group cursor-pointer"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onProfile}
    >
      <div className="relative shrink-0">
        <div className="w-9 h-9 rounded-full bg-accent/10 flex items-center justify-center overflow-hidden">
          {user.avatar_url ? (
            <img src={user.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover" />
          ) : (
            <User className="w-4 h-4 text-accent/60" />
          )}
        </div>
        <div className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-bg-sidebar ${online ? 'bg-accent-2' : 'bg-text-muted/40'}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-text truncate">{user.display_name || user.username}</div>
        <div className="text-xs text-text-muted truncate">
          {online ? 'Online' : user.status_message || '@' + user.username}
        </div>
      </div>
      {hover && (
        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => onMessage(user)}
            className="p-1.5 rounded-lg bg-accent/10 text-accent hover:bg-accent/20 transition-all"
            title="Send message"
          >
            <MessageCircle className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onAddFriend(user)}
            className="p-1.5 rounded-lg bg-accent/10 text-accent hover:bg-accent/20 transition-all"
            title="Add friend"
          >
            <UserPlus className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}
