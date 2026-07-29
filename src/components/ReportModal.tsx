import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

interface ReportModalProps {
  messageId: string
  chatId: string
  onClose: () => void
}

const REASONS = [
  { id: 'spam', label: 'Spam or scam', icon: '🚫' },
  { id: 'harassment', label: 'Harassment or bullying', icon: '😠' },
  { id: 'hate', label: 'Hate speech', icon: '💢' },
  { id: 'nsfw', label: 'Inappropriate / NSFW', icon: '🔞' },
  { id: 'violence', label: 'Violence or harm', icon: '⚠️' },
  { id: 'other', label: 'Other', icon: '📋' },
]

export default function ReportModal({ messageId, chatId, onClose }: ReportModalProps) {
  const [visible, setVisible] = useState(false)
  const [reason, setReason] = useState<string | null>(null)
  const [details, setDetails] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true))
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, submitting])

  const handleSubmit = async () => {
    if (!reason || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const fullReason = details.trim()
        ? `${REASONS.find((r) => r.id === reason)?.label || reason}: ${details.trim()}`
        : REASONS.find((r) => r.id === reason)?.label || reason
      const { error: rpcError } = await supabase.rpc('admin_create_report', {
        p_content_type: 'message',
        p_content_id: messageId,
        p_chat_id: chatId,
        p_reason: fullReason,
      })
      if (rpcError) throw rpcError
      onClose()
    } catch (err) {
      console.error('Failed to submit report:', err)
      setError('Failed to submit report. Please try again.')
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className={`absolute inset-0 bg-black/60 transition-opacity duration-200 ${visible ? 'opacity-100' : 'opacity-0'}`}
        onClick={() => !submitting && onClose()}
      />
      <div
        className={`relative bg-night-900 border border-night-800 rounded-2xl shadow-2xl w-full max-w-md transition-all duration-200 ${visible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-night-800">
          <h3 className="text-lg font-semibold text-night-50 flex items-center gap-2">
            <FlagIcon />
            Report Message
          </h3>
          <button
            onClick={() => !submitting && onClose()}
            disabled={submitting}
            className="p-1.5 rounded-lg text-night-400 hover:text-night-100 hover:bg-night-800 transition-colors disabled:opacity-50"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-sm text-night-400">
            Help us understand what's wrong with this message. Our moderators will review your report.
          </p>

          <div className="space-y-2">
            <label className="text-xs font-medium text-night-300 uppercase tracking-wide">
              Reason
            </label>
            <div className="grid grid-cols-1 gap-2">
              {REASONS.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setReason(r.id)}
                  disabled={submitting}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-all duration-150 disabled:opacity-50 ${reason === r.id ? 'border-forest-400 bg-forest-950/40' : 'border-night-700 bg-night-800 hover:bg-night-700 hover:border-night-600'}`}
                >
                  <span className="text-lg flex-shrink-0">{r.icon}</span>
                  <span className={`text-sm font-medium ${reason === r.id ? 'text-forest-100' : 'text-night-200'}`}>
                    {r.label}
                  </span>
                  {reason === r.id && (
                    <span className="ml-auto">
                      <CheckIcon />
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-night-300 uppercase tracking-wide">
              Additional details (optional)
            </label>
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              disabled={submitting}
              rows={3}
              placeholder="Provide more context about the issue..."
              className="w-full px-3 py-2 text-sm text-night-100 bg-night-950 border border-night-700 rounded-lg resize-none focus:outline-none focus:border-forest-500 focus:ring-1 focus:ring-forest-500 transition-colors placeholder:text-night-500 disabled:opacity-50"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-950/40 border border-red-800/60 text-red-300 text-sm animate-fade-in">
              <AlertIcon />
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-1">
            <button
              onClick={() => !submitting && onClose()}
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-night-300 hover:text-night-100 bg-night-800 hover:bg-night-700 rounded-lg transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={!reason || submitting}
              className="px-5 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-500 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {submitting ? (
                <>
                  <SpinnerIcon />
                  Submitting...
                </>
              ) : (
                <>
                  <FlagIcon />
                  Submit Report
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function FlagIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" y1="22" x2="4" y2="15" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-forest-400">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

function AlertIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  )
}

function SpinnerIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-spin">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  )
}
