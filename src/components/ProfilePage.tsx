import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, User, CreditCard as Edit2, Check, X, Calendar, MessageCircle, UserPlus, UserCheck, UserMinus, Ban, Leaf, Camera, Image, Star, Award, Clock, Zap, TrendingUp, Shield, Sparkles, Loader as Loader2 } from 'lucide-react'
import { useStore } from '../lib/store'
import { getUserById, updateUser, uploadAvatar, createOrGetDM, getChatMembers, getChatMembership, getFriends, sendFriendRequest, deleteFriend, blockUser, unblockUser, getBlockedUsers } from '../lib/api'
import { supabase } from '../lib/supabase'
import { translateError } from '../lib/errorTranslator'
import type { AppUser, ChatWithDetails } from '../lib/types'

type Badge = { id: string; label: string; icon: typeof Award; color: string; description: string }

const BADGES: Badge[] = [
  { id: 'early-adopter', label: 'Early Adopter', icon: Star, color: 'text-amber-500', description: 'Joined in the first month' },
  { id: 'admin', label: 'Admin', icon: Shield, color: 'text-red-500', description: 'App administrator' },
  { id: 'active', label: 'Active Member', icon: Zap, color: 'text-green-500', description: 'Online in last 24 hours' },
  { id: 'veteran', label: 'Veteran', icon: Award, color: 'text-purple-500', description: 'Member for 30+ days' },
  { id: 'chatty', label: 'Chatty', icon: MessageCircle, color: 'text-blue-500', description: 'Sent 100+ messages' },
]

export default function ProfilePage() {
  const { userId } = useParams()
  const navigate = useNavigate()
  const currentUser = useStore((s) => s.currentUser)
  const setCurrentUser = useStore((s) => s.setCurrentUser)
  const addToast = useStore((s) => s.addToast)
  const [profile, setProfile] = useState<AppUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [isEditing, setIsEditing] = useState(false)
  const [editData, setEditData] = useState({ display_name: '', bio: '', status_message: '' })
  const [friendStatus, setFriendStatus] = useState<'none' | 'pending' | 'accepted' | 'blocked'>('none')
  const [friendLoading, setFriendLoading] = useState(false)
  const [friendRecordId, setFriendRecordId] = useState<string | null>(null)
  const [isBlocked, setIsBlocked] = useState(false)
  const [isSelf, setIsSelf] = useState(false)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [stats, setStats] = useState({ messageCount: 0, chatCount: 0, friendCount: 0 })
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!userId || !currentUser) return
    loadProfile()
  }, [userId, currentUser])

  const loadProfile = async () => {
    if (!userId) return
    setLoading(true)
    try {
      const user = await getUserById(userId)
      if (user) {
        setProfile(user)
        setEditData({
          display_name: user.display_name || user.username,
          bio: user.bio || '',
          status_message: user.status_message || '',
        })
        const self = user.id === currentUser?.id
        setIsSelf(self)

        if (!self && currentUser) {
          const blocked = await getBlockedUsers(currentUser.id)
          setIsBlocked(blocked.includes(user.id))
          const friends = await getFriends(currentUser.id)
          const friend = friends.find((f) => f.requester_id === user.id || f.addressee_id === user.id)
          if (friend) {
            setFriendStatus(friend.status as any)
            setFriendRecordId(friend.id)
          } else {
            setFriendStatus('none')
          }
        }

        const { count: msgCount } = await supabase
          .from('messages')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('is_deleted', false)
        const { count: chatCount } = await supabase
          .from('chat_memberships')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
        const { count: friendCount } = await supabase
          .from('friends')
          .select('*', { count: 'exact', head: true })
          .eq('addressee_id', user.id)
          .eq('status', 'accepted')
        setStats({
          messageCount: msgCount || 0,
          chatCount: chatCount || 0,
          friendCount: friendCount || 0,
        })
      }
    } catch (e) {
      console.error('Failed to load profile', e)
    } finally {
      setLoading(false)
    }
  }

  const handleAvatarSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !profile || !isSelf) return
    setAvatarUploading(true)
    try {
      const url = await uploadAvatar(file, profile.id)
      const updated = await updateUser(profile.id, { avatar_url: url })
      setProfile(updated)
      setAvatarPreview(null)
      if (currentUser?.id === profile.id) setCurrentUser(updated)
    } catch (e) { console.error('Failed to upload avatar', e) }
    finally { setAvatarUploading(false) }
  }

  const handleAvatarPreview = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => setAvatarPreview(ev.target?.result as string)
    reader.readAsDataURL(file)
  }

  const handleSave = async () => {
    if (!profile || !isSelf) return
    try {
      const updated = await updateUser(profile.id, {
        display_name: editData.display_name || profile.username,
        bio: editData.bio,
        status_message: editData.status_message,
      })
      setProfile(updated)
      setIsEditing(false)
      if (currentUser?.id === profile.id) setCurrentUser(updated)
    } catch (e) { console.error('Failed to update profile', e) }
  }

  const handleAddFriend = async () => {
    if (!profile || !currentUser || friendLoading) return
    setFriendLoading(true)
    try {
      await sendFriendRequest(currentUser.id, profile.id)
      setFriendStatus('pending')
      addToast('Friend request sent', 'success')
    } catch (e: any) {
      const msg = translateError(e)
      if (msg.includes('Already friends')) {
        setFriendStatus('accepted')
        addToast('Already friends', 'info')
      } else {
        addToast(`Failed to send request: ${msg}`, 'error')
      }
    } finally {
      setFriendLoading(false)
    }
  }

  const handleMessage = async () => {
    if (!profile || !currentUser) return
    try {
      const chat = await createOrGetDM(currentUser.id, profile.id)
      const members = await getChatMembers(chat.id)
      const membership = await getChatMembership(chat.id, currentUser.id)
      const enriched: ChatWithDetails = {
        ...chat,
        membership: membership || { id: '', chat_id: chat.id, user_id: currentUser.id, role: 'member', is_muted: false, is_pinned: false, is_archived: false, joined_at: null },
        unread_count: 0, last_message: null, members,
      }
      useStore.getState().setActiveChat(enriched)
      navigate('/chat')
    } catch (e) { addToast(`Failed to start conversation: ${translateError(e)}`, 'error') }
  }

  const handleUnfriend = async () => {
    if (!friendRecordId) return
    try {
      await deleteFriend(friendRecordId)
      setFriendStatus('none')
      setFriendRecordId(null)
    } catch (e) { addToast(`Failed to unfriend: ${translateError(e)}`, 'error') }
  }

  const handleBlock = async () => {
    if (!profile || !currentUser) return
    try {
      if (isBlocked) { await unblockUser(currentUser.id, profile.id); setIsBlocked(false) }
      else { await blockUser(currentUser.id, profile.id); setIsBlocked(true) }
    } catch (e) { addToast(`Failed to update block status: ${translateError(e)}`, 'error') }
  }

  const getEarnedBadges = (): Badge[] => {
    if (!profile) return []
    const earned: Badge[] = []
    if (profile.is_admin) earned.push(BADGES.find(b => b.id === 'admin')!)
    const joinDate = new Date(profile.created_at || '')
    const daysSince = (Date.now() - joinDate.getTime()) / 86400000
    if (daysSince > 30) earned.push(BADGES.find(b => b.id === 'veteran')!)
    if (joinDate.getMonth() === 5 && joinDate.getFullYear() === 2026) earned.push(BADGES.find(b => b.id === 'early-adopter')!)
    if (stats.messageCount >= 100) earned.push(BADGES.find(b => b.id === 'chatty')!)
    if (profile.status === 'online') earned.push(BADGES.find(b => b.id === 'active')!)
    return earned
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg nature-bg">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-text-muted">Loading profile...</span>
        </motion.div>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg text-text-muted nature-bg">
        User not found
      </div>
    )
  }

  const avatarSrc = avatarPreview || profile.avatar_url
  const earnedBadges = getEarnedBadges()
  const joinDate = new Date(profile.created_at || '')
  const daysSinceJoin = Math.floor((Date.now() - joinDate.getTime()) / 86400000)

  return (
    <div className="min-h-screen bg-bg nature-bg overflow-y-auto">
      <div className="max-w-2xl mx-auto relative z-10">
        {/* Header bar */}
        <div className="flex items-center gap-3 p-4 border-b border-border sticky top-0 bg-bg-sidebar/80 backdrop-blur-md z-20">
          <button onClick={() => navigate('/chat')} className="p-2 rounded-xl hover:bg-bg-hover text-text-muted transition-all" aria-label="Back to chat">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="font-semibold text-text">Profile</h1>
          <div className="ml-auto text-accent/20">
            <Leaf className="w-5 h-5 leaf-sway" />
          </div>
        </div>

        <div className="p-6">
          {/* Hero card with avatar, name, status */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="bg-bg-surface border border-border/60 rounded-2xl p-6 shadow-sm mb-4"
          >
            <div className="flex items-center gap-5 mb-4">
              <div className="relative group shrink-0">
                <div className="w-28 h-28 rounded-full bg-accent/15 flex items-center justify-center ring-4 ring-accent/10 overflow-hidden">
                  {avatarSrc ? (
                    <img src={avatarSrc} alt="" className="w-28 h-28 rounded-full object-cover" />
                  ) : (
                    <User className="w-14 h-14 text-accent/60" />
                  )}
                </div>
                <div className={`absolute bottom-1 right-1 w-5 h-5 rounded-full border-2 border-bg-surface ${profile.status === 'online' ? 'bg-green-500' : 'bg-text-muted'}`} />
                {isSelf && (
                  <>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="absolute bottom-0 right-0 p-2 rounded-full bg-accent text-white shadow-lg hover:bg-accent-hover transition-all opacity-0 group-hover:opacity-100"
                      title="Change avatar"
                    >
                      {avatarUploading ? (
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        <Camera className="w-4 h-4" />
                      )}
                    </button>
                    <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { handleAvatarPreview(e); handleAvatarSelect(e) }} />
                  </>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-2xl font-bold text-text">{profile.display_name || profile.username}</h2>
                <p className="text-sm text-text-muted mt-0.5">@{profile.username}</p>
                <div className="flex items-center gap-3 mt-2">
                  <span className={`text-xs flex items-center gap-1.5 ${profile.status === 'online' ? 'text-green-500' : 'text-text-muted'}`}>
                    <span className={`w-2 h-2 rounded-full ${profile.status === 'online' ? 'bg-green-500 animate-pulse' : 'bg-text-muted'}`} />
                    {profile.status === 'online' ? 'Online' : 'Offline'}
                  </span>
                </div>
              </div>
            </div>

            {/* Badges row */}
            {earnedBadges.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {earnedBadges.map((badge) => (
                  <motion.div
                    key={badge.id}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-bg-hover text-xs font-medium ${badge.color}`}
                    title={badge.description}
                  >
                    <badge.icon className="w-3.5 h-3.5" />
                    {badge.label}
                  </motion.div>
                ))}
              </div>
            )}

            {/* Action buttons */}
            {!isSelf && (
              <div className="flex gap-2 flex-wrap">
                <motion.button whileTap={{ scale: 0.97 }} onClick={handleMessage} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-accent text-white text-sm font-medium hover:bg-accent-hover transition-all shadow-sm">
                  <MessageCircle className="w-4 h-4" /> Message
                </motion.button>
                {friendStatus === 'none' && (
                  <motion.button whileTap={{ scale: 0.97 }} onClick={handleAddFriend} disabled={friendLoading} className={`flex items-center gap-2 px-5 py-2.5 rounded-xl border text-sm font-medium transition-all ${friendLoading ? 'bg-bg-surface border-border text-text-muted cursor-wait opacity-60' : 'bg-bg-surface border-border text-text hover:bg-bg-hover'}`}>
                    {friendLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />} {friendLoading ? 'Sending...' : 'Add Friend'}
                  </motion.button>
                )}
                {friendStatus === 'pending' && (
                  <button className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-bg-surface border border-border text-text-muted text-sm font-medium cursor-default">
                    <UserCheck className="w-4 h-4" /> Pending
                  </button>
                )}
                {friendStatus === 'accepted' && (
                  <motion.button whileTap={{ scale: 0.97 }} onClick={handleUnfriend} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-error-light border border-error/20 text-error text-sm font-medium hover:bg-error/20 transition-all">
                    <UserMinus className="w-4 h-4" /> Unfriend
                  </motion.button>
                )}
                <motion.button whileTap={{ scale: 0.97 }} onClick={handleBlock} className={`flex items-center gap-2 px-5 py-2.5 rounded-xl border text-sm font-medium transition-all ${isBlocked ? 'bg-error-light border-error text-error' : 'bg-bg-surface border-border text-text-muted hover:bg-bg-hover'}`}>
                  <Ban className="w-4 h-4" /> {isBlocked ? 'Unblock' : 'Block'}
                </motion.button>
              </div>
            )}

            {isSelf && !isEditing && (
              <div className="flex gap-2 flex-wrap">
                <motion.button whileTap={{ scale: 0.97 }} onClick={() => setIsEditing(true)} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-bg-surface border border-border text-text text-sm font-medium hover:bg-bg-hover transition-all">
                  <Edit2 className="w-4 h-4" /> Edit Profile
                </motion.button>
                <motion.button whileTap={{ scale: 0.97 }} onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-accent/10 text-accent text-sm font-medium hover:bg-accent/20 transition-all">
                  <Image className="w-4 h-4" /> Change Avatar
                </motion.button>
              </div>
            )}
          </motion.div>

          {/* Stats grid */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.05 }}
            className="grid grid-cols-3 gap-3 mb-4"
          >
            <StatCard icon={MessageCircle} label="Messages" value={stats.messageCount} color="text-blue-500" />
            <StatCard icon={MessageCircle} label="Chats" value={stats.chatCount} color="text-purple-500" />
            <StatCard icon={UserCheck} label="Friends" value={stats.friendCount} color="text-green-500" />
          </motion.div>

          {/* Edit form */}
          <AnimatePresence>
            {isEditing && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="space-y-4 mb-4 overflow-hidden"
              >
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1.5">Display Name</label>
                  <input type="text" value={editData.display_name} onChange={(e) => setEditData({ ...editData, display_name: e.target.value })} className="w-full px-3 py-2.5 rounded-xl bg-bg border border-border text-text focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 transition-all" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1.5">Bio</label>
                  <textarea value={editData.bio} onChange={(e) => setEditData({ ...editData, bio: e.target.value })} rows={3} className="w-full px-3 py-2.5 rounded-xl bg-bg border border-border text-text focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 resize-none transition-all" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1.5">Status</label>
                  <input type="text" value={editData.status_message} onChange={(e) => setEditData({ ...editData, status_message: e.target.value })} placeholder="What's on your mind?" className="w-full px-3 py-2.5 rounded-xl bg-bg border border-border text-text placeholder:text-text-muted focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 transition-all" />
                </div>
                <div className="flex gap-2">
                  <motion.button whileTap={{ scale: 0.97 }} onClick={handleSave} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-accent text-white text-sm font-medium hover:bg-accent-hover transition-all shadow-sm">
                    <Check className="w-4 h-4" /> Save
                  </motion.button>
                  <button onClick={() => setIsEditing(false)} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-bg-surface border border-border text-text text-sm font-medium hover:bg-bg-hover transition-all">
                    <X className="w-4 h-4" /> Cancel
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Info cards */}
          <div className="space-y-3">
            {profile.status_message && (
              <InfoCard label="Status" icon={Sparkles}>
                <div className="text-sm text-text leading-relaxed">{profile.status_message}</div>
              </InfoCard>
            )}
            {profile.bio && (
              <InfoCard label="About" icon={User}>
                <div className="text-sm text-text leading-relaxed">{profile.bio}</div>
              </InfoCard>
            )}
            <InfoCard label="Member Since" icon={Calendar}>
              <div className="flex items-center justify-between">
                <span className="text-sm text-text">{joinDate.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</span>
                <span className="text-xs text-text-muted">{daysSinceJoin} days ago</span>
              </div>
            </InfoCard>
            {profile.last_seen && (
              <InfoCard label="Last Seen" icon={Clock}>
                <span className="text-sm text-text">{new Date(profile.last_seen).toLocaleString()}</span>
              </InfoCard>
            )}
          </div>

          {/* Achievements section */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.1 }}
            className="mt-4"
          >
            <h3 className="text-sm font-bold text-text-secondary mb-3 flex items-center gap-2">
              <Award className="w-4 h-4 text-accent" /> Achievements
            </h3>
            <div className="grid grid-cols-5 gap-2">
              {BADGES.map((badge) => {
                const earned = earnedBadges.some(b => b.id === badge.id)
                return (
                  <div
                    key={badge.id}
                    className={`flex flex-col items-center gap-1 p-2.5 rounded-xl border text-center ${earned ? 'bg-bg-surface border-border' : 'bg-bg-hover/50 border-border/30 opacity-40'}`}
                    title={badge.description}
                  >
                    <badge.icon className={`w-5 h-5 ${earned ? badge.color : 'text-text-muted'}`} />
                    <span className="text-[10px] text-text-muted leading-tight">{badge.label}</span>
                  </div>
                )
              })}
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  )
}

function StatCard({ icon: Icon, label, value, color }: { icon: typeof Award; label: string; value: number; color: string }) {
  return (
    <div className="bg-bg-surface border border-border/60 rounded-xl p-3 text-center">
      <Icon className={`w-4 h-4 mx-auto mb-1 ${color}`} />
      <div className="text-lg font-bold text-text">{value.toLocaleString()}</div>
      <div className="text-xs text-text-muted">{label}</div>
    </div>
  )
}

function InfoCard({ label, icon: Icon, children }: { label: string; icon: typeof Award; children: React.ReactNode }) {
  return (
    <div className="p-4 rounded-xl bg-bg-surface border border-border/60 shadow-sm">
      <div className="text-xs text-text-muted uppercase tracking-wide mb-1.5 font-semibold flex items-center gap-1.5">
        <Icon className="w-3.5 h-3.5" /> {label}
      </div>
      {children}
    </div>
  )
}
