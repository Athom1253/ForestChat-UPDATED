/*
# Fix: Make upsert_pet use auth.uid() instead of passed user_id

## Root Cause
The upsert_pet function checks auth.uid() != p_user_id and rejects if they
don't match. If the frontend passes a stale/wrong user_id (e.g., the old
amy's ID instead of the logged-in amy's ID), the function fails with
"Cannot modify another user's pet".

This is the same class of bug as the DM creation issue: the frontend
caches a user profile and passes its ID, but the ID doesn't match
the current authenticated user.

## Fix
Make upsert_pet use auth.uid() as the authoritative user_id, ignoring
the p_user_id parameter. The p_user_id parameter is kept for backward
compatibility but is no longer used for the auth check.

This is safe because:
- auth.uid() comes from the JWT and can't be faked
- The pet always belongs to the authenticated user
- The p_user_id parameter is redundant (auth.uid() is authoritative)
*/

DROP FUNCTION IF EXISTS upsert_pet(uuid, jsonb);

CREATE FUNCTION upsert_pet(p_user_id uuid DEFAULT NULL, p_patch jsonb DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing record;
  new_stats jsonb;
  new_tricks jsonb;
  new_achievements jsonb;
  result_row record;
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Use auth.uid() as the authoritative user_id, ignoring p_user_id
  -- This prevents issues where the frontend passes a stale/wrong user_id

  SELECT * INTO existing FROM user_pets WHERE user_id = v_user_id;

  IF NOT FOUND THEN
    INSERT INTO user_pets (user_id, species, name, color_variant, accessories, outfit, personality, level, xp, friendship, happiness, energy, hunger, cleanliness, tricks_learned, achievements, stats, is_sleeping)
    VALUES (
      v_user_id,
      COALESCE(p_patch->>'species', 'cat'),
      COALESCE(p_patch->>'name', 'Companion'),
      COALESCE(p_patch->>'color_variant', 'default'),
      COALESCE(p_patch->'accessories', '[]'::jsonb),
      p_patch->'outfit',
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
    new_stats := COALESCE(p_patch->'stats', existing.stats);
    new_tricks := COALESCE(p_patch->'tricks_learned', existing.tricks_learned);
    new_achievements := COALESCE(p_patch->'achievements', existing.achievements);

    UPDATE user_pets SET
      species = COALESCE(p_patch->>'species', existing.species),
      name = COALESCE(p_patch->>'name', existing.name),
      color_variant = COALESCE(p_patch->>'color_variant', existing.color_variant),
      accessories = COALESCE(p_patch->'accessories', existing.accessories),
      outfit = CASE WHEN p_patch ? 'outfit' THEN p_patch->'outfit' ELSE existing.outfit END,
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
    WHERE user_id = v_user_id
    RETURNING * INTO result_row;
  END IF;

  RETURN to_jsonb(result_row);
END;
$$;
