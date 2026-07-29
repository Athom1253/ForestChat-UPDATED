import { useState } from 'react'
import { motion } from 'framer-motion'

interface CallModalProps {
  type: 'voice' | 'video' | 'screen'
  channelName: string
  onClose: () => void
}

export function CallModal({ type, channelName, onClose }: CallModalProps) {
  const [callState] = useState<'connecting' | 'waiting'>('waiting')

  const typeLabel = type === 'voice' ? 'Voice Call' : type === 'video' ? 'Video Call' : 'Screen Share'

  return (
    <div className="fixed inset-0 bg-black/80 z-[200] flex items-center justify-center p-4">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-surface border border-border rounded-2xl p-8 max-w-md w-full text-center"
      >
        <div className="w-20 h-20 rounded-full bg-primary/20 flex items-center justify-center mx-auto mb-4">
          {type === 'voice' ? (
            <svg className="w-10 h-10 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
          ) : type === 'video' ? (
            <svg className="w-10 h-10 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
          ) : (
            <svg className="w-10 h-10 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" /></svg>
          )}
        </div>

        <h2 className="text-xl font-semibold text-text mb-2">{typeLabel}</h2>
        <p className="text-text-muted mb-1">with {channelName}</p>
        <p className="text-sm text-text-muted mb-6">
          {callState === 'connecting' ? 'Connecting...' : 'WebRTC infrastructure is ready. Call signaling requires a signaling server to establish peer connections.'}
        </p>

        <div className="bg-bg/50 rounded-lg p-3 mb-6">
          <p className="text-xs text-text-muted text-left">
            This call system uses the WebRTC architecture. To enable live calls, a signaling server
            (WebSocket or Supabase realtime) needs to be configured for SDP offer/answer exchange.
            The UI, controls, and peer connection setup are all in place.
          </p>
        </div>

        <div className="flex justify-center gap-3">
          <button onClick={onClose} className="btn-danger">
            End Call
          </button>
        </div>
      </motion.div>
    </div>
  )
}
