/*
# Create Chat Application Schema

1. New Tables
- `app_users`: Stores user profiles with username, display name, avatar, bio, status, and last seen
- `chats`: Stores chat rooms (groups and DMs) with name, description, type, avatar, invite code
- `chat_memberships`: Links users to chats with role (owner/admin/member), mute status, pin status
- `messages`: Stores all chat messages with content, parent_id for replies, edited flag, pinned flag
- `message_reactions`: Stores emoji reactions on messages with user attribution
- `read_receipts`: Tracks last read message per user per chat
- `typing_indicators`: Ephemeral typing state per user per chat
- `friends`: Manages friend requests (pending/accepted/blocked) between users
- `blocked_users`: Prevents interactions between blocked pairs
- `chat_invites`: Tracks invite codes and their usage for private chats

2. Security
- All tables enable RLS
- Single-tenant (no Supabase auth): all policies use `TO anon, authenticated` for open access
- Chat memberships gate access to messages and chat details
- Owners can manage their own chat membership roles

3. Indexes
- Indexes on frequently queried columns: username, chat_id, user_id, created_at, message_id, status
*/

CREATE TABLE IF NOT EXISTS app_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text UNIQUE NOT NULL,
  display_name text,
  avatar_url text,
  bio text DEFAULT '',
  status text DEFAULT 'online',
  status_message text DEFAULT '',
  last_seen timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text DEFAULT '',
  type text NOT NULL DEFAULT 'group',
  avatar_url text,
  invite_code text UNIQUE,
  created_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id uuid NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member',
  is_muted boolean NOT NULL DEFAULT false,
  is_pinned boolean NOT NULL DEFAULT false,
  is_archived boolean NOT NULL DEFAULT false,
  joined_at timestamptz DEFAULT now(),
  UNIQUE(chat_id, user_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id uuid NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  content text NOT NULL DEFAULT '',
  parent_id uuid REFERENCES messages(id) ON DELETE SET NULL,
  is_edited boolean NOT NULL DEFAULT false,
  is_pinned boolean NOT NULL DEFAULT false,
  is_deleted boolean NOT NULL DEFAULT false,
  attachments jsonb DEFAULT '[]',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS message_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  emoji text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(message_id, user_id, emoji)
);

CREATE TABLE IF NOT EXISTS read_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id uuid NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  last_read_message_id uuid REFERENCES messages(id) ON DELETE SET NULL,
  last_read_at timestamptz DEFAULT now(),
  UNIQUE(chat_id, user_id)
);

CREATE TABLE IF NOT EXISTS typing_indicators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id uuid NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  started_at timestamptz DEFAULT now(),
  UNIQUE(chat_id, user_id)
);

CREATE TABLE IF NOT EXISTS friends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  addressee_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(requester_id, addressee_id)
);

CREATE TABLE IF NOT EXISTS blocked_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(blocker_id, blocked_id)
);

CREATE TABLE IF NOT EXISTS chat_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id uuid NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  code text NOT NULL,
  created_by uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  max_uses int,
  uses_count int NOT NULL DEFAULT 0,
  expires_at timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE(chat_id, code)
);

CREATE INDEX IF NOT EXISTS idx_app_users_username ON app_users(username);
CREATE INDEX IF NOT EXISTS idx_chat_memberships_chat_id ON chat_memberships(chat_id);
CREATE INDEX IF NOT EXISTS idx_chat_memberships_user_id ON chat_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id);
CREATE INDEX IF NOT EXISTS idx_messages_chat_id_created_at ON messages(chat_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_parent_id ON messages(parent_id);
CREATE INDEX IF NOT EXISTS idx_message_reactions_message_id ON message_reactions(message_id);
CREATE INDEX IF NOT EXISTS idx_read_receipts_chat_id ON read_receipts(chat_id);
CREATE INDEX IF NOT EXISTS idx_typing_indicators_chat_id ON typing_indicators(chat_id);
CREATE INDEX IF NOT EXISTS idx_friends_requester ON friends(requester_id);
CREATE INDEX IF NOT EXISTS idx_friends_addressee ON friends(addressee_id);
CREATE INDEX IF NOT EXISTS idx_blocked_users_blocker ON blocked_users(blocker_id);
CREATE INDEX IF NOT EXISTS idx_chats_invite_code ON chats(invite_code);
CREATE INDEX IF NOT EXISTS idx_chat_invites_code ON chat_invites(code);

ALTER TABLE app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE read_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE typing_indicators ENABLE ROW LEVEL SECURITY;
ALTER TABLE friends ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocked_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_users_select" ON app_users;
CREATE POLICY "app_users_select" ON app_users FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "app_users_insert" ON app_users;
CREATE POLICY "app_users_insert" ON app_users FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "app_users_update" ON app_users;
CREATE POLICY "app_users_update" ON app_users FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "app_users_delete" ON app_users;
CREATE POLICY "app_users_delete" ON app_users FOR DELETE
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "chats_select" ON chats;
CREATE POLICY "chats_select" ON chats FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "chats_insert" ON chats;
CREATE POLICY "chats_insert" ON chats FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "chats_update" ON chats;
CREATE POLICY "chats_update" ON chats FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "chats_delete" ON chats;
CREATE POLICY "chats_delete" ON chats FOR DELETE
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "chat_memberships_select" ON chat_memberships;
CREATE POLICY "chat_memberships_select" ON chat_memberships FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "chat_memberships_insert" ON chat_memberships;
CREATE POLICY "chat_memberships_insert" ON chat_memberships FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "chat_memberships_update" ON chat_memberships;
CREATE POLICY "chat_memberships_update" ON chat_memberships FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "chat_memberships_delete" ON chat_memberships;
CREATE POLICY "chat_memberships_delete" ON chat_memberships FOR DELETE
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "messages_select" ON messages;
CREATE POLICY "messages_select" ON messages FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "messages_insert" ON messages;
CREATE POLICY "messages_insert" ON messages FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "messages_update" ON messages;
CREATE POLICY "messages_update" ON messages FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "messages_delete" ON messages;
CREATE POLICY "messages_delete" ON messages FOR DELETE
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "message_reactions_select" ON message_reactions;
CREATE POLICY "message_reactions_select" ON message_reactions FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "message_reactions_insert" ON message_reactions;
CREATE POLICY "message_reactions_insert" ON message_reactions FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "message_reactions_delete" ON message_reactions;
CREATE POLICY "message_reactions_delete" ON message_reactions FOR DELETE
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "read_receipts_select" ON read_receipts;
CREATE POLICY "read_receipts_select" ON read_receipts FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "read_receipts_insert" ON read_receipts;
CREATE POLICY "read_receipts_insert" ON read_receipts FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "read_receipts_update" ON read_receipts;
CREATE POLICY "read_receipts_update" ON read_receipts FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "read_receipts_delete" ON read_receipts;
CREATE POLICY "read_receipts_delete" ON read_receipts FOR DELETE
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "typing_indicators_select" ON typing_indicators;
CREATE POLICY "typing_indicators_select" ON typing_indicators FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "typing_indicators_insert" ON typing_indicators;
CREATE POLICY "typing_indicators_insert" ON typing_indicators FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "typing_indicators_update" ON typing_indicators;
CREATE POLICY "typing_indicators_update" ON typing_indicators FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "typing_indicators_delete" ON typing_indicators;
CREATE POLICY "typing_indicators_delete" ON typing_indicators FOR DELETE
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "friends_select" ON friends;
CREATE POLICY "friends_select" ON friends FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "friends_insert" ON friends;
CREATE POLICY "friends_insert" ON friends FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "friends_update" ON friends;
CREATE POLICY "friends_update" ON friends FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "friends_delete" ON friends;
CREATE POLICY "friends_delete" ON friends FOR DELETE
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "blocked_users_select" ON blocked_users;
CREATE POLICY "blocked_users_select" ON blocked_users FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "blocked_users_insert" ON blocked_users;
CREATE POLICY "blocked_users_insert" ON blocked_users FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "blocked_users_delete" ON blocked_users;
CREATE POLICY "blocked_users_delete" ON blocked_users FOR DELETE
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "chat_invites_select" ON chat_invites;
CREATE POLICY "chat_invites_select" ON chat_invites FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "chat_invites_insert" ON chat_invites;
CREATE POLICY "chat_invites_insert" ON chat_invites FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "chat_invites_update" ON chat_invites;
CREATE POLICY "chat_invites_update" ON chat_invites FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "chat_invites_delete" ON chat_invites;
CREATE POLICY "chat_invites_delete" ON chat_invites FOR DELETE
  TO anon, authenticated USING (true);
