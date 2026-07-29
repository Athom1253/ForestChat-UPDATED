import { useState, useEffect, useCallback } from 'react'
import { X, Plus, Copy, Trash2, Ban, RefreshCw, Check, Calendar, Users, Hash, ChevronDown, ChevronUp, Shield } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { format } from 'date-fns'
import {
  listAllInviteCodes, createInviteCode, revokeInviteCode,
  deleteInviteCode, updateInviteCode,
} from '../lib/api'
import { useStore } from '../lib/store'
import type { InviteCode } from '../lib/types'

interface InviteManagementProps {
  onClose: () => void
}

export default function InviteManagement({ onClose }: InviteManagementProps) {
  const currentUser = useStore((s) => s.currentUser)
  const [codes, setCodes] = useState<InviteCode[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [error, setError] = useState('')

  // New invite form state
  const [newMaxUses, setNewMaxUses] = useState(1)
  const [newNote, setNewNote] = useState('')
  const [newExpiresAt, setNewExpiresAt] = useState('')
  const [newCustomCode, setNewCustomCode] = useState('')

  const loadCodes = useCallback(async () => {
    setLoading(true)
    try {
      const data = await listAllInviteCodes()
      setCodes(data)
    } catch (e) {
      setError('Failed to load invite codes.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadCodes() }, [loadCodes])

  const handleCreate = async () => {
    if (!currentUser) return
    setCreating(true)
    setError('')
    try {
      await createInviteCode(currentUser.id, {
        code: newCustomCode.trim() || undefined,
        maxUses: newMaxUses,
        expiresAt: newExpiresAt || null,
        note: newNote.trim() || undefined,
      })
      setNewMaxUses(1)
      setNewNote('')
      setNewExpiresAt('')
      setNewCustomCode('')
      setShowCreate(false)
      await loadCodes()
    } catch (e: any) {
      setError(e.message || 'Failed to create invite code.')
    } finally {
      setCreating(false)
    }
  }

  const handleCopy = (code: string, id: string) => {
    navigator.clipboard.writeText(code).catch(() => {
      const el = document.createElement('textarea')
      el.value = code
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
    })
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const handleRevoke = async (id: string) => {
    await revokeInviteCode(id)
    setCodes((prev) => prev.map((c) => c.id === id ? { ...c, is_active: false } : c))
  }

  const handleDelete = async (id: string) => {
    await deleteInviteCode(id)
    setCodes((prev) => prev.filter((c) => c.id !== id))
  }

  const handleReactivate = async (id: string) => {
    await updateInviteCode(id, { is_active: true })
    setCodes((prev) => prev.map((c) => c.id === id ? { ...c, is_active: true } : c))
  }

  const active = codes.filter((c) => c.is_active)
  const inactive = codes.filter((c) => !c.is_active)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ type: 'spring', damping: 28, stiffness: 280 }}
        className="bg-bg-surface border border-border rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2.5">
            <Shield className="w-5 h-5 text-accent" />
            <h2 className="font-bold text-text text-lg">Invite Management</h2>
            <span className="px-2 py-0.5 rounded-full bg-accent/10 text-accent text-xs font-bold">Admin</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={loadCodes} className="p-2 rounded-xl hover:bg-bg-hover text-text-muted transition-all" title="Refresh">
              <RefreshCw className="w-4 h-4" />
            </button>
            <button onClick={onClose} className="p-2 rounded-xl hover:bg-bg-hover text-text-muted transition-all">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
          {/* Error */}
          {error && (
            <div className="text-sm text-error bg-error-light px-3 py-2.5 rounded-xl border border-error/20">
              {error}
            </div>
          )}

          {/* Create new invite */}
          <div className="rounded-2xl border border-border bg-bg overflow-hidden">
            <button
              onClick={() => setShowCreate(!showCreate)}
              className="w-full flex items-center justify-between p-4 hover:bg-bg-hover transition-all"
            >
              <div className="flex items-center gap-2 font-bold text-text">
                <Plus className="w-4 h-4 text-accent" />
                Generate New Invite Code
              </div>
              {showCreate ? <ChevronUp className="w-4 h-4 text-text-muted" /> : <ChevronDown className="w-4 h-4 text-text-muted" />}
            </button>
            <AnimatePresence>
              {showCreate && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden border-t border-border"
                >
                  <div className="p-4 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-text-muted mb-1.5">Custom Code <span className="font-normal opacity-60">(optional)</span></label>
                        <input
                          type="text"
                          value={newCustomCode}
                          onChange={(e) => setNewCustomCode(e.target.value.toUpperCase())}
                          placeholder="AUTO-GENERATED"
                          className="w-full px-3 py-2.5 rounded-xl bg-bg-surface border border-border text-text placeholder:text-text-muted/50 text-sm font-mono focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 transition-all"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-text-muted mb-1.5">Max Uses</label>
                        <input
                          type="number"
                          min={1}
                          max={1000}
                          value={newMaxUses}
                          onChange={(e) => setNewMaxUses(Math.max(1, parseInt(e.target.value) || 1))}
                          className="w-full px-3 py-2.5 rounded-xl bg-bg-surface border border-border text-text text-sm focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 transition-all"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-text-muted mb-1.5">Expires (optional)</label>
                        <input
                          type="datetime-local"
                          value={newExpiresAt}
                          onChange={(e) => setNewExpiresAt(e.target.value)}
                          className="w-full px-3 py-2.5 rounded-xl bg-bg-surface border border-border text-text text-sm focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 transition-all"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-text-muted mb-1.5">Note (optional)</label>
                        <input
                          type="text"
                          value={newNote}
                          onChange={(e) => setNewNote(e.target.value)}
                          placeholder="e.g. For Alice"
                          className="w-full px-3 py-2.5 rounded-xl bg-bg-surface border border-border text-text placeholder:text-text-muted/50 text-sm focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 transition-all"
                        />
                      </div>
                    </div>
                    <button
                      onClick={handleCreate}
                      disabled={creating}
                      className="w-full py-2.5 rounded-xl bg-accent text-white font-bold text-sm hover:bg-accent-hover transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {creating
                        ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        : <><Plus className="w-4 h-4" /> Generate Code</>
                      }
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Active codes */}
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {active.length > 0 && (
                <div>
                  <div className="text-xs font-bold text-text-muted uppercase tracking-wide mb-2 px-1">
                    Active — {active.length}
                  </div>
                  <div className="space-y-2">
                    {active.map((code) => (
                      <InviteRow
                        key={code.id}
                        code={code}
                        copiedId={copiedId}
                        expandedId={expandedId}
                        onCopy={handleCopy}
                        onRevoke={handleRevoke}
                        onDelete={handleDelete}
                        onToggleExpand={(id) => setExpandedId(expandedId === id ? null : id)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {inactive.length > 0 && (
                <div>
                  <div className="text-xs font-bold text-text-muted uppercase tracking-wide mb-2 px-1">
                    Revoked / Exhausted — {inactive.length}
                  </div>
                  <div className="space-y-2">
                    {inactive.map((code) => (
                      <InviteRow
                        key={code.id}
                        code={code}
                        copiedId={copiedId}
                        expandedId={expandedId}
                        onCopy={handleCopy}
                        onRevoke={handleRevoke}
                        onDelete={handleDelete}
                        onReactivate={handleReactivate}
                        onToggleExpand={(id) => setExpandedId(expandedId === id ? null : id)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {codes.length === 0 && (
                <div className="text-center py-10 text-text-muted">
                  <Shield className="w-10 h-10 mx-auto mb-3 opacity-20" />
                  <p className="text-sm">No invite codes yet. Generate one above.</p>
                </div>
              )}
            </>
          )}
        </div>
      </motion.div>
    </div>
  )
}

function InviteRow({
  code,
  copiedId,
  expandedId,
  onCopy,
  onRevoke,
  onDelete,
  onReactivate,
  onToggleExpand,
}: {
  code: InviteCode
  copiedId: string | null
  expandedId: string | null
  onCopy: (code: string, id: string) => void
  onRevoke: (id: string) => void
  onDelete: (id: string) => void
  onReactivate?: (id: string) => void
  onToggleExpand: (id: string) => void
}) {
  const isExpanded = expandedId === code.id
  const isCopied = copiedId === code.id
  const isExhausted = code.uses_count >= code.max_uses
  const isExpired = code.expires_at ? new Date(code.expires_at) < new Date() : false
  const pct = Math.min((code.uses_count / code.max_uses) * 100, 100)

  return (
    <div className={`rounded-2xl border overflow-hidden transition-all ${
      code.is_active && !isExhausted && !isExpired
        ? 'border-border bg-bg'
        : 'border-border/40 bg-bg/50 opacity-70'
    }`}>
      <div className="flex items-center gap-3 p-3">
        {/* Code + usage */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <code className="text-sm font-bold font-mono text-text tracking-wider">{code.code}</code>
            {!code.is_active && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-error/10 text-error">REVOKED</span>}
            {isExhausted && code.is_active && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-warning/10 text-warning">USED UP</span>}
            {isExpired && code.is_active && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-warning/10 text-warning">EXPIRED</span>}
          </div>
          <div className="flex items-center gap-3 text-xs text-text-muted">
            <span className="flex items-center gap-1">
              <Users className="w-3 h-3" />
              {code.uses_count}/{code.max_uses} uses
            </span>
            {code.note && <span className="truncate text-text-muted/70">· {code.note}</span>}
            {code.expires_at && (
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {format(new Date(code.expires_at), 'MMM d')}
              </span>
            )}
          </div>
          {/* Usage bar */}
          <div className="mt-1.5 h-1 rounded-full bg-bg-surface-2 overflow-hidden">
            <div
              className="h-full rounded-full bg-accent transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => onCopy(code.code, code.id)}
            className="p-2 rounded-xl hover:bg-bg-hover text-text-muted hover:text-accent transition-all"
            title="Copy code"
          >
            {isCopied ? <Check className="w-4 h-4 text-accent" /> : <Copy className="w-4 h-4" />}
          </button>
          {code.redemptions && code.redemptions.length > 0 && (
            <button
              onClick={() => onToggleExpand(code.id)}
              className="p-2 rounded-xl hover:bg-bg-hover text-text-muted transition-all"
              title="Show redemptions"
            >
              <Hash className="w-4 h-4" />
            </button>
          )}
          {code.is_active ? (
            <button
              onClick={() => onRevoke(code.id)}
              className="p-2 rounded-xl hover:bg-error-light text-text-muted hover:text-error transition-all"
              title="Revoke"
            >
              <Ban className="w-4 h-4" />
            </button>
          ) : (
            onReactivate && (
              <button
                onClick={() => onReactivate(code.id)}
                className="p-2 rounded-xl hover:bg-accent/10 text-text-muted hover:text-accent transition-all"
                title="Reactivate"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            )
          )}
          <button
            onClick={() => onDelete(code.id)}
            className="p-2 rounded-xl hover:bg-error-light text-text-muted hover:text-error transition-all"
            title="Delete"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Redemption list */}
      <AnimatePresence>
        {isExpanded && code.redemptions && code.redemptions.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-border"
          >
            <div className="p-3 space-y-1">
              <div className="text-xs font-bold text-text-muted mb-2">Registered with this code:</div>
              {code.redemptions.map((r, i) => (
                <div key={i} className="flex items-center justify-between text-xs px-2 py-1.5 rounded-lg bg-bg-surface">
                  <span className="font-bold text-text">@{r.username}</span>
                  <span className="text-text-muted">{format(new Date(r.redeemed_at), 'MMM d, yyyy')}</span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
