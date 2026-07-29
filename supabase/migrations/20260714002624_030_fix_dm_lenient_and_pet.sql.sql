/*
# Fix: Make create_dm_with_members lenient + fix pet loading

## create_dm_with_members
Same lenient approach as get_or_create_dm: if auth.uid() doesn't match
either parameter, use auth.uid() as current and p_user2_id as other.

## Pet loading
The get_pet() function auto-creates a pet if none exists, but the frontend
might be doing a direct SELECT from user_pets instead of calling the RPC.
If the frontend does: supabase.from('user_pets').select('*').limit(1).single()
the RLS policy (auth.uid() = user_id) should work for authenticated users.

But if the frontend does: supabase.from('user_pets').select('*').eq('user_id', userId).single()
where userId is from a stale cache, it would fail.

The fix: ensure the user_pets RLS policy is correct and add a database view
that always returns the current user's pet (or NULL if none exists).
The view bypasses the need for the frontend to pass the correct user_id.
*/

-- ═══════════════════════════════════════════════════════════
-- 1. Fix create_dm_with_members: lenient auth
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
  IF p_user2_id IS NULL THEN RAISE EXCEPTION 'Target user ID is required'; END IF;

  -- Determine current and other user (lenient)
  IF v_current = p_user1_id THEN
    v_other := p_user2_id;
  ELSIF v_current = p_user2_id THEN
    v_other := p_user1_id;
  ELSE
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

-- ═══════════════════════════════════════════════════════════
-- 2. Add current_user_pet view for frontend compatibility
-- ═══════════════════════════════════════════════════════════
-- This view returns the current user's pet. The frontend can query it
-- directly: supabase.from('current_user_pet').select('*').single()
-- It bypasses the need to pass user_id correctly.
CREATE OR REPLACE VIEW current_user_pet AS
SELECT * FROM user_pets WHERE user_id = auth.uid();

-- Grant access to the view
GRANT SELECT ON current_user_pet TO authenticated;

-- ═══════════════════════════════════════════════════════════
-- 3. Add a trigger to auto-create a pet for new users
-- ═══════════════════════════════════════════════════════════
-- This ensures every new user gets a pet record automatically,
-- regardless of whether the frontend calls get_pet() or upsert_pet.
CREATE OR REPLACE FUNCTION auto_create_pet_for_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Create a default pet for the new user if one doesn't exist
  INSERT INTO user_pets (user_id, species, name, color_variant, personality)
  VALUES (NEW.id, 'cat', 'Companion', 'default', 'playful')
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- Create the trigger on app_users INSERT
DROP TRIGGER IF EXISTS trigger_auto_create_pet ON app_users;
CREATE TRIGGER trigger_auto_create_pet
  AFTER INSERT ON app_users
  FOR EACH ROW
  EXECUTE FUNCTION auto_create_pet_for_new_user();

-- ═══════════════════════════════════════════════════════════
-- 4. Backfill: create pets for all existing users who don't have one
-- ═══════════════════════════════════════════════════════════
INSERT INTO user_pets (user_id, species, name, color_variant, personality)
SELECT au.id, 'cat', 'Companion', 'default', 'playful'
FROM app_users au
WHERE NOT EXISTS (SELECT 1 FROM user_pets up WHERE up.user_id = au.id)
ON CONFLICT (user_id) DO NOTHING;
