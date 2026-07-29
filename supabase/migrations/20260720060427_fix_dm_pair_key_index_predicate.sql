-- Fix: Recreate the unique index with the exact predicate the
-- get_or_create_dm / get_or_create_dm_with / create_dm_with_members
-- functions use in their ON CONFLICT clause, so conflict resolution
-- actually works at the database level.
DROP INDEX IF EXISTS chats_dm_pair_key_unique_idx;

CREATE UNIQUE INDEX chats_dm_pair_key_unique_idx
ON chats (dm_pair_key)
WHERE type = 'dm' AND dm_pair_key LIKE 'dm:%';
