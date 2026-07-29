/*
# Fix group chat creation RLS chicken-and-egg

## Problem
The chats INSERT policy is `WITH CHECK (auth.uid() = created_by)` — correct.
But the client uses `.insert({...}).select('id')` to recover the new chat id.
PostgREST runs INSERT ... RETURNING, and the RETURNING clause is filtered by
the chats SELECT policy (`is_chat_member(chats.id)`). The creator has no
chat_memberships row yet, so RETURNING yields zero rows and the whole call
fails with "new row violates row-level security policy for table chats".

## Fix
Add a SECURITY DEFINER function `create_group_chat` that:
1. Inserts the chat row (created_by = caller)
2. Inserts the owner membership row
3. Optionally inserts a chat_invites row
4. Returns the chat id

All in one atomic operation, with RLS bypassed (SECURITY DEFINER + owner).
The caller is verified via auth.uid() and must match p_owner_id.

The client calls this directly, sidestepping the RETURNING/SELECT-policy
chicken-and-egg entirely.
*/

CREATE OR REPLACE FUNCTION create_group_chat(
  p_name text,
  p_description text DEFAULT '',
  p_avatar_url text DEFAULT NULL,
  p_invite_code text DEFAULT NULL,
  p_owner_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_chat_id uuid;
  v_owner uuid;
BEGIN
  -- Use the caller's auth uid by default, or the explicitly passed owner_id
  v_owner := COALESCE(p_owner_id, auth.uid());
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF v_owner <> auth.uid() THEN
    RAISE EXCEPTION 'Owner id must match the authenticated user';
  END IF;

  -- Create the chat
  INSERT INTO public.chats (name, type, description, avatar_url, invite_code, created_by)
  VALUES (p_name, 'group', p_description, p_avatar_url, p_invite_code, v_owner)
  RETURNING id INTO v_chat_id;

  -- Add the creator as owner
  INSERT INTO public.chat_memberships (chat_id, user_id, role)
  VALUES (v_chat_id, v_owner, 'owner');

  -- Optionally create an invite code
  IF p_invite_code IS NOT NULL AND p_invite_code <> '' THEN
    INSERT INTO public.chat_invites (chat_id, code, created_by)
    VALUES (v_chat_id, p_invite_code, v_owner);
  END IF;

  RETURN v_chat_id;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION create_group_chat TO authenticated;
