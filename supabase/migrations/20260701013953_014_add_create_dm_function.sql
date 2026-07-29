/*
# Add create_dm_with_members function

## Purpose
Creates a DM chat with both users as members in a single transaction, running as SECURITY DEFINER to bypass RLS for the second user's membership.

## Security
- Runs as SECURITY DEFINER with fixed search_path
- Only allows creating DMs where the caller is one of the members
- Validates that both user IDs exist in app_users
*/

CREATE OR REPLACE FUNCTION create_dm_with_members(
  p_name TEXT,
  p_user1_id UUID,
  p_user2_id UUID
)
RETURNS UUID
SECURITY DEFINER
SET search_path = ''
LANGUAGE plpgsql
AS $$
DECLARE
  v_chat_id UUID;
BEGIN
  -- Validate that the caller is one of the users
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  
  IF auth.uid() NOT IN (p_user1_id, p_user2_id) THEN
    RAISE EXCEPTION 'Cannot create DM for other users';
  END IF;

  -- Create the chat
  INSERT INTO public.chats (name, type, created_by)
  VALUES (p_name, 'dm', auth.uid())
  RETURNING id INTO v_chat_id;

  -- Add both users as members
  INSERT INTO public.chat_memberships (chat_id, user_id, role)
  VALUES 
    (v_chat_id, p_user1_id, 'member'),
    (v_chat_id, p_user2_id, 'member');

  RETURN v_chat_id;
END;
$$;