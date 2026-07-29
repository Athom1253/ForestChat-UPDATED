import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

interface LogEntry {
  id: string
  timestamp: string
  type: 'error' | 'api' | 'rpc' | 'realtime' | 'info'
  message: string
  latency?: number
}

interface DebugContextValue {
  logs: LogEntry[]
  log: (type: LogEntry['type'], message: string, latency?: number) => void
  clearLogs: () => void
  realtimeSubscriptions: string[]
  trackSubscription: (name: string) => void
  untrackSubscription: (name: string) => void
  lastSync: string | null
  setLastSync: (time: string) => void
  syncFailed: boolean
  setSyncFailed: (failed: boolean) => void
  pendingUpdates: number
  setPendingUpdates: (n: number) => void
}

const DebugContext = createContext<DebugContextValue | undefined>(undefined)

export function DebugProvider({ children }: { children: ReactNode }) {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [realtimeSubscriptions, setRealtimeSubs] = useState<string[]>([])
  const [lastSync, setLastSync] = useState<string | null>(null)
  const [syncFailed, setSyncFailed] = useState(false)
  const [pendingUpdates, setPendingUpdates] = useState(0)

  const log = useCallback((type: LogEntry['type'], message: string, latency?: number) => {
    const entry: LogEntry = {
      id: Math.random().toString(36).slice(2),
      timestamp: new Date().toISOString(),
      type, message, latency,
    }
    setLogs(prev => [entry, ...prev].slice(0, 100))
    if (type === 'error') console.error(`[Debug] ${message}`)
  }, [])

  const clearLogs = useCallback(() => setLogs([]), [])

  const trackSubscription = useCallback((name: string) => {
    setRealtimeSubs(prev => prev.includes(name) ? prev : [...prev, name])
  }, [])

  const untrackSubscription = useCallback((name: string) => {
    setRealtimeSubs(prev => prev.filter(n => n !== name))
  }, [])

  return (
    <DebugContext.Provider value={{
      logs, log, clearLogs,
      realtimeSubscriptions, trackSubscription, untrackSubscription,
      lastSync, setLastSync, syncFailed, setSyncFailed,
      pendingUpdates, setPendingUpdates,
    }}>
      {children}
    </DebugContext.Provider>
  )
}

export function useDebug() {
  const ctx = useContext(DebugContext)
  if (!ctx) throw new Error('useDebug must be used within DebugProvider')
  return ctx
}
