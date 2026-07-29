import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase, type Message, type MessageReaction, type Chat, type AppUser } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { formatFullTimestamp, getInitials, getAvatarUrl, getDisplayName, isOnline, truncate, formatDuration } from '../lib/utils'
import { useConfirmDialog } from '../components/ConfirmDialog'
import DrawingModal from '../components/DrawingModal'
import ReportModal from '../components/ReportModal'
import VoiceRecorder from '../components/VoiceRecorder'
import { useToast } from '../lib/toast'
import { useDebug } from '../lib/debug'

const EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🎉']

const BACKGROUNDS: Record<string, string> = {
  default: '',
  forest: 'bg-gradient-to-b from-forest-950/40 to-night-950',
  bark: 'bg-gradient-to-b from-amber-950/30 to-night-950',
  ocean: 'bg-gradient-to-b from-blue-950/30 to-night-950',
}

interface ChatMember {
  user: AppUser
  role: string
}

interface TypingUser {
  user_id: string
  username: string
}

export default function ChatView() {
  const { chatId } = useParams<{ chatId: string }>()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { toast } = useToast()
  const { confirm, dialog } = useConfirmDialog()
  const { trackSubscription, untrackSubscription, log } = useDebug()

  const [chat, setChat] = useState<Chat | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [members, setMembers] = useState<Record<string, ChatMember>>({})
  const [reactions, setReactions] = useState<Record<string, MessageReaction[]>>({})
  const [loading, setLoading] = useState(true)
  const [input, setInput] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([])
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [pinnedOpen, setPinnedOpen] = useState(false)
  const [membersOpen, setMembersOpen] = useState(false)
  const [drawingOpen, setDrawingOpen] = useState(false)
  const [showVoiceRecorder, setShowVoiceRecorder] = useState(false)
  const [background, setBackground] = useState<string>(() => localStorage.getItem('forestchat-chat-bg') || 'default')
  const [drawingViewer, setDrawingViewer] = useState<string | null>(null)
  const [reportTarget, setReportTarget] = useState<Message | null>(null)
  const [activeEmojiPicker, setActiveEmojiPicker] = useState<string | null>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const sendingRef = useRef(false)
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const typingThrottleRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useRef(true)

  const loadChat = useCallback(async () => {
    if (!chatId) return
    setLoading(true)

    const { data: chatData, error: chatError } = await supabase
      .from('chats')
      .select('*')
      .eq('id', chatId)
      .maybeSingle()

    if (chatError) log('error', `Failed to load chat: ${chatError.message}`)
    if (!mountedRef.current) return

    setChat(chatData as Chat | null)

    const { data: msgData, error: msgError } = await supabase
      .from('messages')
      .select('*')
      .eq('chat_id', chatId)
      .order('created_at', { ascending: true })

    if (msgError) log('error', `Failed to load messages: ${msgError.message}`)
    if (!mountedRef.current) return

    setMessages((msgData as Message[]) || [])

    const { data: memberData } = await supabase
      .from('chat_memberships')
      .select('user_id, role, app_users!inner(*)')
      .eq('chat_id', chatId)

    if (mountedRef.current && memberData) {
      const memberMap: Record<string, ChatMember> = {}
      for (const m of memberData as Array<{ user_id: string; role: string; app_users: AppUser | AppUser[] }>) {
        const user = Array.isArray(m.app_users) ? m.app_users[0] : m.app_users
        memberMap[m.user_id] = { user, role: m.role }
      }
      setMembers(memberMap)
    }

    const { data: reactionData } = await supabase
      .from('message_reactions')
      .select('*')
      .in('message_id', (msgData as Message[])?.map((m) => m.id) || [])

    if (mountedRef.current && reactionData) {
      const reactionMap: Record<string, MessageReaction[]> = {}
      for (const r of reactionData as MessageReaction[]) {
        if (!reactionMap[r.message_id]) reactionMap[r.message_id] = []
        reactionMap[r.message_id].push(r)
      }
      setReactions(reactionMap)
    }

    await supabase.rpc('mark_chat_read', { p_chat_id: chatId })
    setLoading(false)
  }, [chatId, log])

  const debouncedReload = useCallback(() => {
    if (reloadTimer.current) clearTimeout(reloadTimer.current)
    reloadTimer.current = setTimeout(() => loadChat(), 200)
  }, [loadChat])

  useEffect(() => {
    mountedRef.current = true
    if (!chatId) {
      setLoading(false)
      return
    }
    loadChat()

    const channel = supabase
      .channel(`chat-${chatId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `chat_id=eq.${chatId}` },
        () => debouncedReload()
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages', filter: `chat_id=eq.${chatId}` },
        () => debouncedReload()
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'messages', filter: `chat_id=eq.${chatId}` },
        () => debouncedReload()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'message_reactions' },
        () => debouncedReload()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'typing_indicators', filter: `chat_id=eq.${chatId}` },
        () => loadTypingUsers()
      )
      .subscribe()

    trackSubscription(`chat-${chatId}`)

    return () => {
      mountedRef.current = false
      supabase.removeChannel(channel)
      untrackSubscription(`chat-${chatId}`)
      if (reloadTimer.current) clearTimeout(reloadTimer.current)
      if (typingThrottleRef.current) clearTimeout(typingThrottleRef.current)
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    }
  }, [chatId, loadChat, debouncedReload, trackSubscription, untrackSubscription])

  const loadTypingUsers = useCallback(async () => {
    if (!chatId) return
    const { data } = await supabase
      .from('typing_indicators')
      .select('user_id, username')
      .eq('chat_id', chatId)
      .neq('user_id', profile?.id || '')

    if (mountedRef.current && data) {
      setTypingUsers(data as TypingUser[])
    }
  }, [chatId, profile?.id])

  useEffect(() => {
    if (chatId) {
      supabase.rpc('update_last_seen').then()
    }
  }, [chatId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendTypingIndicator = useCallback(() => {
    if (!chatId || !profile) return
    if (typingThrottleRef.current) return
    typingThrottleRef.current = setTimeout(() => {
      typingThrottleRef.current = null
    }, 3000)

    supabase
      .from('typing_indicators')
      .upsert({
        chat_id: chatId,
        user_id: profile.id,
        username: profile.username,
        updated_at: new Date().toISOString(),
      })
      .then()

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    typingTimeoutRef.current = setTimeout(() => {
      supabase
        .from('typing_indicators')
        .delete()
        .eq('chat_id', chatId)
        .eq('user_id', profile.id)
        .then()
    }, 4000)
  }, [chatId, profile])

  const handleSendMessage = useCallback(async () => {
    if (!chatId || !profile) return
    const content = input.trim()
    if (!content || sendingRef.current) return

    sendingRef.current = true
    setInput('')

    const { error } = await supabase.from('messages').insert({
      chat_id: chatId,
      user_id: profile.id,
      content,
      message_type: 'text',
    })

    if (error) {
      log('error', `Failed to send message: ${error.message}`)
      setInput(content)
    }

    supabase
      .from('typing_indicators')
      .delete()
      .eq('chat_id', chatId)
      .eq('user_id', profile.id)
      .then()

    sendingRef.current = false
  }, [chatId, profile, input, log])

  const handleEditMessage = useCallback(async (msg: Message) => {
    const content = editContent.trim()
    if (!content) return
    const { error } = await supabase
      .from('messages')
      .update({ content, is_edited: true })
      .eq('id', msg.id)
    if (error) log('error', `Failed to edit message: ${error.message}`)
    setEditingId(null)
    setEditContent('')
  }, [editContent, log])

  const handleDeleteMessage = useCallback((msg: Message) => {
    confirm({
      title: 'Delete Message',
      message: 'Are you sure you want to delete this message? This action cannot be undone.',
      confirmLabel: 'Delete',
      danger: true,
      onConfirm: async () => {
        const { error } = await supabase
          .from('messages')
          .update({ is_deleted: true, deleted_by: profile?.id || null })
          .eq('id', msg.id)
        if (error) log('error', `Failed to delete message: ${error.message}`)
      },
    })
  }, [confirm, profile?.id, log])

  const handleReact = useCallback(async (msg: Message, emoji: string) => {
    if (!profile) return
    const msgReactions = reactions[msg.id] || []
    const existing = msgReactions.find((r) => r.user_id === profile.id && r.emoji === emoji)

    if (existing) {
      const { error } = await supabase.from('message_reactions').delete().eq('id', existing.id)
      if (error) log('error', `Failed to remove reaction: ${error.message}`)
    } else {
      const { error } = await supabase.from('message_reactions').insert({
        message_id: msg.id,
        user_id: profile.id,
        emoji,
      })
      if (error) log('error', `Failed to add reaction: ${error.message}`)
    }
    setActiveEmojiPicker(null)
  }, [profile, reactions, log])

  const handleDrawingSent = useCallback(() => {
    setDrawingOpen(false)
    debouncedReload()
  }, [debouncedReload])

  const handleVoiceSent = useCallback(() => {
    setShowVoiceRecorder(false)
    debouncedReload()
  }, [debouncedReload])

  const setBackgroundChoice = useCallback((bg: string) => {
    setBackground(bg)
    localStorage.setItem('forestchat-chat-bg', bg)
  }, [])

  const filteredMessages = searchQuery.trim()
    ? messages.filter((m) => m.content.toLowerCase().includes(searchQuery.toLowerCase()))
    : messages

  const pinnedMessages = messages.filter((m) => m.is_pinned && !m.is_deleted)

  if (!chatId) {
    return (
      <div className="flex items-center justify-center h-full bg-night-950">
        <div className="text-center">
          <div className="mb-4 flex justify-center">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-night-600">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <p className="text-lg font-medium text-night-400">Select a chat</p>
          <p className="text-sm text-night-500 mt-1">Choose a conversation from the sidebar to start messaging</p>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-night-950">
        <div className="w-10 h-10 border-4 border-forest-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const chatName = chat?.name || (chat?.type === 'dm' ? getDisplayName(Object.values(members).find((m) => m.user.id !== profile?.id)?.user || null) : 'Chat')
  const chatAvatar = getAvatarUrl(chat?.avatar_url ?? null)
  const isGroup = chat?.type === 'group' || chat?.type === 'room'
  const memberCount = Object.keys(members).length

  return (
    <div className="flex flex-col h-full bg-night-950">
      <div className="flex items-center justify-between px-4 py-3 bg-night-900 border-b border-night-800 flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="relative flex-shrink-0">
            {chatAvatar ? (
              <img src={chatAvatar} alt={chatName} className="w-10 h-10 rounded-full object-cover" />
            ) : (
              <div className="w-10 h-10 rounded-full bg-forest-700 flex items-center justify-center text-sm font-semibold text-night-50">
                {getInitials(chatName)}
              </div>
            )}
            {chat?.type === 'dm' && (() => {
              const partner = Object.values(members).find((m) => m.user.id !== profile?.id)
              if (partner && isOnline(partner.user.last_seen, partner.user.status)) {
                return <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-green-500 border-2 border-night-900" />
              }
              return null
            })()}
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-night-50">{chatName}</h2>
            <p className="text-xs text-night-400">
              {isGroup
                ? `${memberCount} members`
                : chat?.type === 'dm' && (() => {
                    const partner = Object.values(members).find((m) => m.user.id !== profile?.id)
                    return partner && isOnline(partner.user.last_seen, partner.user.status) ? 'Online' : 'Offline'
                  })()
              }
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setSearchOpen((v) => !v)}
            className="p-2 rounded-lg text-night-400 hover:bg-night-800 hover:text-night-100 transition-colors"
            aria-label="Search messages"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </button>

          <div className="relative">
            <button
              onClick={() => setPinnedOpen((v) => !v)}
              className="p-2 rounded-lg text-night-400 hover:bg-night-800 hover:text-night-100 transition-colors"
              aria-label="Pinned messages"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 17v5M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" />
              </svg>
            </button>
            {pinnedOpen && (
              <div className="absolute right-0 top-full mt-2 w-72 max-h-80 overflow-y-auto rounded-xl bg-night-800 border border-night-700 shadow-2xl z-50 animate-fade-in">
                <div className="px-3 py-2 border-b border-night-700 text-xs font-semibold uppercase tracking-wide text-night-500">
                  Pinned Messages
                </div>
                {pinnedMessages.length === 0 ? (
                  <p className="px-3 py-4 text-sm text-night-500 text-center">No pinned messages</p>
                ) : (
                  pinnedMessages.map((m) => (
                    <div key={m.id} className="px-3 py-2 border-b border-night-700/50 last:border-0">
                      <p className="text-sm text-night-200">{truncate(m.content, 60)}</p>
                      <p className="text-xs text-night-500 mt-0.5">{formatFullTimestamp(m.created_at)}</p>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          <div className="relative">
            <button
              onClick={() => setMembersOpen((v) => !v)}
              className="p-2 rounded-lg text-night-400 hover:bg-night-800 hover:text-night-100 transition-colors"
              aria-label="Group members"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </button>
            {membersOpen && (
              <div className="absolute right-0 top-full mt-2 w-56 max-h-80 overflow-y-auto rounded-xl bg-night-800 border border-night-700 shadow-2xl z-50 animate-fade-in">
                <div className="px-3 py-2 border-b border-night-700 text-xs font-semibold uppercase tracking-wide text-night-500">
                  Members ({memberCount})
                </div>
                {Object.values(members).map((m) => {
                  const name = getDisplayName(m.user)
                  const avatar = getAvatarUrl(m.user.avatar_url)
                  const online = isOnline(m.user.last_seen, m.user.status)
                  return (
                    <div key={m.user.id} className="flex items-center gap-2 px-3 py-2 hover:bg-night-700 transition-colors">
                      <div className="relative flex-shrink-0">
                        {avatar ? (
                          <img src={avatar} alt={name} className="w-7 h-7 rounded-full object-cover" />
                        ) : (
                          <div className="w-7 h-7 rounded-full bg-forest-700 flex items-center justify-center text-[10px] font-semibold text-night-50">
                            {getInitials(name)}
                          </div>
                        )}
                        {online && <span className="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-green-500 border border-night-800" />}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm text-night-100">{name}</p>
                        {m.role === 'admin' && <span className="text-[10px] text-forest-400">Admin</span>}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <button onClick={() => toast('Voice calls coming soon', 'info')} className="p-2 rounded-lg text-night-400 hover:bg-night-800 hover:text-night-100 transition-colors" aria-label="Voice call">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
            </svg>
          </button>

          <button onClick={() => toast('Video calls coming soon', 'info')} className="p-2 rounded-lg text-night-400 hover:bg-night-800 hover:text-night-100 transition-colors" aria-label="Video call">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
            </svg>
          </button>

          <button onClick={() => toast('Screen share coming soon', 'info')} className="p-2 rounded-lg text-night-400 hover:bg-night-800 hover:text-night-100 transition-colors" aria-label="Screen share">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" />
            </svg>
          </button>

          <button onClick={() => navigate('/settings')} className="p-2 rounded-lg text-night-400 hover:bg-night-800 hover:text-night-100 transition-colors" aria-label="Chat settings">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </div>
      </div>

      {searchOpen && (
        <div className="px-4 py-2 bg-night-900 border-b border-night-800 flex-shrink-0">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search messages..."
            className="w-full px-3 py-1.5 text-sm rounded-lg bg-night-800 border border-night-700 text-night-100 placeholder-night-500 focus:outline-none focus:border-forest-600 transition-colors"
            autoFocus
          />
        </div>
      )}

      <div className={`flex-1 overflow-y-auto scrollbar-thin ${BACKGROUNDS[background] || ''}`} ref={messagesContainerRef}>
        <div className="max-w-3xl mx-auto px-4 py-4 space-y-1">
          {filteredMessages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <p className="text-sm text-night-500">
                {searchQuery ? 'No messages found' : 'No messages yet. Say hello!'}
              </p>
            </div>
          ) : (
            filteredMessages.map((msg, idx) => {
              const sender = members[msg.user_id]?.user
              const isOwn = msg.user_id === profile?.id
              const showAvatar = isGroup && !isOwn
              const showSenderName = isGroup && !isOwn
              const prevMsg = idx > 0 ? filteredMessages[idx - 1] : null
              const showAvatarThis = showAvatar && (!prevMsg || prevMsg.user_id !== msg.user_id)
              const msgReactions = reactions[msg.id] || []

              return (
                <MessageItem
                  key={msg.id}
                  msg={msg}
                  isOwn={isOwn}
                  sender={sender}
                  showAvatar={showAvatarThis}
                  showSenderName={showSenderName && showAvatarThis}
                  reactions={msgReactions}
                  currentUserId={profile?.id || ''}
                  isAdmin={profile?.is_admin || false}
                  editingId={editingId}
                  editContent={editContent}
                  setEditContent={setEditContent}
                  onStartEdit={() => { setEditingId(msg.id); setEditContent(msg.content) }}
                  onCancelEdit={() => { setEditingId(null); setEditContent('') }}
                  onSaveEdit={() => handleEditMessage(msg)}
                  onDelete={() => handleDeleteMessage(msg)}
                  onReport={() => setReportTarget(msg)}
                  onReact={(emoji) => handleReact(msg, emoji)}
                  onOpenDrawing={(url) => setDrawingViewer(url)}
                  activeEmojiPicker={activeEmojiPicker}
                  onToggleEmojiPicker={() => setActiveEmojiPicker(activeEmojiPicker === msg.id ? null : msg.id)}
                />
              )
            })
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {typingUsers.length > 0 && (
        <div className="px-4 py-1.5 text-xs text-night-400 italic flex-shrink-0">
          {typingUsers.length === 1
            ? `${typingUsers[0].username} is typing...`
            : `${typingUsers.length} people are typing...`}
        </div>
      )}

      <div className="px-4 py-3 bg-night-900 border-t border-night-800 flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            <button
              onClick={() => setDrawingOpen(true)}
              className="p-2.5 rounded-xl text-night-400 hover:bg-night-800 hover:text-forest-400 transition-colors"
              aria-label="Send drawing"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 19l7-7 3 3-7 7-3-3z" /><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" /><path d="M2 2l7.586 7.586" /><circle cx="11" cy="11" r="2" />
              </svg>
            </button>
            <button
              onClick={() => setShowVoiceRecorder((v) => !v)}
              className="p-2.5 rounded-xl text-night-400 hover:bg-night-800 hover:text-forest-400 transition-colors"
              aria-label="Record voice message"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            </button>
          </div>

          <input
            type="text"
            value={input}
            onChange={(e) => {
              setInput(e.target.value)
              sendTypingIndicator()
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSendMessage()
              }
            }}
            placeholder="Type a message..."
            className="flex-1 px-4 py-2.5 text-sm rounded-xl bg-night-800 border border-night-700 text-night-100 placeholder-night-500 focus:outline-none focus:border-forest-600 transition-colors"
          />

          <button
            onClick={handleSendMessage}
            disabled={!input.trim()}
            className="p-2.5 rounded-xl bg-forest-600 text-night-50 hover:bg-forest-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            aria-label="Send message"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>

        {showVoiceRecorder && (
          <div className="mt-2">
            <VoiceRecorder chatId={chatId} userId={profile?.id} onClose={() => setShowVoiceRecorder(false)} />
          </div>
        )}

        <div className="flex items-center gap-2 mt-2">
          <span className="text-xs text-night-500">Background:</span>
          {Object.keys(BACKGROUNDS).map((bg) => (
            <button
              key={bg}
              onClick={() => setBackgroundChoice(bg)}
              className={`w-5 h-5 rounded-full border-2 transition-all ${
                background === bg ? 'border-forest-400 scale-110' : 'border-night-700'
              } ${
                bg === 'default' ? 'bg-night-950' :
                bg === 'forest' ? 'bg-forest-800' :
                bg === 'bark' ? 'bg-amber-800' :
                'bg-blue-800'
              }`}
              aria-label={`${bg} background`}
            />
          ))}
        </div>
      </div>

      {drawingOpen && (
        <DrawingModal chatId={chatId} onClose={() => setDrawingOpen(false)} onSent={handleDrawingSent} />
      )}

      {drawingViewer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80" onClick={() => setDrawingViewer(null)}>
          <div className="relative max-w-3xl max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            <img src={drawingViewer} alt="Drawing" className="max-w-full max-h-[80vh] rounded-xl" />
            <div className="flex gap-2 justify-center mt-4">
              <a
                href={drawingViewer}
                download="drawing.png"
                className="px-4 py-2 text-sm font-medium text-night-50 bg-forest-600 hover:bg-forest-500 rounded-lg transition-colors"
              >
                Download
              </a>
              <button
                onClick={() => setDrawingViewer(null)}
                className="px-4 py-2 text-sm font-medium text-night-200 bg-night-800 hover:bg-night-700 rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {reportTarget && (
        <ReportModal
          messageId={reportTarget.id}
          chatId={chatId}
          onClose={() => setReportTarget(null)}
        />
      )}

      {dialog}
    </div>
  )
}

interface MessageItemProps {
  msg: Message
  isOwn: boolean
  sender: AppUser | undefined
  showAvatar: boolean
  showSenderName: boolean
  reactions: MessageReaction[]
  currentUserId: string
  isAdmin: boolean
  editingId: string | null
  editContent: string
  setEditContent: (v: string) => void
  onStartEdit: () => void
  onCancelEdit: () => void
  onSaveEdit: () => void
  onDelete: () => void
  onReport: () => void
  onReact: (emoji: string) => void
  onOpenDrawing: (url: string) => void
  activeEmojiPicker: string | null
  onToggleEmojiPicker: () => void
}

function MessageItem({
  msg, isOwn, sender, showAvatar, showSenderName, reactions, currentUserId, isAdmin,
  editingId, editContent, setEditContent, onStartEdit, onCancelEdit, onSaveEdit, onDelete, onReport,
  onReact, onOpenDrawing, activeEmojiPicker, onToggleEmojiPicker,
}: MessageItemProps) {
  const [hovered, setHovered] = useState(false)
  const isEditing = editingId === msg.id
  const senderName = sender ? getDisplayName(sender) : 'Unknown'
  const senderAvatar = sender ? getAvatarUrl(sender.avatar_url) : null

  const attachments = msg.attachments as Array<Record<string, unknown>> | null
  const drawingAttachment = attachments?.find((a) => a.type === 'drawing' || a.url)
  const imageUrl = drawingAttachment?.url as string | undefined
  const voiceAttachment = attachments?.find((a) => a.type === 'voice')
  const audioUrl = voiceAttachment?.url as string | undefined
  const voiceDuration = voiceAttachment?.duration as number | undefined

  if (msg.is_deleted) {
    return (
      <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
        <div className="max-w-[75%]">
          <div className="px-4 py-2 rounded-2xl bg-night-800/50 border border-night-700/50 text-night-500 italic text-sm">
            Message deleted
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className={`group flex ${isOwn ? 'justify-end' : 'justify-start'} gap-2 ${showAvatar ? 'mt-3' : 'mt-0.5'}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {!isOwn && (
        <div className="w-8 flex-shrink-0">
          {showAvatar && (
            senderAvatar ? (
              <img src={senderAvatar} alt={senderName} className="w-8 h-8 rounded-full object-cover" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-forest-700 flex items-center justify-center text-[10px] font-semibold text-night-50">
                {getInitials(senderName)}
              </div>
            )
          )}
        </div>
      )}

      <div className={`max-w-[75%] ${isOwn ? 'items-end' : 'items-start'} flex flex-col`}>
        {showSenderName && (
          <span className="text-xs font-medium text-night-400 mb-0.5 ml-1">{senderName}</span>
        )}

        <div className={`relative px-4 py-2 rounded-2xl text-sm transition-all ${
          isOwn
            ? 'bg-forest-700 text-night-50 rounded-br-sm'
            : 'bg-night-800 text-night-100 rounded-bl-sm'
        }`}>
          {msg.message_type === 'drawing' && imageUrl ? (
            <img
              src={imageUrl}
              alt="Drawing"
              onClick={() => onOpenDrawing(imageUrl)}
              className="max-h-48 rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
            />
          ) : msg.message_type === 'voice' && audioUrl ? (
            <VoicePlayer url={audioUrl} duration={voiceDuration || 0} isOwn={isOwn} />
          ) : isEditing ? (
            <div className="flex flex-col gap-2">
              <input
                type="text"
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onSaveEdit()
                  if (e.key === 'Escape') onCancelEdit()
                }}
                className="w-full px-2 py-1 text-sm rounded-lg bg-night-900 border border-night-700 text-night-100 focus:outline-none focus:border-forest-600"
                autoFocus
              />
              <div className="flex gap-2">
                <button onClick={onSaveEdit} className="px-2 py-1 text-xs font-medium text-night-50 bg-forest-600 hover:bg-forest-500 rounded-lg transition-colors">Save</button>
                <button onClick={onCancelEdit} className="px-2 py-1 text-xs font-medium text-night-300 bg-night-700 hover:bg-night-600 rounded-lg transition-colors">Cancel</button>
              </div>
            </div>
          ) : (
            <span className="whitespace-pre-wrap break-words">{msg.content}</span>
          )}

          {msg.is_edited && !isEditing && (
            <span className="ml-1 text-[10px] text-night-400 italic">(edited)</span>
          )}
        </div>

        <div className={`flex items-center gap-1 mt-0.5 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
          <span className="text-[10px] text-night-500">{formatFullTimestamp(msg.created_at)}</span>

          {hovered && !isEditing && (
            <div className={`flex items-center gap-0.5 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
              <div className="relative">
                <button
                  onClick={onToggleEmojiPicker}
                  className="p-1 rounded-md text-night-500 hover:text-night-200 hover:bg-night-800 transition-colors"
                  aria-label="React"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" /><path d="M8 14s1.5 2 4 2 4-2 4-2" /><line x1="9" y1="9" x2="9.01" y2="9" /><line x1="15" y1="9" x2="15.01" y2="9" />
                  </svg>
                </button>
                {activeEmojiPicker === msg.id && (
                  <div className={`absolute bottom-full mb-1 ${isOwn ? 'right-0' : 'left-0'} flex gap-1 p-1.5 rounded-lg bg-night-800 border border-night-700 shadow-xl z-30 animate-fade-in`}>
                    {EMOJIS.map((emoji) => (
                      <button
                        key={emoji}
                        onClick={() => onReact(emoji)}
                        className="text-lg hover:scale-125 transition-transform"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {isOwn && (
                <button
                  onClick={onStartEdit}
                  className="p-1 rounded-md text-night-500 hover:text-night-200 hover:bg-night-800 transition-colors"
                  aria-label="Edit"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                </button>
              )}

              {(isOwn || isAdmin) && (
                <button
                  onClick={onDelete}
                  className="p-1 rounded-md text-night-500 hover:text-red-400 hover:bg-night-800 transition-colors"
                  aria-label="Delete"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </button>
              )}

              <button
                onClick={onReport}
                className="p-1 rounded-md text-night-500 hover:text-sunset-400 hover:bg-night-800 transition-colors"
                aria-label="Report"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" y1="22" x2="4" y2="15" />
                </svg>
              </button>
            </div>
          )}
        </div>

        {reactions.length > 0 && (
          <div className={`flex flex-wrap gap-1 mt-1 ${isOwn ? 'justify-end' : 'justify-start'}`}>
            {Object.entries(
              reactions.reduce<Record<string, number>>((acc, r) => {
                acc[r.emoji] = (acc[r.emoji] || 0) + 1
                return acc
              }, {})
            ).map(([emoji, count]) => {
              const userReacted = reactions.some((r) => r.user_id === currentUserId && r.emoji === emoji)
              return (
                <button
                  key={emoji}
                  onClick={() => onReact(emoji)}
                  className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs transition-colors ${
                    userReacted
                      ? 'bg-forest-600/30 border border-forest-500/50 text-night-50'
                      : 'bg-night-800 border border-night-700 text-night-300 hover:bg-night-700'
                  }`}
                >
                  <span>{emoji}</span>
                  <span className="text-[10px] font-medium">{count}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

interface VoicePlayerProps {
  url: string
  duration: number
  isOwn: boolean
}

function VoicePlayer({ url, duration, isOwn }: VoicePlayerProps) {
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const onTime = () => setCurrentTime(audio.currentTime)
    const onEnd = () => { setPlaying(false); setCurrentTime(0) }
    audio.addEventListener('timeupdate', onTime)
    audio.addEventListener('ended', onEnd)
    return () => {
      audio.removeEventListener('timeupdate', onTime)
      audio.removeEventListener('ended', onEnd)
    }
  }, [])

  const toggle = () => {
    const audio = audioRef.current
    if (!audio) return
    if (playing) {
      audio.pause()
      setPlaying(false)
    } else {
      audio.play()
      setPlaying(true)
    }
  }

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0
  const bars = 24
  const activeBars = Math.floor((progress / 100) * bars)

  return (
    <div className="flex items-center gap-2 min-w-[180px]">
      <audio ref={audioRef} src={url} preload="metadata" />
      <button
        onClick={toggle}
        className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
          isOwn ? 'bg-night-50/20 hover:bg-night-50/30' : 'bg-forest-600 hover:bg-forest-500'
        }`}
        aria-label={playing ? 'Pause' : 'Play'}
      >
        {playing ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="text-night-50">
            <rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="text-night-50">
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
        )}
      </button>

      <div className="flex items-center gap-0.5 flex-1">
        {Array.from({ length: bars }).map((_, i) => (
          <div
            key={i}
            className={`w-0.5 rounded-full transition-colors ${
              i < activeBars ? 'bg-night-50' : isOwn ? 'bg-night-50/30' : 'bg-night-400/40'
            }`}
            style={{ height: `${8 + Math.sin(i * 0.8) * 6 + Math.cos(i * 1.3) * 4}px` }}
          />
        ))}
      </div>

      <span className="text-[10px] text-night-300 flex-shrink-0 tabular-nums">
        {formatDuration(playing && currentTime > 0 ? currentTime : duration)}
      </span>
    </div>
  )
}
