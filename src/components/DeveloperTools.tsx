import { useState, useEffect, useCallback } from 'react'
import { Activity, Database, User, RefreshCw, Trash2, Wifi, HeartPulse, ChevronDown, ChevronUp, TriangleAlert as AlertTriangle, CircleCheck as CheckCircle2, Circle as XCircle } from 'lucide-react'
import { useStore } from '../lib/store'
import { supabase } from '../lib/supabase'
import {
  getLogEntries, clearLogEntries, getErrorCount, subscribeToLogs,
  type LogEntry,
} from './DebugPanel'
import { getFriends } from '../lib/api'
import { loadPet } from '../lib/petApi'

type HealthState = {
  dbConnected: boolean | null
  authStatus: 'authenticated' | 'anonymous' | 'unknown'
  realtimeConnected: boolean
  latencyMs: number | null
  errorCount: number
  lastChecked: string | null
}

type SyncState = {
  chats: { lastSync: string | null; syncing: boolean }
  messages: { lastSync: string | null; syncing: boolean }
  friends: { lastSync: string | null; syncing: boolean }
  pet: { lastSync: string | null; syncing: boolean }
}

type Section = 'status' | 'sync' | 'logs' | 'errors'

export default function DeveloperTools() {
  const [expanded, setExpanded] = useState<Section | null>(null)
  const [, forceUpdate] = useState(0)
  const currentUser = useStore((s) => s.currentUser)
  const activeChat = useStore((s) => s.activeChat)
  const messages = useStore((s) => s.messages)
  const onlineUsers = useStore((s) => s.onlineUsers)
  const typingUsers = useStore((s) => s.typingUsers)
  const addToast = useStore((s) => s.addToast)
  const setMessages = useStore((s) => s.setMessages)
  const petEnabled = useStore((s) => s.petEnabled)
  const petName = useStore((s) => s.petName)

  const [health, setHealth] = useState<HealthState>({
    dbConnected: null,
    authStatus: 'unknown',
    realtimeConnected: false,
    latencyMs: null,
    errorCount: 0,
    lastChecked: null,
  })
  const [syncState, setSyncState] = useState<SyncState>({
    chats: { lastSync: null, syncing: false },
    messages: { lastSync: null, syncing: false },
    friends: { lastSync: null, syncing: false },
    pet: { lastSync: null, syncing: false },
  })
  const [sessionInfo, setSessionInfo] = useState<Record<string, unknown>>({})

  useEffect(() => {
    const unsub = subscribeToLogs(() => forceUpdate((n) => n + 1))
    return unsub
  }, [])

  const checkHealth = useCallback(async () => {
    const t0 = performance.now()
    let dbConnected = false
    let authStatus: HealthState['authStatus'] = 'unknown'

    try {
      const { data } = await supabase.from('app_users').select('id').limit(1)
      dbConnected = !!(data || data === null)
      const latencyMs = Math.round(performance.now() - t0)

      const { data: sessionData } = await supabase.auth.getSession()
      authStatus = sessionData.session ? 'authenticated' : 'anonymous'

      const channels = supabase.getChannels()
      const realtimeConnected = channels.length > 0

      setHealth({
        dbConnected,
        authStatus,
        realtimeConnected,
        latencyMs,
        errorCount: getErrorCount(),
        lastChecked: new Date().toISOString().split('T')[1].replace('Z', ''),
      })
    } catch {
      setHealth((prev) => ({
        ...prev,
        dbConnected: false,
        latencyMs: Math.round(performance.now() - t0),
        lastChecked: new Date().toISOString().split('T')[1].replace('Z', ''),
      }))
    }
  }, [])

  useEffect(() => {
    checkHealth()
    const interval = setInterval(checkHealth, 15000)
    return () => clearInterval(interval)
  }, [checkHealth])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSessionInfo({
        sessionExists: !!data.session,
        userId: data.session?.user?.id,
        email: data.session?.user?.email,
        expiresAt: data.session?.expires_at,
        tokenPresent: !!data.session?.access_token,
      })
    })
  }, [])

  const syncChats = async () => {
    if (!currentUser) return
    setSyncState((s) => ({ ...s, chats: { ...s.chats, syncing: true } }))
    try {
      const { data: memberships } = await supabase
        .from('chat_memberships')
        .select('chat_id, chat:chats(*)')
        .eq('user_id', currentUser.id)
      if (memberships) {
        const chats = memberships.map((m: any) => m.chat).filter(Boolean)
        addToast(`Synced ${chats.length} chats`, 'success')
      }
      setSyncState((s) => ({ ...s, chats: { lastSync: new Date().toISOString().split('T')[1].replace('Z', ''), syncing: false } }))
    } catch {
      addToast('Chat sync failed', 'error')
      setSyncState((s) => ({ ...s, chats: { ...s.chats, syncing: false } }))
    }
  }

  const syncMessages = async () => {
    if (!activeChat) {
      addToast('Select a chat first', 'info')
      return
    }
    setSyncState((s) => ({ ...s, messages: { ...s.messages, syncing: true } }))
    try {
      const { data } = await supabase
        .from('messages')
        .select('*')
        .eq('chat_id', activeChat.id)
        .order('created_at', { ascending: true })
      if (data) {
        setMessages(activeChat.id, data)
        addToast(`Synced ${data.length} messages`, 'success')
      }
      setSyncState((s) => ({ ...s, messages: { lastSync: new Date().toISOString().split('T')[1].replace('Z', ''), syncing: false } }))
    } catch {
      addToast('Message sync failed', 'error')
      setSyncState((s) => ({ ...s, messages: { ...s.messages, syncing: false } }))
    }
  }

  const syncFriends = async () => {
    if (!currentUser) return
    setSyncState((s) => ({ ...s, friends: { ...s.friends, syncing: true } }))
    try {
      const friends = await getFriends(currentUser.id)
      addToast(`Synced ${friends.length} friends`, 'success')
      setSyncState((s) => ({ ...s, friends: { lastSync: new Date().toISOString().split('T')[1].replace('Z', ''), syncing: false } }))
    } catch {
      addToast('Friends sync failed', 'error')
      setSyncState((s) => ({ ...s, friends: { ...s.friends, syncing: false } }))
    }
  }

  const syncPet = async () => {
    if (!currentUser) return
    setSyncState((s) => ({ ...s, pet: { ...s.pet, syncing: true } }))
    try {
      const pet = await loadPet(currentUser.id)
      addToast(pet ? `Pet synced: ${pet.name}` : 'No pet found — will auto-create on next visit', pet ? 'success' : 'info')
      setSyncState((s) => ({ ...s, pet: { lastSync: new Date().toISOString().split('T')[1].replace('Z', ''), syncing: false } }))
    } catch {
      addToast('Pet sync failed', 'error')
      setSyncState((s) => ({ ...s, pet: { ...s.pet, syncing: false } }))
    }
  }

  const syncEverything = async () => {
    addToast('Syncing everything...', 'info')
    await Promise.allSettled([syncChats(), syncMessages(), syncFriends(), syncPet()])
    await checkHealth()
    addToast('Sync complete', 'success')
  }

  const entries = getLogEntries()
  const errorEntries = entries.filter((e) => e.status === 'error')
  const hasHealthIssues = health.dbConnected === false || health.authStatus === 'unknown' || health.errorCount > 0

  const statusColor = (s: LogEntry['status']) => {
    switch (s) {
      case 'success': return 'text-success'
      case 'error': return 'text-error'
      case 'loading': return 'text-amber-400'
      default: return 'text-text-muted'
    }
  }

  const SectionHeader = ({ id, icon, label, badge }: { id: Section; icon: React.ReactNode; label: string; badge?: React.ReactNode }) => (
    <button
      onClick={() => setExpanded(expanded === id ? null : id)}
      className="w-full flex items-center justify-between p-3 rounded-xl bg-bg-surface hover:bg-bg-hover transition-all border border-border"
    >
      <span className="flex items-center gap-2.5 text-sm font-medium text-text">
        {icon} {label}
        {badge}
      </span>
      {expanded === id ? <ChevronUp className="w-4 h-4 text-text-muted" /> : <ChevronDown className="w-4 h-4 text-text-muted" />}
    </button>
  )

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-bold text-text flex items-center gap-2">
          <HeartPulse className="w-4 h-4" /> Developer Tools
        </h3>
        {hasHealthIssues && (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-error/10 text-error text-xs font-medium">
            <AlertTriangle className="w-3 h-3" /> {health.errorCount} issues
          </span>
        )}
        {!hasHealthIssues && health.dbConnected !== null && (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-success/10 text-success text-xs font-medium">
            <CheckCircle2 className="w-3 h-3" /> Healthy
          </span>
        )}
      </div>

      {/* System Status */}
      <SectionHeader id="status" icon={<Activity className="w-4 h-4 text-accent" />} label="System Status" />
      {expanded === 'status' && (
        <div className="space-y-1.5 p-3 rounded-xl bg-bg-surface border border-border">
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-2 text-text-muted"><Database className="w-3.5 h-3.5" /> Database</span>
            <span className={health.dbConnected ? 'text-success' : 'text-error'}>
              {health.dbConnected === null ? 'Checking...' : health.dbConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-2 text-text-muted"><User className="w-3.5 h-3.5" /> Auth</span>
            <span className={health.authStatus === 'authenticated' ? 'text-success' : health.authStatus === 'anonymous' ? 'text-amber-400' : 'text-error'}>
              {health.authStatus}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-2 text-text-muted"><Wifi className="w-3.5 h-3.5" /> Realtime</span>
            <span className={health.realtimeConnected ? 'text-success' : 'text-text-muted'}>
              {health.realtimeConnected ? `${supabase.getChannels().length} channels` : 'No channels'}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-2 text-text-muted"><Activity className="w-3.5 h-3.5" /> Latency</span>
            <span className={health.latencyMs !== null && health.latencyMs < 500 ? 'text-success' : health.latencyMs !== null && health.latencyMs < 2000 ? 'text-amber-400' : 'text-error'}>
              {health.latencyMs !== null ? `${health.latencyMs}ms` : 'n/a'}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-2 text-text-muted"><XCircle className="w-3.5 h-3.5" /> Errors</span>
            <span className={health.errorCount === 0 ? 'text-success' : 'text-error'}>{health.errorCount}</span>
          </div>
          <div className="text-text-muted text-[10px] mt-1">Last checked: {health.lastChecked || 'never'}</div>
          <button onClick={checkHealth} className="mt-2 px-3 py-1.5 rounded-lg bg-bg-hover text-text hover:bg-border transition-all text-xs flex items-center gap-1.5">
            <RefreshCw className="w-3 h-3" /> Re-check
          </button>

          <div className="mt-3 pt-2 border-t border-border">
            <div className="text-text-muted text-[10px] mb-1">Session Details</div>
            {Object.entries(sessionInfo).map(([k, v]) => (
              <div key={k} className="flex justify-between text-[11px]">
                <span className="text-text-muted">{k}:</span>
                <span className={v ? 'text-success' : 'text-text-muted'}>{String(v)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sync Manager */}
      <SectionHeader id="sync" icon={<RefreshCw className="w-4 h-4 text-accent" />} label="Sync Manager" />
      {expanded === 'sync' && (
        <div className="space-y-2 p-3 rounded-xl bg-bg-surface border border-border">
          <button
            onClick={syncEverything}
            className="w-full px-3 py-2 rounded-lg bg-accent text-white hover:bg-accent-hover transition-all text-sm font-medium flex items-center justify-center gap-2"
          >
            <RefreshCw className="w-4 h-4" /> Sync Everything
          </button>
          {([
            { key: 'chats' as const, label: 'Chats', sync: syncChats },
            { key: 'messages' as const, label: 'Messages (active chat)', sync: syncMessages },
            { key: 'friends' as const, label: 'Friends', sync: syncFriends },
            { key: 'pet' as const, label: 'Pet State', sync: syncPet },
          ]).map(({ key, label, sync }) => (
            <div key={key} className="flex items-center justify-between text-xs">
              <span className="text-text-muted">{label}</span>
              <div className="flex items-center gap-2">
                {syncState[key].lastSync && <span className="text-text-muted text-[10px]">{syncState[key].lastSync}</span>}
                <button
                  onClick={sync}
                  disabled={syncState[key].syncing}
                  className="px-2 py-1 rounded bg-bg-hover text-text hover:bg-border transition-all text-xs flex items-center gap-1 disabled:opacity-40"
                >
                  {syncState[key].syncing ? <RefreshCw className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />} Sync
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Action Logs */}
      <SectionHeader
        id="logs"
        icon={<Activity className="w-4 h-4 text-accent" />}
        label="Action Logs"
        badge={<span className="text-[10px] text-text-muted">{entries.length}</span>}
      />
      {expanded === 'logs' && (
        <div className="space-y-1 p-3 rounded-xl bg-bg-surface border border-border max-h-64 overflow-y-auto">
          <div className="flex items-center justify-between mb-1">
            <span className="text-text-muted text-[10px]">Last {entries.length} actions</span>
            <button onClick={clearLogEntries} className="text-text-muted hover:text-error flex items-center gap-1 text-[10px]">
              <Trash2 className="w-3 h-3" /> Clear
            </button>
          </div>
          {entries.length === 0 && <div className="text-text-muted italic py-3 text-center text-xs">No actions logged yet</div>}
          {entries.map((e, i) => (
            <div key={i} className="flex items-start gap-2 py-1 border-b border-border/50 text-[11px]">
              <span className="text-text-muted shrink-0">{e.timestamp}</span>
              <span className={`shrink-0 font-bold ${statusColor(e.status)}`}>[{e.status.toUpperCase()}]</span>
              <span className="text-text">{e.action}</span>
              {e.latencyMs !== undefined && <span className="text-accent shrink-0">{e.latencyMs}ms</span>}
              {e.detail && <span className="text-text-muted truncate flex-1">{e.detail}</span>}
            </div>
          ))}
        </div>
      )}

      {/* Error Viewer */}
      <SectionHeader
        id="errors"
        icon={<XCircle className="w-4 h-4 text-error" />}
        label="Error Viewer"
        badge={errorEntries.length > 0 && <span className="text-[10px] text-error">{errorEntries.length}</span>}
      />
      {expanded === 'errors' && (
        <div className="space-y-1 p-3 rounded-xl bg-bg-surface border border-border max-h-64 overflow-y-auto">
          {errorEntries.length === 0 && <div className="text-success italic py-3 text-center text-xs">No errors logged</div>}
          {errorEntries.map((e, i) => (
            <div key={i} className="py-1.5 border-b border-border/50 text-[11px]">
              <div className="flex items-center gap-2">
                <span className="text-text-muted shrink-0">{e.timestamp}</span>
                <span className="text-error font-bold">{e.action}</span>
                {e.latencyMs !== undefined && <span className="text-text-muted">{e.latencyMs}ms</span>}
              </div>
              {e.detail && <div className="text-error mt-0.5">{e.detail}</div>}
            </div>
          ))}
        </div>
      )}

      {/* Quick state inspector */}
      <div className="p-3 rounded-xl bg-bg-surface border border-border text-[11px] space-y-1">
        <div className="text-text-muted font-medium mb-1">Live State</div>
        <div className="flex justify-between"><span className="text-text-muted">User:</span><span className="text-text">{currentUser?.id?.slice(0, 8) || 'none'}</span></div>
        <div className="flex justify-between"><span className="text-text-muted">Chat:</span><span className="text-text">{activeChat?.name || 'none'}</span></div>
        <div className="flex justify-between"><span className="text-text-muted">Messages:</span><span className="text-text">{activeChat ? (messages[activeChat.id]?.length || 0) : 0}</span></div>
        <div className="flex justify-between"><span className="text-text-muted">Online:</span><span className="text-text">{onlineUsers.size}</span></div>
        <div className="flex justify-between"><span className="text-text-muted">Typing:</span><span className="text-text">{Object.keys(typingUsers).length}</span></div>
        <div className="flex justify-between"><span className="text-text-muted">Pet:</span><span className="text-text">{petEnabled ? petName : 'disabled'}</span></div>
      </div>
    </div>
  )
}
