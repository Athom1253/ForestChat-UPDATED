import { useState } from 'react'
import { X, Plus, Trash2, ChartBar as BarChart3, Send, Loader as Loader2 } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useStore } from '../lib/store'
import { createPoll, sendMessage } from '../lib/api'

interface PollCreatorProps {
  onClose: () => void
  onPollSent: (messageId: string) => void
}

export default function PollCreator({ onClose, onPollSent }: PollCreatorProps) {
  const currentUser = useStore((s) => s.currentUser)
  const activeChat = useStore((s) => s.activeChat)
  const appendMessages = useStore((s) => s.appendMessages)
  const [question, setQuestion] = useState('')
  const [options, setOptions] = useState(['', ''])
  const [allowMultiple, setAllowMultiple] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const addOption = () => {
    if (options.length >= 10) return
    setOptions((p) => [...p, ''])
  }

  const removeOption = (i: number) => {
    if (options.length <= 2) return
    setOptions((p) => p.filter((_, idx) => idx !== i))
  }

  const updateOption = (i: number, value: string) => {
    setOptions((p) => p.map((o, idx) => (idx === i ? value : o)))
  }

  const handleSend = async () => {
    if (!currentUser || !activeChat) return
    setError(null)
    const trimmedQ = question.trim()
    const trimmedOpts = options.map((o) => o.trim()).filter(Boolean)
    if (!trimmedQ) { setError('Please enter a question.'); return }
    if (trimmedOpts.length < 2) { setError('Please add at least 2 options.'); return }

    setSending(true)
    try {
      const poll = await createPoll(activeChat.id, currentUser.id, trimmedQ, trimmedOpts, allowMultiple)
      const pollContent = `📊 **${trimmedQ}**\n${trimmedOpts.map((o, i) => `${i + 1}. ${o}`).join('\n')}`
      const msg = await sendMessage(
        activeChat.id,
        currentUser.id,
        pollContent,
        undefined,
        undefined,
        'poll'
      )
      appendMessages(activeChat.id, [{ ...msg, reactions: [] }])
      console.log('[Poll] Created poll:', poll.id, 'Message:', msg.id)
      onPollSent(msg.id)
    } catch (e: any) {
      console.error('[Poll] Failed to send poll:', e)
      setError(e?.message || 'Failed to send poll. Please try again.')
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ type: 'spring', damping: 28, stiffness: 280 }}
        className="bg-bg-surface border border-border rounded-3xl shadow-2xl w-full max-w-md overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-accent" />
            <span className="font-bold text-text">Create Poll</span>
          </div>
          <button onClick={onClose} disabled={sending} className="p-1.5 rounded-xl hover:bg-bg-hover text-text-muted transition-all disabled:opacity-50">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Question */}
          <div>
            <label className="text-xs font-bold text-text-muted uppercase tracking-wide mb-1.5 block">Question</label>
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask a question..."
              rows={2}
              className="w-full px-3 py-2.5 text-sm rounded-2xl bg-bg border border-border text-text placeholder:text-text-muted focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 transition-all resize-none"
            />
          </div>

          {/* Options */}
          <div>
            <label className="text-xs font-bold text-text-muted uppercase tracking-wide mb-1.5 block">Options</label>
            <div className="space-y-2">
              {options.map((opt, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs text-text-muted w-5 text-center shrink-0">{i + 1}</span>
                  <input
                    type="text"
                    value={opt}
                    onChange={(e) => updateOption(i, e.target.value)}
                    placeholder={`Option ${i + 1}`}
                    className="flex-1 px-3 py-2 text-sm rounded-2xl bg-bg border border-border text-text placeholder:text-text-muted focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 transition-all"
                  />
                  <button
                    onClick={() => removeOption(i)}
                    disabled={options.length <= 2}
                    className="p-1.5 rounded-xl hover:bg-error-light text-text-muted hover:text-error transition-all disabled:opacity-30"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
            {options.length < 10 && (
              <button
                onClick={addOption}
                className="mt-2 flex items-center gap-1.5 text-xs text-accent hover:text-accent-hover transition-all px-1"
              >
                <Plus className="w-3.5 h-3.5" /> Add option
              </button>
            )}
          </div>

          {/* Multiple choice toggle */}
          <div
            className="flex items-center justify-between p-3 rounded-2xl bg-bg border border-border cursor-pointer"
            onClick={() => setAllowMultiple((v) => !v)}
          >
            <span className="text-sm text-text">Allow multiple answers</span>
            <div className={`w-10 h-5 rounded-full transition-all duration-300 ${allowMultiple ? 'bg-accent' : 'bg-bg-surface-2'}`}>
              <div className={`w-4 h-4 rounded-full bg-white shadow-sm mt-0.5 transition-all duration-300 ${allowMultiple ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </div>
          </div>

          {/* Error */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="px-3 py-2.5 rounded-2xl bg-error-light border border-error/20 text-error text-sm"
              >
                {error}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border">
          <button onClick={onClose} disabled={sending} className="px-4 py-2 rounded-xl text-sm text-text-muted hover:bg-bg-hover transition-all disabled:opacity-50">
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={sending || !question.trim() || options.filter((o) => o.trim()).length < 2}
            className="flex items-center gap-2 px-5 py-2 rounded-xl bg-accent text-white text-sm font-bold hover:bg-accent-hover transition-all shadow-sm disabled:opacity-40"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {sending ? 'Sending...' : 'Post Poll'}
          </button>
        </div>
      </motion.div>
    </div>
  )
}
