import { useState } from 'react'
import { motion } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import { timestampLabel } from '@/lib/utils'
import type { Message, Profile } from '@/types'

interface SearchPanelProps {
  channelId: string
  onClose: () => void
}

export function SearchPanel({ channelId, onClose }: SearchPanelProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<(Message & { author: Profile | null })[]>([])
  const [loading, setLoading] = useState(false)

  const search = async () => {
    if (!query.trim()) { setResults([]); return }
    setLoading(true)
    const { data, error } = await supabase
      .from('messages')
      .select('*, author:app_users!messages_user_id_fkey(*)')
      .eq('chat_id', channelId)
      .ilike('content', `%${query}%`)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(50)

    if (!error && data) setResults(data as (Message & { author: Profile | null })[])
    setLoading(false)
  }

  return (
    <motion.div
      initial={{ x: 300, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 300, opacity: 0 }}
      className="w-72 bg-surface border-l border-border flex flex-col flex-shrink-0"
    >
      <div className="h-14 flex items-center justify-between px-4 border-b border-border">
        <h3 className="font-semibold text-text">Search Messages</h3>
        <button onClick={onClose} className="text-text-muted hover:text-text">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>
      <div className="p-3">
        <div className="relative">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && search()}
            placeholder="Search messages..."
            className="input pl-9 text-sm"
            autoFocus
          />
          <svg className="absolute left-3 top-2.5 w-4 h-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-2 space-y-2">
        {loading && <p className="text-sm text-text-muted text-center py-4">Searching...</p>}
        {!loading && results.length === 0 && query && (
          <p className="text-sm text-text-muted text-center py-4">No results found</p>
        )}
        {results.map((msg) => (
          <div key={msg.id} className="p-3 bg-bg rounded-lg hover:bg-surface-hover cursor-pointer">
            <div className="flex items-center gap-2 mb-1">
              {msg.author?.avatar_url ? (
                <img src={msg.author.avatar_url} alt="" className="w-5 h-5 rounded-full" />
              ) : (
                <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-xs text-primary">{(msg.author?.username || '?')[0]?.toUpperCase()}</div>
              )}
              <span className="text-xs font-medium text-text">{msg.author?.display_name || msg.author?.username}</span>
              <span className="text-xs text-text-muted">{timestampLabel(msg.created_at)}</span>
            </div>
            <p className="text-sm text-text-muted line-clamp-2">{msg.content}</p>
          </div>
        ))}
      </div>
    </motion.div>
  )
}
