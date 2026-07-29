const RLS_PATTERNS: Array<{ test: RegExp; message: string }> = [
  { test: /policy.*not met|violates row-level security/i, message: 'You don\'t have permission for this action' },
  { test: /not authenticated|unauthorized|jwt/i, message: 'You\'re not signed in. Please sign in and try again.' },
  { test: /permission denied|access denied/i, message: 'Access denied — you may not have membership in this chat.' },
  { test: /duplicate key|unique constraint/i, message: 'This already exists. It may have been created already.' },
  { test: /foreign key|violates foreign key/i, message: 'A required reference is missing. Please refresh and try again.' },
  { test: /network|fetch failed|Failed to fetch/i, message: 'Network error — check your connection and try again.' },
  { test: /timeout|timed out/i, message: 'The request timed out. Please try again.' },
]

export function translateError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)

  for (const { test, message } of RLS_PATTERNS) {
    if (test.test(raw)) return message
  }

  return raw.length > 120 ? raw.slice(0, 120) + '...' : raw
}

export function getTechnicalError(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`
  return String(error)
}
