import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { useState, useEffect } from 'react'
import type { Channel } from '@/types'

interface ChatTopBarProps {
  channel: Channel | null
  onSearch: () => void
  onMembers: () => void
  onPinned: () => void
  onSettings: () => void
  onCall: (type: 'voice' | 'video' | 'screen') => void
}

export function ChatTopBar({ channel, onSearch, onMembers, onPinned, onSettings, onCall }: ChatTopBarProps) {
  const { user } = useAuthStore()
  const [dmName, setDmName] = useState<string>('')
  const [dmStatus, setDmStatus] = useState<string>('')

  useEffect(() => {
    if (channel?.type === 'dm' && user) {
      loadDmInfo()
    } else {
      setDmName('')
      setDmStatus('')
    }
  }, [channel?.id, channel?.type, user?.id])

  async function loadDmInfo() {
    if (!channel || !user) return
    const { data: members } = await supabase
      .from('channel_members')
      .select('user_id')
      .eq('channel_id', channel.id)
      .neq('user_id', user.id)

    if (members && members.length > 0) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('username, display_name, status, last_seen')
        .eq('id', members[0].user_id)
        .maybeSingle()

      if (profile) {
        setDmName(profile.display_name || profile.username)
        setDmStatus(profile.status === 'online' ? 'Online' : profile.status === 'away' ? 'Away' : `Last seen ${new Date(profile.last_seen).toLocaleDateString()}`)
      }
    }
  }

  const displayName = channel?.type === 'dm' ? dmName : channel?.name || 'Unknown'

  return (
    <div className="h-14 flex items-center justify-between px-4 border-b border-border bg-surface flex-shrink-0">
      {/* Left: channel info */}
      <div className="flex items-center gap-3 min-w-0">
        {channel?.type === 'dm' ? (
          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary text-sm font-bold">
            {displayName[0]?.toUpperCase()}
          </div>
        ) : (
          <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
            {channel?.type === 'room' ? (
              <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
            ) : (
              <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
            )}
          </div>
        )}
        <div className="min-w-0">
          <h2 className="font-semibold text-text text-sm truncate">{displayName}</h2>
          {channel?.type === 'dm' && <p className="text-xs text-text-muted">{dmStatus}</p>}
          {channel?.type !== 'dm' && channel?.description && <p className="text-xs text-text-muted truncate">{channel.description}</p>}
        </div>
      </div>

      {/* Right: actions */}
      <div className="flex items-center gap-1">
        {/* Call buttons - WebRTC ready architecture */}
        <button onClick={() => onCall('voice')} className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-surface-hover text-text-muted hover:text-text transition-colors" title="Voice call">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
        </button>
        <button onClick={() => onCall('video')} className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-surface-hover text-text-muted hover:text-text transition-colors" title="Video call">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
        </button>
        <button onClick={() => onCall('screen')} className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-surface-hover text-text-muted hover:text-text transition-colors" title="Screen share">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" /></svg>
        </button>

        <div className="w-px h-6 bg-border mx-1" />

        <button onClick={onSearch} className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-surface-hover text-text-muted hover:text-text transition-colors" title="Search">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
        </button>
        <button onClick={onMembers} className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-surface-hover text-text-muted hover:text-text transition-colors" title="Members">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
        </button>
        <button onClick={onPinned} className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-surface-hover text-text-muted hover:text-text transition-colors" title="Pinned messages">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-6-4-6 4V5z" /></svg>
        </button>
        <button onClick={onSettings} className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-surface-hover text-text-muted hover:text-text transition-colors" title="Chat settings">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
        </button>
      </div>
    </div>
  )
}
