/*
# Drop functions that need return type change from uuid to jsonb
# Must DROP first because CREATE OR REPLACE can't change return type
*/

DROP FUNCTION IF EXISTS get_or_create_dm(uuid, uuid);
DROP FUNCTION IF EXISTS create_dm_with_members(text, uuid, uuid);
DROP FUNCTION IF EXISTS get_pet();
