import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Shield, Users, MessageSquare, ChartBar as BarChart3, FileText, Megaphone, Bell, Search, Trash2, Ban, RotateCcw, Power, UserCog, ArrowUpRight, ArrowDownRight, LogOut, Eye, EyeOff, Crown, TriangleAlert as AlertTriangle, CircleCheck as CheckCircle, X, Download, Send, MessageCircle, Activity, TrendingUp, ChevronLeft, ClipboardList, Scissors, UserX, UserCheck, Clock, Inbox } from 'lucide-react'
import { useStore } from '../lib/store'
import {
  adminGetAllUsers, adminDisableUser, adminEnableUser, adminSuspendUser,
  adminDeleteUser, adminResetUserProfile, adminPromoteUser, adminDemoteUser,
  adminForceSignOut, adminGetSignInActivity, adminGetAllChats, adminJoinChat,
  adminDeleteChat, adminRemoveFromChat, adminTransferOwnership,
  adminGetDeletedMessages, adminDeleteMessage, adminRestoreMessage, adminGetReports, adminResolveReport,
  adminGetAuditLog, adminExportAuditLog, adminGetNotes, adminAddNote, adminDeleteNote,
  adminGetAnnouncements, adminCreateAnnouncement, adminDeleteAnnouncement,
  adminSendNotification, adminGetStats, adminGlobalSearch,
  startImpersonation, stopImpersonation,
} from '../lib/adminApi'
import { getChatMembers, listAllInviteCodes, createInviteCode, revokeInviteCode, deleteInviteCode } from '../lib/api'
import type {
  AdminUser, AdminChat, DeletedMessage, AdminReport, AdminNote,
  AdminAnnouncement, AdminAuditLog, AdminStats, AdminGlobalSearchResult,
} from '../lib/types'

type Tab = 'overview' | 'users' | 'chats' | 'messages' | 'reports' | 'logs' | 'invites' | 'broadcast' | 'search'

export default function AdminDashboard() {
  const navigate = useNavigate()
  const currentUser = useStore((s) => s.currentUser)
  const [tab, setTab] = useState<Tab>('overview')
  const [showImpersonationBanner, setShowImpersonationBanner] = useState(false)

  useEffect(() => {
    if (!currentUser?.is_admin) navigate('/chat')
  }, [currentUser, navigate])

  if (!currentUser?.is_admin) return null

  const tabs: { id: Tab; label: string; icon: typeof Shield }[] = [
    { id: 'overview', label: 'Overview', icon: BarChart3 },
    { id: 'users', label: 'Users', icon: Users },
    { id: 'chats', label: 'Chats', icon: MessageSquare },
    { id: 'messages', label: 'Messages', icon: FileText },
    { id: 'reports', label: 'Reports', icon: AlertTriangle },
    { id: 'logs', label: 'Audit Log', icon: ClipboardList },
    { id: 'invites', label: 'Invites', icon: Inbox },
    { id: 'broadcast', label: 'Broadcast', icon: Megaphone },
    { id: 'search', label: 'Search', icon: Search },
  ]

  return (
    <div className="min-h-screen bg-bg-base text-text flex">
      {/* Sidebar */}
      <div className="w-60 bg-bg-surface border-r border-border flex flex-col shrink-0">
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Shield className="w-6 h-6 text-accent" />
            <div>
              <h1 className="font-bold text-sm">Admin Panel</h1>
              <p className="text-xs text-text-muted">{currentUser.username}</p>
            </div>
          </div>
        </div>
        <nav className="flex-1 p-2 space-y-0.5">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                tab === t.id ? 'bg-accent/15 text-accent font-semibold' : 'text-text-muted hover:bg-bg-hover hover:text-text'
              }`}
            >
              <t.icon className="w-4 h-4" />
              {t.label}
            </button>
          ))}
        </nav>
        <div className="p-3 border-t border-border space-y-1">
          <button
            onClick={() => navigate('/chat')}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-text-muted hover:bg-bg-hover hover:text-text transition-colors"
          >
            <ChevronLeft className="w-4 h-4" /> Back to Chat
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-5xl mx-auto p-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15 }}
            >
              {tab === 'overview' && <OverviewTab />}
              {tab === 'users' && <UsersTab />}
              {tab === 'chats' && <ChatsTab />}
              {tab === 'messages' && <MessagesTab />}
              {tab === 'reports' && <ReportsTab />}
              {tab === 'logs' && <LogsTab />}
              {tab === 'invites' && <InvitesTab />}
              {tab === 'broadcast' && <BroadcastTab />}
              {tab === 'search' && <SearchTab />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}

// ── Reusable confirm dialog ──
function ConfirmDialog({
  open, title, message, confirmLabel, onConfirm, onCancel, danger,
}: {
  open: boolean; title: string; message: string; confirmLabel: string
  onConfirm: () => void; onCancel: () => void; danger?: boolean
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onCancel}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-bg-surface rounded-2xl border border-border p-6 max-w-sm w-full mx-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-bold text-lg mb-2">{title}</h3>
        <p className="text-sm text-text-muted mb-4">{message}</p>
        <div className="flex gap-2 justify-end">
          <button onClick={onCancel} className="px-4 py-2 rounded-lg text-sm bg-bg-hover hover:bg-border transition-colors">Cancel</button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 rounded-lg text-sm font-semibold text-white transition-colors ${
              danger ? 'bg-error hover:bg-error/80' : 'bg-accent hover:bg-accent/80'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </motion.div>
    </div>
  )
}

// ── Toast hook ──
function useAdminToast() {
  const addToast = useStore((s) => s.addToast)
  return useCallback((msg: string, type: 'success' | 'error' | 'info' = 'success') => {
    addToast(msg, type)
  }, [addToast])
}

// ── Overview Tab ──
function OverviewTab() {
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    adminGetStats().then((s) => { setStats(s); setLoading(false) })
  }, [])

  if (loading) return <div className="text-text-muted">Loading statistics...</div>
  if (!stats) return <div className="text-error">Failed to load statistics.</div>

  const cards = [
    { label: 'Total Users', value: stats.total_users, icon: Users, color: 'text-blue-500' },
    { label: 'Active (24h)', value: stats.active_users_24h, icon: TrendingUp, color: 'text-green-500' },
    { label: 'Total Chats', value: stats.total_chats, icon: MessageSquare, color: 'text-purple-500' },
    { label: 'Total Messages', value: stats.total_messages, icon: FileText, color: 'text-orange-500' },
    { label: 'Groups', value: stats.total_groups, icon: Users, color: 'text-teal-500' },
    { label: 'DMs', value: stats.total_dms, icon: MessageCircle, color: 'text-pink-500' },
    { label: 'Disabled', value: stats.disabled_users, icon: Ban, color: 'text-red-500' },
    { label: 'Suspended', value: stats.suspended_users, icon: Clock, color: 'text-amber-500' },
    { label: 'Open Reports', value: stats.open_reports, icon: AlertTriangle, color: 'text-red-500' },
    { label: 'Deleted Msgs', value: stats.deleted_messages, icon: Trash2, color: 'text-gray-500' },
  ]

  return (
    <div>
      <h2 className="text-xl font-bold mb-4">App Statistics</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-8">
        {cards.map((c) => (
          <div key={c.label} className="bg-bg-surface rounded-xl border border-border p-4">
            <c.icon className={`w-5 h-5 mb-2 ${c.color}`} />
            <div className="text-2xl font-bold">{c.value.toLocaleString()}</div>
            <div className="text-xs text-text-muted">{c.label}</div>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <ChartCard title="Daily Active Users" data={stats.daily_active} color="#3b82f6" />
        <ChartCard title="Messages per Day" data={stats.messages_per_day} color="#f97316" />
        <ChartCard title="New Users per Day" data={stats.new_users_per_day} color="#10b981" />
      </div>
    </div>
  )
}

function ChartCard({ title, data, color }: { title: string; data: { date: string; count: number }[]; color: string }) {
  const max = Math.max(...data.map((d) => d.count), 1)
  const total = data.reduce((sum, d) => sum + d.count, 0)
  const recent = data.slice(-7).reduce((sum, d) => sum + d.count, 0)
  const prev = data.slice(-14, -7).reduce((sum, d) => sum + d.count, 0)
  const trend = prev > 0 ? ((recent - prev) / prev) * 100 : 0

  return (
    <div className="bg-bg-surface rounded-xl border border-border p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">{title}</h3>
        {trend !== 0 && (
          <span className={`text-xs flex items-center gap-0.5 ${trend > 0 ? 'text-success' : 'text-error'}`}>
            {trend > 0 ? '↑' : '↓'} {Math.abs(Math.round(trend))}%
          </span>
        )}
      </div>
      <div className="flex items-end gap-1 h-32">
        {data.map((d, i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-1 group relative">
            <motion.div
              initial={{ height: 0 }}
              animate={{ height: `${(d.count / max) * 100}%` }}
              transition={{ duration: 0.4, delay: i * 0.02, ease: 'easeOut' }}
              className="w-full rounded-t transition-all hover:opacity-80 cursor-pointer"
              style={{ backgroundColor: color, minHeight: '2px' }}
            />
            <div className="absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 bg-bg-sidebar border border-border rounded-lg px-2 py-1 text-xs whitespace-nowrap pointer-events-none transition-opacity z-10 shadow-sm">
              {d.count} · {d.date.slice(5)}
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between mt-2">
        <span className="text-xs text-text-muted">{data.length} days</span>
        <span className="text-xs font-semibold text-text">{total.toLocaleString()} total</span>
      </div>
    </div>
  )
}

// ── Users Tab ──
function UsersTab() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'admin' | 'disabled' | 'suspended' | 'active'>('all')
  const [sortBy, setSortBy] = useState<'created_at' | 'username' | 'last_seen'>('created_at')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null)
  const [confirm, setConfirm] = useState<{ action: string; userId: string; label: string; danger: boolean } | null>(null)
  const toast = useAdminToast()

  const load = useCallback(() => {
    setLoading(true)
    adminGetAllUsers().then((u) => { setUsers(u); setLoading(false) })
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = useMemo(() => {
    let result = [...users]
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(u => u.username.toLowerCase().includes(q) || (u.display_name ?? '').toLowerCase().includes(q))
    }
    if (filter === 'admin') result = result.filter(u => u.is_admin)
    else if (filter === 'disabled') result = result.filter(u => u.is_disabled)
    else if (filter === 'suspended') result = result.filter(u => u.is_suspended)
    else if (filter === 'active') result = result.filter(u => !u.is_disabled && !u.is_suspended)
    result.sort((a, b) => {
      let cmp = 0
      if (sortBy === 'username') cmp = a.username.localeCompare(b.username)
      else if (sortBy === 'last_seen') cmp = (a.last_seen ?? '').localeCompare(b.last_seen ?? '')
      else cmp = (a.created_at ?? '').localeCompare(b.created_at ?? '')
      return sortDir === 'asc' ? cmp : -cmp
    })
    return result
  }, [users, search, filter, sortBy, sortDir])

  const handleAction = async (action: string, userId: string) => {
    try {
      switch (action) {
        case 'disable': await adminDisableUser(userId); break
        case 'enable': await adminEnableUser(userId); break
        case 'suspend': await adminSuspendUser(userId, new Date(Date.now() + 7 * 86400000).toISOString()); break
        case 'delete': await adminDeleteUser(userId); break
        case 'reset': await adminResetUserProfile(userId); break
        case 'promote': await adminPromoteUser(userId); break
        case 'demote': await adminDemoteUser(userId); break
        case 'signout': await adminForceSignOut(userId); break
        case 'impersonate': {
          const u = users.find(x => x.id === userId)
          if (u) { startImpersonation(u); toast('Now viewing as ' + u.username, 'info'); return }
          break
        }
      }
      toast(`${action} succeeded`)
      load()
    } catch (e: any) {
      toast(e.message || 'Action failed', 'error')
    }
  }

  return (
    <div>
      <h2 className="text-xl font-bold mb-4">User Management</h2>
      <div className="flex flex-wrap gap-2 mb-4">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search users..."
          className="flex-1 min-w-40 px-3 py-2 rounded-lg bg-bg-surface border border-border text-sm focus:border-accent outline-none"
        />
        <select value={filter} onChange={(e) => setFilter(e.target.value as any)}
          className="px-3 py-2 rounded-lg bg-bg-surface border border-border text-sm">
          <option value="all">All</option>
          <option value="active">Active</option>
          <option value="admin">Admins</option>
          <option value="disabled">Disabled</option>
          <option value="suspended">Suspended</option>
        </select>
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)}
          className="px-3 py-2 rounded-lg bg-bg-surface border border-border text-sm">
          <option value="created_at">Sort: Joined</option>
          <option value="username">Sort: Username</option>
          <option value="last_seen">Sort: Last Seen</option>
        </select>
        <button onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}
          className="px-3 py-2 rounded-lg bg-bg-surface border border-border text-sm">
          {sortDir === 'asc' ? '↑' : '↓'}
        </button>
      </div>

      {loading ? (
        <div className="text-text-muted">Loading users...</div>
      ) : (
        <div className="space-y-1.5">
          {filtered.map((u) => (
            <div key={u.id} className="flex items-center gap-3 p-3 rounded-lg bg-bg-surface border border-border hover:border-accent/30 transition-colors">
              <img src={u.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.username}`}
                className="w-10 h-10 rounded-full bg-bg-hover" alt="" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm truncate">{u.display_name || u.username}</span>
                  {u.is_admin && <Crown className="w-3.5 h-3.5 text-amber-500" />}
                  {u.is_disabled && <span className="text-xs px-1.5 py-0.5 rounded bg-error/15 text-error">Disabled</span>}
                  {u.is_suspended && <span className="text-xs px-1.5 py-0.5 rounded bg-warning/15 text-warning">Suspended</span>}
                </div>
                <div className="text-xs text-text-muted">@{u.username} · {u.last_seen ? new Date(u.last_seen).toLocaleDateString() : '—'}</div>
              </div>
              <button onClick={() => setSelectedUser(u)}
                className="px-3 py-1.5 rounded-lg bg-bg-hover hover:bg-border text-xs transition-colors">Manage</button>
            </div>
          ))}
          {filtered.length === 0 && <div className="text-text-muted text-center py-8">No users found</div>}
        </div>
      )}

      {/* User detail modal */}
      <AnimatePresence>
        {selectedUser && (
          <UserDetailModal
            user={selectedUser}
            onClose={() => setSelectedUser(null)}
            onAction={(action, userId, label, danger) => setConfirm({ action, userId, label, danger })}
          />
        )}
      </AnimatePresence>

      {/* Confirm dialog */}
      <ConfirmDialog
        open={!!confirm}
        title="Confirm Action"
        message={`Are you sure you want to ${confirm?.label ?? ''}? This action will be logged.`}
        confirmLabel={confirm?.label ?? ''}
        danger={confirm?.danger}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          if (confirm) handleAction(confirm.action, confirm.userId)
          setConfirm(null)
        }}
      />
    </div>
  )
}

function UserDetailModal({
  user, onClose, onAction,
}: {
  user: AdminUser; onClose: () => void
  onAction: (action: string, userId: string, label: string, danger: boolean) => void
}) {
  const [notes, setNotes] = useState<AdminNote[]>([])
  const [newNote, setNewNote] = useState('')
  const [signInActivity, setSignInActivity] = useState<{ id: string; created_at: string }[]>([])
  const toast = useAdminToast()

  useEffect(() => {
    adminGetNotes(user.id).then(setNotes).catch(() => {})
    adminGetSignInActivity(user.id).then((a) => setSignInActivity(a)).catch(() => {})
  }, [user.id])

  const addNote = async () => {
    if (!newNote.trim()) return
    try {
      await adminAddNote(user.id, newNote.trim())
      setNewNote('')
      setNotes(await adminGetNotes(user.id))
      toast('Note added')
    } catch (e: any) { toast(e.message, 'error') }
  }

  const deleteNote = async (id: string) => {
    await adminDeleteNote(id)
    setNotes(await adminGetNotes(user.id))
  }

  const actions = [
    { action: 'impersonate', label: 'Login as User', icon: Eye, danger: false },
    { action: 'promote', label: 'Promote to Admin', icon: ArrowUpRight, danger: false, show: !user.is_admin },
    { action: 'demote', label: 'Demote from Admin', icon: ArrowDownRight, danger: false, show: user.is_admin },
    { action: 'signout', label: 'Force Sign Out', icon: Power, danger: false },
    { action: 'reset', label: 'Reset Profile', icon: RotateCcw, danger: true },
    { action: 'suspend', label: 'Suspend (7 days)', icon: Clock, danger: true, show: !user.is_suspended && !user.is_disabled },
    { action: 'enable', label: 'Restore Account', icon: UserCheck, danger: false, show: user.is_disabled || user.is_suspended },
    { action: 'disable', label: 'Disable Account', icon: Ban, danger: true, show: !user.is_disabled },
    { action: 'delete', label: 'Permanently Delete', icon: Trash2, danger: true },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-bg-surface rounded-2xl border border-border p-6 max-w-lg w-full mx-4 shadow-2xl max-h-[85vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-4 mb-4">
          <img src={user.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.username}`}
            className="w-16 h-16 rounded-full bg-bg-hover" alt="" />
          <div className="flex-1">
            <h3 className="font-bold text-lg">{user.display_name || user.username}</h3>
            <p className="text-sm text-text-muted">@{user.username}</p>
            <div className="flex gap-1.5 mt-1">
              {user.is_admin && <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-500">Admin</span>}
              {user.is_disabled && <span className="text-xs px-1.5 py-0.5 rounded bg-error/15 text-error">Disabled</span>}
              {user.is_suspended && <span className="text-xs px-1.5 py-0.5 rounded bg-warning/15 text-warning">Suspended</span>}
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-bg-hover"><X className="w-5 h-5" /></button>
        </div>

        {/* Actions */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          {actions.filter(a => a.show !== false).map((a) => (
            <button
              key={a.action}
              onClick={() => onAction(a.action, user.id, a.label, a.danger)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                a.danger ? 'bg-error/10 text-error hover:bg-error/20' : 'bg-bg-hover hover:bg-border'
              }`}
            >
              <a.icon className="w-4 h-4" /> {a.label}
            </button>
          ))}
        </div>

        {/* Sign-in activity */}
        {signInActivity.length > 0 && (
          <div className="mb-4">
            <h4 className="text-xs font-semibold text-text-muted mb-2">Recent Sign-ins</h4>
            <div className="space-y-1 max-h-28 overflow-auto">
              {signInActivity.slice(0, 5).map((a) => (
                <div key={a.id} className="text-xs text-text-muted flex items-center gap-2">
                  <Activity className="w-3 h-3" /> {new Date(a.created_at).toLocaleString()}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Admin notes */}
        <div>
          <h4 className="text-xs font-semibold text-text-muted mb-2">Admin Notes (private)</h4>
          <div className="space-y-1.5 mb-2 max-h-32 overflow-auto">
            {notes.map((n) => (
              <div key={n.id} className="flex items-start gap-2 p-2 rounded-lg bg-bg-hover text-sm">
                <span className="flex-1">{n.note}</span>
                <button onClick={() => deleteNote(n.id)} className="text-text-muted hover:text-error"><X className="w-3.5 h-3.5" /></button>
              </div>
            ))}
            {notes.length === 0 && <div className="text-xs text-text-muted">No notes yet</div>}
          </div>
          <div className="flex gap-2">
            <input
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addNote()}
              placeholder="Add a private note..."
              className="flex-1 px-3 py-1.5 rounded-lg bg-bg-hover border border-border text-sm focus:border-accent outline-none"
            />
            <button onClick={addNote} className="px-3 py-1.5 rounded-lg bg-accent text-white text-sm">Add</button>
          </div>
        </div>
      </motion.div>
    </div>
  )
}

// ── Chats Tab ──
function ChatsTab() {
  const [chats, setChats] = useState<AdminChat[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'group' | 'dm'>('all')
  const [confirm, setConfirm] = useState<{ chatId: string; name: string } | null>(null)
  const [selectedChat, setSelectedChat] = useState<AdminChat | null>(null)
  const toast = useAdminToast()

  const load = useCallback(() => {
    setLoading(true)
    adminGetAllChats().then((c) => { setChats(c); setLoading(false) })
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = chats.filter(c => filter === 'all' || c.type === filter)

  const handleDelete = async () => {
    if (!confirm) return
    try {
      await adminDeleteChat(confirm.chatId)
      toast('Chat deleted')
      load()
    } catch (e: any) { toast(e.message, 'error') }
    setConfirm(null)
  }

  const handleJoin = async (chatId: string) => {
    try {
      await adminJoinChat(chatId)
      toast('Joined chat for moderation')
    } catch (e: any) { toast(e.message, 'error') }
  }

  return (
    <div>
      <h2 className="text-xl font-bold mb-4">Chat Management</h2>
      <div className="flex gap-2 mb-4">
        {(['all', 'group', 'dm'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-sm capitalize ${filter === f ? 'bg-accent text-white' : 'bg-bg-surface border border-border'}`}>
            {f === 'dm' ? 'DMs' : f + 's'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-text-muted">Loading chats...</div>
      ) : (
        <div className="space-y-1.5">
          {filtered.map((c) => (
            <div key={c.id} className="flex items-center gap-3 p-3 rounded-lg bg-bg-surface border border-border">
              <div className="w-10 h-10 rounded-lg bg-accent/15 flex items-center justify-center">
                <MessageSquare className="w-5 h-5 text-accent" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm truncate">{c.name}</div>
                <div className="text-xs text-text-muted capitalize">{c.type} · {c.member_count} members</div>
              </div>
              <button onClick={() => handleJoin(c.id)}
                className="px-3 py-1.5 rounded-lg bg-bg-hover hover:bg-border text-xs">Join</button>
              <button onClick={() => setSelectedChat(c)}
                className="px-3 py-1.5 rounded-lg bg-bg-hover hover:bg-border text-xs">Manage</button>
              <button onClick={() => setConfirm({ chatId: c.id, name: c.name })}
                className="px-3 py-1.5 rounded-lg bg-error/10 text-error hover:bg-error/20 text-xs">Delete</button>
            </div>
          ))}
          {filtered.length === 0 && <div className="text-text-muted text-center py-8">No chats found</div>}
        </div>
      )}

      <AnimatePresence>
        {selectedChat && (
          <ChatDetailModal chat={selectedChat} onClose={() => setSelectedChat(null)} onReload={load} />
        )}
      </AnimatePresence>

      <ConfirmDialog
        open={!!confirm}
        title="Delete Chat"
        message={`Permanently delete "${confirm?.name}"? All messages will be lost.`}
        confirmLabel="Delete"
        danger
        onCancel={() => setConfirm(null)}
        onConfirm={handleDelete}
      />
    </div>
  )
}

function ChatDetailModal({ chat, onClose, onReload }: { chat: AdminChat; onClose: () => void; onReload: () => void }) {
  const [members, setMembers] = useState<{ id: string; username: string; display_name: string | null; _role?: string }[]>([])
  const [transferTarget, setTransferTarget] = useState('')
  const toast = useAdminToast()

  useEffect(() => {
    getChatMembers(chat.id).then((m) => setMembers(m as any)).catch(() => {})
  }, [chat.id])

  const handleRemove = async (userId: string) => {
    try {
      await adminRemoveFromChat(chat.id, userId)
      setMembers(m => m.filter(x => x.id !== userId))
      toast('User removed')
    } catch (e: any) { toast(e.message, 'error') }
  }

  const handleTransfer = async () => {
    if (!transferTarget) return
    try {
      await adminTransferOwnership(chat.id, transferTarget)
      toast('Ownership transferred')
      setTransferTarget('')
      onReload()
    } catch (e: any) { toast(e.message, 'error') }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-bg-surface rounded-2xl border border-border p-6 max-w-md w-full mx-4 shadow-2xl max-h-[80vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-lg">{chat.name}</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-bg-hover"><X className="w-5 h-5" /></button>
        </div>

        <h4 className="text-xs font-semibold text-text-muted mb-2">Members ({members.length})</h4>
        <div className="space-y-1.5 mb-4">
          {members.map((m) => (
            <div key={m.id} className="flex items-center gap-2 p-2 rounded-lg bg-bg-hover">
              <span className="flex-1 text-sm">{m.display_name || m.username} {m._role === 'owner' && <Crown className="inline w-3 h-3 text-amber-500" />}</span>
              {m._role !== 'owner' && (
                <button onClick={() => handleRemove(m.id)}
                  className="text-xs text-error hover:underline">Remove</button>
              )}
              {m._role !== 'owner' && (
                <button onClick={() => setTransferTarget(m.id)}
                  className="text-xs text-accent hover:underline">Make Owner</button>
              )}
            </div>
          ))}
        </div>

        {transferTarget && (
          <div className="flex gap-2 mb-2">
            <span className="text-sm text-text-muted">Transfer ownership to {members.find(m => m.id === transferTarget)?.username}?</span>
            <button onClick={handleTransfer} className="text-xs px-2 py-1 rounded bg-accent text-white">Confirm</button>
            <button onClick={() => setTransferTarget('')} className="text-xs px-2 py-1 rounded bg-bg-hover">Cancel</button>
          </div>
        )}
      </motion.div>
    </div>
  )
}

// ── Messages Tab (soft-deleted) ──
function MessagesTab() {
  const [messages, setMessages] = useState<DeletedMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [confirm, setConfirm] = useState<string | null>(null)
  const toast = useAdminToast()

  const load = useCallback(() => {
    setLoading(true)
    adminGetDeletedMessages().then((m) => { setMessages(m); setLoading(false) })
  }, [])

  useEffect(() => { load() }, [load])

  const handlePurge = async () => {
    if (!confirm) return
    try {
      await adminDeleteMessage(confirm)
      toast('Message permanently deleted')
      load()
    } catch (e: any) { toast(e.message, 'error') }
    setConfirm(null)
  }

  const handleRestore = async (id: string) => {
    try {
      await adminRestoreMessage(id)
      toast('Message restored successfully')
      load()
    } catch (e: any) { toast(e.message, 'error') }
  }

  return (
    <div>
      <h2 className="text-xl font-bold mb-4">Deleted Messages</h2>
      <p className="text-sm text-text-muted mb-4">Messages soft-deleted by users. Permanently remove to clear them.</p>
      {loading ? (
        <div className="text-text-muted">Loading...</div>
      ) : (
        <div className="space-y-1.5">
          {messages.map((m) => (
            <div key={m.id} className="flex items-start gap-3 p-3 rounded-lg bg-bg-surface border border-border">
              <div className="flex-1 min-w-0">
                <div className="text-sm">
                  <span className="text-text-muted">Content:</span>{' '}
                  <span className="line-through opacity-60">{m.content || '[empty]'}</span>
                </div>
                <div className="text-xs text-text-muted mt-1">
                  By {m.user_id.slice(0, 8)}... · {new Date(m.created_at).toLocaleString()} · {m.message_type}
                </div>
              </div>
              <button onClick={() => setConfirm(m.id)}
                className="px-3 py-1.5 rounded-lg bg-error/10 text-error hover:bg-error/20 text-xs whitespace-nowrap">
                Purge
              </button>
            </div>
          ))}
          {messages.length === 0 && <div className="text-text-muted text-center py-8">No deleted messages</div>}
        </div>
      )}

      <ConfirmDialog
        open={!!confirm}
        title="Permanently Delete Message"
        message="This message will be irrecoverably removed."
        confirmLabel="Purge"
        danger
        onCancel={() => setConfirm(null)}
        onConfirm={handlePurge}
      />
    </div>
  )
}

// ── Reports Tab ──
function ReportsTab() {
  const [reports, setReports] = useState<AdminReport[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'open' | 'resolved' | 'all'>('open')
  const [resolving, setResolving] = useState<string | null>(null)
  const [resolution, setResolution] = useState('')
  const toast = useAdminToast()

  const load = useCallback(() => {
    setLoading(true)
    adminGetReports(filter === 'all' ? undefined : filter).then((r) => { setReports(r); setLoading(false) })
  }, [filter])

  useEffect(() => { load() }, [load])

  const handleResolve = async () => {
    if (!resolving) return
    try {
      await adminResolveReport(resolving, resolution)
      toast('Report resolved')
      load()
    } catch (e: any) { toast(e.message, 'error') }
    setResolving(null)
    setResolution('')
  }

  return (
    <div>
      <h2 className="text-xl font-bold mb-4">Moderation Reports</h2>
      <div className="flex gap-2 mb-4">
        {(['open', 'resolved', 'all'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-sm capitalize ${filter === f ? 'bg-accent text-white' : 'bg-bg-surface border border-border'}`}>
            {f}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-text-muted">Loading...</div>
      ) : (
        <div className="space-y-1.5">
          {reports.map((r) => (
            <div key={r.id} className="p-3 rounded-lg bg-bg-surface border border-border">
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-xs px-1.5 py-0.5 rounded ${r.status === 'open' ? 'bg-error/15 text-error' : 'bg-success/15 text-success'}`}>
                  {r.status}
                </span>
                <span className="text-xs text-text-muted">{r.content_type}</span>
                <span className="text-xs text-text-muted">{new Date(r.created_at).toLocaleDateString()}</span>
              </div>
              <p className="text-sm">{r.reason}</p>
              {r.status === 'open' && (
                <button onClick={() => setResolving(r.id)}
                  className="mt-2 text-xs px-3 py-1 rounded-lg bg-accent text-white">Resolve</button>
              )}
            </div>
          ))}
          {reports.length === 0 && <div className="text-text-muted text-center py-8">No reports</div>}
        </div>
      )}

      <AnimatePresence>
        {resolving && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setResolving(null)}>
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-bg-surface rounded-2xl border border-border p-6 max-w-sm w-full mx-4 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="font-bold mb-3">Resolve Report</h3>
              <textarea
                value={resolution}
                onChange={(e) => setResolution(e.target.value)}
                placeholder="Resolution notes..."
                className="w-full h-24 px-3 py-2 rounded-lg bg-bg-hover border border-border text-sm focus:border-accent outline-none mb-3 resize-none"
              />
              <div className="flex gap-2 justify-end">
                <button onClick={() => setResolving(null)} className="px-4 py-2 rounded-lg text-sm bg-bg-hover">Cancel</button>
                <button onClick={handleResolve} className="px-4 py-2 rounded-lg text-sm bg-accent text-white">Resolve</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Logs Tab ──
function LogsTab() {
  const [logs, setLogs] = useState<AdminAuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')
  const [actionFilter, setActionFilter] = useState('all')
  const toast = useAdminToast()

  useEffect(() => {
    adminGetAuditLog(200).then((l) => { setLogs(l); setLoading(false) })
  }, [])

  const actions = useMemo(() => {
    const set = new Set(logs.map(l => l.action))
    return ['all', ...Array.from(set).sort()]
  }, [logs])

  const filtered = useMemo(() => {
    let result = logs
    if (filter) {
      const q = filter.toLowerCase()
      result = result.filter(l =>
        l.action.toLowerCase().includes(q) ||
        (l.target_name || '').toLowerCase().includes(q) ||
        l.admin_id.toLowerCase().includes(q)
      )
    }
    if (actionFilter !== 'all') result = result.filter(l => l.action === actionFilter)
    return result
  }, [logs, filter, actionFilter])

  const handleExport = async () => {
    try {
      const all = await adminExportAuditLog()
      const csv = ['timestamp,admin_id,action,target_type,target_id,target_name']
        .concat(all.map(l => [
          new Date(l.created_at).toISOString(),
          l.admin_id,
          l.action,
          l.target_type || '',
          l.target_id || '',
          (l.target_name || '').replace(/,/g, ';'),
        ].join(',')))
        .join('\n')
      const blob = new Blob([csv], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `audit-log-${Date.now()}.csv`
      a.click()
      URL.revokeObjectURL(url)
      toast('Audit log exported')
    } catch (e: any) { toast(e.message, 'error') }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold">Audit Log</h2>
        <button onClick={handleExport}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-bg-surface border border-border text-sm hover:bg-bg-hover">
          <Download className="w-4 h-4" /> Export CSV
        </button>
      </div>
      <div className="flex gap-2 mb-4">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Search logs..."
          className="flex-1 px-3 py-2 rounded-lg bg-bg-surface border border-border text-sm focus:border-accent outline-none"
        />
        <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)}
          className="px-3 py-2 rounded-lg bg-bg-surface border border-border text-sm">
          {actions.map(a => <option key={a} value={a}>{a === 'all' ? 'All Actions' : a}</option>)}
        </select>
      </div>
      {loading ? (
        <div className="text-text-muted">Loading...</div>
      ) : (
        <div className="space-y-1 max-h-[70vh] overflow-auto">
          {filtered.map((l) => (
            <div key={l.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-bg-surface border border-border text-sm hover:border-accent/30 transition-colors">
              <div className="w-2 h-2 rounded-full bg-accent shrink-0" />
              <span className="font-mono text-xs text-text-muted w-32 shrink-0">{new Date(l.created_at).toLocaleString()}</span>
              <span className="font-semibold">{l.action}</span>
              {l.target_name && <span className="text-text-muted">→ {l.target_name}</span>}
            </div>
          ))}
          {filtered.length === 0 && <div className="text-text-muted text-center py-8">No matching entries</div>}
        </div>
      )}
    </div>
  )
}

// ── Invites Tab ──
function InvitesTab() {
  const [invites, setInvites] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [newCode, setNewCode] = useState('')
  const [newMaxUses, setNewMaxUses] = useState(5)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const currentUser = useStore((s) => s.currentUser)
  const toast = useAdminToast()

  const load = useCallback(() => {
    setLoading(true)
    listAllInviteCodes().then((i: any) => { setInvites(i); setLoading(false) })
  }, [])

  useEffect(() => { load() }, [load])

  const handleCreate = async () => {
    try {
      await createInviteCode(currentUser!.id, { code: newCode || undefined, maxUses: newMaxUses })
      toast('Invite code created')
      setNewCode('')
      setNewMaxUses(5)
      setShowCreate(false)
      load()
    } catch (e: any) { toast(e.message, 'error') }
  }

  const handleRevoke = async (id: string) => {
    await revokeInviteCode(id)
    toast('Code revoked')
    load()
  }

  const handleDelete = async () => {
    if (!confirmDelete) return
    await deleteInviteCode(confirmDelete)
    toast('Code deleted')
    setConfirmDelete(null)
    load()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold">Invite Codes</h2>
        <button onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-accent text-white text-sm">
          Create Code
        </button>
      </div>
      {loading ? (
        <div className="text-text-muted">Loading...</div>
      ) : (
        <div className="space-y-1.5">
          {invites.map((inv) => (
            <div key={inv.id} className="flex items-center gap-3 p-3 rounded-lg bg-bg-surface border border-border">
              <div className="flex-1">
                <div className="font-mono font-semibold text-sm">{inv.code}</div>
                <div className="text-xs text-text-muted">
                  {inv.uses_count}/{inv.max_uses} used · {inv.is_active ? 'Active' : 'Revoked'}
                  {inv.note && ` · ${inv.note}`}
                </div>
              </div>
              {inv.is_active && (
                <button onClick={() => handleRevoke(inv.id)} className="px-3 py-1.5 rounded-lg bg-warning/10 text-warning text-xs hover:bg-warning/20">Revoke</button>
              )}
              <button onClick={() => setConfirmDelete(inv.id)} className="px-3 py-1.5 rounded-lg bg-error/10 text-error text-xs hover:bg-error/20">Delete</button>
            </div>
          ))}
          {invites.length === 0 && <div className="text-text-muted text-center py-8">No invite codes</div>}
        </div>
      )}

      <AnimatePresence>
        {showCreate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowCreate(false)}>
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-bg-surface rounded-2xl border border-border p-6 max-w-sm w-full mx-4 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="font-bold mb-3">Create Invite Code</h3>
              <input value={newCode} onChange={(e) => setNewCode(e.target.value.toUpperCase())}
                placeholder="Custom code (optional)"
                className="w-full px-3 py-2 rounded-lg bg-bg-hover border border-border text-sm mb-2 focus:border-accent outline-none" />
              <label className="text-sm text-text-muted">Max uses</label>
              <input type="number" value={newMaxUses} onChange={(e) => setNewMaxUses(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg bg-bg-hover border border-border text-sm mb-4 focus:border-accent outline-none" />
              <div className="flex gap-2 justify-end">
                <button onClick={() => setShowCreate(false)} className="px-4 py-2 rounded-lg text-sm bg-bg-hover">Cancel</button>
                <button onClick={handleCreate} className="px-4 py-2 rounded-lg text-sm bg-accent text-white">Create</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <ConfirmDialog
        open={!!confirmDelete}
        title="Delete Invite Code"
        message="This will permanently remove the invite code."
        confirmLabel="Delete"
        danger
        onCancel={() => setConfirmDelete(null)}
        onConfirm={handleDelete}
      />
    </div>
  )
}

// ── Broadcast Tab ──
function BroadcastTab() {
  const [announcements, setAnnouncements] = useState<AdminAnnouncement[]>([])
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [notifTarget, setNotifTarget] = useState('')
  const [notifTitle, setNotifTitle] = useState('')
  const [notifBody, setNotifBody] = useState('')
  const toast = useAdminToast()

  const load = useCallback(() => {
    adminGetAnnouncements().then(setAnnouncements).catch(() => {})
  }, [])

  useEffect(() => { load() }, [load])

  const handleAnnounce = async () => {
    if (!title.trim() || !body.trim()) return
    try {
      await adminCreateAnnouncement(title.trim(), body.trim())
      toast('Announcement broadcast')
      setTitle(''); setBody('')
      load()
    } catch (e: any) { toast(e.message, 'error') }
  }

  const handleNotify = async () => {
    if (!notifTarget.trim() || !notifTitle.trim()) return
    try {
      await adminSendNotification(notifTarget.trim(), notifTitle.trim(), notifBody.trim())
      toast('Notification sent')
      setNotifTarget(''); setNotifTitle(''); setNotifBody('')
    } catch (e: any) { toast(e.message, 'error') }
  }

  return (
    <div>
      <h2 className="text-xl font-bold mb-4">Broadcast & Notifications</h2>

      {/* Announcement */}
      <div className="bg-bg-surface rounded-xl border border-border p-4 mb-4">
        <h3 className="font-semibold text-sm mb-3 flex items-center gap-2"><Megaphone className="w-4 h-4" /> New Announcement</h3>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title"
          className="w-full px-3 py-2 rounded-lg bg-bg-hover border border-border text-sm mb-2 focus:border-accent outline-none" />
        <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Message body..."
          className="w-full h-20 px-3 py-2 rounded-lg bg-bg-hover border border-border text-sm mb-2 focus:border-accent outline-none resize-none" />
        <button onClick={handleAnnounce}
          className="px-4 py-2 rounded-lg bg-accent text-white text-sm">Broadcast to All Users</button>
      </div>

      {/* Targeted notification */}
      <div className="bg-bg-surface rounded-xl border border-border p-4 mb-4">
        <h3 className="font-semibold text-sm mb-3 flex items-center gap-2"><Bell className="w-4 h-4" /> Send Notification</h3>
        <input value={notifTarget} onChange={(e) => setNotifTarget(e.target.value)} placeholder="User ID"
          className="w-full px-3 py-2 rounded-lg bg-bg-hover border border-border text-sm mb-2 focus:border-accent outline-none" />
        <input value={notifTitle} onChange={(e) => setNotifTitle(e.target.value)} placeholder="Notification title"
          className="w-full px-3 py-2 rounded-lg bg-bg-hover border border-border text-sm mb-2 focus:border-accent outline-none" />
        <input value={notifBody} onChange={(e) => setNotifBody(e.target.value)} placeholder="Notification body"
          className="w-full px-3 py-2 rounded-lg bg-bg-hover border border-border text-sm mb-2 focus:border-accent outline-none" />
        <button onClick={handleNotify}
          className="px-4 py-2 rounded-lg bg-accent text-white text-sm">Send</button>
      </div>

      {/* Existing announcements */}
      <h3 className="font-semibold text-sm mb-2">Active Announcements</h3>
      <div className="space-y-1.5">
        {announcements.map((a) => (
          <div key={a.id} className="p-3 rounded-lg bg-bg-surface border border-border">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-sm">{a.title}</span>
              <button onClick={() => { adminDeleteAnnouncement(a.id); load() }}
                className="text-text-muted hover:text-error"><X className="w-4 h-4" /></button>
            </div>
            <p className="text-sm text-text-muted mt-1">{a.body}</p>
            <div className="text-xs text-text-muted mt-1">{new Date(a.created_at).toLocaleString()}</div>
          </div>
        ))}
        {announcements.length === 0 && <div className="text-text-muted text-sm">No announcements</div>}
      </div>
    </div>
  )
}

// ── Global Search Tab ──
function SearchTab() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<AdminGlobalSearchResult | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSearch = async () => {
    if (!query.trim()) { setResults(null); return }
    setLoading(true)
    try {
      const r = await adminGlobalSearch(query.trim())
      setResults(r)
    } catch { setResults(null) }
    setLoading(false)
  }

  return (
    <div>
      <h2 className="text-xl font-bold mb-4">Global Search</h2>
      <div className="flex gap-2 mb-4">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          placeholder="Search users, chats, messages..."
          className="flex-1 px-3 py-2 rounded-lg bg-bg-surface border border-border text-sm focus:border-accent outline-none"
        />
        <button onClick={handleSearch} className="px-4 py-2 rounded-lg bg-accent text-white text-sm">Search</button>
      </div>

      {loading && <div className="text-text-muted">Searching...</div>}

      {results && (
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold mb-2">Users ({results.users.length})</h3>
            <div className="space-y-1">
              {results.users.map(u => (
                <div key={u.id} className="p-2 rounded-lg bg-bg-surface border border-border text-sm">
                  {u.display_name || u.username} <span className="text-text-muted">@{u.username}</span>
                </div>
              ))}
              {results.users.length === 0 && <div className="text-xs text-text-muted">No matches</div>}
            </div>
          </div>
          <div>
            <h3 className="text-sm font-semibold mb-2">Chats ({results.chats.length})</h3>
            <div className="space-y-1">
              {results.chats.map(c => (
                <div key={c.id} className="p-2 rounded-lg bg-bg-surface border border-border text-sm">
                  {c.name} <span className="text-text-muted">{c.type}</span>
                </div>
              ))}
              {results.chats.length === 0 && <div className="text-xs text-text-muted">No matches</div>}
            </div>
          </div>
          <div>
            <h3 className="text-sm font-semibold mb-2">Messages ({results.messages.length})</h3>
            <div className="space-y-1">
              {results.messages.map(m => (
                <div key={m.id} className="p-2 rounded-lg bg-bg-surface border border-border text-sm">
                  {m.content} <span className="text-text-muted">{new Date(m.created_at).toLocaleDateString()}</span>
                </div>
              ))}
              {results.messages.length === 0 && <div className="text-xs text-text-muted">No matches</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
