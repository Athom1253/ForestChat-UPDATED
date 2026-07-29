export type LogEntry = {
  timestamp: string
  action: string
  status: 'idle' | 'loading' | 'success' | 'error'
  detail?: string
  latencyMs?: number
  userId?: string
}

let logEntries: LogEntry[] = []
const listeners: Set<() => void> = new Set()
const activeTimers: Map<string, number> = new Map()

export function logAction(action: string, status: LogEntry['status'], detail?: string, extra?: { latencyMs?: number; userId?: string }) {
  const entry: LogEntry = {
    timestamp: new Date().toISOString().split('T')[1].replace('Z', ''),
    action,
    status,
    detail,
    latencyMs: extra?.latencyMs,
    userId: extra?.userId,
  }
  logEntries = [entry, ...logEntries].slice(0, 100)
  listeners.forEach((l) => l())
}

export function startAction(action: string, userId?: string): string {
  const timerKey = `${action}-${Date.now()}`
  activeTimers.set(timerKey, performance.now())
  logAction(action, 'loading', undefined, { userId })
  return timerKey
}

export function endAction(timerKey: string, action: string, status: LogEntry['status'], detail?: string, userId?: string) {
  const startTime = activeTimers.get(timerKey)
  const latencyMs = startTime ? Math.round(performance.now() - startTime) : undefined
  activeTimers.delete(timerKey)
  logAction(action, status, detail, { latencyMs, userId })
}

export function getLogEntries(): LogEntry[] {
  return logEntries
}

export function clearLogEntries() {
  logEntries = []
  listeners.forEach((l) => l())
}

export function getErrorCount(): number {
  return logEntries.filter((e) => e.status === 'error').length
}

export function subscribeToLogs(fn: () => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}
