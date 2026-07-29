/*
# ForestChat Initial Schema

## Overview
Complete database schema for ForestChat — real-time chat with channels, DMs, group chats,
friends, invite codes, reactions, replies, file/drawing/voice messages, virtual pets, and admin tools.

## New Tables
1. profiles — user data (display name, bio, avatar, banner, status, join date)
2. master_invites — invite codes that gate sign-up (admin-managed)
3. channels — chat channels (dm, group, room)
4. channel_members — junction linking users to channels (roles, pinned, archived, unread)
5. messages — all messages (text/image/file/drawing/voice, replies, edits, soft-delete)
6. reactions — emoji reactions
7. message_reads — read receipts
8. friends — friend relationships (pending/accepted/blocked)
9. pets — virtual pets (mood, energy, growth, customization)
10. pet_items — pet inventory
11. pet_achievements — pet achievements
12. reports — moderation reports
13. user_settings — per-user settings
14. admin_logs — admin audit log

## Security
- RLS on every table.
- Profiles: all authenticated can read, update own only.
- Master invites: all can read (for validation), admin-only insert/update/delete.
- Channels: members can read, owner can insert/update/delete.
- Channel members: members can read, insert own, update own, delete own.
- Messages: channel members read, authenticated insert (membership checked), author update/delete.
- Reactions: channel members read, insert/delete own.
- Message reads: read/update own.
- Friends: read own friendships, insert/update/delete own.
- Pets: all read, insert/update/delete own.
- Pet items/achievements: read/insert own.
- Reports: read own or admin, insert own, update admin.
- User settings: read/update own.
- Admin logs: admin read only.
- Admin = profiles.is_admin = true.

## Notes
- Owner columns default to auth.uid().
- Soft-delete for messages (deleted_at).
- Realtime enabled on messages, reactions, channel_members, friends, profiles, pets.
- Storage buckets: avatars, attachments, drawings, voice (all public-read, auth-write).
- Auto-create profile + settings on signup via trigger.
*/

-- ============================================================================
-- 1. PROFILES
-- ============================================================================
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text UNIQUE NOT NULL,
  display_name text,
  bio text DEFAULT '',
  avatar_url text,
  banner_url text,
  status_message text DEFAULT '',
  status text DEFAULT 'offline',
  is_admin boolean NOT NULL DEFAULT false,
  join_date timestamptz DEFAULT now(),
  last_seen timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_all" ON profiles;
CREATE POLICY "profiles_select_all" ON profiles FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "profiles_insert_own" ON profiles;
CREATE POLICY "profiles_insert_own" ON profiles FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE
  TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- ============================================================================
-- 2. MASTER INVITES
-- ============================================================================
CREATE TABLE IF NOT EXISTS master_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  label text DEFAULT '',
  max_uses int,
  use_count int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz
);

ALTER TABLE master_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "master_invites_select_all" ON master_invites;
CREATE POLICY "master_invites_select_all" ON master_invites FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "master_invites_insert_admin" ON master_invites;
CREATE POLICY "master_invites_insert_admin" ON master_invites FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

DROP POLICY IF EXISTS "master_invites_update_admin" ON master_invites;
CREATE POLICY "master_invites_update_admin" ON master_invites FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

DROP POLICY IF EXISTS "master_invites_delete_admin" ON master_invites;
CREATE POLICY "master_invites_delete_admin" ON master_invites FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- ============================================================================
-- 3. CHANNELS (table only, RLS after channel_members exists)
-- ============================================================================
CREATE TABLE IF NOT EXISTS channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL DEFAULT 'group',
  name text,
  description text DEFAULT '',
  icon_url text,
  owner_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  is_private boolean NOT NULL DEFAULT false,
  invite_code text UNIQUE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE channels ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 4. CHANNEL MEMBERS
-- ============================================================================
CREATE TABLE IF NOT EXISTS channel_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member',
  is_pinned boolean NOT NULL DEFAULT false,
  is_archived boolean NOT NULL DEFAULT false,
  muted boolean NOT NULL DEFAULT false,
  unread_count int NOT NULL DEFAULT 0,
  joined_at timestamptz DEFAULT now(),
  UNIQUE(channel_id, user_id)
);

ALTER TABLE channel_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "channel_members_select_own" ON channel_members;
CREATE POLICY "channel_members_select_own" ON channel_members FOR SELECT
  TO authenticated USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM channel_members cm2
      WHERE cm2.channel_id = channel_members.channel_id
      AND cm2.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "channel_members_insert_own" ON channel_members;
CREATE POLICY "channel_members_insert_own" ON channel_members FOR INSERT
  TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "channel_members_update_own" ON channel_members;
CREATE POLICY "channel_members_update_own" ON channel_members FOR UPDATE
  TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "channel_members_delete_own" ON channel_members;
CREATE POLICY "channel_members_delete_own" ON channel_members FOR DELETE
  TO authenticated USING (user_id = auth.uid());

-- Now add channels RLS policies (channel_members exists now)
DROP POLICY IF EXISTS "channels_select_members" ON channels;
CREATE POLICY "channels_select_members" ON channels FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM channel_members
      WHERE channel_members.channel_id = channels.id
      AND channel_members.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "channels_insert_own" ON channels;
CREATE POLICY "channels_insert_own" ON channels FOR INSERT
  TO authenticated WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "channels_update_owner" ON channels;
CREATE POLICY "channels_update_owner" ON channels FOR UPDATE
  TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "channels_delete_owner" ON channels;
CREATE POLICY "channels_delete_owner" ON channels FOR DELETE
  TO authenticated USING (owner_id = auth.uid());

-- ============================================================================
-- 5. MESSAGES
-- ============================================================================
CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  author_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  content text DEFAULT '',
  message_type text NOT NULL DEFAULT 'text',
  reply_to uuid REFERENCES messages(id) ON DELETE SET NULL,
  attachment_url text,
  attachment_name text,
  attachment_size bigint,
  attachment_metadata jsonb,
  edited_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "messages_select_members" ON messages;
CREATE POLICY "messages_select_members" ON messages FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM channel_members
      WHERE channel_members.channel_id = messages.channel_id
      AND channel_members.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "messages_insert_members" ON messages;
CREATE POLICY "messages_insert_members" ON messages FOR INSERT
  TO authenticated WITH CHECK (
    author_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM channel_members
      WHERE channel_members.channel_id = messages.channel_id
      AND channel_members.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "messages_update_own" ON messages;
CREATE POLICY "messages_update_own" ON messages FOR UPDATE
  TO authenticated USING (author_id = auth.uid()) WITH CHECK (author_id = auth.uid());

DROP POLICY IF EXISTS "messages_delete_own" ON messages;
CREATE POLICY "messages_delete_own" ON messages FOR DELETE
  TO authenticated USING (author_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_messages_channel_created ON messages(channel_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_reply ON messages(reply_to);

-- ============================================================================
-- 6. REACTIONS
-- ============================================================================
CREATE TABLE IF NOT EXISTS reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  emoji text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(message_id, user_id, emoji)
);

ALTER TABLE reactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reactions_select_members" ON reactions;
CREATE POLICY "reactions_select_members" ON reactions FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM messages m
      JOIN channel_members cm ON cm.channel_id = m.channel_id
      WHERE m.id = reactions.message_id AND cm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "reactions_insert_own" ON reactions;
CREATE POLICY "reactions_insert_own" ON reactions FOR INSERT
  TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "reactions_delete_own" ON reactions;
CREATE POLICY "reactions_delete_own" ON reactions FOR DELETE
  TO authenticated USING (user_id = auth.uid());

-- ============================================================================
-- 7. MESSAGE READS
-- ============================================================================
CREATE TABLE IF NOT EXISTS message_reads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  last_read_message_id uuid REFERENCES messages(id) ON DELETE SET NULL,
  last_read_at timestamptz DEFAULT now(),
  UNIQUE(channel_id, user_id)
);

ALTER TABLE message_reads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "message_reads_select_own" ON message_reads;
CREATE POLICY "message_reads_select_own" ON message_reads FOR SELECT
  TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "message_reads_insert_own" ON message_reads;
CREATE POLICY "message_reads_insert_own" ON message_reads FOR INSERT
  TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "message_reads_update_own" ON message_reads;
CREATE POLICY "message_reads_update_own" ON message_reads FOR UPDATE
  TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ============================================================================
-- 8. FRIENDS
-- ============================================================================
CREATE TABLE IF NOT EXISTS friends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  addressee_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(requester_id, addressee_id)
);

ALTER TABLE friends ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "friends_select_own" ON friends;
CREATE POLICY "friends_select_own" ON friends FOR SELECT
  TO authenticated USING (requester_id = auth.uid() OR addressee_id = auth.uid());

DROP POLICY IF EXISTS "friends_insert_own" ON friends;
CREATE POLICY "friends_insert_own" ON friends FOR INSERT
  TO authenticated WITH CHECK (requester_id = auth.uid());

DROP POLICY IF EXISTS "friends_update_own" ON friends;
CREATE POLICY "friends_update_own" ON friends FOR UPDATE
  TO authenticated USING (requester_id = auth.uid() OR addressee_id = auth.uid())
  WITH CHECK (requester_id = auth.uid() OR addressee_id = auth.uid());

DROP POLICY IF EXISTS "friends_delete_own" ON friends;
CREATE POLICY "friends_delete_own" ON friends FOR DELETE
  TO authenticated USING (requester_id = auth.uid() OR addressee_id = auth.uid());

-- ============================================================================
-- 9. PETS
-- ============================================================================
CREATE TABLE IF NOT EXISTS pets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'My Pet',
  species text NOT NULL DEFAULT 'forest_sprite',
  mood text NOT NULL DEFAULT 'happy',
  energy int NOT NULL DEFAULT 100,
  hunger int NOT NULL DEFAULT 0,
  happiness int NOT NULL DEFAULT 100,
  growth int NOT NULL DEFAULT 1,
  xp int NOT NULL DEFAULT 0,
  level int NOT NULL DEFAULT 1,
  color text DEFAULT '#4ade80',
  accessory text,
  last_fed timestamptz,
  last_played timestamptz,
  last_updated timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE pets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pets_select_all" ON pets;
CREATE POLICY "pets_select_all" ON pets FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "pets_insert_own" ON pets;
CREATE POLICY "pets_insert_own" ON pets FOR INSERT
  TO authenticated WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "pets_update_own" ON pets;
CREATE POLICY "pets_update_own" ON pets FOR UPDATE
  TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "pets_delete_own" ON pets;
CREATE POLICY "pets_delete_own" ON pets FOR DELETE
  TO authenticated USING (owner_id = auth.uid());

-- ============================================================================
-- 10. PET ITEMS
-- ============================================================================
CREATE TABLE IF NOT EXISTS pet_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pet_id uuid NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  item_type text NOT NULL,
  item_name text NOT NULL,
  quantity int NOT NULL DEFAULT 1,
  metadata jsonb DEFAULT '{}',
  acquired_at timestamptz DEFAULT now()
);

ALTER TABLE pet_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pet_items_select_own" ON pet_items;
CREATE POLICY "pet_items_select_own" ON pet_items FOR SELECT
  TO authenticated USING (owner_id = auth.uid());

DROP POLICY IF EXISTS "pet_items_insert_own" ON pet_items;
CREATE POLICY "pet_items_insert_own" ON pet_items FOR INSERT
  TO authenticated WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "pet_items_update_own" ON pet_items;
CREATE POLICY "pet_items_update_own" ON pet_items FOR UPDATE
  TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "pet_items_delete_own" ON pet_items;
CREATE POLICY "pet_items_delete_own" ON pet_items FOR DELETE
  TO authenticated USING (owner_id = auth.uid());

-- ============================================================================
-- 11. PET ACHIEVEMENTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS pet_achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pet_id uuid NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  achievement_id text NOT NULL,
  achievement_name text NOT NULL,
  unlocked_at timestamptz DEFAULT now(),
  UNIQUE(pet_id, achievement_id)
);

ALTER TABLE pet_achievements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pet_achievements_select_own" ON pet_achievements;
CREATE POLICY "pet_achievements_select_own" ON pet_achievements FOR SELECT
  TO authenticated USING (owner_id = auth.uid());

DROP POLICY IF EXISTS "pet_achievements_insert_own" ON pet_achievements;
CREATE POLICY "pet_achievements_insert_own" ON pet_achievements FOR INSERT
  TO authenticated WITH CHECK (owner_id = auth.uid());

-- ============================================================================
-- 12. REPORTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  reported_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  reported_message_id uuid REFERENCES messages(id) ON DELETE SET NULL,
  reason text NOT NULL,
  description text DEFAULT '',
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES profiles(id) ON DELETE SET NULL
);

ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reports_select_own_or_admin" ON reports;
CREATE POLICY "reports_select_own_or_admin" ON reports FOR SELECT
  TO authenticated USING (
    reporter_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

DROP POLICY IF EXISTS "reports_insert_own" ON reports;
CREATE POLICY "reports_insert_own" ON reports FOR INSERT
  TO authenticated WITH CHECK (reporter_id = auth.uid());

DROP POLICY IF EXISTS "reports_update_admin" ON reports;
CREATE POLICY "reports_update_admin" ON reports FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- ============================================================================
-- 13. USER SETTINGS
-- ============================================================================
CREATE TABLE IF NOT EXISTS user_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  theme text NOT NULL DEFAULT 'forest',
  animated_background text DEFAULT 'fireflies',
  notifications_enabled boolean NOT NULL DEFAULT true,
  notification_sound boolean NOT NULL DEFAULT true,
  email_notifications boolean NOT NULL DEFAULT false,
  show_online_status boolean NOT NULL DEFAULT true,
  allow_dm_from_friends_only boolean NOT NULL DEFAULT false,
  read_receipts_enabled boolean NOT NULL DEFAULT true,
  typing_indicators_enabled boolean NOT NULL DEFAULT true,
  compact_mode boolean NOT NULL DEFAULT false,
  reduced_motion boolean NOT NULL DEFAULT false,
  custom_data jsonb DEFAULT '{}',
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_settings_select_own" ON user_settings;
CREATE POLICY "user_settings_select_own" ON user_settings FOR SELECT
  TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "user_settings_insert_own" ON user_settings;
CREATE POLICY "user_settings_insert_own" ON user_settings FOR INSERT
  TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "user_settings_update_own" ON user_settings;
CREATE POLICY "user_settings_update_own" ON user_settings FOR UPDATE
  TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ============================================================================
-- 14. ADMIN LOGS
-- ============================================================================
CREATE TABLE IF NOT EXISTS admin_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  action text NOT NULL,
  target_id uuid,
  target_type text,
  details jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE admin_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_logs_select_admin" ON admin_logs;
CREATE POLICY "admin_logs_select_admin" ON admin_logs FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- ============================================================================
-- TRIGGERS
-- ============================================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, username, display_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1))
  )
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO user_settings (user_id) VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================================
-- REALTIME
-- ============================================================================
ALTER TABLE messages REPLICA IDENTITY FULL;
ALTER TABLE reactions REPLICA IDENTITY FULL;
ALTER TABLE channel_members REPLICA IDENTITY FULL;
ALTER TABLE friends REPLICA IDENTITY FULL;
ALTER TABLE profiles REPLICA IDENTITY FULL;
ALTER TABLE pets REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'messages') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE messages;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'reactions') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE reactions;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'channel_members') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE channel_members;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'friends') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE friends;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'profiles') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE profiles;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'pets') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE pets;
  END IF;
END $$;

-- ============================================================================
-- STORAGE BUCKETS
-- ============================================================================
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('attachments', 'attachments', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('drawings', 'drawings', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('voice', 'voice', true) ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "avatar_upload_own" ON storage.objects;
CREATE POLICY "avatar_upload_own" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'avatars');

DROP POLICY IF EXISTS "avatar_read_all" ON storage.objects;
CREATE POLICY "avatar_read_all" ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "attachments_upload_own" ON storage.objects;
CREATE POLICY "attachments_upload_own" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'attachments');

DROP POLICY IF EXISTS "attachments_read_all" ON storage.objects;
CREATE POLICY "attachments_read_all" ON storage.objects
  FOR SELECT USING (bucket_id = 'attachments');

DROP POLICY IF EXISTS "drawings_upload_own" ON storage.objects;
CREATE POLICY "drawings_upload_own" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'drawings');

DROP POLICY IF EXISTS "drawings_read_all" ON storage.objects;
CREATE POLICY "drawings_read_all" ON storage.objects
  FOR SELECT USING (bucket_id = 'drawings');

DROP POLICY IF EXISTS "voice_upload_own" ON storage.objects;
CREATE POLICY "voice_upload_own" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'voice');

DROP POLICY IF EXISTS "voice_read_all" ON storage.objects;
CREATE POLICY "voice_read_all" ON storage.objects
  FOR SELECT USING (bucket_id = 'voice');
