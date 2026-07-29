import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import { lastSeenLabel } from '@/lib/utils'
import type { Profile, ChannelMember } from '@/types'

interface MembersPanelProps {
  channelId: string
  onClose: () => void
}

export function MembersPanel({ channelId, onClose }: MembersPanelProps) {
  const [members, setMembers] = useState<(ChannelMember & { profile: Profile | null })[]>([])

  useEffect(() => {
    loadMembers()
  }, [channelId])

  async function loadMembers() {
    const { data, error } = await supabase
      .from('channel_members')
      .select('*, profile:profiles!channel_members_user_id_fkey(*)')
      .eq('channel_id', channelId)
      .order('joined_at', { ascending: true })

    if (!error && data) setMembers(data as (ChannelMember & { profile: Profile | null })[])
  }

  const online = members.filter((m) => m.profile?.status === 'online')
  const offline = members.filter((m) => m.profile?.status !== 'online')

  return (
    <motion.div
      initial={{ x: 300, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 300, opacity: 0 }}
      className="w-72 bg-surface border-l border-border flex flex-col flex-shrink-0"
    >
      <div className="h-14 flex items-center justify-between px-4 border-b border-border">
        <h3 className="font-semibold text-text">Members ({members.length})</h3>
        <button onClick={onClose} className="text-text-muted hover:text-text">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {online.length > 0 && (
          <div className="mb-4">
            <p className="text-xs text-text-muted uppercase font-semibold px-2 mb-1">Online — {online.length}</p>
            {online.map((m) => <MemberRow key={m.id} member={m} />)}
          </div>
        )}
        {offline.length > 0 && (
          <div>
            <p className="text-xs text-text-muted uppercase font-semibold px-2 mb-1">Offline — {offline.length}</p>
            {offline.map((m) => <MemberRow key={m.id} member={m} />)}
          </div>
        )}
        {members.length === 0 && <p className="text-sm text-text-muted text-center py-4">No members</p>}
      </div>
    </motion.div>
  )
}

function MemberRow({ member }: { member: ChannelMember & { profile: Profile | null } }) {
  const p = member.profile
  if (!p) return null
  return (
    <div className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-surface-hover">
      <div className="relative">
        {p.avatar_url ? (
          <img src={p.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" />
        ) : (
          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs font-bold">{p.username[0]?.toUpperCase()}</div>
        )}
        <div className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-surface ${p.status === 'online' ? 'bg-success' : p.status === 'away' ? 'bg-warning' : 'bg-text-muted/40'}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-text truncate">{p.display_name || p.username}</p>
        <p className="text-xs text-text-muted truncate">{p.status === 'online' ? 'Online' : lastSeenLabel(p.last_seen)}</p>
      </div>
      {member.role === 'owner' && <span className="text-xs text-accent">★</span>}
      {member.role === 'admin' && <span className="text-xs text-primary">⚡</span>}
    </div>
  )
}
