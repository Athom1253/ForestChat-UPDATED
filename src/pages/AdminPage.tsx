import { useState, useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { toast } from '@/stores/toast'
import { generateInviteCode, relativeTime, lastSeenLabel } from '@/lib/utils'
import type { Profile, MasterInvite, Report, AdminLog } from '@/types'

export default function AdminPage() {
  const { profile, user } = useAuthStore()
  const [tab, setTab] = useState<'users' | 'reports' | 'invites' | 'stats' | 'logs'>('stats')
  const [users, setUsers] = useState<Profile[]>([])
  const [invites, setInvites] = useState<MasterInvite[]>([])
  const [reports, setReports] = useState<Report[]>([])
  const [logs, setLogs] = useState<AdminLog[]>([])
  const [stats, setStats] = useState({ totalUsers: 0, totalChannels: 0, totalMessages: 0, activeInvites: 0, openReports: 0 })

  if (!profile?.is_admin) return <Navigate to="/" replace />

  useEffect(() => {
    loadAll()
  }, [])

  async function loadAll() {
    const [{ data: usersData }, { data: invitesData }, { data: reportsData }, { data: logsData }] = await Promise.all([
      supabase.from('profiles').select('*').order('join_date', { ascending: false }),
      supabase.from('master_invites').select('*').order('created_at', { ascending: false }),
      supabase.from('reports').select('*').order('created_at', { ascending: false }),
      supabase.from('admin_logs').select('*').order('created_at', { ascending: false }).limit(50),
    ])

    setUsers(usersData || [])
    setInvites(invitesData || [])
    setReports(reportsData || [])
    setLogs(logsData || [])

    const { count: totalChannels } = await supabase.from('channels').select('*', { count: 'exact', head: true })
    const { count: totalMessages } = await supabase.from('messages').select('*', { count: 'exact', head: true })
    setStats({
      totalUsers: usersData?.length || 0,
      totalChannels: totalChannels || 0,
      totalMessages: totalMessages || 0,
      activeInvites: invitesData?.filter(i => i.is_active)?.length || 0,
      openReports: reportsData?.filter(r => r.status === 'open')?.length || 0,
    })
  }

  const createInvite = async () => {
    const code = generateInviteCode()
    const { data, error } = await supabase.from('master_invites').insert({
      code,
      label: 'New invite',
      created_by: user?.id,
    }).select().single()
    if (error) toast.error('Failed to create invite')
    else { toast.success('Invite created!'); setInvites([data, ...invites]) }
  }

  const toggleInvite = async (invite: MasterInvite) => {
    await supabase.from('master_invites').update({ is_active: !invite.is_active }).eq('id', invite.id)
    loadAll()
  }

  const deleteInvite = async (id: string) => {
    await supabase.from('master_invites').delete().eq('id', id)
    toast.success('Invite deleted')
    loadAll()
  }

  const toggleAdmin = async (p: Profile) => {
    await supabase.from('profiles').update({ is_admin: !p.is_admin }).eq('id', p.id)
    toast.success(`${p.username} ${p.is_admin ? 'demoted' : 'promoted to admin'}`)
    loadAll()
  }

  const resolveReport = async (id: string, status: 'resolved' | 'dismissed') => {
    await supabase.from('reports').update({
      status,
      resolved_at: new Date().toISOString(),
      resolved_by: user?.id,
    }).eq('id', id)
    toast.success(`Report ${status}`)
    loadAll()
  }

  return (
    <div className="flex-1 flex flex-col bg-bg overflow-hidden">
      <div className="h-14 flex items-center px-6 border-b border-border bg-surface">
        <h1 className="text-lg font-semibold text-text">Admin Panel</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-6 py-2 border-b border-border bg-surface">
        {(['stats', 'users', 'reports', 'invites', 'logs'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors capitalize ${tab === t ? 'bg-primary/20 text-primary' : 'text-text-muted hover:text-text hover:bg-surface-hover'}`}
          >
            {t}
            {t === 'reports' && stats.openReports > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 bg-error text-white text-xs rounded-full">{stats.openReports}</span>
            )}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto">
          {tab === 'stats' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <StatCard label="Total Users" value={stats.totalUsers} icon="👥" />
              <StatCard label="Total Channels" value={stats.totalChannels} icon="💬" />
              <StatCard label="Total Messages" value={stats.totalMessages} icon="📨" />
              <StatCard label="Active Invites" value={stats.activeInvites} icon="🎟️" />
              <StatCard label="Open Reports" value={stats.openReports} icon="⚠️" />
            </motion.div>
          )}

          {tab === 'users' && (
            <div className="space-y-2">
              {users.map((p) => (
                <div key={p.id} className="flex items-center gap-3 p-3 bg-surface rounded-lg">
                  {p.avatar_url ? (
                    <img src={p.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">{p.username[0]?.toUpperCase()}</div>
                  )}
                  <div className="flex-1">
                    <p className="font-medium text-text">{p.display_name || p.username}</p>
                    <p className="text-xs text-text-muted">@{p.username} · Joined {relativeTime(p.join_date)}</p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full ${p.status === 'online' ? 'bg-success/20 text-success' : 'bg-surface-hover text-text-muted'}`}>{p.status}</span>
                  <button onClick={() => toggleAdmin(p)} className={`btn text-sm ${p.is_admin ? 'btn-ghost' : 'btn-primary'}`}>
                    {p.is_admin ? 'Remove Admin' : 'Make Admin'}
                  </button>
                </div>
              ))}
            </div>
          )}

          {tab === 'reports' && (
            <div className="space-y-2">
              {reports.length === 0 ? (
                <p className="text-center text-text-muted py-12">No reports</p>
              ) : reports.map((r) => (
                <div key={r.id} className="card p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <span className="text-sm font-medium text-text">{r.reason}</span>
                      <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${r.status === 'open' ? 'bg-error/20 text-error' : r.status === 'resolved' ? 'bg-success/20 text-success' : 'bg-surface-hover text-text-muted'}`}>{r.status}</span>
                    </div>
                    <span className="text-xs text-text-muted">{relativeTime(r.created_at)}</span>
                  </div>
                  {r.description && <p className="text-sm text-text-muted mb-2">{r.description}</p>}
                  {r.status === 'open' && (
                    <div className="flex gap-2 mt-2">
                      <button onClick={() => resolveReport(r.id, 'resolved')} className="btn-primary text-sm">Resolve</button>
                      <button onClick={() => resolveReport(r.id, 'dismissed')} className="btn-ghost text-sm">Dismiss</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {tab === 'invites' && (
            <div>
              <button onClick={createInvite} className="btn-primary mb-4">Create New Invite</button>
              <div className="space-y-2">
                {invites.map((inv) => (
                  <div key={inv.id} className="card p-4 flex items-center gap-4">
                    <code className="text-lg font-mono text-primary">{inv.code}</code>
                    <div className="flex-1">
                      <p className="text-sm text-text">{inv.label}</p>
                      <p className="text-xs text-text-muted">
                        Used {inv.use_count}{inv.max_uses ? `/${inv.max_uses}` : '∞'} · {relativeTime(inv.created_at)}
                      </p>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full ${inv.is_active ? 'bg-success/20 text-success' : 'bg-surface-hover text-text-muted'}`}>
                      {inv.is_active ? 'Active' : 'Inactive'}
                    </span>
                    <button onClick={() => toggleInvite(inv)} className="btn-ghost text-sm">{inv.is_active ? 'Disable' : 'Enable'}</button>
                    <button onClick={() => deleteInvite(inv.id)} className="btn-ghost text-sm text-error">Delete</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'logs' && (
            <div className="space-y-1">
              {logs.length === 0 ? (
                <p className="text-center text-text-muted py-12">No admin actions logged</p>
              ) : logs.map((log) => (
                <div key={log.id} className="flex items-center gap-3 p-2 bg-surface rounded-lg text-sm">
                  <span className="text-text-muted text-xs">{relativeTime(log.created_at)}</span>
                  <span className="text-text">{log.action}</span>
                  {log.target_type && <span className="text-text-muted">→ {log.target_type}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function StatCard({ label, value, icon }: { label: string; value: number; icon: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="card p-4"
    >
      <div className="text-2xl mb-1">{icon}</div>
      <p className="text-2xl font-bold text-text">{value}</p>
      <p className="text-sm text-text-muted">{label}</p>
    </motion.div>
  )
}
