export type Database = {
  public: {
    Tables: {
      app_users: {
        Row: {
          id: string
          username: string
          display_name: string | null
          avatar_url: string | null
          bio: string | null
          status: string | null
          status_message: string | null
          last_seen: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          username: string
          display_name?: string | null
          avatar_url?: string | null
          bio?: string | null
          status?: string | null
          status_message?: string | null
          last_seen?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          username?: string
          display_name?: string | null
          avatar_url?: string | null
          bio?: string | null
          status?: string | null
          status_message?: string | null
          last_seen?: string | null
          created_at?: string | null
        }
      }
      chats: {
        Row: {
          id: string
          name: string
          description: string | null
          type: string
          avatar_url: string | null
          invite_code: string | null
          created_by: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          name: string
          description?: string | null
          type?: string
          avatar_url?: string | null
          invite_code?: string | null
          created_by?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          name?: string
          description?: string | null
          type?: string
          avatar_url?: string | null
          invite_code?: string | null
          created_by?: string | null
          created_at?: string | null
        }
      }
      chat_memberships: {
        Row: {
          id: string
          chat_id: string
          user_id: string
          role: string
          is_muted: boolean
          is_pinned: boolean
          is_archived: boolean
          joined_at: string | null
        }
        Insert: {
          id?: string
          chat_id: string
          user_id: string
          role?: string
          is_muted?: boolean
          is_pinned?: boolean
          is_archived?: boolean
          joined_at?: string | null
        }
        Update: {
          id?: string
          chat_id?: string
          user_id?: string
          role?: string
          is_muted?: boolean
          is_pinned?: boolean
          is_archived?: boolean
          joined_at?: string | null
        }
      }
      messages: {
        Row: {
          id: string
          chat_id: string
          user_id: string
          content: string
          parent_id: string | null
          is_edited: boolean
          is_pinned: boolean
          is_deleted: boolean
          attachments: any | null
          created_at: string | null
        }
        Insert: {
          id?: string
          chat_id: string
          user_id: string
          content?: string
          parent_id?: string | null
          is_edited?: boolean
          is_pinned?: boolean
          is_deleted?: boolean
          attachments?: any | null
          created_at?: string | null
        }
        Update: {
          id?: string
          chat_id?: string
          user_id?: string
          content?: string
          parent_id?: string | null
          is_edited?: boolean
          is_pinned?: boolean
          is_deleted?: boolean
          attachments?: any | null
          created_at?: string | null
        }
      }
      message_reactions: {
        Row: {
          id: string
          message_id: string
          user_id: string
          emoji: string
          created_at: string | null
        }
        Insert: {
          id?: string
          message_id: string
          user_id: string
          emoji: string
          created_at?: string | null
        }
        Update: {
          id?: string
          message_id?: string
          user_id?: string
          emoji?: string
          created_at?: string | null
        }
      }
      read_receipts: {
        Row: {
          id: string
          chat_id: string
          user_id: string
          last_read_message_id: string | null
          last_read_at: string | null
        }
        Insert: {
          id?: string
          chat_id: string
          user_id: string
          last_read_message_id?: string | null
          last_read_at?: string | null
        }
        Update: {
          id?: string
          chat_id?: string
          user_id?: string
          last_read_message_id?: string | null
          last_read_at?: string | null
        }
      }
      typing_indicators: {
        Row: {
          id: string
          chat_id: string
          user_id: string
          started_at: string | null
        }
        Insert: {
          id?: string
          chat_id: string
          user_id: string
          started_at?: string | null
        }
        Update: {
          id?: string
          chat_id?: string
          user_id?: string
          started_at?: string | null
        }
      }
      friends: {
        Row: {
          id: string
          requester_id: string
          addressee_id: string
          status: string
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          requester_id: string
          addressee_id: string
          status?: string
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          requester_id?: string
          addressee_id?: string
          status?: string
          created_at?: string | null
          updated_at?: string | null
        }
      }
      blocked_users: {
        Row: {
          id: string
          blocker_id: string
          blocked_id: string
          created_at: string | null
        }
        Insert: {
          id?: string
          blocker_id: string
          blocked_id: string
          created_at?: string | null
        }
        Update: {
          id?: string
          blocker_id?: string
          blocked_id?: string
          created_at?: string | null
        }
      }
      chat_invites: {
        Row: {
          id: string
          chat_id: string
          code: string
          created_by: string
          max_uses: number | null
          uses_count: number
          expires_at: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          chat_id: string
          code: string
          created_by: string
          max_uses?: number | null
          uses_count?: number
          expires_at?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          chat_id?: string
          code?: string
          created_by?: string
          max_uses?: number | null
          uses_count?: number
          expires_at?: string | null
          created_at?: string | null
        }
      }
    }
    Views: {}
    Functions: {}
  }
}
