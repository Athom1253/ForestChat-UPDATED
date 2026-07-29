/*
# Make current_user_pet view return a default pet row when none exists

## Problem
The `current_user_pet` view returns 0 rows when an authenticated user
has no pet record in `user_pets`. If the frontend calls `.single()` on
this query, PostgREST returns an error ("JSON object requested, multiple
(or no) rows returned"), which the UI surfaces as "Pet failed to load".
The `get_pet()` RPC has a fallback that creates a pet, but the view does
not — so code paths that go through the view break for users without a
pet.

## Fix
Replace the view with a version that `UNION ALL`s a default-pet row
when the authenticated user has no pet. The default row uses the same
column defaults as the `user_pets` table. This ensures the view always
returns exactly one row for any authenticated user, so `.single()` and
`.maybeSingle()` both succeed.

## Security
- The view still uses `auth.uid()` in the WHERE clause, so unauthenticated
  requests get 0 rows (no default pet is returned for NULL auth.uid()).
- The default row is synthetic — it is not inserted into `user_pets`.
  If the frontend later calls `upsert_pet()` to save changes, the RPC
  will create the real row at that point.
- No RLS policy changes. No data changes.

## Notes
1. The default row has `id = NULL` and `created_at/updated_at = now()`
   so it is distinguishable from a real pet row if needed.
2. All column types match `user_pets` exactly.
3. The view is still owned by `postgres` (security_definer), so it
   bypasses RLS on `user_pets` — same behavior as before.
*/

DROP VIEW IF EXISTS current_user_pet;

CREATE VIEW current_user_pet AS
SELECT
  p.id, p.user_id, p.species, p.name, p.color_variant,
  p.accessories, p.outfit, p.personality,
  p.level, p.xp, p.friendship, p.happiness, p.energy, p.hunger, p.cleanliness,
  p.tricks_learned, p.achievements, p.stats,
  p.last_fed_at, p.last_played_at, p.last_slept_at, p.last_bathed_at,
  p.is_sleeping, p.invisible_admin_mode,
  p.created_at, p.updated_at
FROM user_pets p
WHERE p.user_id = auth.uid()

UNION ALL

SELECT
  NULL::uuid AS id,
  auth.uid() AS user_id,
  'cat' AS species,
  'Companion' AS name,
  'default' AS color_variant,
  '[]'::jsonb AS accessories,
  NULL::jsonb AS outfit,
  'playful' AS personality,
  1 AS level,
  0 AS xp,
  50 AS friendship,
  80 AS happiness,
  80 AS energy,
  60 AS hunger,
  90 AS cleanliness,
  '[]'::jsonb AS tricks_learned,
  '[]'::jsonb AS achievements,
  '{"pets": 0, "baths": 0, "feeds": 0, "plays": 0, "tricks": 0}'::jsonb AS stats,
  NULL::timestamptz AS last_fed_at,
  NULL::timestamptz AS last_played_at,
  NULL::timestamptz AS last_slept_at,
  NULL::timestamptz AS last_bathed_at,
  false AS is_sleeping,
  false AS invisible_admin_mode,
  now() AS created_at,
  now() AS updated_at
WHERE auth.uid() IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM user_pets WHERE user_pets.user_id = auth.uid()
  );

-- Grant the same permissions as before
GRANT SELECT ON current_user_pet TO anon, authenticated;
