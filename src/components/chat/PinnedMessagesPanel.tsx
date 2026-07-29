import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import { timestampLabel } from '@/lib/utils'
import type { Message, Profile } from '@/types'

interface PinnedMessagesPanelProps {
  channelId: string
  onClose: () => void
}

export function PinnedMessagesPanel({ channelId, onClose }: PinnedMessagesPanelProps) {
  const [pinnedMessages, setPinnedMessages] = useState<(Message & { author: Profile | null })[]>([])

  useEffect(() => {
    // For now, we show messages that have been reacted to with the pin emoji
    // In a full implementation, we'd have a pinned_messages table
    loadPinnedMessages()
  }, [channelId])

  async function loadPinnedMessages() {
    // Get messages with pin reactions
    const { data: reactions } = await supabase
      .from('reactions')
      .select('message_id')
      .eq('emoji', '📌')
      .order('created_at', { ascending: false })

    if (!reactions || reactions.length === 0) return

    const messageIds = reactions.map((r) => r.message_id)
    const { data: messages } = await supabase
      .from('messages')
      .select('*, author:app_users!messages_user_id_fkey(*)')
      .in('id', messageIds)
      .eq('chat_id', channelId)
      .is('deleted_at', null)

    if (messages) setPinnedMessages(messages as (Message & { author: Profile | null })[])
  }

  return (
    <motion.div
      initial={{ x: 300, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 300, opacity: 0 }}
      className="w-72 bg-surface border-l border-border flex flex-col flex-shrink-0"
    >
      <div className="h-14 flex items-center justify-between px-4 border-b border-border">
        <h3 className="font-semibold text-text">Pinned Messages</h3>
        <button onClick={onClose} className="text-text-muted hover:text-text">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {pinnedMessages.length === 0 ? (
          <div className="text-center py-8 text-text-muted">
            <p className="text-sm">No pinned messages</p>
            <p className="text-xs mt-1">React with 📌 to pin a message</p>
          </div>
        ) : (
          pinnedMessages.map((msg) => (
            <div key={msg.id} className="p-3 bg-bg rounded-lg">
              <div className="flex items-center gap-2 mb-1">
                {msg.author?.avatar_url ? (
                  <img src={msg.author.avatar_url} alt="" className="w-5 h-5 rounded-full" />
                ) : (
                  <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-xs text-primary">{(msg.author?.username || '?')[0]?.toUpperCase()}</div>
                )}
                <span className="text-xs font-medium text-text">{msg.author?.display_name || msg.author?.username}</span>
                <span className="text-xs text-text-muted">{timestampLabel(msg.created_at)}</span>
              </div>
              <p className="text-sm text-text-muted">{msg.content}</p>
            </div>
          ))
        )}
      </div>
    </motion.div>
  )
}
