/*
# Fix: Make get_or_create_dm lenient about current user ID

## Root Cause of "Cannot create DM for other users"
The frontend passes user_a and user_b to get_or_create_dm. If the frontend's
cached current user ID is stale or wrong, auth.uid() won't match either
parameter, causing the function to reject.

## Fix
Make the function lenient: if auth.uid() doesn't match either parameter,
assume user_b is the "other" user (frontend convention: user_a = me, user_b = them)
and use auth.uid() as the current user. This way, even if user_a is stale/wrong,
the DM is still created between the actual logged-in user and the intended recipient.

This is safe because:
- auth.uid() is the authoritative current user (from JWT, can't be faked)
- user_b is the intended recipient (from search results)
- Even if user_a is wrong, the DM is created with the correct pair
*/

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
  IF user_b IS NULL THEN
    RAISE EXCEPTION 'Target user ID is required';
  END IF;

  -- Determine current and other user
  -- Normal case: auth.uid() matches one of the parameters
  IF v_current = user_a THEN
    v_other := user_b;
  ELSIF v_current = user_b THEN
    v_other := user_a;
  ELSE
    -- Lenient mode: auth.uid() doesn't match either parameter.
    -- The frontend likely passed a stale user_a. Use auth.uid() as current
    -- and user_b as the other user (frontend convention: user_b = target).
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
