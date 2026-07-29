-- Fix: Prevent duplicate DM chats
-- The dm_pair_key column exists to dedup DMs between the same pair of users,
-- but has no unique constraint, so duplicates can be created. Add a unique
-- constraint. Use COALESCE to handle existing NULLs (non-DM chats).
-- Note: a partial unique index only applies to DM rows, so group chats
-- with NULL dm_pair_key are unaffected.

-- First normalize existing dm_pair_keys so order is deterministic
-- (smaller UUID first). This ensures the same pair always produces the
-- same key regardless of who initiated.
UPDATE chats
SET dm_pair_key = (
  SELECT 'dm:' || array_to_string(
    array_agg(x ORDER BY x), ':'
  )
  FROM unnest(string_to_array(
    REPLACE(dm_pair_key, 'dm:', ''), ':'
  )) AS x
)
WHERE type = 'dm' AND dm_pair_key IS NOT NULL;

-- Add unique constraint for DM chats only
CREATE UNIQUE INDEX IF NOT EXISTS chats_dm_pair_key_unique_idx
ON chats (dm_pair_key)
WHERE type = 'dm' AND dm_pair_key IS NOT NULL;
