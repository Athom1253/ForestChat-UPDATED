-- =====================================================
-- Fix 1: Make get_pet() robust against race conditions
-- =====================================================
-- The get_pet() function has a race condition: if the auto_create_pet
-- trigger fires simultaneously with get_pet()'s fallback INSERT,
-- the INSERT fails (UNIQUE constraint violation on user_id),
-- v_pet stays uninitialized, and to_jsonb(NULL::record) returns NULL.
-- The frontend sees { data: null, error: null } and shows "Pet failed to load".
--
-- Fix: Use ON CONFLICT DO NOTHING on the fallback INSERT, then re-SELECT
-- to get the pet row regardless of whether we inserted or a conflict occurred.

CREATE OR REPLACE FUNCTION public.get_pet()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  result jsonb;
  v_pet record;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Try to select existing pet
  SELECT * INTO v_pet FROM user_pets WHERE user_id = auth.uid() LIMIT 1;

  IF NOT FOUND THEN
    -- Pet doesn't exist; try to create one.
    -- ON CONFLICT handles the race condition where the auto_create_pet
    -- trigger or another call inserts a pet between our SELECT and INSERT.
    INSERT INTO user_pets (user_id, species, name, color_variant, personality)
    VALUES (auth.uid(), 'cat', 'Companion', 'default', 'playful')
    ON CONFLICT (user_id) DO NOTHING
    RETURNING * INTO v_pet;

    -- If INSERT conflicted (v_pet is still null), re-select the existing row
    IF v_pet.user_id IS NULL THEN
      SELECT * INTO v_pet FROM user_pets WHERE user_id = auth.uid() LIMIT 1;
    END IF;
  END IF;

  -- If we still don't have a pet (shouldn't happen, but defensive),
  -- return an explicit error rather than NULL
  IF v_pet.user_id IS NULL THEN
    RAISE EXCEPTION 'Failed to load pet data';
  END IF;

  result := to_jsonb(v_pet);
  RETURN result;
END;
$function$;

-- =====================================================
-- Fix 2: Deduplicate DMs between the same user pairs
-- =====================================================
-- The "amy" account (7d0ebdfb) was seeded without auth. "amy test" 
-- (7d0fa80e) was created later with auth. Both created DMs with the
-- same people, producing different dm_pair_keys.
--
-- We can't merge the accounts (different IDs), but we CAN merge
-- the duplicate DM chats by:
-- 1. Finding DMs where both participants are the same pair of users
-- 2. Keeping the most recently active chat
-- 3. Moving messages from older duplicates to the kept chat
-- 4. Removing the duplicate chats and their memberships
--
-- We also need to handle the DM between "amy" and "amy test" themselves
-- (chat 8a2816cb) — this is a self-DM that shouldn't appear in the sidebar.

DO $$
DECLARE
  dup_record record;
  keep_chat_id uuid;
  dup_chat_id uuid;
BEGIN
  -- Find DMs between the same pair of users (different chat IDs, same pair)
  FOR dup_record IN
    SELECT 
      LEAST(cm1.user_id, cm2.user_id) as user_a,
      GREATEST(cm1.user_id, cm2.user_id) as user_b,
      array_agg(c.id ORDER BY c.last_message_at DESC NULLS LAST) as chat_ids
    FROM chats c
    JOIN chat_memberships cm1 ON cm1.chat_id = c.id
    JOIN chat_memberships cm2 ON cm2.chat_id = c.id AND cm2.user_id > cm1.user_id
    WHERE c.type = 'dm'
    GROUP BY LEAST(cm1.user_id, cm2.user_id), GREATEST(cm1.user_id, cm2.user_id)
    HAVING count(DISTINCT c.id) > 1
  LOOP
    -- Keep the first chat (most recently active), remove the rest
    keep_chat_id := dup_record.chat_ids[1];
    
    FOR i IN 2..array_length(dup_record.chat_ids, 1) LOOP
      dup_chat_id := dup_record.chat_ids[i];
      
      -- Move messages from duplicate to kept chat
      UPDATE messages SET chat_id = keep_chat_id WHERE chat_id = dup_chat_id;
      
      -- Move read receipts
      INSERT INTO read_receipts (chat_id, user_id, last_read_at)
      SELECT keep_chat_id, user_id, last_read_at FROM read_receipts WHERE chat_id = dup_chat_id
      ON CONFLICT (chat_id, user_id) DO UPDATE SET last_read_at = GREATEST(read_receipts.last_read_at, EXCLUDED.last_read_at);
      
      -- Remove memberships from duplicate chat
      DELETE FROM chat_memberships WHERE chat_id = dup_chat_id;
      
      -- Delete the duplicate chat
      DELETE FROM chats WHERE id = dup_chat_id;
    END LOOP;
  END LOOP;
END $$;

-- =====================================================
-- Fix 3: Remove the self-DM between "amy" and "amy test"
-- =====================================================
-- The "amy" account (7d0ebdfb) and "amy test" (7d0fa80e) are the same
-- person. The DM between them (chat 8a2816cb) is a self-DM that
-- clutters the sidebar. Remove it.

DELETE FROM chat_memberships WHERE chat_id = '8a2816cb-58a2-4010-8ecb-f3b691cb6f34';
DELETE FROM messages WHERE chat_id = '8a2816cb-58a2-4010-8ecb-f3b691cb6f34';
DELETE FROM chats WHERE id = '8a2816cb-58a2-4010-8ecb-f3b691cb6f34';

-- =====================================================
-- Fix 4: Merge duplicate "Test" groups created by the same user
-- =====================================================
-- "amy test" created two groups named "Test". Keep the one with
-- more recent activity, move messages from the other.

DO $$
DECLARE
  keep_id uuid;
  dup_id uuid;
BEGIN
  -- Find the most recently active "Test" group by "amy test"
  SELECT id INTO keep_id FROM chats 
  WHERE name = 'Test' AND type = 'group' AND created_by = '7d0fa80e-842a-479d-b490-393252712ad2'
  ORDER BY last_message_at DESC NULLS LAST LIMIT 1;
  
  -- Find the other one
  SELECT id INTO dup_id FROM chats 
  WHERE name = 'Test' AND type = 'group' AND created_by = '7d0fa80e-842a-479d-b490-393252712ad2'
    AND id != keep_id
  ORDER BY last_message_at DESC NULLS LAST LIMIT 1;
  
  IF keep_id IS NOT NULL AND dup_id IS NOT NULL THEN
    -- Move messages
    UPDATE messages SET chat_id = keep_id WHERE chat_id = dup_id;
    -- Move memberships (skip conflicts)
    INSERT INTO chat_memberships (chat_id, user_id, role, is_muted, is_pinned, is_archived)
    SELECT keep_id, user_id, role, is_muted, is_pinned, is_archived 
    FROM chat_memberships WHERE chat_id = dup_id
    ON CONFLICT (chat_id, user_id) DO NOTHING;
    -- Delete duplicate
    DELETE FROM chat_memberships WHERE chat_id = dup_id;
    DELETE FROM chats WHERE id = dup_id;
  END IF;
END $$;

-- =====================================================
-- Fix 5: Update last_message_at on kept chats after message migration
-- =====================================================
UPDATE chats c SET 
  last_message_at = (SELECT MAX(created_at) FROM messages WHERE chat_id = c.id),
  last_message_preview = COALESCE(
    (SELECT content FROM messages WHERE chat_id = c.id AND is_deleted = false ORDER BY created_at DESC LIMIT 1),
    ''
  )
WHERE c.type = 'dm' OR c.type = 'group';
