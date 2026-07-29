-- Fix: get_user_chats returns stale chat names for DMs.
-- The chats.name column stores the other user's display name at DM creation
-- time and never updates. The sidebar shows this stale name, causing:
--   - Confusion when users rename themselves (stale names)
--   - Frontend key collisions when multiple DMs happen to share a name
--     (frontend uses name as React key instead of id)
-- Fix: return the live other-user display name for DM chats, and the
-- stored name for group chats (group names are user-chosen, not derived).
CREATE OR REPLACE FUNCTION get_user_chats()
RETURNS TABLE (
  id uuid,
  name text,
  type text,
  description text,
  avatar_url text,
  last_message_at timestamptz,
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
  CASE
    WHEN c.type = 'dm' THEN
      COALESCE(
        (SELECT au.display_name
         FROM app_users au
         JOIN chat_memberships cm2 ON cm2.user_id = au.id
         WHERE cm2.chat_id = c.id AND cm2.user_id != auth.uid()
         LIMIT 1),
        (SELECT au.username
         FROM app_users au
         JOIN chat_memberships cm2 ON cm2.user_id = au.id
         WHERE cm2.chat_id = c.id AND cm2.user_id != auth.uid()
         LIMIT 1),
        c.name
      )
    ELSE c.name
  END AS name,
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
  ) AS unread_count
FROM chats c
JOIN chat_memberships cm ON cm.chat_id = c.id AND cm.user_id = auth.uid()
ORDER BY
  cm.is_archived ASC,
  cm.is_pinned DESC,
  c.last_message_at DESC NULLS LAST;
END;
$$;
