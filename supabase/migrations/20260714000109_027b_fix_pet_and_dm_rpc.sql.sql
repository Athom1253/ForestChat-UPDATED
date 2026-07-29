/*
# Fix: Pet auto-creation + DM RPC return format

## Issue 1: Pet not loading for accounts without a pet record
get_pet() now auto-creates a default pet if none exists.

## Issue 2: Search friend → Chat button doesn't work
get_or_create_dm and create_dm_with_members now return jsonb ({ id: "..." })
instead of scalar uuid, fixing the "Cannot coerce to single JSON object" error
when the frontend calls .single() on the RPC response.
*/

-- ═══════════════════════════════════════════════════════════
-- 1. get_pet: auto-create default pet if none exists
-- ═══════════════════════════════════════════════════════════
CREATE FUNCTION get_pet()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
  v_pet record;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_pet FROM user_pets WHERE user_id = auth.uid() LIMIT 1;

  IF NOT FOUND THEN
    INSERT INTO user_pets (user_id, species, name, color_variant, personality)
    VALUES (auth.uid(), 'cat', 'Companion', 'default', 'playful')
    RETURNING * INTO v_pet;
  END IF;

  result := to_jsonb(v_pet);
  RETURN result;
END;
$$;

-- ═══════════════════════════════════════════════════════════
-- 2. get_or_create_dm: return jsonb { id: "..." }
-- ═══════════════════════════════════════════════════════════
CREATE FUNCTION get_or_create_dm(user_a uuid, user_b uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_chat_id uuid;
  v_pair_key text;
  v_other_display text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF auth.uid() NOT IN (user_a, user_b) THEN
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
    RETURN jsonb_build_object('id', v_chat_id);
  END IF;

  IF auth.uid() = user_a THEN
    SELECT COALESCE(display_name, username) INTO v_other_display
    FROM app_users WHERE id = user_b;
  ELSE
    SELECT COALESCE(display_name, username) INTO v_other_display
    FROM app_users WHERE id = user_a;
  END IF;
  v_other_display := COALESCE(v_other_display, 'Direct Message');

  INSERT INTO chats (type, name, created_by, dm_pair_key)
  VALUES ('dm', v_other_display, auth.uid(), v_pair_key)
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

  RETURN jsonb_build_object('id', v_chat_id);
END;
$$;

-- ═══════════════════════════════════════════════════════════
-- 3. create_dm_with_members: return jsonb { id: "..." }
-- ═══════════════════════════════════════════════════════════
CREATE FUNCTION create_dm_with_members(
  p_name text, p_user1_id uuid, p_user2_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_chat_id uuid;
  v_pair_key text;
  v_other_display text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF auth.uid() NOT IN (p_user1_id, p_user2_id) THEN
    RAISE EXCEPTION 'Cannot create DM for other users';
  END IF;
  IF p_user1_id = p_user2_id THEN
    RAISE EXCEPTION 'Cannot create DM with yourself';
  END IF;

  v_pair_key := 'dm:' || LEAST(p_user1_id::text, p_user2_id::text) || ':' || GREATEST(p_user1_id::text, p_user2_id::text);

  SELECT id INTO v_chat_id FROM chats WHERE type = 'dm' AND dm_pair_key = v_pair_key LIMIT 1;
  IF v_chat_id IS NOT NULL THEN
    RETURN jsonb_build_object('id', v_chat_id);
  END IF;

  IF auth.uid() = p_user1_id THEN
    SELECT COALESCE(display_name, username) INTO v_other_display FROM app_users WHERE id = p_user2_id;
  ELSE
    SELECT COALESCE(display_name, username) INTO v_other_display FROM app_users WHERE id = p_user1_id;
  END IF;

  INSERT INTO chats (name, type, created_by, dm_pair_key)
  VALUES (COALESCE(v_other_display, 'Direct Message'), 'dm', auth.uid(), v_pair_key)
  ON CONFLICT (dm_pair_key) WHERE type = 'dm' AND dm_pair_key LIKE 'dm:%'
  DO NOTHING
  RETURNING id INTO v_chat_id;

  IF v_chat_id IS NULL THEN
    SELECT id INTO v_chat_id FROM chats WHERE type = 'dm' AND dm_pair_key = v_pair_key LIMIT 1;
  END IF;

  INSERT INTO chat_memberships (chat_id, user_id, role)
  VALUES (v_chat_id, p_user1_id, 'member'), (v_chat_id, p_user2_id, 'member')
  ON CONFLICT (chat_id, user_id) DO NOTHING;

  RETURN jsonb_build_object('id', v_chat_id);
END;
$$;
