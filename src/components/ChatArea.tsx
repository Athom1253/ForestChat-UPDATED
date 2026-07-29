import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Pin, Hash, User, Search, Settings, Send, X, Reply, CreditCard as Edit2, ChevronDown, MessageSquare, Smile, Leaf, Mic, MicOff, Paperclip, Users, Copy, Bookmark, Forward, Wand as Wand2, Pen, Gamepad2, Phone, Video, RefreshCw, Music, ChartBar as BarChart3 } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { format } from 'date-fns'
import EmojiPicker from 'emoji-picker-react'
import { useStore } from '../lib/store'
import { supabase } from '../lib/supabase'
import { translateError } from '../lib/errorTranslator'
import {
  getMessages, sendMessage, editMessage as apiEditMessage, softDeleteMessage, pinMessage,
  toggleReaction, getReactions, updateReadReceipt, getChatMembers, updateTyping, clearTyping,
  getTypingUsers, getPinnedMessages, getChatMembership, getUserById, uploadFile, searchMessages,
  bookmarkMessage,
} from '../lib/api'
import MessageBubble, { summarizeReactions } from './MessageBubble'
import ChannelManagePanel from './ChannelManagePanel'
import AnimatedBackground from './AnimatedBackground'
import AnimationSettings from './AnimationSettings'
import PeoplePanel from './PeoplePanel'
import DrawingCanvas from './DrawingCanvas'
import GameLauncher from './GameLauncher'
import Soundboard from './Soundboard'
import PollCreator from './PollCreator'
import CallWindow from './CallWindow'
import type { Message, AppUser } from '../lib/types'

const TYPING_TIMEOUT = 3000
const FETCH_LIMIT = 50

export default function ChatArea({ activeCallChat, onCallClosed }: { activeCallChat?: { chatId: string; chatName: string; mode: 'voice' | 'video' } | null; onCallClosed?: () => void }) {
  const navigate = useNavigate()
  const activeChat = useStore((s) => s.activeChat)
  const currentUser = useStore((s) => s.currentUser)
  const messages = useStore((s) => s.messages)
  const setMessages = useStore((s) => s.setMessages)
  const appendMessages = useStore((s) => s.appendMessages)
  const prependMessages = useStore((s) => s.prependMessages)
  const updateMessage = useStore((s) => s.updateMessage)
  const typingUsers = useStore((s) => s.typingUsers)
  const setTypingUsers = useStore((s) => s.setTypingUsers)
  const showSidebar = useStore((s) => s.showSidebar)
  const setShowSidebar = useStore((s) => s.setShowSidebar)
  const replyTo = useStore((s) => s.replyTo)
  const setReplyTo = useStore((s) => s.setReplyTo)
  const editMsg = useStore((s) => s.editMessage)
  const setEditMsg = useStore((s) => s.setEditMessage)
  const addToast = useStore((s) => s.addToast)
  const users = useStore((s) => s.users)
  const setUser = useStore((s) => s.setUser)

  const [inputText, setInputText] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Message[]>([])
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; message: Message } | null>(null)
  const [selectedImage, setSelectedImage] = useState<string | null>(null)
  const [pinnedMessages, setPinnedMessages] = useState<Message[]>([])
  const [members, setMembers] = useState<AppUser[]>([])
  const [myMembership, setMyMembership] = useState<any>(null)
  const [isAtBottom, setIsAtBottom] = useState(true)
  const [showNewMessages, setShowNewMessages] = useState(false)
  const [fileUploading, setFileUploading] = useState(false)
  const [attachments, setAttachments] = useState<Array<{ name: string; url: string; type: string; size?: number }>>([])
  const [lastTyping, setLastTyping] = useState(0)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [showManagePanel, setShowManagePanel] = useState(false)
  const [showAnimSettings, setShowAnimSettings] = useState(false)
  const [showPeoplePanel, setShowPeoplePanel] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)
  const [forwarding, setForwarding] = useState<Message | null>(null)
  const [showDrawing, setShowDrawing] = useState(false)
  const [showGames, setShowGames] = useState(false)
  const [showSoundboard, setShowSoundboard] = useState(false)
  const [showPollCreator, setShowPollCreator] = useState(false)
  const [callMode, setCallMode] = useState<'voice' | 'video' | null>(activeCallChat?.chatId === activeChat?.id ? activeCallChat?.mode ?? null : null)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState<string | null>(null)
  // Read receipts: map of userId -> last_read_at (for other members)
  const [otherMemberReadAts, setOtherMemberReadAts] = useState<Record<string, string>>({})
  // Voice recording
  const [isRecording, setIsRecording] = useState(false)
  const [recordingDuration, setRecordingDuration] = useState(0)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const recordingChunksRef = useRef<BlobPart[]>([])
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const chatMessages = activeChat ? messages[activeChat.id] || [] : []

  // Sync callMode when an incoming call is accepted via ChatLayout
  useEffect(() => {
    if (activeCallChat && activeCallChat.chatId === activeChat?.id) {
      setCallMode(activeCallChat.mode)
    }
  }, [activeCallChat, activeChat?.id])

  const loadMessages = useCallback(async (before?: string) => {
    if (!activeChat) return
    try {
      const msgs = await getMessages(activeChat.id, FETCH_LIMIT, before)
      const msgsWithReactions = await Promise.all(
        msgs.map(async (m: Message) => {
          const reactions = await getReactions(m.id)
          return { ...m, reactions: summarizeReactions(reactions, currentUser?.id || '') }
        })
      )
      if (before) {
        prependMessages(activeChat.id, msgsWithReactions)
        setHasMore(msgs.length === FETCH_LIMIT)
      } else {
        setMessages(activeChat.id, msgsWithReactions)
        setHasMore(msgs.length === FETCH_LIMIT)
        setTimeout(() => messagesEndRef.current?.scrollIntoView(), 50)
      }
      const idsToFetch = [...new Set(msgs.map((m) => m.user_id).filter((id) => !users[id]))]
      await Promise.all(idsToFetch.map(async (uid) => {
        const u = await getUserById(uid)
        if (u) setUser(u)
      }))
    } catch (e) {
      addToast(`Failed to load messages: ${translateError(e)}`, 'error')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChat?.id, currentUser?.id])

  useEffect(() => {
    if (!activeChat || !currentUser) return
    setLoading(true)
    Promise.all([
      loadMessages(),
      getChatMembers(activeChat.id),
      getPinnedMessages(activeChat.id),
      getChatMembership(activeChat.id, currentUser.id),
    ]).then(([, membersData, pinned, membership]) => {
      setMembers(membersData)
      // Seed all chat members into the users store so messages resolve names immediately
      membersData.forEach((m) => setUser(m))
      setPinnedMessages(pinned)
      setMyMembership(membership)
      setLoading(false)
    }).catch(() => setLoading(false))

    // Load other members' read receipts for DMs
    if (activeChat.type === 'dm') {
      supabase
        .from('read_receipts')
        .select('user_id, last_read_at')
        .eq('chat_id', activeChat.id)
        .neq('user_id', currentUser.id)
        .then(({ data }) => {
          if (data) {
            const map: Record<string, string> = {}
            data.forEach((r) => { if (r.last_read_at) map[r.user_id] = r.last_read_at })
            setOtherMemberReadAts(map)
          }
        })
    }
  }, [activeChat?.id])

  // Real-time messages
  useEffect(() => {
    if (!activeChat || !currentUser) return
    const channel = supabase.channel(`chat:${activeChat.id}:${currentUser.id}`)
    channel
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `chat_id=eq.${activeChat.id}` }, async (payload) => {
        const msg = payload.new as Message
        const reactions = await getReactions(msg.id)
        const enriched = { ...msg, reactions: summarizeReactions(reactions, currentUser.id) }
        appendMessages(activeChat.id, [enriched])
        if (msg.user_id !== currentUser.id && !isAtBottom) setShowNewMessages(true)
        if (msg.user_id && !users[msg.user_id]) {
          const u = await getUserById(msg.user_id)
          if (u) setUser(u)
        }
        await updateReadReceipt(activeChat.id, currentUser.id, msg.id)
        if (isAtBottom) setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `chat_id=eq.${activeChat.id}` }, (payload) => {
        updateMessage(activeChat.id, payload.new.id, payload.new as Message)
      })
      .subscribe()

    // Reactions channel (single subscription per chat, optimized)
    const reactChannel = supabase.channel(`reactions:${activeChat.id}`)
    reactChannel
      .on('postgres_changes', { event: '*', schema: 'public', table: 'message_reactions' }, async (payload) => {
        const messageId = (payload.new as any)?.message_id || (payload.old as any)?.message_id
        if (!messageId) return
        const reactions = await getReactions(messageId)
        updateMessage(activeChat.id, messageId, { reactions: summarizeReactions(reactions, currentUser.id) })
      })
      .subscribe()

    return () => {
      channel.unsubscribe()
      reactChannel.unsubscribe()
    }
  }, [activeChat?.id, currentUser?.id])

  // Typing channel
  useEffect(() => {
    if (!activeChat || !currentUser) return
    const channel = supabase.channel(`typing:${activeChat.id}:v2`)
    channel
      .on('postgres_changes', { event: '*', schema: 'public', table: 'typing_indicators', filter: `chat_id=eq.${activeChat.id}` }, async () => {
        const typing = await getTypingUsers(activeChat.id)
        const names = typing.filter((u) => u.id !== currentUser.id).map((u) => u.display_name || u.username)
        setTypingUsers(activeChat.id, names)
      })
      .subscribe()
    return () => { channel.unsubscribe() }
  }, [activeChat?.id, currentUser?.id])

  // Read receipts real-time (for DMs — show who has read messages)
  useEffect(() => {
    if (!activeChat || !currentUser || activeChat.type !== 'dm') return
    const channel = supabase.channel(`read-receipts:${activeChat.id}`)
    channel
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'read_receipts',
        filter: `chat_id=eq.${activeChat.id}`,
      }, (payload) => {
        const r = payload.new as any
        if (r && r.user_id !== currentUser.id) {
          setOtherMemberReadAts((prev) => ({ ...prev, [r.user_id]: r.last_read_at }))
        }
      })
      .subscribe()
    return () => { channel.unsubscribe() }
  }, [activeChat?.id, currentUser?.id])

  // Mark as read when messages load
  useEffect(() => {
    if (!activeChat || !currentUser || chatMessages.length === 0) return
    const last = chatMessages[chatMessages.length - 1]
    updateReadReceipt(activeChat.id, currentUser.id, last.id)
  }, [activeChat?.id, chatMessages.length])

  // Update presence (handled in ChatLayout)

  const scrollToBottom = (smooth = true) => {
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' })
    setIsAtBottom(true)
    setShowNewMessages(false)
  }

  const handleScroll = () => {
    const el = scrollRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60
    setIsAtBottom(atBottom)
    if (atBottom) setShowNewMessages(false)
    if (el.scrollTop < 80 && hasMore && !loadingMore) {
      setLoadingMore(true)
      const first = chatMessages[0]
      if (first) {
        loadMessages(first.created_at || undefined).then(() => setLoadingMore(false))
      }
    }
  }

  const startCall = async (mode: 'voice' | 'video') => {
    if (!activeChat || !currentUser) return
    setCallMode(mode)
    // Broadcast call invite to all chat members
    const { supabase: sb } = await import('../lib/supabase')
    members.forEach((m) => {
      if (m.id === currentUser.id) return
      sb.channel(`incoming-calls:${m.id}`).send({
        type: 'broadcast',
        event: 'call-invite',
        payload: {
          from: currentUser,
          chatId: activeChat.id,
          chatName: activeChat.name,
          mode,
        },
      })
    })
  }

  const handleSync = async () => {
    if (!activeChat || !currentUser || syncing) return
    setSyncing(true)
    setSyncMsg(null)
    try {
      const prevCount = chatMessages.length
      await loadMessages()
      const newCount = (useStore.getState().messages[activeChat.id] || []).length
      const diff = newCount - prevCount
      setSyncMsg(diff > 0 ? `${diff} new message${diff !== 1 ? 's' : ''} synced` : "You're up to date!")
      setTimeout(() => setSyncMsg(null), 3000)
    } catch {
      setSyncMsg('Sync failed — try again')
    } finally {
      setSyncing(false)
    }
  }

  const handleSendDrawing = async (dataUrl: string) => {
    if (!activeChat || !currentUser) return
    try {
      const res = await fetch(dataUrl)
      const blob = await res.blob()
      const file = new File([blob], `drawing-${Date.now()}.png`, { type: 'image/png' })
      const url = await uploadFile(file)
      const att = [{ name: file.name, url, type: 'image/png', size: blob.size }]
      const msg = await sendMessage(activeChat.id, currentUser.id, '🎨 Sent a drawing', undefined, att, 'image')
      appendMessages(activeChat.id, [{ ...msg, reactions: [] }])
      setShowDrawing(false)
      scrollToBottom()
    } catch (e: any) {
      addToast(`Failed to send drawing: ${e.message || 'Unknown error'}`, 'error')
    }
  }

  const handleSend = async () => {
    if (!activeChat || !currentUser) return
    if (sending) return
    const text = inputText.trim()
    if (!text && attachments.length === 0) return
    setSending(true)
    const msgType = attachments.some((a) => a.type.startsWith('audio/')) ? 'voice'
      : attachments.some((a) => a.type.startsWith('video/')) ? 'video'
      : attachments.some((a) => a.type.startsWith('image/')) ? 'image'
      : attachments.length > 0 ? 'file' : 'text'
    try {
      const msg = await sendMessage(activeChat.id, currentUser.id, text, replyTo?.id || undefined, attachments, msgType)
      appendMessages(activeChat.id, [{ ...msg, reactions: [] }])
      setInputText('')
      setAttachments([])
      setReplyTo(null)
      setEditMsg(null)
      scrollToBottom()
      await clearTyping(activeChat.id, currentUser.id)
    } catch (e: any) {
      addToast(`Failed to send message: ${e.message || 'Unknown error'}`, 'error')
    } finally {
      setSending(false)
    }
  }

  const handleEdit = async () => {
    if (!editMsg || !inputText.trim() || !activeChat) return
    try {
      await apiEditMessage(editMsg.id, inputText.trim())
      updateMessage(activeChat.id, editMsg.id, { content: inputText.trim(), is_edited: true })
      setInputText('')
      setEditMsg(null)
      addToast('Message edited', 'success')
    } catch (e: any) {
      addToast(`Failed to edit: ${e.message || 'Unknown error'}`, 'error')
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (editMsg) handleEdit()
      else handleSend()
    }
    if (e.key === 'Escape') {
      setReplyTo(null)
      setEditMsg(null)
      setInputText('')
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(e.target.value)
    if (!activeChat || !currentUser) return
    const now = Date.now()
    if (now - lastTyping > 2000) {
      setLastTyping(now)
      updateTyping(activeChat.id, currentUser.id)
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
      typingTimerRef.current = setTimeout(() => clearTyping(activeChat.id, currentUser.id), TYPING_TIMEOUT)
    }
  }

  const handleFileSelect = async (files: FileList | null) => {
    if (!files) return
    setFileUploading(true)
    try {
      const newAtts = await Promise.all(
        Array.from(files).map(async (file) => {
          const url = await uploadFile(file)
          return { name: file.name, url, type: file.type, size: file.size }
        })
      )
      setAttachments((p) => [...p, ...newAtts])
    } catch (e) {
      addToast(`Upload failed: ${translateError(e)}`, 'error')
    } finally {
      setFileUploading(false)
    }
  }

  // Voice recording
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      recordingChunksRef.current = []
      recorder.ondataavailable = (e) => { if (e.data.size > 0) recordingChunksRef.current.push(e.data) }
      recorder.onstop = async () => {
        const blob = new Blob(recordingChunksRef.current, { type: 'audio/webm' })
        const file = new File([blob], `voice-${Date.now()}.webm`, { type: 'audio/webm' })
        const url = await uploadFile(file)
        const att = { name: file.name, url, type: file.type, size: file.size, duration: recordingDuration }
        stream.getTracks().forEach((t) => t.stop())
        if (!activeChat || !currentUser) return
        await sendMessage(activeChat.id, currentUser.id, '', replyTo?.id || undefined, [att], 'voice')
        setReplyTo(null)
        setRecordingDuration(0)
      }
      mediaRecorderRef.current = recorder
      recorder.start()
      setIsRecording(true)
      setRecordingDuration(0)
      recordingTimerRef.current = setInterval(() => setRecordingDuration((d) => d + 1), 1000)
    } catch (e) {
      addToast(`Microphone access denied: ${translateError(e)}`, 'error')
    }
  }

  const stopRecording = () => {
    mediaRecorderRef.current?.stop()
    setIsRecording(false)
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current)
  }

  // Drag and drop
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragOver(true) }
  const handleDragLeave = () => setIsDragOver(false)
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    await handleFileSelect(e.dataTransfer.files)
  }

  const handleReaction = async (messageId: string, emoji: string) => {
    if (!currentUser || !activeChat) return
    await toggleReaction(messageId, currentUser.id, emoji)
  }

  const handleBookmark = async (msg: Message) => {
    if (!currentUser) return
    await bookmarkMessage(currentUser.id, msg.id)
  }

  const handlePin = async (msg: Message) => {
    if (!activeChat) return
    await pinMessage(msg.id, !msg.is_pinned)
    updateMessage(activeChat.id, msg.id, { is_pinned: !msg.is_pinned })
    if (!msg.is_pinned) setPinnedMessages((p) => [msg, ...p])
    else setPinnedMessages((p) => p.filter((m) => m.id !== msg.id))
  }

  const handleDelete = async (msg: Message) => {
    if (!activeChat) return
    await softDeleteMessage(msg.id)
    updateMessage(activeChat.id, msg.id, { is_deleted: true, content: '' })
  }

  const handleSearch = async () => {
    if (!activeChat || !searchQuery.trim()) return
    const results = await searchMessages(activeChat.id, searchQuery.trim())
    setSearchResults(results)
  }

  const groupedMessages = groupMessagesByDate(chatMessages)
  const typing = typingUsers[activeChat?.id || ''] || []
  const isAdmin = myMembership?.role === 'owner' || myMembership?.role === 'admin'
  const otherMember = activeChat?.type === 'dm' ? members.find((m) => m.id !== currentUser?.id) : null

  // Determine the latest read timestamp among other members (for DMs)
  const latestOtherReadAt = Object.values(otherMemberReadAts).sort().reverse()[0]

  const animationPrefs = useStore((s) => s.animationPrefs)

  if (!activeChat) return null

  return (
    <div
      className="flex h-full relative nature-bg overflow-hidden"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Animated Background */}
      {(() => {
        const override = activeChat ? animationPrefs.chatOverrides[activeChat.id] : undefined
        const theme = override?.enabled ? override.theme : animationPrefs.enabled ? animationPrefs.theme : 'none'
        return theme !== 'none' ? (
          <AnimatedBackground
            theme={theme}
            intensity={animationPrefs.intensity}
            speed={animationPrefs.speed}
            paused={animationPrefs.paused}
          />
        ) : null
      })()}
      {/* Drag-drop overlay */}
      <AnimatePresence>
        {isDragOver && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 bg-accent/10 border-4 border-dashed border-accent/40 rounded-3xl flex items-center justify-center pointer-events-none"
          >
            <div className="text-center text-accent">
              <Paperclip className="w-12 h-12 mx-auto mb-2 opacity-60" />
              <p className="text-lg font-bold">Drop files here</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-1 flex flex-col min-w-0 relative z-10">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-bg-surface/90 backdrop-blur-sm shrink-0">
          <button onClick={() => setShowSidebar(!showSidebar)} className="p-2 rounded-xl hover:bg-bg-hover text-text-muted md:hidden transition-all">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center shrink-0 ring-2 ring-accent/5 overflow-hidden cursor-pointer"
            onClick={() => activeChat.type === 'dm' && otherMember && navigate(`/profile/${otherMember.id}`)}>
            {otherMember?.avatar_url ? (
              <img src={otherMember.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover" />
            ) : (
              activeChat.type === 'dm' ? <User className="w-5 h-5 text-accent" /> : <Hash className="w-5 h-5 text-accent" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-sm text-text truncate">{activeChat.name}</div>
            <div className="text-xs text-text-muted">
              {typing.length > 0 ? (
                <span className="flex items-center gap-1.5 text-accent animate-fade-in">
                  <span>{typing.length === 1 ? typing[0] : `${typing.length} people`} {typing.length === 1 ? 'is' : 'are'} typing</span>
                  <span className="flex gap-1 items-center">
                    <motion.span
                      className="w-1.5 h-1.5 rounded-full bg-accent"
                      animate={{ y: [0, -3, 0] }}
                      transition={{ duration: 0.6, repeat: Infinity, ease: 'easeInOut' }}
                    />
                    <motion.span
                      className="w-1.5 h-1.5 rounded-full bg-accent"
                      animate={{ y: [0, -3, 0] }}
                      transition={{ duration: 0.6, repeat: Infinity, ease: 'easeInOut', delay: 0.15 }}
                    />
                    <motion.span
                      className="w-1.5 h-1.5 rounded-full bg-accent"
                      animate={{ y: [0, -3, 0] }}
                      transition={{ duration: 0.6, repeat: Infinity, ease: 'easeInOut', delay: 0.3 }}
                    />
                  </span>
                </span>
              ) : (
                <span className="flex items-center gap-1">
                  <Leaf className="w-3 h-3" />
                  {activeChat.type === 'dm' ? (otherMember?.status === 'online' ? 'Online' : 'Offline') : `${members.length} members`}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => showPeoplePanel ? setShowPeoplePanel(false) : setShowPeoplePanel(true)} className="p-2 rounded-xl hover:bg-bg-hover text-text-muted transition-all" title="People">
              <Users className="w-4 h-4" />
            </button>
            <button onClick={() => setShowSearch(!showSearch)} className="p-2 rounded-xl hover:bg-bg-hover text-text-muted transition-all" title="Search">
              <Search className="w-4 h-4" />
            </button>
            {/* Sync button */}
            <div className="relative">
              <button
                onClick={handleSync}
                disabled={syncing}
                className="p-2 rounded-xl hover:bg-bg-hover text-text-muted hover:text-accent transition-all disabled:opacity-40"
                title="Sync messages"
              >
                <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
              </button>
              {syncMsg && (
                <div className="absolute top-full right-0 mt-1 px-2.5 py-1.5 bg-bg-surface border border-border rounded-xl text-xs text-text-muted whitespace-nowrap shadow-md z-50">
                  {syncMsg}
                </div>
              )}
            </div>
            <button onClick={() => startCall('voice')} className="p-2 rounded-xl hover:bg-bg-hover text-text-muted hover:text-accent transition-all" title="Voice call">
              <Phone className="w-4 h-4" />
            </button>
            <button onClick={() => startCall('video')} className="p-2 rounded-xl hover:bg-bg-hover text-text-muted hover:text-accent transition-all" title="Video call">
              <Video className="w-4 h-4" />
            </button>
            <button onClick={() => setShowAnimSettings(true)} className="p-2 rounded-xl hover:bg-bg-hover text-text-muted transition-all" title="Animated background">
              <Wand2 className="w-4 h-4" />
            </button>
            {isAdmin && (
              <button onClick={() => setShowManagePanel(true)} className="p-2 rounded-xl hover:bg-bg-hover text-text-muted transition-all">
                <Settings className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Search bar */}
        <AnimatePresence>
          {showSearch && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden border-b border-border bg-bg-surface/90">
              <div className="p-3 flex gap-2">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  placeholder="Search messages..."
                  className="flex-1 px-3 py-2 text-sm rounded-2xl bg-bg border border-border text-text placeholder:text-text-muted focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/10"
                />
                <button onClick={handleSearch} className="px-4 py-2 rounded-2xl bg-accent text-white text-sm hover:bg-accent-hover transition-all">Search</button>
                <button onClick={() => { setShowSearch(false); setSearchResults([]) }} className="p-2 rounded-2xl hover:bg-bg-hover text-text-muted transition-all">
                  <X className="w-4 h-4" />
                </button>
              </div>
              {searchResults.length > 0 && (
                <div className="px-3 pb-3 max-h-48 overflow-y-auto space-y-1">
                  {searchResults.map((msg) => (
                    <div key={msg.id} className="p-2.5 rounded-2xl bg-bg-hover text-sm cursor-pointer hover:bg-bg-active transition-all" onClick={() => {
                      document.getElementById(`msg-${msg.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                      setShowSearch(false)
                    }}>
                      <span className="font-bold text-accent mr-1">{users[msg.user_id]?.display_name || 'Unknown'}:</span>
                      <span className="text-text">{msg.content}</span>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Pinned message */}
        {pinnedMessages.length > 0 && (
          <div className="px-4 py-2 border-b border-border bg-accent/5 shrink-0 flex items-center gap-2 text-xs text-accent">
            <Pin className="w-3 h-3 shrink-0" />
            <span className="font-bold">Pinned:</span>
            <span className="truncate">{pinnedMessages[0].content}</span>
          </div>
        )}

        {/* Messages area */}
        <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto px-4 py-3 relative">
          {loadingMore && (
            <div className="flex justify-center py-3">
              <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="w-10 h-10 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-sm text-text-muted">Loading messages...</p>
              </div>
            </div>
          ) : chatMessages.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center text-text-muted">
                <div className="w-16 h-16 rounded-full bg-accent/10 flex items-center justify-center mx-auto mb-4 ring-4 ring-accent/5">
                  <MessageSquare className="w-8 h-8 text-accent/40" />
                </div>
                <p className="font-bold text-text">No messages yet</p>
                <p className="text-xs mt-1">Be the first to say something cozy 🌿</p>
              </div>
            </div>
          ) : (
            Object.entries(groupedMessages).map(([date, msgs]) => (
              <div key={date}>
                <div className="flex items-center gap-3 my-5">
                  <div className="flex-1 h-px bg-border/50" />
                  <span className="text-xs text-text-muted font-bold px-3 py-1 bg-bg-surface rounded-full border border-border/50">{date}</span>
                  <div className="flex-1 h-px bg-border/50" />
                </div>
                {msgs.map((msg) => {
                  const parent = msg.parent_id ? chatMessages.find((m) => m.id === msg.parent_id) || null : null
                  const parentUser = parent ? users[parent.user_id] || null : null
                  return (
                    <MessageBubble
                      key={msg.id}
                      message={msg}
                      isOwn={msg.user_id === currentUser?.id}
                      user={users[msg.user_id] || null}
                      parentUser={parentUser}
                      parentMessage={parent}
                      onContextMenu={(e) => {
                        e.preventDefault()
                        setContextMenu({ x: e.clientX, y: e.clientY, message: msg })
                      }}
                      onReaction={handleReaction}
                      onReply={(m) => { setReplyTo(m); inputRef.current?.focus() }}
                      onEdit={(m) => { setEditMsg(m); setInputText(m.content); inputRef.current?.focus() }}
                      onDelete={handleDelete}
                      onPin={handlePin}
                      onCopy={(t) => navigator.clipboard.writeText(t)}
                      onBookmark={handleBookmark}
                      onForward={(m) => setForwarding(m)}
                      onImageClick={setSelectedImage}
                      isAdmin={isAdmin}
                      currentUserId={currentUser?.id || ''}
                      onAvatarClick={(uid) => navigate(`/profile/${uid}`)}
                      readStatus={
                        msg.user_id === currentUser?.id && activeChat?.type === 'dm'
                          ? (latestOtherReadAt && msg.created_at && latestOtherReadAt >= msg.created_at ? 'read' : 'sent')
                          : undefined
                      }
                    />
                  )
                })}
              </div>
            ))
          )}
          <div ref={messagesEndRef} className="h-2" />
        </div>

        {/* New messages button */}
        <AnimatePresence>
          {showNewMessages && !isAtBottom && (
            <motion.button
              initial={{ opacity: 0, y: 10, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.9 }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => scrollToBottom()}
              className="absolute bottom-28 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full bg-accent text-white text-sm shadow-lg font-bold flex items-center gap-2 z-10 animate-unread"
            >
              <ChevronDown className="w-4 h-4" /> New messages
            </motion.button>
          )}
        </AnimatePresence>

        {/* Input area */}
        <div className="border-t border-border bg-bg-surface/90 backdrop-blur-sm shrink-0 p-3">
          {/* Reply/Edit indicators */}
          <AnimatePresence>
            {replyTo && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} className="flex items-center gap-2 mb-2 px-3 py-2 rounded-2xl bg-accent/8 border border-accent/20 text-sm">
                <Reply className="w-3 h-3 text-accent shrink-0" />
                <span className="text-text-muted text-xs truncate flex-1">
                  <span className="font-bold text-accent">{users[replyTo.user_id]?.display_name || 'Unknown'}</span>: {replyTo.content}
                </span>
                <button onClick={() => setReplyTo(null)} className="p-1 hover:bg-bg-hover rounded-lg">
                  <X className="w-3 h-3 text-text-muted" />
                </button>
              </motion.div>
            )}
            {editMsg && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} className="flex items-center gap-2 mb-2 px-3 py-2 rounded-2xl bg-accent/10 border border-accent/20 text-sm">
                <Edit2 className="w-3 h-3 text-accent shrink-0" />
                <span className="text-accent text-xs flex-1 font-bold">Editing message</span>
                <button onClick={() => { setEditMsg(null); setInputText('') }} className="p-1 hover:bg-bg-hover rounded-lg">
                  <X className="w-3 h-3 text-accent" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Attachment previews */}
          {attachments.length > 0 && (
            <div className="flex gap-2 mb-2 flex-wrap">
              {attachments.map((att, i) => (
                <div key={i} className="relative group">
                  {att.type.startsWith('image/') ? (
                    <img src={att.url} alt="" className="h-16 w-16 object-cover rounded-2xl" />
                  ) : (
                    <div className="h-16 px-3 flex items-center gap-2 rounded-2xl bg-bg-surface-2 border border-border text-xs">
                      <span className="text-lg">{att.type.startsWith('audio/') ? '🎤' : att.type.startsWith('video/') ? '🎬' : '📎'}</span>
                      <span className="max-w-[80px] truncate">{att.name}</span>
                    </div>
                  )}
                  <button onClick={() => setAttachments(attachments.filter((_, j) => j !== i))} className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-error text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Voice recording indicator */}
          {isRecording && (
            <div className="flex items-center gap-3 mb-2 px-3 py-2 rounded-2xl bg-error-light border border-error/20">
              <div className="w-2 h-2 rounded-full bg-error animate-pulse" />
              <span className="text-error text-sm font-bold">Recording {Math.floor(recordingDuration / 60)}:{(recordingDuration % 60).toString().padStart(2, '0')}</span>
              <button onClick={stopRecording} className="ml-auto text-xs text-error font-bold hover:underline">Stop & Send</button>
            </div>
          )}

          <div className="flex items-end gap-2">
            {/* Left actions */}
            <div className="flex items-center gap-0.5 shrink-0">
              <label className="p-2 rounded-xl hover:bg-bg-hover text-text-muted cursor-pointer transition-all" title="Attach files or images">
                <Paperclip className="w-5 h-5" />
                <input type="file" multiple accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip" className="hidden" onChange={(e) => handleFileSelect(e.target.files)} />
              </label>
              <button
                onClick={() => setShowDrawing(true)}
                className="p-2 rounded-xl hover:bg-bg-hover text-text-muted hover:text-accent transition-all"
                title="Draw & send"
              >
                <Pen className="w-5 h-5" />
              </button>
              <button
                onClick={() => setShowSoundboard(true)}
                className="p-2 rounded-xl hover:bg-bg-hover text-text-muted hover:text-accent transition-all"
                title="Soundboard"
              >
                <Music className="w-5 h-5" />
              </button>
              <button
                onClick={() => setShowGames(true)}
                className="p-2 rounded-xl hover:bg-bg-hover text-text-muted hover:text-accent transition-all"
                title="Games"
              >
                <Gamepad2 className="w-5 h-5" />
              </button>
              <button
                onClick={() => setShowPollCreator(true)}
                className="p-2 rounded-xl hover:bg-bg-hover text-text-muted hover:text-accent transition-all"
                title="Create poll"
              >
                <BarChart3 className="w-5 h-5" />
              </button>
              <div className="relative">
                <button
                  onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                  className="p-2 rounded-xl hover:bg-bg-hover text-text-muted transition-all"
                  title="Emoji"
                >
                  <Smile className="w-5 h-5" />
                </button>
                <AnimatePresence>
                  {showEmojiPicker && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setShowEmojiPicker(false)} />
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="absolute bottom-12 left-0 z-50 shadow-xl rounded-3xl overflow-hidden border border-border"
                      >
                        <EmojiPicker
                          onEmojiClick={(data) => {
                            setInputText((p) => p + data.emoji)
                            inputRef.current?.focus()
                          }}
                          width={320}
                          height={380}
                        />
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>
              <button
                onMouseDown={startRecording}
                onMouseUp={stopRecording}
                onTouchStart={startRecording}
                onTouchEnd={stopRecording}
                className={`p-2 rounded-xl transition-all ${isRecording ? 'bg-error text-white' : 'hover:bg-bg-hover text-text-muted'}`}
                title="Hold to record voice"
              >
                {isRecording ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </button>
            </div>

            {/* Text input */}
            <textarea
              ref={inputRef}
              value={inputText}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={editMsg ? 'Edit message...' : isRecording ? 'Recording voice...' : 'Type a cozy message...'}
              disabled={isRecording}
              rows={1}
              className="flex-1 px-4 py-2.5 rounded-2xl bg-bg border border-border text-text placeholder:text-text-muted focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 resize-none max-h-32 min-h-[42px] transition-all disabled:opacity-50"
            />

            {/* Send button */}
            <button
              onClick={editMsg ? handleEdit : handleSend}
              disabled={sending || (!inputText.trim() && attachments.length === 0) || fileUploading || isRecording}
              className="p-3 rounded-2xl bg-accent text-white hover:bg-accent-hover disabled:opacity-40 transition-all shadow-sm hover:shadow-md shrink-0"
            >
              {sending || fileUploading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Send className="w-5 h-5" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* People panel */}
      <AnimatePresence>
        {showPeoplePanel && (
          <PeoplePanel onClose={() => setShowPeoplePanel(false)} />
        )}
      </AnimatePresence>

      {/* Channel manage panel */}
      <AnimatePresence>
        {showManagePanel && (
          <ChannelManagePanel
            chat={activeChat}
            members={members}
            onClose={() => setShowManagePanel(false)}
            onChatDeleted={() => useStore.getState().setActiveChat(null)}
          />
        )}
      </AnimatePresence>

      {/* Animation settings */}
      <AnimatePresence>
        {showAnimSettings && (
          <AnimationSettings
            onClose={() => setShowAnimSettings(false)}
            chatId={activeChat.id}
          />
        )}
      </AnimatePresence>

      {/* Drawing canvas */}
      <AnimatePresence>
        {showDrawing && (
          <DrawingCanvas
            onClose={() => setShowDrawing(false)}
            onSend={handleSendDrawing}
          />
        )}
      </AnimatePresence>

      {/* Soundboard */}
      <AnimatePresence>
        {showSoundboard && (
          <Soundboard
            onClose={() => setShowSoundboard(false)}
          />
        )}
      </AnimatePresence>

      {/* Poll creator */}
      <AnimatePresence>
        {showPollCreator && activeChat && currentUser && (
          <PollCreator
            onClose={() => setShowPollCreator(false)}
            onPollSent={(_msgId) => {
              setShowPollCreator(false)
              scrollToBottom()
            }}
          />
        )}
      </AnimatePresence>

      {/* Game launcher */}
      <AnimatePresence>
        {showGames && (
          <GameLauncher
            onClose={() => setShowGames(false)}
            onSendResult={async (text) => {
              if (!activeChat || !currentUser) return
              try {
                const msg = await sendMessage(activeChat.id, currentUser.id, text)
                appendMessages(activeChat.id, [{ ...msg, reactions: [] }])
                setShowGames(false)
                scrollToBottom()
              } catch (e: any) {
                addToast(`Failed to send game result: ${e.message || 'Unknown error'}`, 'error')
              }
            }}
          />
        )}
      </AnimatePresence>

      {/* Call window */}
      <AnimatePresence>
        {callMode && currentUser && (
          <CallWindow
            chatId={activeChat.id}
            chatName={activeChat.name}
            currentUser={currentUser}
            members={members}
            mode={callMode}
            onClose={async () => {
              // Cancel any pending invites
              const { supabase: sb } = await import('../lib/supabase')
              members.forEach((m) => {
                if (m.id !== currentUser.id) {
                  sb.channel(`incoming-calls:${m.id}`).send({
                    type: 'broadcast',
                    event: 'call-cancelled',
                    payload: { chatId: activeChat.id },
                  })
                }
              })
              setCallMode(null)
              onCallClosed?.()
            }}
          />
        )}
      </AnimatePresence>

      {/* Context menu */}
      <AnimatePresence>
        {contextMenu && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setContextMenu(null)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              style={{ left: Math.min(contextMenu.x, window.innerWidth - 180), top: Math.min(contextMenu.y, window.innerHeight - 260) }}
              className="fixed z-50 w-44 bg-bg-surface/98 border border-border rounded-2xl shadow-xl overflow-hidden"
            >
              <div className="py-1">
                {[
                  { icon: <Reply className="w-3.5 h-3.5" />, label: 'Reply', onClick: () => { setReplyTo(contextMenu.message); setContextMenu(null); inputRef.current?.focus() } },
                  { icon: <Copy className="w-3.5 h-3.5" />, label: 'Copy', onClick: () => { navigator.clipboard.writeText(contextMenu.message.content); setContextMenu(null) } },
                  { icon: <Bookmark className="w-3.5 h-3.5" />, label: 'Bookmark', onClick: () => { handleBookmark(contextMenu.message); setContextMenu(null) } },
                  { icon: <Forward className="w-3.5 h-3.5" />, label: 'Forward', onClick: () => { setForwarding(contextMenu.message); setContextMenu(null) } },
                  ...(contextMenu.message.user_id === currentUser?.id ? [{ icon: <Edit2 className="w-3.5 h-3.5" />, label: 'Edit', onClick: () => { setEditMsg(contextMenu.message); setInputText(contextMenu.message.content); setContextMenu(null); inputRef.current?.focus() } }] : []),
                  ...(isAdmin ? [{ icon: <Pin className="w-3.5 h-3.5" />, label: contextMenu.message.is_pinned ? 'Unpin' : 'Pin', onClick: () => { handlePin(contextMenu.message); setContextMenu(null) } }] : []),
                  ...(isAdmin || contextMenu.message.user_id === currentUser?.id ? [{ icon: <X className="w-3.5 h-3.5" />, label: 'Delete', danger: true, onClick: () => { handleDelete(contextMenu.message); setContextMenu(null) } }] : []),
                ].map((item, i) => (
                  <button key={i} onClick={item.onClick} className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-xs font-semibold transition-all ${(item as any).danger ? 'text-error hover:bg-error-light' : 'text-text hover:bg-bg-hover'}`}>
                    {item.icon}
                    {item.label}
                  </button>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Image lightbox */}
      <AnimatePresence>
        {selectedImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm"
            onClick={() => setSelectedImage(null)}
          >
            <motion.img
              initial={{ scale: 0.85 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.85 }}
              src={selectedImage}
              alt=""
              className="max-w-full max-h-[90vh] rounded-3xl object-contain shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
            <button onClick={() => setSelectedImage(null)} className="absolute top-4 right-4 p-2.5 rounded-full bg-black/50 text-white hover:bg-black/70 transition-all">
              <X className="w-5 h-5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function groupMessagesByDate(messages: Message[]): Record<string, Message[]> {
  const groups: Record<string, Message[]> = {}
  for (const msg of messages) {
    const date = new Date(msg.created_at || '')
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    let key: string
    if (date.toDateString() === today.toDateString()) key = 'Today'
    else if (date.toDateString() === yesterday.toDateString()) key = 'Yesterday'
    else key = format(date, 'MMMM d, yyyy')
    if (!groups[key]) groups[key] = []
    groups[key].push(msg)
  }
  return groups
}
