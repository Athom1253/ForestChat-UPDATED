import { useState } from 'react'
import { X, Settings, Trash2, RefreshCw, Copy, Check, LogOut, UserX, Shield, Hash, Lock } from 'lucide-react'
import { motion } from 'framer-motion'
import { useStore } from '../lib/store'
import { updateChat, deleteChat, regenerateInviteCode, kickMember, updateMemberRole, leaveChat, clearChatHistory, updateMembership } from '../lib/api'
import type { AppUser, ChatWithDetails } from '../lib/types'

interface ChannelManagePanelProps {
  chat: ChatWithDetails
  members: AppUser[]
  onClose: () => void
  onChatDeleted: () => void
}

export default function ChannelManagePanel({ chat, members, onClose, onChatDeleted }: ChannelManagePanelProps) {
  const currentUser = useStore((s) => s.currentUser)
  const setActiveChat = useStore((s) => s.setActiveChat)
  const [name, setName] = useState(chat.name)
  const [description, setDescription] = useState(chat.description || '')
  const [saving, setSaving] = useState(false)
  const [inviteCode, setInviteCode] = useState(chat.invite_code || '')
  const [copied, setCopied] = useState(false)
  const [regenLoading, setRegenLoading] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [activeTab, setActiveTab] = useState<'general' | 'members' | 'danger'>('general')

  const membership = chat.membership
  const isOwner = membership?.role === 'owner'
  const isAdmin = isOwner || membership?.role === 'admin'

  const handleSave = async () => {
    if (!name.trim()) return
    setSaving(true)
    try {
      await updateChat(chat.id, { name: name.trim(), description: description.trim() })
      setActiveChat({ ...chat, name: name.trim(), description: description.trim() })
    } catch (e) {
      console.error('Failed to update chat', e)
    } finally {
      setSaving(false)
    }
  }

  const handleRegenCode = async () => {
    if (!currentUser) return
    setRegenLoading(true)
    try {
      const newCode = await regenerateInviteCode(chat.id, currentUser.id)
      setInviteCode(newCode)
      setActiveChat({ ...chat, invite_code: newCode })
    } catch (e) {
      console.error('Failed to regen code', e)
    } finally {
      setRegenLoading(false)
    }
  }

  const handleCopyCode = () => {
    navigator.clipboard.writeText(inviteCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleDeleteChat = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return }
    await deleteChat(chat.id)
    setActiveChat(null)
    onChatDeleted()
    onClose()
  }

  const handleArchive = async () => {
    if (!currentUser) return
    await updateMembership(chat.id, currentUser.id, { is_archived: !chat.is_archived })
    setActiveChat({ ...chat, is_archived: !chat.is_archived })
    onClose()
  }

  const handleKick = async (userId: string) => {
    await kickMember(chat.id, userId)
  }

  const handlePromote = async (userId: string, currentRole: string) => {
    const newRole = currentRole === 'admin' ? 'member' : 'admin'
    await updateMemberRole(chat.id, userId, newRole)
  }

  const handleLeave = async () => {
    if (!currentUser) return
    await leaveChat(chat.id, currentUser.id)
    setActiveChat(null)
    onClose()
  }

  const handleClearHistory = async () => {
    await clearChatHistory(chat.id)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-bg-surface border border-border rounded-3xl shadow-xl w-full max-w-lg overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Settings className="w-4 h-4 text-accent" />
            <h2 className="font-bold text-text">Manage Channel</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-bg-hover text-text-muted transition-all">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-2 border-b border-border">
          {(['general', 'members', 'danger'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2 text-sm rounded-xl font-medium capitalize transition-all duration-200 ${activeTab === tab ? 'bg-accent/10 text-accent' : 'text-text-muted hover:bg-bg-hover'}`}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="p-5 space-y-4 max-h-[500px] overflow-y-auto">
          {activeTab === 'general' && (
            <>
              <div>
                <label className="text-xs font-bold text-text-secondary uppercase tracking-wide block mb-1.5">Channel Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={!isAdmin}
                  className="w-full px-3 py-3 rounded-2xl bg-bg border border-border text-text focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 disabled:opacity-50 transition-all"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-text-secondary uppercase tracking-wide block mb-1.5">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={!isAdmin}
                  rows={3}
                  className="w-full px-3 py-3 rounded-2xl bg-bg border border-border text-text focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 resize-none disabled:opacity-50 transition-all"
                />
              </div>
              {isAdmin && (
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="w-full py-3 rounded-2xl bg-accent text-white font-bold hover:bg-accent-hover transition-all shadow-sm"
                >
                  {saving ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin mx-auto" /> : 'Save Changes'}
                </button>
              )}

              {/* Invite code */}
              <div>
                <label className="text-xs font-bold text-text-secondary uppercase tracking-wide block mb-1.5">Invite Code</label>
                <div className="flex gap-2">
                  <div className="flex-1 flex items-center gap-2 px-3 py-3 rounded-2xl bg-bg border border-border">
                    <Lock className="w-3.5 h-3.5 text-text-muted" />
                    <code className="text-sm font-mono text-accent flex-1">{inviteCode || 'No invite code'}</code>
                  </div>
                  <button onClick={handleCopyCode} disabled={!inviteCode} className="px-3 py-2 rounded-2xl bg-accent/10 text-accent hover:bg-accent/20 transition-all disabled:opacity-40">
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </button>
                  {isAdmin && (
                    <button onClick={handleRegenCode} disabled={regenLoading} className="px-3 py-2 rounded-2xl bg-accent/10 text-accent hover:bg-accent/20 transition-all disabled:opacity-40">
                      <RefreshCw className={`w-4 h-4 ${regenLoading ? 'animate-spin' : ''}`} />
                    </button>
                  )}
                </div>
              </div>
            </>
          )}

          {activeTab === 'members' && (
            <div className="space-y-2">
              {members.map((member) => {
                const memRole = (member as any)._role || 'member'
                return (
                  <div key={member.id} className="flex items-center gap-3 p-3 rounded-2xl bg-bg border border-border/50">
                    <div className="w-9 h-9 rounded-full bg-accent/10 overflow-hidden shrink-0">
                      {member.avatar_url ? <img src={member.avatar_url} alt="" className="w-9 h-9 object-cover rounded-full" /> : <div className="w-9 h-9 flex items-center justify-center"><Hash className="w-4 h-4 text-accent/60" /></div>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-text">{member.display_name || member.username}</div>
                      <div className="text-xs text-text-muted capitalize">{memRole}</div>
                    </div>
                    {isOwner && member.id !== currentUser?.id && (
                      <div className="flex gap-1">
                        <button
                          onClick={() => handlePromote(member.id, memRole)}
                          className="p-1.5 rounded-xl hover:bg-accent/10 text-accent transition-all"
                          title={memRole === 'admin' ? 'Demote to member' : 'Promote to admin'}
                        >
                          <Shield className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleKick(member.id)}
                          className="p-1.5 rounded-xl hover:bg-error-light text-error transition-all"
                          title="Kick member"
                        >
                          <UserX className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {activeTab === 'danger' && (
            <div className="space-y-3">
              <button
                onClick={handleArchive}
                className="w-full flex items-center gap-3 p-3 rounded-2xl border border-border hover:bg-bg-hover text-text transition-all"
              >
                <div className="w-8 h-8 rounded-xl bg-warning/10 flex items-center justify-center">
                  <Hash className="w-4 h-4 text-warning" />
                </div>
                <div className="text-left">
                  <div className="text-sm font-semibold">{chat.is_archived ? 'Unarchive' : 'Archive'} Chat</div>
                  <div className="text-xs text-text-muted">{chat.is_archived ? 'Restore to active chats' : 'Hide from main list'}</div>
                </div>
              </button>
              {isAdmin && (
                <button
                  onClick={handleClearHistory}
                  className="w-full flex items-center gap-3 p-3 rounded-2xl border border-error/30 hover:bg-error-light transition-all"
                >
                  <div className="w-8 h-8 rounded-xl bg-error-light flex items-center justify-center">
                    <Trash2 className="w-4 h-4 text-error" />
                  </div>
                  <div className="text-left">
                    <div className="text-sm font-semibold text-error">Clear History</div>
                    <div className="text-xs text-text-muted">Delete all messages (irreversible)</div>
                  </div>
                </button>
              )}
              <button
                onClick={handleLeave}
                className="w-full flex items-center gap-3 p-3 rounded-2xl border border-error/30 hover:bg-error-light transition-all"
              >
                <div className="w-8 h-8 rounded-xl bg-error-light flex items-center justify-center">
                  <LogOut className="w-4 h-4 text-error" />
                </div>
                <div className="text-left">
                  <div className="text-sm font-semibold text-error">Leave Chat</div>
                  <div className="text-xs text-text-muted">Remove yourself from this channel</div>
                </div>
              </button>
              {isOwner && (
                <button
                  onClick={handleDeleteChat}
                  className={`w-full flex items-center gap-3 p-3 rounded-2xl border transition-all ${confirmDelete ? 'border-error bg-error-light' : 'border-error/30 hover:bg-error-light'}`}
                >
                  <div className="w-8 h-8 rounded-xl bg-error-light flex items-center justify-center">
                    <Trash2 className="w-4 h-4 text-error" />
                  </div>
                  <div className="text-left">
                    <div className="text-sm font-semibold text-error">{confirmDelete ? 'Click again to confirm' : 'Delete Channel'}</div>
                    <div className="text-xs text-text-muted">Permanently delete this channel and all messages</div>
                  </div>
                </button>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  )
}
