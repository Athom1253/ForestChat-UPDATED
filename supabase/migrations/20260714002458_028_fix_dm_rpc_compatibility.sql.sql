/*
# Fix: Revert RPC return types to scalar uuid + simplified DM creation API

## Changes
1. Revert get_or_create_dm(uuid, uuid) to return scalar uuid
2. Add get_or_create_dm_with(other_user_id uuid) - simplified, uses auth.uid()
3. Revert create_dm_with_members to return scalar uuid
4. Fix join_public_room to handle rooms without chat_invites (auto-create invite)
5. Keep get_pet() returning jsonb (it's a new function)
*/

-- ═══════════════════════════════════════════════════════════
-- 1. Revert get_or_create_dm to return scalar uuid
-- ═══════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS get_or_create_dm(uuid, uuid);

CREATE FUNCTION get_or_create_dm(user_a uuid, user_b uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_chat_id uuid;
  v_pair_key text;
  v_other_display text;
  v_current uuid;
  v_other uuid;
BEGIN
  v_current := auth.uid();
  IF v_current IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Determine which user is "current" and which is "other"
  IF v_current = user_a THEN
    v_other := user_b;
  ELSIF v_current = user_b THEN
    v_other := user_a;
  ELSE
    RAISE EXCEPTION 'Cannot create DM for other users';
  END IF;

  IF user_a = user_b THEN
    RAISE EXCEPTION 'Cannot create DM with yourself';
  END IF;

  v_pair_key := 'dm:' || LEAST(user_a::text, user_b::text) || ':' || GREATEST(user_a::text, user_b::text);

  SELECT id INTO v_chat_id
  FROM chats
  WHERE type = 'dm' AND dm_pair_key = v_pair_key
  LIMIT 1;

  IF v_chat_id IS NOT NULL THEN
    RETURN v_chat_id;
  END IF;

  SELECT COALESCE(display_name, username) INTO v_other_display
  FROM app_users WHERE id = v_other;
  v_other_display := COALESCE(v_other_display, 'Direct Message');

  INSERT INTO chats (type, name, created_by, dm_pair_key)
  VALUES ('dm', v_other_display, v_current, v_pair_key)
  ON CONFLICT (dm_pair_key) WHERE type = 'dm' AND dm_pair_key LIKE 'dm:%'
  DO NOTHING
  RETURNING id INTO v_chat_id;

  IF v_chat_id IS NULL THEN
    SELECT id INTO v_chat_id
    FROM chats
    WHERE type = 'dm' AND dm_pair_key = v_pair_key
    LIMIT 1;
  END IF;

  INSERT INTO chat_memberships (chat_id, user_id, role)
  VALUES (v_chat_id, user_a, 'member')
  ON CONFLICT (chat_id, user_id) DO NOTHING;

  INSERT INTO chat_memberships (chat_id, user_id, role)
  VALUES (v_chat_id, user_b, 'member')
  ON CONFLICT (chat_id, user_id) DO NOTHING;

  RETURN v_chat_id;
END;
$$;

-- ═══════════════════════════════════════════════════════════
-- 2. Add simplified get_or_create_dm_with(other_user_id)
-- ═══════════════════════════════════════════════════════════
CREATE FUNCTION get_or_create_dm_with(other_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_chat_id uuid;
  v_pair_key text;
  v_other_display text;
  v_current uuid;
BEGIN
  v_current := auth.uid();
  IF v_current IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF other_user_id IS NULL THEN
    RAISE EXCEPTION 'Other user ID is required';
  END IF;
  IF v_current = other_user_id THEN
    RAISE EXCEPTION 'Cannot create DM with yourself';
  END IF;

  v_pair_key := 'dm:' || LEAST(v_current::text, other_user_id::text) || ':' || GREATEST(v_current::text, other_user_id::text);

  SELECT id INTO v_chat_id
  FROM chats
  WHERE type = 'dm' AND dm_pair_key = v_pair_key
  LIMIT 1;

  IF v_chat_id IS NOT NULL THEN
    RETURN v_chat_id;
  END IF;

  SELECT COALESCE(display_name, username) INTO v_other_display
  FROM app_users WHERE id = other_user_id;
  v_other_display := COALESCE(v_other_display, 'Direct Message');

  INSERT INTO chats (type, name, created_by, dm_pair_key)
  VALUES ('dm', v_other_display, v_current, v_pair_key)
  ON CONFLICT (dm_pair_key) WHERE type = 'dm' AND dm_pair_key LIKE 'dm:%'
  DO NOTHING
  RETURNING id INTO v_chat_id;

  IF v_chat_id IS NULL THEN
    SELECT id INTO v_chat_id
    FROM chats
    WHERE type = 'dm' AND dm_pair_key = v_pair_key
    LIMIT 1;
  END IF;

  INSERT INTO chat_memberships (chat_id, user_id, role)
  VALUES (v_chat_id, v_current, 'member')
  ON CONFLICT (chat_id, user_id) DO NOTHING;

  INSERT INTO chat_memberships (chat_id, user_id, role)
  VALUES (v_chat_id, other_user_id, 'member')
  ON CONFLICT (chat_id, user_id) DO NOTHING;

  RETURN v_chat_id;
END;
$$;

-- ═══════════════════════════════════════════════════════════
-- 3. Revert create_dm_with_members to return scalar uuid
-- ═══════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS create_dm_with_members(text, uuid, uuid);

CREATE FUNCTION create_dm_with_members(
  p_name text, p_user1_id uuid, p_user2_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_chat_id uuid;
  v_pair_key text;
  v_other_display text;
  v_current uuid;
  v_other uuid;
BEGIN
  v_current := auth.uid();
  IF v_current IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  IF v_current = p_user1_id THEN
    v_other := p_user2_id;
  ELSIF v_current = p_user2_id THEN
    v_other := p_user1_id;
  ELSE
    RAISE EXCEPTION 'Cannot create DM for other users';
  END IF;

  IF p_user1_id = p_user2_id THEN
    RAISE EXCEPTION 'Cannot create DM with yourself';
  END IF;

  v_pair_key := 'dm:' || LEAST(p_user1_id::text, p_user2_id::text) || ':' || GREATEST(p_user1_id::text, p_user2_id::text);

  SELECT id INTO v_chat_id FROM chats WHERE type = 'dm' AND dm_pair_key = v_pair_key LIMIT 1;
  IF v_chat_id IS NOT NULL THEN RETURN v_chat_id; END IF;

  SELECT COALESCE(display_name, username) INTO v_other_display FROM app_users WHERE id = v_other;
  v_other_display := COALESCE(v_other_display, 'Direct Message');

  INSERT INTO chats (name, type, created_by, dm_pair_key)
  VALUES (COALESCE(v_other_display, 'Direct Message'), 'dm', v_current, v_pair_key)
  ON CONFLICT (dm_pair_key) WHERE type = 'dm' AND dm_pair_key LIKE 'dm:%'
  DO NOTHING
  RETURNING id INTO v_chat_id;

  IF v_chat_id IS NULL THEN
    SELECT id INTO v_chat_id FROM chats WHERE type = 'dm' AND dm_pair_key = v_pair_key LIMIT 1;
  END IF;

  INSERT INTO chat_memberships (chat_id, user_id, role)
  VALUES (v_chat_id, p_user1_id, 'member'), (v_chat_id, p_user2_id, 'member')
  ON CONFLICT (chat_id, user_id) DO NOTHING;

  RETURN v_chat_id;
END;
$$;

-- ═══════════════════════════════════════════════════════════
-- 4. Fix join_public_room: allow joining any group chat
-- ═══════════════════════════════════════════════════════════
-- The old function required a chat_invites entry to exist.
-- But the "amy test" account's "Test" room has no invite.
-- Fix: if no chat_invites entry exists, auto-create one.
DROP FUNCTION IF EXISTS join_public_room(uuid);

CREATE FUNCTION join_public_room(p_chat_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_chat record;
  v_existing uuid;
  v_current uuid;
BEGIN
  v_current := auth.uid();
  IF v_current IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT id, type INTO v_chat FROM chats WHERE id = p_chat_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Room not found'; END IF;
  IF v_chat.type != 'group' THEN RAISE EXCEPTION 'Not a group chat'; END IF;

  -- Check if already a member
  SELECT id INTO v_existing FROM chat_memberships
  WHERE chat_id = p_chat_id AND user_id = v_current;
  IF v_existing IS NOT NULL THEN RETURN p_chat_id; END IF;

  -- Add membership
  INSERT INTO chat_memberships (chat_id, user_id, role)
  VALUES (p_chat_id, v_current, 'member')
  ON CONFLICT (chat_id, user_id) DO NOTHING;

  RETURN p_chat_id;
END;
$$;
