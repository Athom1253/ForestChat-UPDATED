/*
# Sidebar 2.0: Premium sidebar data function + presence tracking

## What this provides
A single RPC function `get_sidebar_data()` that returns everything the
frontend needs to render a premium sidebar:

1. All chats the user is a member of, organized by:
   - Pinned (is_pinned = true)
   - Direct Messages (type = 'dm', not pinned, not archived)
   - Groups (type = 'group', not pinned, not archived)
   - Archived (is_archived = true)

2. For each chat:
   - Chat name, type, avatar, description
   - Last message preview + timestamp
   - Unread count
   - Pin/archive/mute status
   - For DMs: the other user's id, username, display_name, avatar, status, last_seen
   - For groups: member count
   - Last message sender name (for "Emma: Rehearsal at 4" style previews)

3. A `update_presence()` function for the frontend to call on login/heartbeat
   to keep the user's status and last_seen accurate.

## Presence
The app_users table already has `status` and `last_seen` columns.
The frontend can update these via `update_presence(status)`.
Realtime on app_users broadcasts status changes to all clients.
*/

-- ═══════════════════════════════════════════════════════════
-- 1. Add last_message_sender_id and last_message_sender_name to chats
-- ═══════════════════════════════════════════════════════════
-- This avoids a JOIN on messages for every sidebar render.
ALTER TABLE chats ADD COLUMN IF NOT EXISTS last_message_sender_id uuid;
ALTER TABLE chats ADD COLUMN IF NOT EXISTS last_message_sender_name text;

-- ═══════════════════════════════════════════════════════════
-- 2. Update the message INSERT trigger to also store sender info
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION update_chat_last_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sender_name text;
BEGIN
  -- Get sender's display name for the preview
  SELECT COALESCE(display_name, username) INTO v_sender_name
  FROM app_users WHERE id = NEW.user_id;

  UPDATE public.chats SET
    last_message_at = NEW.created_at,
    last_message_preview = CASE
      WHEN NEW.message_type = 'voice' THEN '🎤 Voice message'
      WHEN NEW.message_type = 'image' THEN '📷 Image'
      WHEN NEW.message_type = 'video' THEN '🎬 Video'
      WHEN NEW.message_type = 'file' THEN '📎 File'
      WHEN NEW.message_type = 'poll' THEN '📊 Poll'
      WHEN NEW.content != '' THEN LEFT(NEW.content, 80)
      ELSE '[attachment]'
    END,
    last_message_sender_id = NEW.user_id,
    last_message_sender_name = v_sender_name
  WHERE id = NEW.chat_id;

  RETURN NEW;
END;
$$;

-- ═══════════════════════════════════════════════════════════
-- 3. Update the message UPDATE trigger to also update sender info
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION update_chat_last_message_on_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sender_name text;
BEGIN
  IF NEW.created_at >= (SELECT COALESCE(last_message_at, '1970-01-01') FROM public.chats WHERE id = NEW.chat_id) THEN
    SELECT COALESCE(display_name, username) INTO v_sender_name
    FROM app_users WHERE id = NEW.user_id;

    UPDATE public.chats SET
      last_message_preview = CASE
        WHEN NEW.is_deleted THEN '[deleted]'
        WHEN NEW.message_type = 'voice' THEN '🎤 Voice message'
        WHEN NEW.message_type = 'image' THEN '📷 Image'
        WHEN NEW.message_type = 'video' THEN '🎬 Video'
        WHEN NEW.message_type = 'file' THEN '📎 File'
        WHEN NEW.message_type = 'poll' THEN '📊 Poll'
        WHEN NEW.content != '' THEN LEFT(NEW.content, 80)
        ELSE '[attachment]'
      END,
      last_message_sender_id = NEW.user_id,
      last_message_sender_name = v_sender_name
    WHERE id = NEW.chat_id;
  END IF;
  RETURN NEW;
END;
$$;

-- ═══════════════════════════════════════════════════════════
-- 4. Backfill last_message_sender_id and last_message_sender_name
-- ═══════════════════════════════════════════════════════════
UPDATE chats c SET
  last_message_sender_id = sub.user_id,
  last_message_sender_name = sub.sender_name
FROM (
  SELECT m.chat_id, m.user_id,
    (SELECT COALESCE(au.display_name, au.username) FROM app_users au WHERE au.id = m.user_id) as sender_name,
    ROW_NUMBER() OVER (PARTITION BY m.chat_id ORDER BY m.created_at DESC) as rn
  FROM messages m
  WHERE m.is_deleted = false
) sub
WHERE sub.chat_id = c.id AND sub.rn = 1
  AND c.last_message_sender_id IS NULL;

-- ═══════════════════════════════════════════════════════════
-- 5. Add update_presence function
-- ═══════════════════════════════════════════════════════════
CREATE FUNCTION update_presence(p_status text DEFAULT 'online', p_status_message text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  UPDATE app_users SET
    status = p_status,
    last_seen = now(),
    status_message = COALESCE(p_status_message, status_message)
  WHERE id = auth.uid();
END;
$$;

-- ═══════════════════════════════════════════════════════════
-- 6. Add get_sidebar_data function
-- ═══════════════════════════════════════════════════════════
-- Returns ALL data needed for the premium sidebar in a single call.
-- The frontend calls this once on load, then uses realtime for updates.
CREATE FUNCTION get_sidebar_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT jsonb_build_object(
    'chats', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', c.id,
          'name', c.name,
          'type', c.type,
          'description', c.description,
          'avatar_url', c.avatar_url,
          'last_message_at', c.last_message_at,
          'last_message_preview', c.last_message_preview,
          'last_message_sender_id', c.last_message_sender_id,
          'last_message_sender_name', c.last_message_sender_name,
          'is_pinned', cm.is_pinned,
          'is_archived', cm.is_archived,
          'is_muted', cm.is_muted,
          'role', cm.role,
          'unread_count', COALESCE(
            (SELECT COUNT(*) FROM messages m
             WHERE m.chat_id = c.id
             AND m.user_id != v_uid
             AND m.is_deleted = false
             AND m.created_at > COALESCE(
               (SELECT rr.last_read_at FROM read_receipts rr
                WHERE rr.chat_id = c.id AND rr.user_id = v_uid),
               '1970-01-01'::timestamptz
             )),
            0
          ),
          -- For DMs: the other user's info
          'dm_partner', CASE
            WHEN c.type = 'dm' THEN (
              SELECT jsonb_build_object(
                'id', au.id,
                'username', au.username,
                'display_name', au.display_name,
                'avatar_url', au.avatar_url,
                'status', au.status,
                'last_seen', au.last_seen,
                'do_not_disturb', au.do_not_disturb
              )
              FROM app_users au
              WHERE au.id = (
                SELECT cm2.user_id FROM chat_memberships cm2
                WHERE cm2.chat_id = c.id AND cm2.user_id != v_uid
                LIMIT 1
              )
            )
            ELSE NULL
          END,
          -- For groups: member count and invite code
          'member_count', CASE
            WHEN c.type = 'group' THEN (
              SELECT COUNT(*) FROM chat_memberships WHERE chat_id = c.id
            )
            ELSE NULL
          END,
          'invite_code', c.invite_code
        )
        ORDER BY
          cm.is_archived ASC,
          cm.is_pinned DESC,
          c.last_message_at DESC NULLS LAST
      )
      FROM chats c
      JOIN chat_memberships cm ON cm.chat_id = c.id AND cm.user_id = v_uid
    ), '[]'::jsonb),
    'current_user', (
      SELECT jsonb_build_object(
        'id', au.id,
        'username', au.username,
        'display_name', au.display_name,
        'avatar_url', au.avatar_url,
        'status', au.status,
        'is_admin', au.is_admin
      )
      FROM app_users au WHERE au.id = v_uid
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- ═══════════════════════════════════════════════════════════
-- 7. Add mark_chat_read function (simplified mark_as_read that also clears unread)
-- ═══════════════════════════════════════════════════════════
CREATE FUNCTION mark_chat_read(p_chat_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_last_msg_id uuid;
  v_last_msg_at timestamptz;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT is_chat_member(p_chat_id) THEN RAISE EXCEPTION 'Not a member of this chat'; END IF;

  -- Get the latest message in this chat
  SELECT id, created_at INTO v_last_msg_id, v_last_msg_at
  FROM messages
  WHERE chat_id = p_chat_id AND is_deleted = false
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_last_msg_id IS NULL THEN
    -- No messages, just upsert a read receipt with now()
    INSERT INTO read_receipts (chat_id, user_id, last_read_at)
    VALUES (p_chat_id, v_uid, now())
    ON CONFLICT (chat_id, user_id)
    DO UPDATE SET last_read_at = now(), last_read_message_id = NULL;
  ELSE
    -- Upsert read receipt
    INSERT INTO read_receipts (chat_id, user_id, last_read_message_id, last_read_at)
    VALUES (p_chat_id, v_uid, v_last_msg_id, COALESCE(v_last_msg_at, now()))
    ON CONFLICT (chat_id, user_id)
    DO UPDATE SET
      last_read_message_id = EXCLUDED.last_read_message_id,
      last_read_at = GREATEST(read_receipts.last_read_at, EXCLUDED.last_read_at);
  END IF;
END;
$$;
