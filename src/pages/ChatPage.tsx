import { useEffect, useRef, useState, useCallback } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { toast } from '@/stores/toast'
import { cn, timestampLabel, dayDivider, relativeTime, lastSeenLabel, formatFileSize } from '@/lib/utils'
import type { Message, Profile, Channel, Reaction } from '@/types'
import { MessageInput } from '@/components/chat/MessageInput'
import { ChatTopBar } from '@/components/chat/ChatTopBar'
import { MessageItem } from '@/components/chat/MessageItem'
import { TypingIndicator } from '@/components/chat/TypingIndicator'
import { DrawingModal } from '@/components/chat/DrawingModal'
import { VoiceRecorder } from '@/components/chat/VoiceRecorder'
import { SearchPanel } from '@/components/chat/SearchPanel'
import { MembersPanel } from '@/components/chat/MembersPanel'
import { PinnedMessagesPanel } from '@/components/chat/PinnedMessagesPanel'
import { ChatSettingsPanel } from '@/components/chat/ChatSettingsPanel'
import { CallModal } from '@/components/chat/CallModal'

interface MessageWithAuthor extends Message {
  author: Profile | null
  reactions: Reaction[]
  reply_message: Message | null
}

export default function ChatPage() {
  const { user, profile, settings } = useAuthStore()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const channelId = searchParams.get('c')

  const [channel, setChannel] = useState<Channel | null>(null)
  const [messages, setMessages] = useState<MessageWithAuthor[]>([])
  const [loading, setLoading] = useState(true)
  const [typingUsers, setTypingUsers] = useState<string[]>([])
  const [replyTo, setReplyTo] = useState<Message | null>(null)
  const [editingMessage, setEditingMessage] = useState<Message | null>(null)
  const [showSearch, setShowSearch] = useState(false)
  const [showMembers, setShowMembers] = useState(false)
  const [showPinned, setShowPinned] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showDrawing, setShowDrawing] = useState(false)
  const [showVoice, setShowVoice] = useState(false)
  const [showCall, setShowCall] = useState<'voice' | 'video' | 'screen' | null>(null)
  const [showNewMessages, setShowNewMessages] = useState(false)
  const [showScrollBottom, setShowScrollBottom] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const isAtBottomRef = useRef(true)
  const lastMessageIdRef = useRef<string | null>(null)

  // Load channel and messages
  useEffect(() => {
    if (!channelId || !user) {
      setLoading(false)
      return
    }
    loadChannel()
    loadMessages()
    markAsRead()
  }, [channelId, user?.id])

  // Realtime subscription
  useEffect(() => {
    if (!channelId) return

    const sub = supabase
      .channel(`channel-${channelId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `chat_id=eq.${channelId}` },
        (payload) => {
          const newMsg = payload.new as Message
          loadMessageWithAuthor(newMsg.id).then((msg) => {
            if (msg) {
              setMessages((prev) => {
                if (prev.find((m) => m.id === msg.id)) return prev
                return [...prev, msg]
              })
              if (isAtBottomRef.current) {
                scrollToBottom()
              } else {
                setShowNewMessages(true)
                setUnreadCount((c) => c + 1)
              }
            }
          })
        }
      )
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `chat_id=eq.${channelId}` },
        (payload) => {
          const updated = payload.new as Message
          setMessages((prev) => prev.map((m) => m.id === updated.id ? { ...m, ...updated } : m))
        }
      )
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages', filter: `chat_id=eq.${channelId}` },
        (payload) => {
          const deleted = payload.old as Message
          setMessages((prev) => prev.map((m) => m.id === deleted.id ? { ...m, deleted_at: new Date().toISOString() } : m))
        }
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reactions' },
        () => loadReactionsForChannel()
      )
      .subscribe()

    return () => { supabase.removeChannel(sub) }
  }, [channelId])

  // Typing indicator via realtime broadcast
  useEffect(() => {
    if (!channelId || !user) return
    const channel = supabase.channel(`typing-${channelId}`)
    channel.on('broadcast', { event: 'typing' }, (payload) => {
      const { userId, isTyping } = payload.payload as { userId: string; isTyping: boolean }
      if (userId === user.id) return
      setTypingUsers((prev) => {
        if (isTyping) return prev.includes(userId) ? prev : [...prev, userId]
        return prev.filter((u) => u !== userId)
      })
    })
    .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [channelId, user?.id])

  // Scroll detection
  const handleScroll = useCallback(() => {
    const container = messagesContainerRef.current
    if (!container) return
    const { scrollTop, scrollHeight, clientHeight } = container
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 100
    isAtBottomRef.current = isAtBottom
    if (isAtBottom) {
      setShowNewMessages(false)
      setUnreadCount(0)
      if (channelId) markAsRead()
    }
    setShowScrollBottom(!isAtBottom && scrollHeight > clientHeight + 200)
  }, [channelId])

  const scrollToBottom = (smooth = true) => {
    const container = messagesContainerRef.current
    if (!container) return
    container.scrollTo({ top: container.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
    isAtBottomRef.current = true
    setShowNewMessages(false)
    setUnreadCount(0)
  }

  async function loadChannel() {
    const { data } = await supabase.from('channels').select('*').eq('id', channelId).maybeSingle()
    setChannel(data)
  }

  async function loadMessages() {
    if (!channelId) { setLoading(false); return }
    setLoading(true)
    const { data, error } = await supabase
      .from('messages')
      .select(`
        *,
        author:app_users!messages_user_id_fkey(*),
        reply_message:messages!messages_reply_to_fkey(*)
      `)
      .eq('chat_id', channelId)
      .order('created_at', { ascending: true })
      .limit(200)

    if (error) {
      toast.error('Failed to load messages')
      setLoading(false)
      return
    }

    // Load reactions for all messages
    const messageIds = (data || []).map((m) => m.id)
    let reactionsMap: Record<string, Reaction[]> = {}
    if (messageIds.length > 0) {
      const { data: reactions } = await supabase
        .from('reactions')
        .select('*')
        .in('message_id', messageIds)
      reactionsMap = {}
      ;(reactions || []).forEach((r: Reaction) => {
        if (!reactionsMap[r.message_id]) reactionsMap[r.message_id] = []
        reactionsMap[r.message_id].push(r)
      })
    }

    const messagesWithReactions: MessageWithAuthor[] = (data || []).map((m) => ({
      ...m,
      reactions: reactionsMap[m.id] || [],
    }))

    setMessages(messagesWithReactions)
    setLoading(false)
    setTimeout(() => scrollToBottom(false), 100)
  }

  async function loadMessageWithAuthor(messageId: string): Promise<MessageWithAuthor | null> {
    const { data } = await supabase
      .from('messages')
      .select(`
        *,
        author:app_users!messages_user_id_fkey(*),
        reply_message:messages!messages_reply_to_fkey(*)
      `)
      .eq('id', messageId)
      .maybeSingle()
    if (!data) return null

    const { data: reactions } = await supabase
      .from('reactions')
      .select('*')
      .eq('message_id', messageId)
    return { ...data, reactions: reactions || [] }
  }

  async function loadReactionsForChannel() {
    if (!channelId) return
    const { data: reactions } = await supabase
      .from('reactions')
      .select('*')
      .in('message_id', messages.map((m) => m.id))

    const map: Record<string, Reaction[]> = {}
    ;(reactions || []).forEach((r: Reaction) => {
      if (!map[r.message_id]) map[r.message_id] = []
      map[r.message_id].push(r)
    })

    setMessages((prev) => prev.map((m) => ({ ...m, reactions: map[m.id] || [] })))
  }

  async function markAsRead() {
    if (!channelId || !user) return
    await supabase.from('channel_members')
      .update({ unread_count: 0 })
      .eq('chat_id', channelId)
      .eq('user_id', user.id)

    const { data: lastMsg } = await supabase
      .from('messages')
      .select('id')
      .eq('chat_id', channelId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (lastMsg) {
      await supabase.from('message_reads')
        .upsert({
          chat_id: channelId,
          user_id: user.id,
          last_read_message_id: lastMsg.id,
          last_read_at: new Date().toISOString(),
        }, { onConflict: 'chat_id,user_id' })
    }
  }

  // Typing broadcast
  const broadcastTyping = useCallback((isTyping: boolean) => {
    if (!channelId || !user) return
    const channel = supabase.channel(`typing-${channelId}`)
    channel.send({ type: 'broadcast', event: 'typing', payload: { userId: user.id, isTyping } })
  }, [channelId, user?.id])

  if (!channelId) {
    return (
      <div className="flex-1 flex items-center justify-center bg-bg">
        <div className="text-center">
          <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-primary/10 flex items-center justify-center">
            <svg className="w-10 h-10 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-text mb-2">Welcome to ForestChat</h2>
          <p className="text-text-muted">Select a conversation to start chatting</p>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex-1 flex flex-col bg-bg">
        <div className="h-14 border-b border-border skeleton" />
        <div className="flex-1 p-4 space-y-3">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="flex gap-3">
              <div className="skeleton w-10 h-10 rounded-full" />
              <div className="flex-1 space-y-2">
                <div className="skeleton h-4 w-32" />
                <div className="skeleton h-4 w-3/4" />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col bg-bg min-w-0">
      <ChatTopBar
        channel={channel}
        onSearch={() => setShowSearch(!showSearch)}
        onMembers={() => setShowMembers(!showMembers)}
        onPinned={() => setShowPinned(!showPinned)}
        onSettings={() => setShowSettings(!showSettings)}
        onCall={(type) => setShowCall(type)}
      />

      <div className="flex-1 flex min-h-0 relative">
        {/* Messages area */}
        <div className="flex-1 flex flex-col min-w-0">
          <div
            ref={messagesContainerRef}
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto px-4 py-4 space-y-1"
          >
            {messages.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center text-text-muted">
                  <p className="text-lg mb-2">No messages yet</p>
                  <p className="text-sm">Send the first message to start the conversation</p>
                </div>
              </div>
            ) : (
              <>
                {messages.map((msg, i) => {
                  const prev = messages[i - 1]
                  const showDayDivider = !prev || new Date(prev.created_at).toDateString() !== new Date(msg.created_at).toDateString()
                  const showAuthor = !prev || prev.user_id !== msg.user_id || new Date(prev.created_at).getTime() + 300000 < new Date(msg.created_at).getTime()

                  return (
                    <div key={msg.id}>
                      {showDayDivider && (
                        <div className="flex items-center gap-3 my-4">
                          <div className="flex-1 h-px bg-border" />
                          <span className="text-xs text-text-muted font-medium">{dayDivider(msg.created_at)}</span>
                          <div className="flex-1 h-px bg-border" />
                        </div>
                      )}
                      <MessageItem
                        message={msg}
                        showAuthor={showAuthor && !msg.deleted_at}
                        isOwn={msg.user_id === user?.id}
                        onReply={() => setReplyTo(msg)}
                        onEdit={() => setEditingMessage(msg)}
                        currentUserId={user?.id || ''}
                      />
                    </div>
                  )
                })}
              </>
            )}
            <div ref={messagesEndRef} />

            {typingUsers.length > 0 && (
              <TypingIndicator userIds={typingUsers} />
            )}
          </div>

          {/* New messages button */}
          <AnimatePresence>
            {showNewMessages && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="absolute bottom-20 left-1/2 -translate-x-1/2 z-10"
              >
                <button
                  onClick={() => scrollToBottom()}
                  className="px-4 py-1.5 bg-primary text-bg rounded-full text-sm font-medium shadow-lg hover:bg-primary-hover flex items-center gap-2"
                >
                  {unreadCount > 0 && <span className="bg-bg/20 px-1.5 rounded-full text-xs">{unreadCount}</span>}
                  New messages
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                  </svg>
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Scroll to bottom button */}
          <AnimatePresence>
            {showScrollBottom && !showNewMessages && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className="absolute bottom-20 right-6 z-10"
              >
                <button
                  onClick={() => scrollToBottom()}
                  className="w-10 h-10 bg-surface border border-border rounded-full shadow-lg hover:bg-surface-hover flex items-center justify-center"
                >
                  <svg className="w-5 h-5 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                  </svg>
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Reply indicator */}
          {replyTo && (
            <div className="px-4 py-2 bg-surface border-t border-border flex items-center gap-3">
              <div className="w-1 h-8 bg-primary rounded-full" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-text-muted">Replying to</p>
                <p className="text-sm text-text truncate">{replyTo.content || 'Attachment'}</p>
              </div>
              <button onClick={() => setReplyTo(null)} className="text-text-muted hover:text-text">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}

          {/* Message input */}
          <MessageInput
            channelId={channelId}
            replyTo={replyTo}
            editingMessage={editingMessage}
            onReplyCleared={() => setReplyTo(null)}
            onEditCleared={() => setEditingMessage(null)}
            onTyping={broadcastTyping}
            onDrawingOpen={() => setShowDrawing(true)}
            onVoiceOpen={() => setShowVoice(true)}
          />
        </div>

        {/* Side panels */}
        <AnimatePresence>
          {showSearch && <SearchPanel channelId={channelId} onClose={() => setShowSearch(false)} />}
          {showMembers && <MembersPanel channelId={channelId} onClose={() => setShowMembers(false)} />}
          {showPinned && <PinnedMessagesPanel channelId={channelId} onClose={() => setShowPinned(false)} />}
          {showSettings && <ChatSettingsPanel channel={channel} onClose={() => setShowSettings(false)} />}
        </AnimatePresence>
      </div>

      {/* Modals */}
      {showDrawing && (
        <DrawingModal
          channelId={channelId}
          onClose={() => setShowDrawing(false)}
        />
      )}
      {showVoice && (
        <VoiceRecorder
          channelId={channelId}
          onClose={() => setShowVoice(false)}
        />
      )}
      {showCall && (
        <CallModal
          type={showCall}
          channelName={channel?.name || 'Direct Message'}
          onClose={() => setShowCall(null)}
        />
      )}
    </div>
  )
}
