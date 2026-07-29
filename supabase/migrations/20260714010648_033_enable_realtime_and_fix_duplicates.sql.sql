/*
# Fix: Duplicate group chats + Enable real-time syncing

## Issue 1: Duplicate group chats from rapid joining

### Root Cause
The database already has a UNIQUE constraint on (chat_id, user_id) in
chat_memberships, and join_public_room uses ON CONFLICT DO NOTHING.
So duplicate MEMBERSHIPS are prevented at the DB level.

However, the "3 or 5 copies" issue is a FRONTEND rendering problem:
when the Join button is clicked rapidly, the frontend sends multiple
join requests. Each request succeeds (returns the same chat_id), but
the frontend may add the chat to the sidebar list multiple times
before the first response arrives.

### Database Fix
The join_public_room function is already idempotent (checks existing
membership, uses ON CONFLICT). But let me make it even more robust
by using a single INSERT ... ON CONFLICT instead of SELECT-then-INSERT.

## Issue 2: Real-time syncing not working

### Root Cause
The supabase_realtime publication has NO tables in it!
Only supabase_realtime_messages_publication has partitioned message
tables in the realtime schema.

This means the frontend's realtime subscriptions on:
- public.messages (new/edited/deleted messages)
- public.chats (new/deleted/updated chats)
- public.chat_memberships (joining/leaving rooms)
- public.message_reactions (reaction changes)
- public.user_pets (pet updates)
- public.app_users (user status changes)
- public.read_receipts (read receipt updates)
- public.typing_indicators (typing status)

...will NEVER receive any events because these tables are not
in any publication.

### Fix
Add all relevant tables to the supabase_realtime publication.
*/

-- ═══════════════════════════════════════════════════════════
-- 1. Enable real-time for all relevant tables
-- ═══════════════════════════════════════════════════════════

-- Add core chat tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.chats;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_memberships;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions;

-- Add user-related tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.app_users;
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_pets;

-- Add real-time feature tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.read_receipts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.typing_indicators;

-- Add social tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.friends;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_invites;

-- Add poll tables (for real-time poll updates)
ALTER PUBLICATION supabase_realtime ADD TABLE public.polls;
ALTER PUBLICATION supabase_realtime ADD TABLE public.poll_votes;

-- Add admin notification table (for real-time admin notifications)
ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_announcements;
ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_notifications;

-- ═══════════════════════════════════════════════════════════
-- 2. Make join_public_room fully idempotent (single statement)
-- ═══════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS join_public_room(uuid);

CREATE FUNCTION join_public_room(p_chat_id uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_chat record;
  v_current uuid;
BEGIN
  v_current := auth.uid();
  IF v_current IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_chat_id IS NULL THEN RAISE EXCEPTION 'Chat ID is required'; END IF;

  -- Verify the chat exists and is a group
  SELECT id, type INTO v_chat FROM chats WHERE id = p_chat_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Room not found'; END IF;
  IF v_chat.type != 'group' THEN RAISE EXCEPTION 'Not a group chat'; END IF;

  -- Single idempotent INSERT: if already a member, do nothing
  INSERT INTO chat_memberships (chat_id, user_id, role)
  VALUES (p_chat_id, v_current, 'member')
  ON CONFLICT (chat_id, user_id) DO NOTHING;

  -- Always return the chat_id (whether new membership or existing)
  RETURN p_chat_id;
END;
$$;

-- ═══════════════════════════════════════════════════════════
-- 3. Make join_chat_by_invite fully idempotent
-- ═══════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS join_chat_by_invite(text);

CREATE FUNCTION join_chat_by_invite(p_code text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite record;
  v_chat_id uuid;
  v_current uuid;
BEGIN
  v_current := auth.uid();
  IF v_current IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_code IS NULL OR p_code = '' THEN RAISE EXCEPTION 'Invite code is required'; END IF;

  -- Find the invite
  SELECT id, chat_id, max_uses, uses_count, expires_at INTO v_invite
  FROM chat_invites
  WHERE UPPER(code) = UPPER(p_code)
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid invite code'; END IF;
  IF v_invite.expires_at IS NOT NULL AND v_invite.expires_at < now() THEN
    RAISE EXCEPTION 'This invite code has expired';
  END IF;
  IF v_invite.max_uses IS NOT NULL AND v_invite.uses_count >= v_invite.max_uses THEN
    RAISE EXCEPTION 'This invite code has reached its usage limit';
  END IF;

  v_chat_id := v_invite.chat_id;

  -- Idempotent membership insert
  INSERT INTO chat_memberships (chat_id, user_id, role)
  VALUES (v_chat_id, v_current, 'member')
  ON CONFLICT (chat_id, user_id) DO NOTHING;

  -- Increment uses only if this was a new membership
  -- (check after insert to avoid incrementing for existing members)
  IF NOT EXISTS (SELECT 1 FROM chat_memberships WHERE chat_id = v_chat_id AND user_id = v_current AND joined_at < now() - interval '1 second') THEN
    UPDATE chat_invites SET uses_count = uses_count + 1 WHERE id = v_invite.id;
  END IF;

  RETURN v_chat_id;
END;
$$;

-- ═══════════════════════════════════════════════════════════
-- 4. Add REPLICA IDENTITY FULL to tables that need real-time DELETE events
-- ═══════════════════════════════════════════════════════════
-- For real-time DELETE events to work, the table must have REPLICA IDENTITY FULL
-- (or at least REPLICA IDENTITY DEFAULT with a primary key).
-- Tables with primary keys already work with DEFAULT, but FULL is safer
-- for tables that might have soft deletes or complex RLS.
ALTER TABLE public.chats REPLICA IDENTITY FULL;
ALTER TABLE public.chat_memberships REPLICA IDENTITY FULL;
ALTER TABLE public.messages REPLICA IDENTITY FULL;
ALTER TABLE public.message_reactions REPLICA IDENTITY FULL;
ALTER TABLE public.user_pets REPLICA IDENTITY FULL;
ALTER TABLE public.read_receipts REPLICA IDENTITY FULL;
ALTER TABLE public.typing_indicators REPLICA IDENTITY FULL;
ALTER TABLE public.friends REPLICA IDENTITY FULL;
ALTER TABLE public.chat_invites REPLICA IDENTITY FULL;
ALTER TABLE public.polls REPLICA IDENTITY FULL;
ALTER TABLE public.poll_votes REPLICA IDENTITY FULL;
ALTER TABLE public.admin_announcements REPLICA IDENTITY FULL;
ALTER TABLE public.admin_notifications REPLICA IDENTITY FULL;
