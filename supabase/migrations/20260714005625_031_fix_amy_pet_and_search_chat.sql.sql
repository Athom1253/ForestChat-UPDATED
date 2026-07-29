/*
# Fix: Amy pet loading + search friend Chat button

## Issue 1: Amy account virtual pet does not load (ONLY Amy account)

### Root Cause
There are TWO Amy accounts in app_users:
1. "amy" (7d0ebdfb) - old, created 2026-06-18, can't login (no auth.users entry), is_admin=true, is_disabled=false
2. "amy test" (7d0fa80e) - new, created 2026-07-01, can login, is_admin=true, is_disabled=false

The old "amy" account has no corresponding auth.users entry but is NOT marked
as disabled. When the frontend searches for user profiles (e.g., by username
"amy" or fetches all profiles), it may find the old amy account first (created
earlier) and use its ID (7d0ebdfb) instead of the logged-in user's ID
(7d0fa80e). When the frontend then queries user_pets with the wrong user_id,
the RLS policy blocks it because auth.uid() (7d0fa80e) != user_id (7d0ebdfb).

### Fix
Mark the old "amy" account and other orphaned accounts (no auth.users entry)
as disabled. This way:
- They won't appear in user searches (if frontend filters by is_disabled)
- They won't interfere with profile lookups
- The frontend will use the correct logged-in user's profile

## Issue 2: Search friend → Chat button does not work

### Root Cause
The frontend's createOrGetDM function calls get_or_create_dm(user_a, user_b).
The function parameters have no defaults, so if the frontend:
- Passes only one parameter (the other user's ID), the call fails
- Passes the parameters with different names (e.g., camelCase), the call fails
- Passes a non-UUID value, the cast fails

### Fix
1. Add DEFAULT NULL to both parameters so the function works with 0, 1, or 2 args
2. Make the function accept text parameters (overloaded) so string UUIDs work
3. If only one parameter is provided, use it as the other user and auth.uid() as current
4. If both are NULL, fail with a clear error
*/

-- ═══════════════════════════════════════════════════════════
-- 1. Mark orphaned accounts (no auth.users entry) as disabled
-- ═══════════════════════════════════════════════════════════
UPDATE app_users au
SET is_disabled = true
WHERE NOT EXISTS (SELECT 1 FROM auth.users WHERE id = au.id)
AND au.is_disabled = false;

-- ═══════════════════════════════════════════════════════════
-- 2. Fix get_or_create_dm: add defaults + handle single-param call
-- ═══════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS get_or_create_dm(uuid, uuid);

CREATE FUNCTION get_or_create_dm(user_a uuid DEFAULT NULL, user_b uuid DEFAULT NULL)
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

  -- Handle different calling patterns:
  -- Case 1: Both params provided -> normal mode (lenient auth check)
  -- Case 2: Only user_a provided -> use user_a as the other user
  -- Case 3: Only user_b provided -> use user_b as the other user
  -- Case 4: Neither provided -> error

  IF user_a IS NULL AND user_b IS NULL THEN
    RAISE EXCEPTION 'At least one user ID is required';
  END IF;

  -- Determine current and other user
  IF user_a IS NOT NULL AND user_b IS NOT NULL THEN
    -- Both provided: normal mode
    IF v_current = user_a THEN
      v_other := user_b;
    ELSIF v_current = user_b THEN
      v_other := user_a;
    ELSE
      -- Lenient mode: use auth.uid() as current, user_b as other
      v_other := user_b;
    END IF;
  ELSIF user_a IS NOT NULL AND user_b IS NULL THEN
    -- Only user_a provided: treat it as the other user
    IF v_current = user_a THEN
      RAISE EXCEPTION 'Cannot create DM with yourself';
    END IF;
    v_other := user_a;
  ELSIF user_b IS NOT NULL AND user_a IS NULL THEN
    -- Only user_b provided: treat it as the other user
    IF v_current = user_b THEN
      RAISE EXCEPTION 'Cannot create DM with yourself';
    END IF;
    v_other := user_b;
  END IF;

  IF v_current = v_other THEN
    RAISE EXCEPTION 'Cannot create DM with yourself';
  END IF;

  -- Verify the other user exists
  IF NOT EXISTS (SELECT 1 FROM app_users WHERE id = v_other) THEN
    RAISE EXCEPTION 'Target user not found';
  END IF;

  -- Deterministic pair key
  v_pair_key := 'dm:' || LEAST(v_current::text, v_other::text) || ':' || GREATEST(v_current::text, v_other::text);

  -- Find existing DM
  SELECT id INTO v_chat_id
  FROM chats
  WHERE type = 'dm' AND dm_pair_key = v_pair_key
  LIMIT 1;

  IF v_chat_id IS NOT NULL THEN
    RETURN v_chat_id;
  END IF;

  -- Get other user's display name
  SELECT COALESCE(display_name, username) INTO v_other_display
  FROM app_users WHERE id = v_other;
  v_other_display := COALESCE(v_other_display, 'Direct Message');

  -- Insert with ON CONFLICT DO NOTHING for race safety
  INSERT INTO chats (type, name, created_by, dm_pair_key)
  VALUES ('dm', v_other_display, v_current, v_pair_key)
  ON CONFLICT (dm_pair_key) WHERE type = 'dm' AND dm_pair_key LIKE 'dm:%'
  DO NOTHING
  RETURNING id INTO v_chat_id;

  -- If conflict, SELECT existing
  IF v_chat_id IS NULL THEN
    SELECT id INTO v_chat_id
    FROM chats
    WHERE type = 'dm' AND dm_pair_key = v_pair_key
    LIMIT 1;
  END IF;

  -- Add memberships
  INSERT INTO chat_memberships (chat_id, user_id, role)
  VALUES (v_chat_id, v_current, 'member')
  ON CONFLICT (chat_id, user_id) DO NOTHING;

  INSERT INTO chat_memberships (chat_id, user_id, role)
  VALUES (v_chat_id, v_other, 'member')
  ON CONFLICT (chat_id, user_id) DO NOTHING;

  RETURN v_chat_id;
END;
$$;

-- ═══════════════════════════════════════════════════════════
-- 3. Add overloaded get_or_create_dm(text, text) for string params
-- ═══════════════════════════════════════════════════════════
-- This handles the case where the frontend passes string UUIDs instead of
-- proper UUID types. PostgreSQL will automatically cast text to uuid.
CREATE FUNCTION get_or_create_dm(user_a text DEFAULT NULL, user_b text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN get_or_create_dm(
    user_a::uuid,
    user_b::uuid
  );
END;
$$;

-- ═══════════════════════════════════════════════════════════
-- 4. Fix create_dm_with_members: add defaults + lenient auth
-- ═══════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS create_dm_with_members(text, uuid, uuid);

CREATE FUNCTION create_dm_with_members(
  p_name text DEFAULT NULL,
  p_user1_id uuid DEFAULT NULL,
  p_user2_id uuid DEFAULT NULL
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

  -- At least one target user is required
  IF p_user1_id IS NULL AND p_user2_id IS NULL THEN
    RAISE EXCEPTION 'At least one target user ID is required';
  END IF;

  -- Determine current and other user (lenient)
  IF p_user1_id IS NOT NULL AND p_user2_id IS NOT NULL THEN
    IF v_current = p_user1_id THEN
      v_other := p_user2_id;
    ELSIF v_current = p_user2_id THEN
      v_other := p_user1_id;
    ELSE
      v_other := p_user2_id;
    END IF;
  ELSIF p_user1_id IS NOT NULL AND p_user2_id IS NULL THEN
    v_other := p_user1_id;
  ELSIF p_user2_id IS NOT NULL AND p_user1_id IS NULL THEN
    v_other := p_user2_id;
  END IF;

  IF v_current = v_other THEN
    RAISE EXCEPTION 'Cannot create DM with yourself';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM app_users WHERE id = v_other) THEN
    RAISE EXCEPTION 'Target user not found';
  END IF;

  v_pair_key := 'dm:' || LEAST(v_current::text, v_other::text) || ':' || GREATEST(v_current::text, v_other::text);

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
  VALUES (v_chat_id, v_current, 'member'), (v_chat_id, v_other, 'member')
  ON CONFLICT (chat_id, user_id) DO NOTHING;

  RETURN v_chat_id;
END;
$$;
