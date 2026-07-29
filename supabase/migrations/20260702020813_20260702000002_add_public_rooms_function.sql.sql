/*
# Add public_rooms function for discoverable group chats

## Purpose
The Rooms tab lists all group chats so users can discover and join them.
With membership-based RLS on chats/chat_memberships, a user can only read
chats they already belong to — so they cannot discover rooms they haven't
joined. This SECURITY DEFINER function returns all group chats with their
member counts, bypassing RLS internally (read-only, no sensitive data leak).

## Security
- SECURITY DEFINER, search_path = '', owned by postgres
- Read-only: returns chat id, name, description, avatar_url, invite_code,
  created_at, last_message_at, last_message_preview, and member_count
- Only group chats are returned (DMs are private)
- Does NOT expose messages, membership lists, or any private content
*/
CREATE OR REPLACE FUNCTION public_rooms()
RETURNS TABLE (
  id uuid,
  name text,
  description text,
  type text,
  avatar_url text,
  invite_code text,
  created_by uuid,
  created_at timestamptz,
  last_message_at timestamptz,
  last_message_preview text,
  member_count bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
  SELECT
    c.id, c.name, c.description, c.type, c.avatar_url, c.invite_code,
    c.created_by, c.created_at, c.last_message_at, c.last_message_preview,
    COALESCE(mc.cnt, 0) AS member_count
  FROM public.chats c
  LEFT JOIN (
    SELECT chat_id, COUNT(*) AS cnt
    FROM public.chat_memberships
    GROUP BY chat_id
  ) mc ON mc.chat_id = c.id
  WHERE c.type = 'group'
  ORDER BY c.created_at DESC
$$;
