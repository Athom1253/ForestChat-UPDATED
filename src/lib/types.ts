export type AppUser = {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
  bio: string | null
  status: string | null
  status_message: string | null
  last_seen: string | null
  created_at: string | null
  is_admin?: boolean
  invite_code_used?: string | null
  animation_prefs?: Record<string, unknown> | null
}

export type InviteCode = {
  id: string
  code: string
  created_by: string | null
  max_uses: number
  uses_count: number
  expires_at: string | null
  is_active: boolean
  note: string | null
  created_at: string | null
  redemptions?: { username: string; redeemed_at: string }[]
}

export type Chat = {
  id: string
  name: string
  description: string | null
  type: 'group' | 'dm'
  avatar_url: string | null
  invite_code: string | null
  created_by: string | null
  created_at: string | null
  last_message_at?: string | null
  last_message_preview?: string | null
}

export type ChatMembership = {
  id?: string
  chat_id: string
  user_id: string
  role: 'owner' | 'admin' | 'member'
  is_muted: boolean
  is_pinned: boolean
  is_archived: boolean
  joined_at: string | null
}

export type Attachment = {
  name: string
  url: string
  type: string
  size?: number
  duration?: number
}

export type Message = {
  id: string
  chat_id: string
  user_id: string
  content: string
  parent_id: string | null
  is_edited: boolean
  is_pinned: boolean
  is_deleted: boolean
  message_type?: string
  attachments: Attachment[] | null
  created_at: string | null
  user?: AppUser
  reactions?: ReactionSummary[]
}

export type MessageReaction = {
  id: string
  message_id: string
  user_id: string
  emoji: string
  created_at: string | null
}

export type ReactionSummary = {
  emoji: string
  count: number
  users: string[]
  me: boolean
}

export type ReadReceipt = {
  id: string
  chat_id: string
  user_id: string
  last_read_message_id: string | null
  last_read_at: string | null
}

export type TypingIndicator = {
  id: string
  chat_id: string
  user_id: string
  started_at: string | null
  user?: AppUser
}

export type Friend = {
  id: string
  requester_id: string
  addressee_id: string
  status: 'pending' | 'accepted' | 'blocked'
  created_at: string | null
  updated_at: string | null
  other_user?: AppUser
}

export type BlockedUser = {
  id: string
  blocker_id: string
  blocked_id: string
  created_at: string | null
  blocked_user?: AppUser
}

export type ChatWithDetails = Chat & {
  membership: ChatMembership | null
  unread_count: number
  last_message: Message | null
  members: AppUser[]
  is_pinned?: boolean
  is_muted?: boolean
  is_archived?: boolean
}

export type ChatInvite = {
  id: string
  chat_id: string
  code: string
  created_by: string
  max_uses: number | null
  uses_count: number
  expires_at: string | null
  created_at: string | null
}

export type StoredAccount = {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
  created_at: string
}

// ── Admin types ──

export type AdminUser = AppUser & {
  is_disabled?: boolean
  is_suspended?: boolean
  suspended_until?: string | null
  profile_reset_at?: string | null
}

export type AdminAuditLog = {
  id: string
  admin_id: string
  action: string
  target_type: string | null
  target_id: string | null
  target_name: string | null
  details: Record<string, unknown> | null
  created_at: string
  admin?: AppUser
}

export type AdminReport = {
  id: string
  reporter_id: string | null
  content_type: string
  content_id: string | null
  chat_id: string | null
  reason: string
  status: string
  resolution_notes: string | null
  resolved_by: string | null
  created_at: string
  resolved_at: string | null
  reporter?: AppUser | null
}

export type AdminNote = {
  id: string
  target_user_id: string
  admin_id: string
  note: string
  created_at: string
  updated_at: string
  admin?: AppUser
}

export type AdminAnnouncement = {
  id: string
  admin_id: string
  title: string
  body: string
  is_pinned: boolean
  dismissible: boolean
  created_at: string
  expires_at: string | null
}

export type AdminNotification = {
  id: string
  admin_id: string | null
  target_user_id: string
  title: string
  body: string
  type: string
  is_read: boolean
  created_at: string
}

export type SignInActivity = {
  id: string
  user_id: string
  ip_address: string | null
  user_agent: string | null
  success: boolean
  created_at: string
}

export type AdminStats = {
  total_users: number
  active_users_24h: number
  disabled_users: number
  suspended_users: number
  total_chats: number
  total_groups: number
  total_dms: number
  total_messages: number
  deleted_messages: number
  open_reports: number
  total_invites: number
  active_invites: number
  daily_active: { date: string; count: number }[]
  messages_per_day: { date: string; count: number }[]
  new_users_per_day: { date: string; count: number }[]
}

export type AdminChat = Chat & {
  member_count: number
}

export type AdminGlobalSearchResult = {
  users: { id: string; username: string; display_name: string | null; avatar_url: string | null }[]
  chats: { id: string; name: string; type: string }[]
  messages: { id: string; chat_id: string; content: string; created_at: string }[]
}

export type DeletedMessage = {
  id: string
  chat_id: string
  user_id: string
  content: string
  deleted_content: string | null
  is_deleted: boolean
  message_type: string | null
  created_at: string
  deleted_by: string | null
}

// ── Pet types ──

export type PetSpecies =
  | 'dog' | 'cat' | 'rabbit' | 'fox' | 'redpanda' | 'hamster'
  | 'penguin' | 'owl' | 'dragon' | 'dinosaur' | 'axolotl' | 'bee' | 'duck' | 'turtle'

export type PetMood =
  | 'happy' | 'sleepy' | 'hungry' | 'excited' | 'bored' | 'curious' | 'playful' | 'sleeping'

export type PetBehavior =
  | 'idle' | 'walking' | 'sitting' | 'sleeping' | 'stretching'
  | 'blinking' | 'wagging' | 'hopping' | 'rolling' | 'playing'
  | 'chasing' | 'sniffing' | 'looking' | 'dancing' | 'following'

export type PetPersonality =
  | 'lazy' | 'energetic' | 'curious' | 'shy' | 'playful' | 'mischievous' | 'affectionate'

export type PetState = {
  id: string
  user_id: string
  species: PetSpecies
  name: string
  color_variant: string
  accessories: string[]
  outfit: Record<string, string> | null
  personality: PetPersonality
  level: number
  xp: number
  friendship: number
  happiness: number
  energy: number
  hunger: number
  cleanliness: number
  tricks_learned: string[]
  achievements: string[]
  stats: { pets: number; feeds: number; plays: number; baths: number; tricks: number }
  last_fed_at: string | null
  last_played_at: string | null
  last_slept_at: string | null
  last_bathed_at: string | null
  is_sleeping: boolean
  created_at: string
  updated_at: string
}
