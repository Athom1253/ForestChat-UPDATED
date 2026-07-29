/*
# Fix get_or_create_dm: provide name on insert

## Problem
The `get_or_create_dm` RPC function inserts into `chats` with only `(type, created_by)`,
omitting the NOT NULL `name` column. This causes every DM creation to fail with:
  "null value in column 'name' of relation 'chats' violates not-null constraint"

## Fix
1. Recreate `get_or_create_dm` with `name` included in the INSERT.
2. The name is auto-generated as 'DM' for simplicity (the UI shows member names, not the chat name).
3. Function remains atomic and idempotent — same lookup-first, create-second logic.

## Security
- SECURITY DEFINER function, unchanged.
- No RLS policy changes.
- No data loss — only the function definition changes.
*/

CREATE OR REPLACE FUNCTION get_or_create_dm(user_a uuid, user_b uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  chat_id uuid;
  existing_chat uuid;
BEGIN
  -- Try to find existing DM between these two users
  SELECT c.id INTO existing_chat
  FROM chats c
  WHERE c.type = 'dm'
    AND c.id IN (
      SELECT cm.chat_id
      FROM chat_memberships cm
      WHERE cm.user_id IN (user_a, user_b)
      GROUP BY cm.chat_id
      HAVING COUNT(DISTINCT cm.user_id) = 2
    )
  LIMIT 1;

  IF existing_chat IS NOT NULL THEN
    RETURN existing_chat;
  END IF;

  -- Create new DM with a valid non-null name
  INSERT INTO chats (type, name, created_by) VALUES ('dm', 'DM', user_a) RETURNING id INTO chat_id;

  -- Add both users as members
  INSERT INTO chat_memberships (chat_id, user_id, role) VALUES (chat_id, user_a, 'owner');
  INSERT INTO chat_memberships (chat_id, user_id, role) VALUES (chat_id, user_b, 'member');

  RETURN chat_id;
END;
$$;
