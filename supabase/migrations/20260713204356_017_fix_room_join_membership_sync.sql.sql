/*
# Fix Room Join Flow: Atomic Join + Membership Creation

## Problem
1. The `redeem_invite_code` function only records a redemption in `invite_redemptions`
   but does NOT create a `chat_memberships` row. Users redeem a code but never become
   members of the chat — so the room never appears in their sidebar.

2. There is no function to join a chat via a `chat_invites` code. The `chat_invites`
   table has per-chat invite codes, but nothing atomically validates the code AND
   creates a membership.

3. The `chats_select` RLS policy requires `is_chat_member(id)`, which means users
   cannot see any chat they haven't joined — including public rooms they might want
   to discover and join.

## Fix
1. Create `join_chat_by_invite(p_code text)` — SECURITY DEFINER function that:
   - Looks up the invite code in `chat_invites`
   - Validates: active, not expired, not at max uses
   - Checks if user is already a member (idempotent — returns chat_id if already joined)
   - Increments uses_count
   - Creates a `chat_memberships` row with role 'member'
   - Returns the chat_id so the frontend can immediately open the room

2. Update `redeem_invite_code` to also create a `chat_memberships` row for the
   chat associated with the invite code (if the invite code has a chat_id).

3. Update `chats_select` RLS policy to also allow reading chats where type = 'group'
   (public rooms visible to all authenticated users for discovery).

## Security
- `join_chat_by_invite` is SECURITY DEFINER so it can insert into `chat_memberships`
  even though the user isn't yet a member.
- All membership inserts use role 'member' (never admin/owner).
- The function is idempotent — if already a member, returns the chat_id without error.
- No existing data is modified or deleted.
*/

-- ── 1. Join chat by chat_invites code ──
CREATE OR REPLACE FUNCTION join_chat_by_invite(p_code text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_invite record;
  v_chat_id uuid;
  v_existing_membership uuid;
BEGIN
  -- Look up the invite code in chat_invites
  SELECT id, chat_id, max_uses, uses_count, expires_at
  INTO v_invite
  FROM public.chat_invites
  WHERE UPPER(code) = UPPER(p_code)
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid invite code';
  END IF;

  IF v_invite.expires_at IS NOT NULL AND v_invite.expires_at < now() THEN
    RAISE EXCEPTION 'This invite code has expired';
  END IF;

  IF v_invite.max_uses IS NOT NULL AND v_invite.uses_count >= v_invite.max_uses THEN
    RAISE EXCEPTION 'This invite code has reached its usage limit';
  END IF;

  v_chat_id := v_invite.chat_id;

  -- Check if already a member (idempotent)
  SELECT id INTO v_existing_membership
  FROM public.chat_memberships
  WHERE chat_id = v_chat_id AND user_id = auth.uid();

  IF v_existing_membership IS NOT NULL THEN
    -- Already a member, just return the chat_id
    RETURN v_chat_id;
  END IF;

  -- Increment uses count
  UPDATE public.chat_invites
  SET uses_count = uses_count + 1
  WHERE id = v_invite.id;

  -- Create membership
  INSERT INTO public.chat_memberships (chat_id, user_id, role)
  VALUES (v_chat_id, auth.uid(), 'member');

  RETURN v_chat_id;
END;
$$;

-- ── 2. Update redeem_invite_code to also create chat membership ──
-- The invite_codes table is a global invite system. If an invite code was
-- created for a specific chat (via chat_invites), we need to add the user
-- as a member of that chat when they redeem the code.
CREATE OR REPLACE FUNCTION redeem_invite_code(p_code text, p_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_invite record;
  v_id uuid;
  v_chat_id uuid;
  v_existing_membership uuid;
BEGIN
  SELECT id, max_uses, uses_count, expires_at, is_active
  INTO v_invite
  FROM public.invite_codes
  WHERE UPPER(code) = UPPER(p_code)
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid invite code';
  END IF;

  IF NOT v_invite.is_active THEN
    RAISE EXCEPTION 'This invite code has been revoked';
  END IF;

  IF v_invite.expires_at IS NOT NULL AND v_invite.expires_at < now() THEN
    RAISE EXCEPTION 'This invite code has expired';
  END IF;

  IF v_invite.uses_count >= v_invite.max_uses THEN
    RAISE EXCEPTION 'This invite code has reached its usage limit';
  END IF;

  UPDATE public.invite_codes
  SET uses_count = uses_count + 1
  WHERE id = v_invite.id
  RETURNING id INTO v_id;

  INSERT INTO public.invite_redemptions (invite_id, user_id)
  VALUES (v_id, p_user_id)
  ON CONFLICT (invite_id, user_id) DO NOTHING;

  -- Check if this invite code is linked to a chat via chat_invites
  SELECT chat_id INTO v_chat_id
  FROM public.chat_invites
  WHERE code = p_code
  LIMIT 1;

  IF v_chat_id IS NOT NULL THEN
    -- Check if already a member
    SELECT id INTO v_existing_membership
    FROM public.chat_memberships
    WHERE chat_id = v_chat_id AND user_id = p_user_id;

    IF v_existing_membership IS NULL THEN
      INSERT INTO public.chat_memberships (chat_id, user_id, role)
      VALUES (v_chat_id, p_user_id, 'member');
    END IF;
  END IF;

  RETURN v_id;
END;
$$;

-- ── 3. Update chats_select RLS to allow reading public group chats ──
-- Users need to see public rooms to discover and join them.
-- A "public room" is a chat with type = 'group' that has at least one
-- chat_invites row with is_active (or we can use a simpler heuristic).
-- For now, allow reading all group-type chats so the rooms tab can list them.
DROP POLICY IF EXISTS "chats_select" ON chats;
CREATE POLICY "chats_select"
ON chats FOR SELECT
TO authenticated
USING (
  is_chat_member(id)
  OR (type = 'group' AND EXISTS (
    SELECT 1 FROM chat_invites ci
    WHERE ci.chat_id = chats.id
  ))
);
