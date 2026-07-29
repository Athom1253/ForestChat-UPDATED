import { motion } from 'framer-motion'
import type { Channel } from '@/types'

interface ChatSettingsPanelProps {
  channel: Channel | null
  onClose: () => void
}

export function ChatSettingsPanel({ channel, onClose }: ChatSettingsPanelProps) {
  return (
    <motion.div
      initial={{ x: 300, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 300, opacity: 0 }}
      className="w-72 bg-surface border-l border-border flex flex-col flex-shrink-0"
    >
      <div className="h-14 flex items-center justify-between px-4 border-b border-border">
        <h3 className="font-semibold text-text">Chat Settings</h3>
        <button onClick={onClose} className="text-text-muted hover:text-text">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div>
          <label className="text-sm text-text-muted">Channel Name</label>
          <p className="text-text font-medium mt-1">{channel?.name || 'Direct Message'}</p>
        </div>
        <div>
          <label className="text-sm text-text-muted">Type</label>
          <p className="text-text font-medium mt-1 capitalize">{channel?.type}</p>
        </div>
        {channel?.description && (
          <div>
            <label className="text-sm text-text-muted">Description</label>
            <p className="text-text mt-1">{channel.description}</p>
          </div>
        )}
        {channel?.invite_code && (
          <div>
            <label className="text-sm text-text-muted">Invite Code</label>
            <div className="flex items-center gap-2 mt-1">
              <code className="px-2 py-1 bg-bg rounded text-sm text-primary font-mono">{channel.invite_code}</code>
              <button
                onClick={() => navigator.clipboard.writeText(channel.invite_code!)}
                className="text-text-muted hover:text-text"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
              </button>
            </div>
          </div>
        )}
        <div className="pt-4 border-t border-border">
          <p className="text-xs text-text-muted">Channel settings are managed by the channel owner.</p>
        </div>
      </div>
    </motion.div>
  )
}
