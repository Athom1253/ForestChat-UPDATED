/*
# Fix sidebar visibility, add chat management, add room discovery

## Root Cause of messy sidebar
The chats SELECT RLS policy was:
  is_chat_member(id) OR (type = 'group' AND EXISTS (SELECT 1 FROM chat_invites ...))

The second clause made ALL group chats with invite codes visible to ALL users,
even if they hadn't joined them. This is why:
- "Too many chats appear" - users see groups they haven't joined
- "Chats appear with people I have not added as friends" - random group rooms
- "Old conversations appear unexpectedly" - old groups with invites show up

## Fix
1. Change chats SELECT to only show chats where the user is a member
2. Add discover_public_rooms() for room discovery (separate from sidebar)
3. Add get_user_chats() for the sidebar (sorted by last activity)
4. Add archive_chat() / unarchive_chat() / pin_chat() / unpin_chat()
5. Add leave_chat confirmation-safe function (already exists)
*/

-- ═══════════════════════════════════════════════════════════
-- 1. Fix chats SELECT policy: only show chats the user is a member of
-- ═══════════════════════════════════════════════════════════
DROP POLICY IF EXISTS chats_select ON chats;

CREATE POLICY chats_select ON chats
  FOR SELECT TO authenticated
  USING (is_chat_member(id));

-- ═══════════════════════════════════════════════════════════
-- 2. Add discover_public_rooms function
-- ═══════════════════════════════════════════════════════════
-- Returns group chats with active invite codes that the user hasn't joined.
-- Used for a "Discover Rooms" section, NOT the sidebar.
CREATE FUNCTION discover_public_rooms()
RETURNS TABLE(
  id uuid,
  name text,
  description text,
  avatar_url text,
  member_count bigint,
  invite_code text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  RETURN QUERY
  SELECT
    c.id,
    c.name,
    c.description,
    c.avatar_url,
    (SELECT COUNT(*) FROM chat_memberships WHERE chat_id = c.id) as member_count,
    ci.code as invite_code
  FROM chats c
  JOIN chat_invites ci ON ci.chat_id = c.id
  WHERE c.type = 'group'
    AND NOT EXISTS (
      SELECT 1 FROM chat_memberships WHERE chat_id = c.id AND user_id = auth.uid()
    )
  ORDER BY member_count DESC, c.name;
END;
$$;

-- ═══════════════════════════════════════════════════════════
-- 3. Add get_user_chats function
-- ═══════════════════════════════════════════════════════════
-- Returns all chats the user is a member of, with membership info,
-- sorted by last activity (pinned first, then by last_message_at).
-- This is what the sidebar should use.
CREATE FUNCTION get_user_chats()
RETURNS TABLE(
  id uuid,
  name text,
  type text,
  description text,
  avatar_url text,
  last_message_at timestamp with time zone,
  last_message_preview text,
  is_pinned boolean,
  is_archived boolean,
  is_muted boolean,
  role text,
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
    c.id,
    c.name,
    c.type,
    c.description,
    c.avatar_url,
    c.last_message_at,
    c.last_message_preview,
    cm.is_pinned,
    cm.is_archived,
    cm.is_muted,
    cm.role,
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
  JOIN chat_memberships cm ON cm.chat_id = c.id AND cm.user_id = auth.uid()
  ORDER BY
    cm.is_archived ASC,          -- archived chats at the bottom
    cm.is_pinned DESC,           -- pinned chats at the top
    c.last_message_at DESC NULLS LAST  -- then by most recent activity
  ;
END;
$$;

-- ═══════════════════════════════════════════════════════════
-- 4. Add archive_chat function
-- ═══════════════════════════════════════════════════════════
CREATE FUNCTION archive_chat(p_chat_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT is_chat_member(p_chat_id) THEN RAISE EXCEPTION 'Not a member of this chat'; END IF;

  UPDATE chat_memberships
  SET is_archived = true
  WHERE chat_id = p_chat_id AND user_id = auth.uid();
END;
$$;

-- ═══════════════════════════════════════════════════════════
-- 5. Add unarchive_chat function
-- ═══════════════════════════════════════════════════════════
CREATE FUNCTION unarchive_chat(p_chat_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT is_chat_member(p_chat_id) THEN RAISE EXCEPTION 'Not a member of this chat'; END IF;

  UPDATE chat_memberships
  SET is_archived = false
  WHERE chat_id = p_chat_id AND user_id = auth.uid();
END;
$$;

-- ═══════════════════════════════════════════════════════════
-- 6. Add pin_chat function
-- ═══════════════════════════════════════════════════════════
CREATE FUNCTION pin_chat(p_chat_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT is_chat_member(p_chat_id) THEN RAISE EXCEPTION 'Not a member of this chat'; END IF;

  UPDATE chat_memberships
  SET is_pinned = true
  WHERE chat_id = p_chat_id AND user_id = auth.uid();
END;
$$;

-- ═══════════════════════════════════════════════════════════
-- 7. Add unpin_chat function
-- ═══════════════════════════════════════════════════════════
CREATE FUNCTION unpin_chat(p_chat_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT is_chat_member(p_chat_id) THEN RAISE EXCEPTION 'Not a member of this chat'; END IF;

  UPDATE chat_memberships
  SET is_pinned = false
  WHERE chat_id = p_chat_id AND user_id = auth.uid();
END;
$$;
