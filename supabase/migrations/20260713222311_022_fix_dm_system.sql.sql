/*
# Fix DM System: Replace broken generated column with real pair key

## Root Cause Found
The `dm_pair_key` column is a GENERATED ALWAYS column that always produces 'dm'
for every DM — it doesn't use the user IDs at all. This means:
1. Every DM has the same dm_pair_key = 'dm'
2. A unique index on dm_pair_key would prevent having more than 1 DM total
3. The get_or_create_dm function can't use it to find existing DMs

## Fix
1. Drop the generated column
2. Add a real column (not generated)
3. Populate it with actual user pair keys
4. Add a unique partial index
5. Fix get_or_create_dm to use it
6. Fix DM naming
7. Fix admin account
*/

-- ═══════════════════════════════════════════════════════════
-- 1. Drop the broken generated column and recreate as real column
-- ═══════════════════════════════════════════════════════════
ALTER TABLE chats DROP COLUMN dm_pair_key;
ALTER TABLE chats ADD COLUMN dm_pair_key text;

-- ═══════════════════════════════════════════════════════════
-- 2. Populate dm_pair_key for all existing 2-member DMs
-- ═══════════════════════════════════════════════════════════
UPDATE chats c
SET dm_pair_key = sub.pair_key
FROM (
  SELECT
    cm.chat_id,
    'dm:' || MIN(cm.user_id::text) || ':' || MAX(cm.user_id::text) as pair_key
  FROM chat_memberships cm
  JOIN chats c2 ON c2.id = cm.chat_id AND c2.type = 'dm'
  GROUP BY cm.chat_id
  HAVING COUNT(*) = 2
) sub
WHERE c.id = sub.chat_id;

-- For 1-member orphaned DMs, set a unique key
UPDATE chats c
SET dm_pair_key = 'orphaned:' || c.id::text
WHERE c.type = 'dm'
AND c.dm_pair_key IS NULL;

-- ═══════════════════════════════════════════════════════════
-- 3. Add partial unique index on dm_pair_key
-- ═══════════════════════════════════════════════════════════
CREATE UNIQUE INDEX IF NOT EXISTS idx_chats_dm_pair_key_unique
  ON chats (dm_pair_key)
  WHERE type = 'dm' AND dm_pair_key LIKE 'dm:%';

-- ═══════════════════════════════════════════════════════════
-- 4. Fix get_or_create_dm: atomic, race-safe, proper naming
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION get_or_create_dm(user_a uuid, user_b uuid)
RETURNS uuid
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

  -- Deterministic pair key: always smaller UUID first
  v_pair_key := 'dm:' || LEAST(user_a::text, user_b::text) || ':' || GREATEST(user_a::text, user_b::text);

  -- Fast path: find existing DM by pair key
  SELECT id INTO v_chat_id
  FROM chats
  WHERE type = 'dm' AND dm_pair_key = v_pair_key
  LIMIT 1;

  IF v_chat_id IS NOT NULL THEN
    RETURN v_chat_id;
  END IF;

  -- Get the other user's display name for the DM name
  IF auth.uid() = user_a THEN
    SELECT COALESCE(display_name, username) INTO v_other_display
    FROM app_users WHERE id = user_b;
  ELSE
    SELECT COALESCE(display_name, username) INTO v_other_display
    FROM app_users WHERE id = user_a;
  END IF;
  v_other_display := COALESCE(v_other_display, 'Direct Message');

  -- Atomic insert with ON CONFLICT for race safety
  INSERT INTO chats (type, name, created_by, dm_pair_key)
  VALUES ('dm', v_other_display, auth.uid(), v_pair_key)
  ON CONFLICT (dm_pair_key) WHERE type = 'dm' AND dm_pair_key LIKE 'dm:%'
  DO UPDATE SET dm_pair_key = EXCLUDED.dm_pair_key
  RETURNING id INTO v_chat_id;

  -- Add memberships (ON CONFLICT for race safety)
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
-- 5. Add get_dm_display_name function for sidebar display
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION get_dm_display_name(p_chat_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_other_user_id uuid;
  v_display_name text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT cm.user_id INTO v_other_user_id
  FROM chat_memberships cm
  WHERE cm.chat_id = p_chat_id AND cm.user_id != auth.uid()
  LIMIT 1;

  IF v_other_user_id IS NULL THEN
    RETURN 'Direct Message';
  END IF;

  SELECT COALESCE(display_name, username) INTO v_display_name
  FROM app_users WHERE id = v_other_user_id;

  RETURN COALESCE(v_display_name, 'Direct Message');
END;
$$;

-- ═══════════════════════════════════════════════════════════
-- 6. Fix admin account: make "amy test" (7d0fa80e) the admin
-- ═══════════════════════════════════════════════════════════
-- The original "amy" (7d0ebdfb) is admin but has NO auth.users entry.
-- "amy test" (7d0fa80e) is the account that actually logs in.
UPDATE app_users
SET is_admin = true
WHERE id = '7d0fa80e-842a-479d-b490-393252712ad2';

-- ═══════════════════════════════════════════════════════════
-- 7. Update existing DM names to show the other participant's name
-- ═══════════════════════════════════════════════════════════
DO $$
DECLARE
  v_dm record;
  v_other_user uuid;
  v_display_name text;
BEGIN
  FOR v_dm IN
    SELECT c.id, c.created_by
    FROM chats c
    WHERE c.type = 'dm'
    AND (SELECT COUNT(*) FROM chat_memberships cm WHERE cm.chat_id = c.id) = 2
  LOOP
    SELECT cm.user_id INTO v_other_user
    FROM chat_memberships cm
    WHERE cm.chat_id = v_dm.id AND cm.user_id != v_dm.created_by
    LIMIT 1;

    IF v_other_user IS NOT NULL THEN
      SELECT COALESCE(display_name, username) INTO v_display_name
      FROM app_users WHERE id = v_other_user;
      IF v_display_name IS NOT NULL THEN
        UPDATE chats SET name = v_display_name WHERE id = v_dm.id;
      END IF;
    END IF;
  END LOOP;
END $$;

-- ═══════════════════════════════════════════════════════════
-- 8. Fix create_dm_with_members to also set dm_pair_key
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION create_dm_with_members(
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
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF auth.uid() NOT IN (p_user1_id, p_user2_id) THEN
    RAISE EXCEPTION 'Cannot create DM for other users';
  END IF;

  v_pair_key := 'dm:' || LEAST(p_user1_id::text, p_user2_id::text) || ':' || GREATEST(p_user1_id::text, p_user2_id::text);

  SELECT id INTO v_chat_id FROM chats WHERE type = 'dm' AND dm_pair_key = v_pair_key LIMIT 1;
  IF v_chat_id IS NOT NULL THEN RETURN v_chat_id; END IF;

  IF auth.uid() = p_user1_id THEN
    SELECT COALESCE(display_name, username) INTO v_other_display FROM app_users WHERE id = p_user2_id;
  ELSE
    SELECT COALESCE(display_name, username) INTO v_other_display FROM app_users WHERE id = p_user1_id;
  END IF;

  INSERT INTO chats (name, type, created_by, dm_pair_key)
  VALUES (COALESCE(v_other_display, 'Direct Message'), 'dm', auth.uid(), v_pair_key)
  ON CONFLICT (dm_pair_key) WHERE type = 'dm' AND dm_pair_key LIKE 'dm:%'
  DO UPDATE SET dm_pair_key = EXCLUDED.dm_pair_key
  RETURNING id INTO v_chat_id;

  INSERT INTO chat_memberships (chat_id, user_id, role)
  VALUES (v_chat_id, p_user1_id, 'member'), (v_chat_id, p_user2_id, 'member')
  ON CONFLICT (chat_id, user_id) DO NOTHING;

  RETURN v_chat_id;
END;
$$;
