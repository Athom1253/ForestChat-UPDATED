/*
# Add join_public_room function

## Problem
There is no RPC for joining a public room directly. The frontend must insert
into chat_memberships, but the chat_memberships INSERT RLS policy requires
auth.uid() = user_id, which is correct. However, the frontend also needs to
verify the room is public (has a chat_invites entry) before joining.

## Fix
Create `join_public_room(p_chat_id uuid)` — SECURITY DEFINER function that:
- Verifies the chat exists and is a group-type chat with an invite code
- Checks if user is already a member (idempotent)
- Creates a chat_memberships row with role 'member'
- Returns the chat_id on success

## Security
- SECURITY DEFINER so it can insert into chat_memberships
- Only allows joining group-type chats that have invite codes (public rooms)
- Idempotent — returns chat_id if already a member
- No data loss or modification of existing rows
*/

CREATE OR REPLACE FUNCTION join_public_room(p_chat_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_chat record;
  v_existing_membership uuid;
BEGIN
  -- Verify the chat exists and is a public group chat
  SELECT id, type INTO v_chat
  FROM public.chats
  WHERE id = p_chat_id AND type = 'group';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Room not found';
  END IF;

  -- Verify it has an invite code (making it a public/discoverable room)
  IF NOT EXISTS (
    SELECT 1 FROM public.chat_invites WHERE chat_id = p_chat_id
  ) THEN
    RAISE EXCEPTION 'This room is not publicly joinable';
  END IF;

  -- Check if already a member (idempotent)
  SELECT id INTO v_existing_membership
  FROM public.chat_memberships
  WHERE chat_id = p_chat_id AND user_id = auth.uid();

  IF v_existing_membership IS NOT NULL THEN
    RETURN p_chat_id;
  END IF;

  -- Create membership
  INSERT INTO public.chat_memberships (chat_id, user_id, role)
  VALUES (p_chat_id, auth.uid(), 'member');

  RETURN p_chat_id;
END;
$$;
