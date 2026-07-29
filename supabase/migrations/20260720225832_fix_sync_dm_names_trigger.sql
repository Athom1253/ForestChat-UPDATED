-- Fix: The sync_dm_names_on_profile_change trigger had a broken correlated subquery.
-- Rewrite it to correctly update DM names when a user changes their display_name.
-- For DMs created BY someone else WITH this user, the chat name should show
-- this user's name (from the creator's perspective).

CREATE OR REPLACE FUNCTION sync_dm_names_on_profile_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_display text;
  v_chat_id uuid;
BEGIN
  v_new_display := COALESCE(NEW.display_name, NEW.username);

  -- Find DMs where this user is the "other" user (not the creator)
  -- and update their name to this user's new display name
  FOR v_chat_id IN
    SELECT c.id
    FROM chats c
    WHERE c.type = 'dm'
      AND c.created_by != NEW.id
      AND c.dm_pair_key LIKE 'dm:%'
      AND EXISTS (
        SELECT 1 FROM chat_memberships cm
        WHERE cm.chat_id = c.id AND cm.user_id = NEW.id
      )
  LOOP
    UPDATE chats SET name = v_new_display WHERE id = v_chat_id;
  END LOOP;

  RETURN NEW;
END;
$$;
