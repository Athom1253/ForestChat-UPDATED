import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { toast } from '@/stores/toast'
import { generateInviteCode, relativeTime } from '@/lib/utils'
import type { Channel } from '@/types'

export default function RoomsPage() {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const [myChannels, setMyChannels] = useState<Channel[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [showJoin, setShowJoin] = useState(false)
  const [newRoomName, setNewRoomName] = useState('')
  const [newRoomDesc, setNewRoomDesc] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadChannels()
  }, [user?.id])

  async function loadChannels() {
    if (!user) return
    setLoading(true)
    const { data, error } = await supabase
      .from('channels')
      .select('*, channel_members!inner(user_id)')
      .neq('type', 'dm')
      .eq('channel_members.user_id', user.id)
      .order('created_at', { ascending: false })

    if (!error && data) setChannels(data)
    setLoading(false)
  }

  function setChannels(data: any[]) {
    setMyChannels(data as Channel[])
  }

  const createRoom = async () => {
    if (!user || !newRoomName.trim()) return
    const code = generateInviteCode()
    const { data, error } = await supabase.from('channels').insert({
      type: 'room',
      name: newRoomName.trim(),
      description: newRoomDesc.trim(),
      owner_id: user.id,
      is_private: false,
      invite_code: code,
    }).select().single()

    if (error) { toast.error('Failed to create room'); return }

    await supabase.from('channel_members').insert({
      channel_id: data.id,
      user_id: user.id,
      role: 'owner',
    })

    toast.success('Room created!')
    setNewRoomName('')
    setNewRoomDesc('')
    setShowCreate(false)
    loadChannels()
    navigate(`/?c=${data.id}`)
  }

  const joinRoom = async () => {
    if (!user || !joinCode.trim()) return
    const { data: channel, error } = await supabase
      .from('channels')
      .select('*')
      .eq('invite_code', joinCode.trim().toUpperCase())
      .maybeSingle()

    if (error || !channel) { toast.error('Room not found'); return }

    // Check if already a member
    const { data: existing } = await supabase
      .from('channel_members')
      .select('id')
      .eq('channel_id', channel.id)
      .eq('user_id', user.id)
      .maybeSingle()

    if (existing) {
      toast.info('You are already a member of this room')
      navigate(`/?c=${channel.id}`)
      return
    }

    const { error: memberError } = await supabase.from('channel_members').insert({
      channel_id: channel.id,
      user_id: user.id,
      role: 'member',
    })

    if (memberError) { toast.error('Failed to join room'); return }
    toast.success(`Joined ${channel.name}!`)
    setJoinCode('')
    setShowJoin(false)
    navigate(`/?c=${channel.id}`)
  }

  return (
    <div className="flex-1 flex flex-col bg-bg">
      <div className="h-14 flex items-center justify-between px-6 border-b border-border bg-surface">
        <h1 className="text-lg font-semibold text-text">Rooms & Groups</h1>
        <div className="flex gap-2">
          <button onClick={() => setShowJoin(true)} className="btn-ghost text-sm">Join Room</button>
          <button onClick={() => setShowCreate(true)} className="btn-primary text-sm">Create Room</button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto">
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[...Array(4)].map((_, i) => <div key={i} className="skeleton h-32" />)}
            </div>
          ) : myChannels.length === 0 ? (
            <div className="text-center py-20 text-text-muted">
              <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-primary/10 flex items-center justify-center">
                <svg className="w-10 h-10 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
              </div>
              <p className="text-lg mb-2">No rooms yet</p>
              <p className="text-sm mb-4">Create a room or join one with an invite code</p>
              <button onClick={() => setShowCreate(true)} className="btn-primary">Create Your First Room</button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {myChannels.map((ch) => (
                <motion.div
                  key={ch.id}
                  layout
                  whileHover={{ y: -2 }}
                  onClick={() => navigate(`/?c=${ch.id}`)}
                  className="card p-4 cursor-pointer hover:border-primary transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center text-primary text-xl font-bold flex-shrink-0">
                      {(ch.name || '?')[0]?.toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-text truncate">{ch.name}</h3>
                      <p className="text-sm text-text-muted truncate">{ch.description || 'No description'}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-xs text-text-muted">{relativeTime(ch.created_at)}</span>
                        {ch.invite_code && <span className="text-xs text-primary font-mono">Code: {ch.invite_code}</span>}
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Create room modal */}
      <AnimatePresence>
        {showCreate && (
          <Modal title="Create Room" onClose={() => setShowCreate(false)}>
            <div className="space-y-4">
              <div>
                <label className="text-sm text-text-muted">Room Name</label>
                <input value={newRoomName} onChange={(e) => setNewRoomName(e.target.value)} className="input mt-1" placeholder="Forest Explorers" autoFocus />
              </div>
              <div>
                <label className="text-sm text-text-muted">Description</label>
                <input value={newRoomDesc} onChange={(e) => setNewRoomDesc(e.target.value)} className="input mt-1" placeholder="A place to chat about forest adventures" />
              </div>
              <button onClick={createRoom} disabled={!newRoomName.trim()} className="btn-primary w-full disabled:opacity-50">Create Room</button>
            </div>
          </Modal>
        )}
      </AnimatePresence>

      {/* Join room modal */}
      <AnimatePresence>
        {showJoin && (
          <Modal title="Join Room" onClose={() => setShowJoin(false)}>
            <div className="space-y-4">
              <div>
                <label className="text-sm text-text-muted">Invite Code</label>
                <input
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  className="input mt-1 font-mono tracking-wider"
                  placeholder="FOREST01"
                  autoFocus
                />
              </div>
              <button onClick={joinRoom} disabled={!joinCode.trim()} className="btn-primary w-full disabled:opacity-50">Join Room</button>
            </div>
          </Modal>
        )}
      </AnimatePresence>
    </div>
  )
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/60 z-[200] flex items-center justify-center p-4" onClick={onClose}>
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="bg-surface border border-border rounded-2xl p-6 max-w-md w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-text">{title}</h2>
          <button onClick={onClose} className="text-text-muted hover:text-text">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        {children}
      </motion.div>
    </div>
  )
}
