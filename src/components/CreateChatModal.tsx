import { useState } from 'react'
import { X, Hash, Lock, Copy, Check, Leaf, Users, ArrowRight } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useStore } from '../lib/store'
import { createChat, joinChatByInvite, getChatById, getChatMembers, getChatMembership, getUnreadCount } from '../lib/api'
import type { ChatWithDetails } from '../lib/types'

interface CreateChatModalProps {
  onClose: () => void
}

export default function CreateChatModal({ onClose }: CreateChatModalProps) {
  const currentUser = useStore((s) => s.currentUser)
  const setActiveChat = useStore((s) => s.setActiveChat)
  const [tab, setTab] = useState<'create' | 'join'>('create')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [isPrivate, setIsPrivate] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [createdChat, setCreatedChat] = useState<any>(null)
  const [joinCode, setJoinCode] = useState('')

  const handleCreate = async () => {
    if (!currentUser || !name.trim()) return
    setLoading(true)
    setError('')
    try {
      const inviteCode = isPrivate ? Math.random().toString(36).slice(2, 10).toUpperCase() : undefined
      const chat = await createChat(name.trim(), 'group', currentUser.id, [], description.trim(), undefined, inviteCode)
      setCreatedChat(chat)
    } catch (e: any) {
      setError(e.message || 'Failed to create chat')
    } finally {
      setLoading(false)
    }
  }

  const handleJoin = async () => {
    if (!currentUser || !joinCode.trim()) return
    setLoading(true)
    setError('')
    try {
      const result = await joinChatByInvite(joinCode.trim().toUpperCase(), currentUser.id)
      if (!result.success || !result.chatId) {
        setError(result.error || 'Invalid invite code')
        return
      }
      const chat = await getChatById(result.chatId)
      if (!chat) { setError('Chat not found'); return }
      const [members, unread, membership] = await Promise.all([
        getChatMembers(chat.id),
        getUnreadCount(chat.id, currentUser.id),
        getChatMembership(chat.id, currentUser.id),
      ])
      const enriched: ChatWithDetails = {
        ...chat,
        membership: membership || { id: '', chat_id: chat.id, user_id: currentUser.id, role: 'member', is_muted: false, is_pinned: false, is_archived: false, joined_at: null },
        unread_count: unread,
        last_message: null,
        members,
      }
      setActiveChat(enriched)
      onClose()
    } catch (e: any) {
      setError(e.message || 'Failed to join chat')
    } finally {
      setLoading(false)
    }
  }

  const copyInvite = () => {
    if (!createdChat?.invite_code) return
    navigator.clipboard.writeText(createdChat.invite_code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        className="bg-bg-surface/98 border border-border rounded-3xl shadow-xl w-full max-w-md overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Leaf className="w-4 h-4 text-accent leaf-sway" />
            <h2 className="font-bold text-text">Chat</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-bg-hover text-text-muted transition-all">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex gap-1 p-2 border-b border-border">
          <button onClick={() => { setTab('create'); setError('') }} className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold rounded-2xl transition-all ${tab === 'create' ? 'bg-accent/10 text-accent' : 'text-text-muted hover:bg-bg-hover'}`}>
            <Hash className="w-4 h-4" />
            Create Group
          </button>
          <button onClick={() => { setTab('join'); setError('') }} className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold rounded-2xl transition-all ${tab === 'join' ? 'bg-accent/10 text-accent' : 'text-text-muted hover:bg-bg-hover'}`}>
            <Users className="w-4 h-4" />
            Join by Code
          </button>
        </div>

        <div className="p-5 space-y-4">
          <AnimatePresence mode="wait">
            {tab === 'create' ? (
              <motion.div key="create" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
                {createdChat ? (
                  <div className="space-y-4">
                    <div className="text-center">
                      <div className="w-16 h-16 rounded-full bg-accent/15 flex items-center justify-center mx-auto mb-3 ring-4 ring-accent/5">
                        <Hash className="w-8 h-8 text-accent" />
                      </div>
                      <h3 className="font-bold text-text text-lg">{createdChat.name}</h3>
                      <p className="text-xs text-text-muted mt-1">Channel created!</p>
                    </div>
                    {createdChat.invite_code && (
                      <div className="p-3 rounded-2xl bg-bg border border-border">
                        <div className="text-xs text-text-muted mb-1.5 font-semibold">Invite Code</div>
                        <div className="flex items-center gap-2">
                          <code className="flex-1 text-sm font-mono text-accent bg-accent/10 px-3 py-2 rounded-xl">{createdChat.invite_code}</code>
                          <button onClick={copyInvite} className="p-2.5 rounded-xl hover:bg-accent/10 text-accent transition-all">
                            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>
                    )}
                    <button onClick={onClose} className="w-full py-3 rounded-2xl bg-accent text-white font-bold hover:bg-accent-hover transition-all shadow-sm">
                      Done
                    </button>
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="text-xs font-bold text-text-secondary uppercase tracking-wide block mb-1.5">Group Name</label>
                      <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Cozy Corner" className="w-full px-3 py-3 rounded-2xl bg-bg border border-border text-text placeholder:text-text-muted focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 transition-all" />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-text-secondary uppercase tracking-wide block mb-1.5">Description (optional)</label>
                      <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What's this group about?" className="w-full px-3 py-3 rounded-2xl bg-bg border border-border text-text placeholder:text-text-muted focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 transition-all" />
                    </div>
                    <div className="flex items-center gap-3 p-3 rounded-2xl bg-bg border border-border/60 cursor-pointer hover:bg-bg-hover transition-all" onClick={() => setIsPrivate(!isPrivate)}>
                      <Lock className="w-4 h-4 text-text-muted" />
                      <div className="flex-1">
                        <div className="text-sm font-bold text-text">Private Group</div>
                        <div className="text-xs text-text-muted">Require invite code to join</div>
                      </div>
                      <div className={`w-10 h-5 rounded-full transition-all duration-300 ${isPrivate ? 'bg-accent' : 'bg-bg-surface-2'}`}>
                        <div className={`w-4 h-4 rounded-full bg-white shadow-sm mt-0.5 transition-all duration-300 ${isPrivate ? 'translate-x-5' : 'translate-x-0.5'}`} />
                      </div>
                    </div>
                    {error && <p className="text-sm text-error bg-error-light px-3 py-2.5 rounded-2xl">{error}</p>}
                    <button onClick={handleCreate} disabled={loading || !name.trim()} className="w-full py-3 rounded-2xl bg-accent text-white font-bold hover:bg-accent-hover disabled:opacity-50 flex items-center justify-center gap-2 transition-all shadow-sm">
                      {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'Create Group'}
                    </button>
                  </>
                )}
              </motion.div>
            ) : (
              <motion.div key="join" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
                <div className="text-center py-2">
                  <div className="w-14 h-14 rounded-full bg-accent/10 flex items-center justify-center mx-auto mb-3 ring-4 ring-accent/5">
                    <Users className="w-7 h-7 text-accent/70" />
                  </div>
                  <p className="text-sm text-text-muted">Enter the invite code shared by a channel member</p>
                </div>
                <div>
                  <label className="text-xs font-bold text-text-secondary uppercase tracking-wide block mb-1.5">Invite Code</label>
                  <input
                    type="text"
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                    onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
                    placeholder="e.g. ABC12345"
                    className="w-full px-3 py-3 rounded-2xl bg-bg border border-border text-text font-mono tracking-widest placeholder:text-text-muted focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 transition-all uppercase text-center text-lg"
                    maxLength={10}
                  />
                </div>
                {error && <p className="text-sm text-error bg-error-light px-3 py-2.5 rounded-2xl">{error}</p>}
                <button onClick={handleJoin} disabled={loading || !joinCode.trim()} className="w-full py-3 rounded-2xl bg-accent text-white font-bold hover:bg-accent-hover disabled:opacity-50 flex items-center justify-center gap-2 transition-all shadow-sm">
                  {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><ArrowRight className="w-4 h-4" /> Join Channel</>}
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  )
}
