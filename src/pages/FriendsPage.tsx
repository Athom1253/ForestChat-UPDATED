import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { toast } from '@/stores/toast'
import { lastSeenLabel } from '@/lib/utils'
import type { Profile, Friend } from '@/types'

export default function FriendsPage() {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const [friends, setFriends] = useState<(Friend & { profile: Profile | null })[]>([])
  const [pendingRequests, setPendingRequests] = useState<(Friend & { profile: Profile | null })[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadFriends()
  }, [user?.id])

  async function loadFriends() {
    if (!user) return
    setLoading(true)

    // Accepted friends where I'm the requester
    const { data: requester } = await supabase
      .from('friends')
      .select('*, profile:profiles!friends_addressee_id_fkey(*)')
      .eq('requester_id', user.id)
      .eq('status', 'accepted')

    // Accepted friends where I'm the addressee
    const { data: addressee } = await supabase
      .from('friends')
      .select('*, profile:profiles!friends_requester_id_fkey(*)')
      .eq('addressee_id', user.id)
      .eq('status', 'accepted')

    const allFriends = [
      ...(requester || []),
      ...(addressee || []),
    ] as (Friend & { profile: Profile | null })[]

    setFriends(allFriends)

    // Pending requests (incoming)
    const { data: pending } = await supabase
      .from('friends')
      .select('*, profile:profiles!friends_requester_id_fkey(*)')
      .eq('addressee_id', user.id)
      .eq('status', 'pending')

    setPendingRequests((pending || []) as (Friend & { profile: Profile | null })[])
    setLoading(false)
  }

  const searchUsers = async () => {
    if (!searchQuery.trim()) { setSearchResults([]); return }
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .or(`username.ilike.%${searchQuery}%,display_name.ilike.%${searchQuery}%`)
      .neq('id', user?.id || '')
      .limit(10)

    if (!error && data) setSearchResults(data)
  }

  const sendFriendRequest = async (userId: string) => {
    if (!user) return
    const { error } = await supabase.from('friends').insert({
      requester_id: user.id,
      addressee_id: userId,
      status: 'pending',
    })
    if (error) {
      if (error.code === '23505') toast.info('Friend request already sent')
      else toast.error('Failed to send friend request')
    } else {
      toast.success('Friend request sent!')
    }
  }

  const acceptFriendRequest = async (friendId: string) => {
    const { error } = await supabase.from('friends')
      .update({ status: 'accepted', updated_at: new Date().toISOString() })
      .eq('id', friendId)
    if (error) toast.error('Failed to accept request')
    else { toast.success('Friend request accepted!'); loadFriends() }
  }

  const rejectFriendRequest = async (friendId: string) => {
    const { error } = await supabase.from('friends').delete().eq('id', friendId)
    if (error) toast.error('Failed to reject request')
    else loadFriends()
  }

  const removeFriend = async (friendId: string) => {
    if (!confirm('Remove this friend?')) return
    const { error } = await supabase.from('friends').delete().eq('id', friendId)
    if (error) toast.error('Failed to remove friend')
    else { toast.success('Friend removed'); loadFriends() }
  }

  const startDM = async (friendUserId: string) => {
    if (!user) return
    // Check if DM channel already exists
    const { data: myChannels } = await supabase
      .from('channel_members')
      .select('channel_id')
      .eq('user_id', user.id)

    if (myChannels && myChannels.length > 0) {
      for (const mc of myChannels) {
        const { data: otherMember } = await supabase
          .from('channel_members')
          .select('user_id')
          .eq('channel_id', mc.channel_id)
          .neq('user_id', user.id)
          .maybeSingle()

        if (otherMember?.user_id === friendUserId) {
          navigate(`/?c=${mc.channel_id}`)
          return
        }
      }
    }

    // Create new DM channel
    const { data: channel, error: chError } = await supabase.from('channels').insert({
      type: 'dm',
      owner_id: user.id,
      is_private: true,
    }).select().single()

    if (chError) { toast.error('Failed to create DM'); return }

    await supabase.from('channel_members').insert([
      { channel_id: channel.id, user_id: user.id, role: 'member' },
      { channel_id: channel.id, user_id: friendUserId, role: 'member' },
    ])

    navigate(`/?c=${channel.id}`)
  }

  return (
    <div className="flex-1 flex flex-col bg-bg">
      <div className="h-14 flex items-center px-6 border-b border-border bg-surface">
        <h1 className="text-lg font-semibold text-text">Friends</h1>
      </div>

      <div className="flex-1 overflow-y-auto p-6 max-w-4xl w-full mx-auto">
        {/* Search users */}
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-text-muted uppercase mb-2">Add Friend</h2>
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && searchUsers()}
              placeholder="Search by username..."
              className="input pl-10"
            />
            <svg className="absolute left-3 top-3 w-5 h-5 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          </div>
          {searchResults.length > 0 && (
            <div className="mt-2 space-y-1">
              {searchResults.map((p) => (
                <div key={p.id} className="flex items-center gap-3 p-3 bg-surface rounded-lg">
                  {p.avatar_url ? (
                    <img src={p.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">{p.username[0]?.toUpperCase()}</div>
                  )}
                  <div className="flex-1">
                    <p className="font-medium text-text">{p.display_name || p.username}</p>
                    <p className="text-xs text-text-muted">@{p.username}</p>
                  </div>
                  <button onClick={() => sendFriendRequest(p.id)} className="btn-primary text-sm">
                    Add Friend
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pending requests */}
        {pendingRequests.length > 0 && (
          <div className="mb-6">
            <h2 className="text-sm font-semibold text-text-muted uppercase mb-2">Pending Requests ({pendingRequests.length})</h2>
            <div className="space-y-2">
              <AnimatePresence>
                {pendingRequests.map((req) => (
                  <motion.div
                    key={req.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className="flex items-center gap-3 p-3 bg-surface rounded-lg"
                  >
                    {req.profile?.avatar_url ? (
                      <img src={req.profile.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">{req.profile?.username[0]?.toUpperCase()}</div>
                    )}
                    <div className="flex-1">
                      <p className="font-medium text-text">{req.profile?.display_name || req.profile?.username}</p>
                      <p className="text-xs text-text-muted">wants to be your friend</p>
                    </div>
                    <button onClick={() => acceptFriendRequest(req.id)} className="btn-primary text-sm">Accept</button>
                    <button onClick={() => rejectFriendRequest(req.id)} className="btn-ghost text-sm">Reject</button>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>
        )}

        {/* Friends list */}
        <div>
          <h2 className="text-sm font-semibold text-text-muted uppercase mb-2">Your Friends ({friends.length})</h2>
          {loading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => <div key={i} className="skeleton h-16" />)}
            </div>
          ) : friends.length === 0 ? (
            <div className="text-center py-12 text-text-muted">
              <p className="text-lg mb-2">No friends yet</p>
              <p className="text-sm">Search for users above to add friends</p>
            </div>
          ) : (
            <div className="space-y-2">
              {friends.map((f) => {
                const p = f.profile
                if (!p) return null
                return (
                  <motion.div
                    key={f.id}
                    layout
                    className="flex items-center gap-3 p-3 bg-surface rounded-lg hover:bg-surface-hover group"
                  >
                    <div className="relative">
                      {p.avatar_url ? (
                        <img src={p.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">{p.username[0]?.toUpperCase()}</div>
                      )}
                      <div className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-surface ${p.status === 'online' ? 'bg-success' : p.status === 'away' ? 'bg-warning' : 'bg-text-muted/40'}`} />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-text">{p.display_name || p.username}</p>
                      <p className="text-xs text-text-muted">{p.status === 'online' ? 'Online' : lastSeenLabel(p.last_seen)}</p>
                    </div>
                    <button onClick={() => startDM(p.id)} className="btn-ghost text-sm">Message</button>
                    <button onClick={() => navigate(`/profile/${p.id}`)} className="btn-ghost text-sm">Profile</button>
                    <button onClick={() => removeFriend(f.id)} className="btn-ghost text-sm text-error opacity-0 group-hover:opacity-100">Remove</button>
                  </motion.div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
