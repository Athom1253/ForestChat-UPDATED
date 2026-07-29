-- Create views that map the frontend's expected table/column names to the actual schema.
-- This lets the frontend code (which uses 'profiles', 'channels', 'channel_members', 'pets', etc.)
-- work against the actual tables ('app_users', 'chats', 'chat_memberships', 'user_pets', etc.)

-- profiles -> app_users
CREATE OR REPLACE VIEW profiles AS
SELECT
  id,
  username,
  display_name,
  bio,
  avatar_url,
  banner_url,
  status_message,
  status,
  is_admin,
  created_at AS join_date,
  last_seen,
  last_seen AS updated_at
FROM app_users;

-- channels -> chats
CREATE OR REPLACE VIEW channels AS
SELECT
  id,
  type,
  name,
  description,
  avatar_url AS icon_url,
  created_by AS owner_id,
  false AS is_private,
  invite_code,
  created_at,
  last_message_at AS updated_at
FROM chats;

-- channel_members -> chat_memberships
CREATE OR REPLACE VIEW channel_members AS
SELECT
  id,
  chat_id AS channel_id,
  user_id,
  role,
  is_pinned,
  is_archived,
  is_muted AS muted,
  0 AS unread_count,
  joined_at
FROM chat_memberships;

-- pets -> user_pets
CREATE OR REPLACE VIEW pets AS
SELECT
  id,
  user_id AS owner_id,
  name,
  species,
  CASE
    WHEN happiness >= 80 THEN 'happy'
    WHEN happiness <= 30 THEN 'sad'
    WHEN energy <= 20 THEN 'sleepy'
    WHEN happiness >= 60 THEN 'excited'
    ELSE 'neutral'
  END AS mood,
  energy,
  hunger,
  happiness,
  level AS growth,
  xp,
  level,
  color_variant AS color,
  accessories::text AS accessory,
  last_fed_at AS last_fed,
  last_played_at AS last_played,
  updated_at AS last_updated,
  created_at
FROM user_pets;

-- reactions -> message_reactions
CREATE OR REPLACE VIEW reactions AS
SELECT
  id,
  message_id,
  user_id,
  emoji,
  created_at
FROM message_reactions;

-- master_invites -> invite_codes (only master invites)
CREATE OR REPLACE VIEW master_invites AS
SELECT
  id,
  code,
  note AS label,
  max_uses,
  uses_count AS use_count,
  is_active,
  created_by,
  created_at,
  expires_at
FROM invite_codes
WHERE is_master = true OR is_active = true;

-- message_reads -> read_receipts
CREATE OR REPLACE VIEW message_reads AS
SELECT
  id,
  chat_id AS channel_id,
  user_id,
  last_read_message_id,
  last_read_at
FROM read_receipts;

-- user_settings: no underlying table exists; derive from app_users.animation_prefs
CREATE OR REPLACE VIEW user_settings AS
SELECT
  gen_random_uuid() AS id,
  id AS user_id,
  'forest' AS theme,
  'none' AS animated_background,
  true AS notifications_enabled,
  true AS notification_sound,
  false AS email_notifications,
  true AS show_online_status,
  false AS allow_dm_from_friends_only,
  true AS read_receipts_enabled,
  true AS typing_indicators_enabled,
  false AS compact_mode,
  false AS reduced_motion,
  animation_prefs AS custom_data,
  last_seen AS updated_at
FROM app_users;

-- Enable RLS on views (views inherit RLS from underlying tables, but we set this for clarity)
-- Note: views automatically respect RLS of underlying tables.

-- Grant access
GRANT SELECT, INSERT, UPDATE, DELETE ON profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON channels TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON channel_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON pets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON reactions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON master_invites TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON message_reads TO authenticated;
GRANT SELECT, UPDATE ON user_settings TO authenticated;
