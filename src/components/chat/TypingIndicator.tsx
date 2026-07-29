import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { Profile } from '@/types'

export function TypingIndicator({ userIds }: { userIds: string[] }) {
  const [profiles, setProfiles] = useState<Profile[]>([])

  useEffect(() => {
    if (userIds.length === 0) { setProfiles([]); return }
    supabase.from('profiles').select('*').in('id', userIds).then(({ data }) => {
      setProfiles(data || [])
    })
  }, [userIds.join(',')])

  if (profiles.length === 0) return null

  const names = profiles.map((p) => p.display_name || p.username).join(', ')
  const text = profiles.length === 1 ? `${names} is typing` : `${names} are typing`

  return (
    <div className="flex items-center gap-2 py-1 px-2 text-sm text-text-muted">
      <div className="flex gap-1">
        <span className="w-1.5 h-1.5 bg-text-muted rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
        <span className="w-1.5 h-1.5 bg-text-muted rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
        <span className="w-1.5 h-1.5 bg-text-muted rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
      </div>
      <span>{text}...</span>
    </div>
  )
}
