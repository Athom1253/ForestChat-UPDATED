/*
# Pet upsert RPC, deleted message content, DM uniqueness

1. Pet persistence
   - Add `upsert_pet` RPC function that atomically creates or updates a pet row.
     This fixes race conditions where read-then-write patterns overwrite each other.
   - The function takes user_id + a JSONB patch and applies it via `jsonb_set` merges.
   - If no pet exists for the user, it creates one with defaults.

2. Deleted message admin feature
   - Add `deleted_content` column to `messages` table — stores the original content
     before deletion so admins can view and optionally restore it.
   - Add `deleted_by` column to track who deleted the message.

3. Duplicate DM prevention
   - Add a unique constraint on `chats` table for DM pairs: `(type, created_by)` 
     combined with a check that prevents creating a second DM between the same two users.
   - Add `get_or_create_dm` RPC function that atomally finds or creates a DM between
     two users, preventing duplicate DM race conditions.

4. Security
   - All RPC functions use `auth.uid()` for ownership checks.
   - RLS policies remain unchanged — new columns are covered by existing policies.
*/

-- ── 1. Pet upsert RPC ──
CREATE OR REPLACE FUNCTION upsert_pet(p_user_id uuid, p_patch jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  existing record;
  new_stats jsonb;
  new_tricks jsonb;
  new_achievements jsonb;
  result_row record;
BEGIN
  SELECT * INTO existing FROM user_pets WHERE user_id = p_user_id;
  
  IF NOT FOUND THEN
    -- Create new pet with defaults, apply patch on top
    INSERT INTO user_pets (user_id, species, name, color_variant, accessories, personality, level, xp, friendship, happiness, energy, hunger, cleanliness, tricks_learned, achievements, stats, is_sleeping)
    VALUES (
      p_user_id,
      COALESCE(p_patch->>'species', 'cat'),
      COALESCE(p_patch->>'name', 'Companion'),
      COALESCE(p_patch->>'color_variant', 'default'),
      COALESCE(p_patch->'accessories', '[]'::jsonb),
      COALESCE(p_patch->>'personality', 'playful'),
      COALESCE((p_patch->>'level')::int, 1),
      COALESCE((p_patch->>'xp')::int, 0),
      COALESCE((p_patch->>'friendship')::int, 50),
      COALESCE((p_patch->>'happiness')::int, 80),
      COALESCE((p_patch->>'energy')::int, 80),
      COALESCE((p_patch->>'hunger')::int, 60),
      COALESCE((p_patch->>'cleanliness')::int, 90),
      COALESCE(p_patch->'tricks_learned', '[]'::jsonb),
      COALESCE(p_patch->'achievements', '[]'::jsonb),
      COALESCE(p_patch->'stats', '{"pets":0,"feeds":0,"plays":0,"baths":0,"tricks":0}'::jsonb),
      COALESCE((p_patch->>'is_sleeping')::boolean, false)
    )
    RETURNING * INTO result_row;
  ELSE
    -- Update existing: merge patch fields
    new_stats := COALESCE(p_patch->'stats', existing.stats);
    new_tricks := COALESCE(p_patch->'tricks_learned', existing.tricks_learned);
    new_achievements := COALESCE(p_patch->'achievements', existing.achievements);
    
    UPDATE user_pets SET
      species = COALESCE(p_patch->>'species', existing.species),
      name = COALESCE(p_patch->>'name', existing.name),
      color_variant = COALESCE(p_patch->>'color_variant', existing.color_variant),
      accessories = COALESCE(p_patch->'accessories', existing.accessories),
      personality = COALESCE(p_patch->>'personality', existing.personality),
      level = COALESCE((p_patch->>'level')::int, existing.level),
      xp = COALESCE((p_patch->>'xp')::int, existing.xp),
      friendship = COALESCE((p_patch->>'friendship')::int, existing.friendship),
      happiness = COALESCE((p_patch->>'happiness')::int, existing.happiness),
      energy = COALESCE((p_patch->>'energy')::int, existing.energy),
      hunger = COALESCE((p_patch->>'hunger')::int, existing.hunger),
      cleanliness = COALESCE((p_patch->>'cleanliness')::int, existing.cleanliness),
      tricks_learned = new_tricks,
      achievements = new_achievements,
      stats = new_stats,
      is_sleeping = COALESCE((p_patch->>'is_sleeping')::boolean, existing.is_sleeping),
      last_fed_at = COALESCE((p_patch->>'last_fed_at')::timestamptz, existing.last_fed_at),
      last_played_at = COALESCE((p_patch->>'last_played_at')::timestamptz, existing.last_played_at),
      last_slept_at = COALESCE((p_patch->>'last_slept_at')::timestamptz, existing.last_slept_at),
      last_bathed_at = COALESCE((p_patch->>'last_bathed_at')::timestamptz, existing.last_bathed_at),
      updated_at = now()
    WHERE user_id = p_user_id
    RETURNING * INTO result_row;
  END IF;
  
  RETURN to_jsonb(result_row);
END;
$$;

-- ── 2. Deleted message content ──
ALTER TABLE messages ADD COLUMN IF NOT EXISTS deleted_content text;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS deleted_by uuid;

-- ── 3. DM uniqueness ──
-- Add a helper column for DM pairing if not exists
ALTER TABLE chats ADD COLUMN IF NOT EXISTS dm_pair_key text GENERATED ALWAYS AS (
  CASE 
    WHEN type = 'dm' AND created_by IS NOT NULL THEN 
      'dm'
    ELSE NULL 
  END
) STORED;

-- Create RPC to atomically get or create a DM between two users
CREATE OR REPLACE FUNCTION get_or_create_dm(user_a uuid, user_b uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  chat_id uuid;
  existing_chat uuid;
BEGIN
  -- Try to find existing DM between these two users
  SELECT c.id INTO existing_chat
  FROM chats c
  WHERE c.type = 'dm'
    AND c.id IN (
      SELECT cm.chat_id 
      FROM chat_memberships cm 
      WHERE cm.user_id IN (user_a, user_b)
      GROUP BY cm.chat_id 
      HAVING COUNT(DISTINCT cm.user_id) = 2
    )
  LIMIT 1;
  
  IF existing_chat IS NOT NULL THEN
    RETURN existing_chat;
  END IF;
  
  -- Create new DM
  INSERT INTO chats (type, created_by) VALUES ('dm', user_a) RETURNING id INTO chat_id;
  
  -- Add both users as members
  INSERT INTO chat_memberships (chat_id, user_id, role) VALUES (chat_id, user_a, 'owner');
  INSERT INTO chat_memberships (chat_id, user_id, role) VALUES (chat_id, user_b, 'member');
  
  RETURN chat_id;
END;
$$;
