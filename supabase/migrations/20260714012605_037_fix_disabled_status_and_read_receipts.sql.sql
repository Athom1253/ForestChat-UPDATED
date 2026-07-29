/*
# Fix: Disabled user status bug + Read receipt system + Admin improvements

## Bug 1: Users showing as "Disabled" without admin action

### Root Cause
Migration 031 ran: UPDATE app_users SET is_disabled = true WHERE NOT EXISTS
(SELECT 1 FROM auth.users WHERE id = au.id)

This disabled 6 old accounts that had no auth.users entry. These accounts
were NOT disabled by an admin - they were disabled by a data cleanup
migration. The admin panel correctly shows is_disabled as a "Disabled" badge.

### Fix
1. Re-enable all 6 orphaned accounts (set is_disabled = false)
2. Update admin_get_all_users to return whether the user has an auth entry
3. The admin panel can show "No Login" for accounts without auth entries
   instead of "Disabled"

## Bug 2: No mark_as_read function

### Root Cause
The frontend was doing direct INSERT/UPDATE on read_receipts, which could
race and create duplicates (though the unique constraint prevents this).
There's no RPC function for marking messages as read.

### Fix
Add mark_as_read function that upserts a read receipt.

## Bug 3: No way to get message read status

### Fix
Add get_message_read_status function that returns read receipts for a chat.
*/

-- ═══════════════════════════════════════════════════════════
-- 1. Re-enable orphaned accounts (undo migration 031's overreach)
-- ═══════════════════════════════════════════════════════════
-- These accounts have no auth.users entry but should NOT be marked as
-- disabled. is_disabled should only be set by admin action.
-- The admin panel will show "No Login" for accounts without auth entries.
UPDATE app_users
SET is_disabled = false
WHERE is_disabled = true
AND NOT EXISTS (SELECT 1 FROM auth.users WHERE id = app_users.id)
-- Only re-enable if there's no admin audit log entry for disabling them
AND NOT EXISTS (
  SELECT 1 FROM admin_audit_log
  WHERE action = 'disable_user'
  AND target_id = app_users.id
);

-- ═══════════════════════════════════════════════════════════
-- 2. Update admin_get_all_users to include auth status
-- ═══════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS admin_get_all_users();

CREATE FUNCTION admin_get_all_users()
RETURNS TABLE(
  id uuid,
  username text,
  display_name text,
  avatar_url text,
  bio text,
  status text,
  last_seen timestamp with time zone,
  created_at timestamp with time zone,
  is_admin boolean,
  is_disabled boolean,
  is_suspended boolean,
  suspended_until timestamp with time zone,
  has_auth_account boolean,
  pet_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_app_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  RETURN QUERY
  SELECT
    au.id, au.username, au.display_name, au.avatar_url, au.bio, au.status,
    au.last_seen, au.created_at, au.is_admin, au.is_disabled, au.is_suspended,
    au.suspended_until,
    EXISTS(SELECT 1 FROM auth.users WHERE id = au.id) as has_auth_account,
    (SELECT name FROM user_pets WHERE user_id = au.id LIMIT 1) as pet_name
  FROM app_users au
  ORDER BY au.created_at DESC;
END;
$$;

-- ═══════════════════════════════════════════════════════════
-- 3. Add mark_as_read function
-- ═══════════════════════════════════════════════════════════
CREATE FUNCTION mark_as_read(p_chat_id uuid, p_message_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current uuid;
  v_last_message_id uuid;
  v_last_message_at timestamptz;
BEGIN
  v_current := auth.uid();
  IF v_current IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  -- Verify user is a member of this chat
  IF NOT is_chat_member(p_chat_id) THEN
    RAISE EXCEPTION 'Not a member of this chat';
  END IF;

  -- If no message_id provided, get the latest message in the chat
  IF p_message_id IS NULL THEN
    SELECT id INTO v_last_message_id
    FROM messages
    WHERE chat_id = p_chat_id AND is_deleted = false
    ORDER BY created_at DESC
    LIMIT 1;
  ELSE
    v_last_message_id := p_message_id;
  END IF;

  IF v_last_message_id IS NULL THEN
    RETURN; -- No messages to mark as read
  END IF;

  -- Get the created_at of the message being marked as read
  SELECT created_at INTO v_last_message_at
  FROM messages WHERE id = v_last_message_id;

  -- Upsert read receipt
  INSERT INTO read_receipts (chat_id, user_id, last_read_message_id, last_read_at)
  VALUES (p_chat_id, v_current, v_last_message_id, COALESCE(v_last_message_at, now()))
  ON CONFLICT (chat_id, user_id)
  DO UPDATE SET
    last_read_message_id = CASE
      WHEN EXCLUDED.last_read_at >= read_receipts.last_read_at
      THEN EXCLUDED.last_read_message_id
      ELSE read_receipts.last_read_message_id
    END,
    last_read_at = GREATEST(read_receipts.last_read_at, EXCLUDED.last_read_at);
END;
$$;

-- ═══════════════════════════════════════════════════════════
-- 4. Add get_chat_read_receipts function
-- ═══════════════════════════════════════════════════════════
-- Returns read receipts for all members of a chat
-- The frontend uses this to show read status for each message
CREATE FUNCTION get_chat_read_receipts(p_chat_id uuid)
RETURNS TABLE(
  user_id uuid,
  username text,
  display_name text,
  last_read_message_id uuid,
  last_read_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_chat_member(p_chat_id) THEN
    RAISE EXCEPTION 'Not a member of this chat';
  END IF;

  RETURN QUERY
  SELECT
    au.id as user_id,
    au.username,
    au.display_name,
    rr.last_read_message_id,
    rr.last_read_at
  FROM app_users au
  LEFT JOIN read_receipts rr ON rr.user_id = au.id AND rr.chat_id = p_chat_id
  WHERE au.id IN (
    SELECT user_id FROM chat_memberships WHERE chat_id = p_chat_id
  )
  AND au.id != auth.uid()
  ORDER BY au.username;
END;
$$;

-- ═══════════════════════════════════════════════════════════
-- 5. Add get_unread_counts function
-- ═══════════════════════════════════════════════════════════
-- Returns unread message counts for all chats the user is a member of
CREATE FUNCTION get_unread_counts()
RETURNS TABLE(
  chat_id uuid,
  unread_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  RETURN QUERY
  SELECT
    c.id as chat_id,
    COALESCE(
      (SELECT COUNT(*) FROM messages m
       WHERE m.chat_id = c.id
       AND m.user_id != auth.uid()
       AND m.is_deleted = false
       AND m.created_at > COALESCE(
         (SELECT rr.last_read_at FROM read_receipts rr
          WHERE rr.chat_id = c.id AND rr.user_id = auth.uid()),
         '1970-01-01'::timestamptz
       )),
      0
    ) as unread_count
  FROM chats c
  WHERE is_chat_member(c.id);
END;
$$;
