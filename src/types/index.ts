export interface Profile {
  id: string
  username: string
  display_name: string | null
  bio: string
  avatar_url: string | null
  banner_url: string | null
  status_message: string
  status: 'online' | 'away' | 'offline'
  is_admin: boolean
  join_date: string
  last_seen: string
  updated_at: string
}

export interface MasterInvite {
  id: string
  code: string
  label: string
  max_uses: number | null
  use_count: number
  is_active: boolean
  created_by: string | null
  created_at: string
  expires_at: string | null
}

export interface Channel {
  id: string
  type: 'dm' | 'group' | 'room'
  name: string | null
  description: string
  icon_url: string | null
  owner_id: string | null
  is_private: boolean
  invite_code: string | null
  created_at: string
  updated_at: string
}

export interface ChannelMember {
  id: string
  channel_id: string
  user_id: string
  role: 'owner' | 'admin' | 'member'
  is_pinned: boolean
  is_archived: boolean
  muted: boolean
  unread_count: number
  joined_at: string
}

export interface Message {
  id: string
  channel_id: string
  author_id: string
  content: string
  message_type: 'text' | 'image' | 'file' | 'drawing' | 'voice'
  reply_to: string | null
  attachment_url: string | null
  attachment_name: string | null
  attachment_size: number | null
  attachment_metadata: Record<string, unknown> | null
  edited_at: string | null
  deleted_at: string | null
  created_at: string
}

export interface Reaction {
  id: string
  message_id: string
  user_id: string
  emoji: string
  created_at: string
}

export interface MessageRead {
  id: string
  channel_id: string
  user_id: string
  last_read_message_id: string | null
  last_read_at: string
}

export interface Friend {
  id: string
  requester_id: string
  addressee_id: string
  status: 'pending' | 'accepted' | 'blocked'
  created_at: string
  updated_at: string
}

export interface Pet {
  id: string
  owner_id: string
  name: string
  species: string
  mood: 'happy' | 'neutral' | 'sad' | 'excited' | 'sleepy'
  energy: number
  hunger: number
  happiness: number
  growth: number
  xp: number
  level: number
  color: string
  accessory: string | null
  last_fed: string | null
  last_played: string | null
  last_updated: string
  created_at: string
}

export interface PetItem {
  id: string
  pet_id: string
  owner_id: string
  item_type: 'food' | 'toy' | 'accessory' | 'potion'
  item_name: string
  quantity: number
  metadata: Record<string, unknown>
  acquired_at: string
}

export interface PetAchievement {
  id: string
  pet_id: string
  owner_id: string
  achievement_id: string
  achievement_name: string
  unlocked_at: string
}

export interface Report {
  id: string
  reporter_id: string
  reported_id: string | null
  reported_message_id: string | null
  reason: string
  description: string
  status: 'open' | 'reviewing' | 'resolved' | 'dismissed'
  created_at: string
  resolved_at: string | null
  resolved_by: string | null
}

export interface UserSettings {
  id: string
  user_id: string
  theme: string
  animated_background: string
  notifications_enabled: boolean
  notification_sound: boolean
  email_notifications: boolean
  show_online_status: boolean
  allow_dm_from_friends_only: boolean
  read_receipts_enabled: boolean
  typing_indicators_enabled: boolean
  compact_mode: boolean
  reduced_motion: boolean
  custom_data: Record<string, unknown>
  updated_at: string
}

export interface AdminLog {
  id: string
  admin_id: string | null
  action: string
  target_id: string | null
  target_type: string | null
  details: Record<string, unknown>
  created_at: string
}

export interface MessageWithAuthor extends Message {
  author?: Profile | null
  reply_message?: Message | null
  reactions?: Reaction[]
}
