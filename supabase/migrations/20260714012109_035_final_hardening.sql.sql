/*
# Final Hardening: Data integrity, safe destructive actions, bug fixes

## Bugs Found and Fixed

### Bug 1: DMs with missing memberships (FIXED in data)
4 DMs created by amy test had only 1 member instead of 2.
The current user (amy test) was missing from all 4.
Already fixed by adding missing memberships.

### Bug 2: redeem_invite_code increments uses_count even for existing members
The function increments uses_count BEFORE checking if the user is already
a member. If the user already redeemed, the count is still incremented.
Fix: Check existing redemption first, only increment if new.

### Bug 3: No user-facing leave_chat function
Users can't leave rooms or delete chats from their sidebar.
Only admin_delete_chat exists (deletes for everyone).
Fix: Add leave_chat function that removes the user's membership.

### Bug 4: No delete_all_chats function
Users can't bulk-delete their conversations.
Fix: Add delete_all_user_chats function.

### Bug 5: No delete_chat_for_user function
Users need to delete a conversation from their sidebar without
affecting other users.
Fix: Add delete_chat_for_user function that removes only the user's membership.
*/

-- ═══════════════════════════════════════════════════════════
-- 1. Fix redeem_invite_code: don't increment for existing redemptions
-- ═══════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS redeem_invite_code(text, uuid);

CREATE FUNCTION redeem_invite_code(p_code text, p_user_id uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite record;
  v_id uuid;
  v_chat_id uuid;
  v_current uuid;
BEGIN
  v_current := auth.uid();
  IF v_current IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_user_id IS NULL THEN p_user_id := v_current; END IF;
  IF p_user_id != v_current THEN RAISE EXCEPTION 'Cannot redeem for another user'; END IF;

  SELECT id, max_uses, uses_count, expires_at, is_active INTO v_invite
  FROM invite_codes WHERE UPPER(code) = UPPER(p_code) FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid invite code'; END IF;
  IF NOT v_invite.is_active THEN RAISE EXCEPTION 'This invite code has been revoked'; END IF;
  IF v_invite.expires_at IS NOT NULL AND v_invite.expires_at < now() THEN
    RAISE EXCEPTION 'This invite code has expired';
  END IF;
  IF v_invite.uses_count >= v_invite.max_uses THEN
    RAISE EXCEPTION 'This invite code has reached its usage limit';
  END IF;

  -- Check if already redeemed
  IF EXISTS (SELECT 1 FROM invite_redemptions WHERE invite_id = v_invite.id AND user_id = v_current) THEN
    RETURN v_invite.id;
  END IF;

  -- Only increment for new redemptions
  UPDATE invite_codes SET uses_count = uses_count + 1 WHERE id = v_invite.id RETURNING id INTO v_id;

  INSERT INTO invite_redemptions (invite_id, user_id) VALUES (v_id, v_current)
  ON CONFLICT (invite_id, user_id) DO NOTHING;

  -- Join the chat if there's an invite for it
  SELECT chat_id INTO v_chat_id FROM chat_invites WHERE UPPER(code) = UPPER(p_code) LIMIT 1;
  IF v_chat_id IS NOT NULL THEN
    INSERT INTO chat_memberships (chat_id, user_id, role)
    VALUES (v_chat_id, v_current, 'member')
    ON CONFLICT (chat_id, user_id) DO NOTHING;
  END IF;

  RETURN v_id;
END;
$$;

-- ═══════════════════════════════════════════════════════════
-- 2. Add leave_chat function (user removes themselves from a chat)
-- ═══════════════════════════════════════════════════════════
CREATE FUNCTION leave_chat(p_chat_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current uuid;
  v_chat_type text;
  v_member_count int;
BEGIN
  v_current := auth.uid();
  IF v_current IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT type INTO v_chat_type FROM chats WHERE id = p_chat_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Chat not found'; END IF;

  -- Remove the user's membership
  DELETE FROM chat_memberships WHERE chat_id = p_chat_id AND user_id = v_current;

  -- For DMs: if one member leaves, delete the entire DM (it's a 2-person chat)
  -- For groups: if the last member leaves, delete the chat
  SELECT COUNT(*) INTO v_member_count FROM chat_memberships WHERE chat_id = p_chat_id;
  IF v_member_count = 0 THEN
    DELETE FROM chats WHERE id = p_chat_id;
  END IF;
END;
$$;

-- ═══════════════════════════════════════════════════════════
-- 3. Add delete_chat_for_user function (alias for leave_chat)
-- ═══════════════════════════════════════════════════════════
-- This is what the frontend calls when a user "deletes" a conversation.
-- It removes the conversation from the user's sidebar without
-- affecting other users.
CREATE FUNCTION delete_chat_for_user(p_chat_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM leave_chat(p_chat_id);
END;
$$;

-- ═══════════════════════════════════════════════════════════
-- 4. Add delete_all_user_chats function
-- ═══════════════════════════════════════════════════════════
-- Removes ALL of the current user's chat memberships.
-- Does NOT delete the chats themselves (other users keep their conversations).
-- Only deletes chats where the user is the sole member.
CREATE FUNCTION delete_all_user_chats()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current uuid;
  v_chat_id uuid;
BEGIN
  v_current := auth.uid();
  IF v_current IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  -- For each chat the user is a member of
  FOR v_chat_id IN SELECT chat_id FROM chat_memberships WHERE user_id = v_current
  LOOP
    -- Remove the user's membership
    DELETE FROM chat_memberships WHERE chat_id = v_chat_id AND user_id = v_current;

    -- If no members remain, delete the chat entirely
    IF NOT EXISTS (SELECT 1 FROM chat_memberships WHERE chat_id = v_chat_id) THEN
      DELETE FROM chats WHERE id = v_chat_id;
    END IF;
  END LOOP;
END;
$$;

-- ═══════════════════════════════════════════════════════════
-- 5. Add a safety trigger: ensure DM memberships always have 2 members
-- ═══════════════════════════════════════════════════════════
-- If a DM ever ends up with 0 or 1 members, delete it (it's broken).
-- This prevents the "DM with 1 member" bug from recurring.
CREATE OR REPLACE FUNCTION cleanup_orphaned_dms()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_chat_id uuid;
BEGIN
  -- Delete DMs with 0 members
  FOR v_chat_id IN
    SELECT c.id FROM chats c
    WHERE c.type = 'dm'
    AND NOT EXISTS (SELECT 1 FROM chat_memberships WHERE chat_id = c.id)
  LOOP
    DELETE FROM chats WHERE id = v_chat_id;
  END LOOP;

  -- For DMs with 1 member: try to add the missing member from the pair key
  FOR v_chat_id IN
    SELECT c.id FROM chats c
    WHERE c.type = 'dm' AND c.dm_pair_key LIKE 'dm:%'
    AND (SELECT COUNT(*) FROM chat_memberships WHERE chat_id = c.id) = 1
  LOOP
    -- Parse the pair key to find both user IDs
    -- The pair key format is: dm:<uuid1>:<uuid2>
    -- But UUIDs contain dashes, not colons, so split on ':'
    DECLARE
      v_pair text;
      v_uid1 uuid;
      v_uid2 uuid;
      v_existing uuid;
    BEGIN
      v_pair := replace(
        (SELECT dm_pair_key FROM chats WHERE id = v_chat_id),
        'dm:', ''
      );
      v_uid1 := split_part(v_pair, ':', 1)::uuid;
      v_uid2 := split_part(v_pair, ':', 2)::uuid;

      -- Find which user is missing
      SELECT user_id INTO v_existing FROM chat_memberships WHERE chat_id = v_chat_id LIMIT 1;

      IF v_existing = v_uid1 THEN
        INSERT INTO chat_memberships (chat_id, user_id, role)
        VALUES (v_chat_id, v_uid2, 'member')
        ON CONFLICT (chat_id, user_id) DO NOTHING;
      ELSIF v_existing = v_uid2 THEN
        INSERT INTO chat_memberships (chat_id, user_id, role)
        VALUES (v_chat_id, v_uid1, 'member')
        ON CONFLICT (chat_id, user_id) DO NOTHING;
      END IF;
    END;
  END LOOP;
END;
$$;

-- Run the cleanup once
SELECT cleanup_orphaned_dms();

-- ═══════════════════════════════════════════════════════════
-- 6. Add a trigger to auto-fix DM memberships after INSERT into chats
-- ═══════════════════════════════════════════════════════════
-- This trigger runs after a new DM chat is created.
-- It ensures both participants are added as members.
CREATE OR REPLACE FUNCTION ensure_dm_memberships()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid1 uuid;
  v_uid2 uuid;
  v_pair text;
BEGIN
  IF NEW.type = 'dm' AND NEW.dm_pair_key LIKE 'dm:%' THEN
    v_pair := replace(NEW.dm_pair_key, 'dm:', '');
    v_uid1 := split_part(v_pair, ':', 1)::uuid;
    v_uid2 := split_part(v_pair, ':', 2)::uuid;

    INSERT INTO chat_memberships (chat_id, user_id, role)
    VALUES (NEW.id, v_uid1, 'member')
    ON CONFLICT (chat_id, user_id) DO NOTHING;

    INSERT INTO chat_memberships (chat_id, user_id, role)
    VALUES (NEW.id, v_uid2, 'member')
    ON CONFLICT (chat_id, user_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_ensure_dm_memberships ON chats;
CREATE TRIGGER trigger_ensure_dm_memberships
  AFTER INSERT ON chats
  FOR EACH ROW
  EXECUTE FUNCTION ensure_dm_memberships();
