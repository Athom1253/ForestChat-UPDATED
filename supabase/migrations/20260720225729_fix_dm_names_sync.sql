-- Fix: DM chat names are stored incorrectly.
-- The chats.name column for DMs should store the OTHER user's display name
-- (from the creator's perspective), but the frontend is storing the creator's
-- own name. This causes every DM to show the auth user's own name in the sidebar.
--
-- This migration:
-- 1. Fixes existing DM names to show the other user's current display name
-- 2. Adds a trigger to correct DM names on INSERT
-- 3. Adds a trigger to sync DM names when a user changes their display_name

-- 1. Fix existing DM names
-- For each DM, set name to the display_name of the member who is NOT created_by
UPDATE chats c
SET name = sub.other_display_name
FROM (
  SELECT
    c2.id,
    COALESCE(au.display_name, au.username) AS other_display_name
  FROM chats c2
  JOIN chat_memberships cm ON cm.chat_id = c2.id
  JOIN app_users au ON au.id = cm.user_id
  WHERE c2.type = 'dm'
    AND cm.user_id != c2.created_by
) sub
WHERE c.id = sub.id
  AND c.type = 'dm';

-- 2. Trigger to correct DM name on insert
CREATE OR REPLACE FUNCTION fix_dm_name_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_other_user_id uuid;
  v_other_display text;
  v_pair text;
BEGIN
  IF NEW.type = 'dm' AND NEW.dm_pair_key LIKE 'dm:%' THEN
    -- Parse the pair key to find both user IDs
    v_pair := replace(NEW.dm_pair_key, 'dm:', '');
    -- The other user is the one who is NOT created_by
    IF split_part(v_pair, ':', 1)::uuid = NEW.created_by THEN
      v_other_user_id := split_part(v_pair, ':', 2)::uuid;
    ELSIF split_part(v_pair, ':', 2)::uuid = NEW.created_by THEN
      v_other_user_id := split_part(v_pair, ':', 1)::uuid;
    ELSE
      -- created_by is not in the pair key; use the second UUID as other
      v_other_user_id := split_part(v_pair, ':', 2)::uuid;
    END IF;

    SELECT COALESCE(display_name, username) INTO v_other_display
    FROM app_users WHERE id = v_other_user_id;

    IF v_other_display IS NOT NULL THEN
      NEW.name := v_other_display;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_fix_dm_name_on_insert ON chats;
CREATE TRIGGER trigger_fix_dm_name_on_insert
  BEFORE INSERT ON chats
  FOR EACH ROW EXECUTE FUNCTION fix_dm_name_on_insert();

-- 3. Trigger to sync DM names when a user changes their display_name
CREATE OR REPLACE FUNCTION sync_dm_names_on_profile_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_display text;
BEGIN
  v_new_display := COALESCE(NEW.display_name, NEW.username);

  -- Update DM names where this user is the "other" user (not created_by)
  -- These are DMs created by someone else with this user as the recipient
  UPDATE chats
  SET name = v_new_display
  WHERE type = 'dm'
    AND created_by != NEW.id
    AND dm_pair_key LIKE 'dm:%'
    AND (
      dm_pair_key = 'dm:' || LEAST(NEW.id::text, (SELECT created_by::text FROM chats c2 WHERE c2.id = chats.id)) || ':' || GREATEST(NEW.id::text, (SELECT created_by::text FROM chats c2 WHERE c2.id = chats.id))
    );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_sync_dm_names_on_profile_change ON app_users;
CREATE TRIGGER trigger_sync_dm_names_on_profile_change
  AFTER UPDATE OF display_name, username ON app_users
  FOR EACH ROW EXECUTE FUNCTION sync_dm_names_on_profile_change();
