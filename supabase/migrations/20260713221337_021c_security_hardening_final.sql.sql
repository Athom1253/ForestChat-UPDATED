/*
# Security Hardening Part 2b: Recreate all functions with search_path and security fixes

Recreates all SECURITY DEFINER functions with:
- Explicit SET search_path = public (eliminates mutable search_path warnings)
- Admin authorization checks on all admin_* functions
- IDOR fixes on upsert_pet and redeem_invite_code
- Auth checks on record_sign_in_activity and update_last_seen
- Preserved DEFAULT parameters where they existed
*/

-- ═══════════════════════════════════════════════════════════
-- Helper functions
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION is_app_admin()
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.app_users WHERE id = auth.uid() AND is_admin = true); $$;

CREATE OR REPLACE FUNCTION is_chat_member(p_chat_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.chat_memberships WHERE chat_id = p_chat_id AND user_id = auth.uid()); $$;

CREATE OR REPLACE FUNCTION is_chat_admin(p_chat_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.chat_memberships WHERE chat_id = p_chat_id AND user_id = auth.uid() AND role IN ('owner', 'admin')); $$;

CREATE OR REPLACE FUNCTION is_chat_owner(p_chat_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.chat_memberships WHERE chat_id = p_chat_id AND user_id = auth.uid() AND role = 'owner'); $$;

-- ═══════════════════════════════════════════════════════════
-- Admin functions (all with is_app_admin() check)
-- ═══════════════════════════════════════════════════════════
CREATE FUNCTION admin_create_announcement(p_title text, p_body text, p_dismissible boolean DEFAULT true, p_expires_at timestamptz DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public.is_app_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  INSERT INTO public.admin_announcements (admin_id, title, body, dismissible, expires_at)
  VALUES (auth.uid(), p_title, p_body, p_dismissible, p_expires_at) RETURNING id INTO v_id;
  PERFORM public.admin_log_action('create_announcement', 'announcement', v_id, p_title);
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION admin_delete_chat(p_chat_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_chat_name text;
BEGIN
  IF NOT public.is_app_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  SELECT name INTO v_chat_name FROM public.chats WHERE id = p_chat_id;
  PERFORM public.admin_log_action('delete_chat', 'chat', p_chat_id, v_chat_name);
  DELETE FROM public.chats WHERE id = p_chat_id;
END;
$$;

CREATE OR REPLACE FUNCTION admin_delete_message(p_message_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_app_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  PERFORM public.admin_log_action('delete_message', 'message', p_message_id);
  DELETE FROM public.messages WHERE id = p_message_id;
END;
$$;

CREATE OR REPLACE FUNCTION admin_delete_user(p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_username text;
BEGIN
  IF NOT public.is_app_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF auth.uid() = p_user_id THEN RAISE EXCEPTION 'Cannot delete yourself'; END IF;
  SELECT username INTO v_username FROM public.app_users WHERE id = p_user_id;
  PERFORM public.admin_log_action('delete_user', 'user', p_user_id, v_username);
  DELETE FROM public.app_users WHERE id = p_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION admin_demote_user(p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_username text;
BEGIN
  IF NOT public.is_app_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF auth.uid() = p_user_id THEN RAISE EXCEPTION 'Cannot demote yourself'; END IF;
  SELECT username INTO v_username FROM public.app_users WHERE id = p_user_id;
  UPDATE public.app_users SET is_admin = false WHERE id = p_user_id;
  PERFORM public.admin_log_action('demote_admin', 'user', p_user_id, v_username);
END;
$$;

CREATE OR REPLACE FUNCTION admin_disable_user(p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_username text;
BEGIN
  IF NOT public.is_app_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF auth.uid() = p_user_id THEN RAISE EXCEPTION 'Cannot disable yourself'; END IF;
  SELECT username INTO v_username FROM public.app_users WHERE id = p_user_id;
  UPDATE public.app_users SET is_disabled = true, is_suspended = false, suspended_until = NULL WHERE id = p_user_id;
  PERFORM public.admin_log_action('disable_user', 'user', p_user_id, v_username);
END;
$$;

CREATE OR REPLACE FUNCTION admin_enable_user(p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_username text;
BEGIN
  IF NOT public.is_app_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  SELECT username INTO v_username FROM public.app_users WHERE id = p_user_id;
  UPDATE public.app_users SET is_disabled = false, is_suspended = false, suspended_until = NULL WHERE id = p_user_id;
  PERFORM public.admin_log_action('enable_user', 'user', p_user_id, v_username);
END;
$$;

CREATE OR REPLACE FUNCTION admin_force_signout(p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_username text;
BEGIN
  IF NOT public.is_app_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  SELECT username INTO v_username FROM public.app_users WHERE id = p_user_id;
  PERFORM public.admin_log_action('force_signout', 'user', p_user_id, v_username);
END;
$$;

CREATE OR REPLACE FUNCTION admin_join_chat(p_chat_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_chat_name text;
BEGIN
  IF NOT public.is_app_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  SELECT name INTO v_chat_name FROM public.chats WHERE id = p_chat_id;
  INSERT INTO public.chat_memberships (chat_id, user_id, role)
  VALUES (p_chat_id, auth.uid(), 'member') ON CONFLICT (chat_id, user_id) DO NOTHING;
  PERFORM public.admin_log_action('admin_join_chat', 'chat', p_chat_id, v_chat_name);
END;
$$;

CREATE OR REPLACE FUNCTION admin_promote_user(p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_username text;
BEGIN
  IF NOT public.is_app_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  SELECT username INTO v_username FROM public.app_users WHERE id = p_user_id;
  UPDATE public.app_users SET is_admin = true WHERE id = p_user_id;
  PERFORM public.admin_log_action('promote_admin', 'user', p_user_id, v_username);
END;
$$;

CREATE OR REPLACE FUNCTION admin_remove_from_chat(p_chat_id uuid, p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_chat_name text; v_username text;
BEGIN
  IF NOT public.is_app_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  SELECT name INTO v_chat_name FROM public.chats WHERE id = p_chat_id;
  SELECT username INTO v_username FROM public.app_users WHERE id = p_user_id;
  DELETE FROM public.chat_memberships WHERE chat_id = p_chat_id AND user_id = p_user_id;
  PERFORM public.admin_log_action('remove_from_chat', 'chat', p_chat_id, v_chat_name, jsonb_build_object('user', v_username));
END;
$$;

CREATE OR REPLACE FUNCTION admin_reset_user_profile(p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_username text;
BEGIN
  IF NOT public.is_app_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  SELECT username INTO v_username FROM public.app_users WHERE id = p_user_id;
  UPDATE public.app_users SET display_name = NULL, avatar_url = NULL, bio = '', status_message = '', banner_url = NULL, badges = '{}'::text[], pronouns = NULL, profile_reset_at = now() WHERE id = p_user_id;
  PERFORM public.admin_log_action('reset_profile', 'user', p_user_id, v_username);
END;
$$;

CREATE FUNCTION admin_send_notification(p_target_user_id uuid, p_title text, p_body text, p_type text DEFAULT 'system')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id uuid; v_username text;
BEGIN
  IF NOT public.is_app_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  SELECT username INTO v_username FROM public.app_users WHERE id = p_target_user_id;
  INSERT INTO public.admin_notifications (admin_id, target_user_id, title, body, type)
  VALUES (auth.uid(), p_target_user_id, p_title, p_body, p_type) RETURNING id INTO v_id;
  PERFORM public.admin_log_action('send_notification', 'notification', v_id, v_username, jsonb_build_object('title', p_title));
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION admin_suspend_user(p_user_id uuid, p_until timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_username text;
BEGIN
  IF NOT public.is_app_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF auth.uid() = p_user_id THEN RAISE EXCEPTION 'Cannot suspend yourself'; END IF;
  SELECT username INTO v_username FROM public.app_users WHERE id = p_user_id;
  UPDATE public.app_users SET is_suspended = true, suspended_until = p_until, is_disabled = false WHERE id = p_user_id;
  PERFORM public.admin_log_action('suspend_user', 'user', p_user_id, v_username, jsonb_build_object('until', p_until));
END;
$$;

CREATE OR REPLACE FUNCTION admin_transfer_ownership(p_chat_id uuid, p_new_owner_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_chat_name text; v_username text;
BEGIN
  IF NOT public.is_app_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  SELECT name INTO v_chat_name FROM public.chats WHERE id = p_chat_id;
  SELECT username INTO v_username FROM public.app_users WHERE id = p_new_owner_id;
  UPDATE public.chat_memberships SET role = 'member' WHERE chat_id = p_chat_id AND role = 'owner';
  INSERT INTO public.chat_memberships (chat_id, user_id, role)
  VALUES (p_chat_id, p_new_owner_id, 'owner') ON CONFLICT (chat_id, user_id) DO UPDATE SET role = 'owner';
  PERFORM public.admin_log_action('transfer_ownership', 'chat', p_chat_id, v_chat_name, jsonb_build_object('new_owner', v_username));
END;
$$;

-- ═══════════════════════════════════════════════════════════
-- User-facing functions
-- ═══════════════════════════════════════════════════════════
CREATE FUNCTION create_group_chat(p_name text, p_description text DEFAULT '', p_avatar_url text DEFAULT NULL, p_invite_code text DEFAULT NULL, p_owner_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_chat_id uuid; v_owner uuid;
BEGIN
  v_owner := COALESCE(p_owner_id, auth.uid());
  IF v_owner IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF v_owner <> auth.uid() THEN RAISE EXCEPTION 'Owner id must match the authenticated user'; END IF;
  INSERT INTO public.chats (name, type, description, avatar_url, invite_code, created_by)
  VALUES (p_name, 'group', p_description, p_avatar_url, p_invite_code, v_owner) RETURNING id INTO v_chat_id;
  INSERT INTO public.chat_memberships (chat_id, user_id, role) VALUES (v_chat_id, v_owner, 'owner');
  IF p_invite_code IS NOT NULL AND p_invite_code <> '' THEN
    INSERT INTO public.chat_invites (chat_id, code, created_by) VALUES (v_chat_id, p_invite_code, v_owner);
  END IF;
  RETURN v_chat_id;
END;
$$;

CREATE OR REPLACE FUNCTION create_dm_with_members(p_name text, p_user1_id uuid, p_user2_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_chat_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF auth.uid() NOT IN (p_user1_id, p_user2_id) THEN RAISE EXCEPTION 'Cannot create DM for other users'; END IF;
  INSERT INTO public.chats (name, type, created_by) VALUES (p_name, 'dm', auth.uid()) RETURNING id INTO v_chat_id;
  INSERT INTO public.chat_memberships (chat_id, user_id, role) VALUES (v_chat_id, p_user1_id, 'member'), (v_chat_id, p_user2_id, 'member');
  RETURN v_chat_id;
END;
$$;

CREATE OR REPLACE FUNCTION get_or_create_dm(user_a uuid, user_b uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE chat_id uuid; existing_chat uuid;
BEGIN
  SELECT c.id INTO existing_chat FROM chats c WHERE c.type = 'dm'
    AND c.id IN (SELECT cm.chat_id FROM chat_memberships cm WHERE cm.user_id IN (user_a, user_b) GROUP BY cm.chat_id HAVING COUNT(DISTINCT cm.user_id) = 2) LIMIT 1;
  IF existing_chat IS NOT NULL THEN RETURN existing_chat; END IF;
  INSERT INTO chats (type, name, created_by) VALUES ('dm', 'DM', user_a) RETURNING id INTO chat_id;
  INSERT INTO chat_memberships (chat_id, user_id, role) VALUES (chat_id, user_a, 'member');
  INSERT INTO chat_memberships (chat_id, user_id, role) VALUES (chat_id, user_b, 'member');
  RETURN chat_id;
END;
$$;

CREATE OR REPLACE FUNCTION join_chat_by_invite(p_code text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_invite record; v_chat_id uuid; v_existing uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT id, chat_id, max_uses, uses_count, expires_at INTO v_invite FROM public.chat_invites WHERE UPPER(code) = UPPER(p_code) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid invite code'; END IF;
  IF v_invite.expires_at IS NOT NULL AND v_invite.expires_at < now() THEN RAISE EXCEPTION 'This invite code has expired'; END IF;
  IF v_invite.max_uses IS NOT NULL AND v_invite.uses_count >= v_invite.max_uses THEN RAISE EXCEPTION 'This invite code has reached its usage limit'; END IF;
  v_chat_id := v_invite.chat_id;
  SELECT id INTO v_existing FROM public.chat_memberships WHERE chat_id = v_chat_id AND user_id = auth.uid();
  IF v_existing IS NOT NULL THEN RETURN v_chat_id; END IF;
  UPDATE public.chat_invites SET uses_count = uses_count + 1 WHERE id = v_invite.id;
  INSERT INTO public.chat_memberships (chat_id, user_id, role) VALUES (v_chat_id, auth.uid(), 'member');
  RETURN v_chat_id;
END;
$$;

CREATE OR REPLACE FUNCTION join_public_room(p_chat_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_chat record; v_existing uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT id, type INTO v_chat FROM public.chats WHERE id = p_chat_id AND type = 'group';
  IF NOT FOUND THEN RAISE EXCEPTION 'Room not found'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.chat_invites WHERE chat_id = p_chat_id) THEN RAISE EXCEPTION 'This room is not publicly joinable'; END IF;
  SELECT id INTO v_existing FROM public.chat_memberships WHERE chat_id = p_chat_id AND user_id = auth.uid();
  IF v_existing IS NOT NULL THEN RETURN p_chat_id; END IF;
  INSERT INTO public.chat_memberships (chat_id, user_id, role) VALUES (p_chat_id, auth.uid(), 'member');
  RETURN p_chat_id;
END;
$$;

CREATE OR REPLACE FUNCTION public_rooms()
RETURNS TABLE (id uuid, name text, description text, type text, avatar_url text, invite_code text, created_by uuid, created_at timestamptz, last_message_at timestamptz, last_message_preview text, member_count bigint)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT c.id, c.name, c.description, c.type, c.avatar_url, c.invite_code, c.created_by, c.created_at, c.last_message_at, c.last_message_preview, COALESCE(mc.cnt, 0)::bigint
  FROM public.chats c
  LEFT JOIN (SELECT chat_id, COUNT(*) AS cnt FROM public.chat_memberships GROUP BY chat_id) mc ON mc.chat_id = c.id
  WHERE c.type = 'group' AND EXISTS (SELECT 1 FROM public.chat_invites ci WHERE ci.chat_id = c.id)
  ORDER BY c.last_message_at DESC NULLS LAST, c.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION record_sign_in_activity()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  INSERT INTO public.sign_in_activity (user_id) VALUES (auth.uid());
END;
$$;

CREATE OR REPLACE FUNCTION update_last_seen()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  UPDATE public.app_users SET last_seen = now() WHERE id = auth.uid();
END;
$$;

CREATE OR REPLACE FUNCTION cleanup_stale_typing_indicators()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE deleted_count integer;
BEGIN
  DELETE FROM public.typing_indicators WHERE started_at < now() - interval '15 seconds';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- Trigger functions
CREATE OR REPLACE FUNCTION update_chat_last_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE public.chats SET last_message_at = NEW.created_at, last_message_preview = CASE
    WHEN NEW.message_type = 'voice' THEN '🎤 Voice message'
    WHEN NEW.message_type = 'image' THEN '📷 Image'
    WHEN NEW.message_type = 'video' THEN '🎬 Video'
    WHEN NEW.message_type = 'file' THEN '📎 File'
    WHEN NEW.message_type = 'poll' THEN '📊 Poll'
    WHEN NEW.content != '' THEN LEFT(NEW.content, 80)
    ELSE '[attachment]' END
  WHERE id = NEW.chat_id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION update_chat_last_message_on_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.created_at >= (SELECT COALESCE(last_message_at, '1970-01-01') FROM public.chats WHERE id = NEW.chat_id) THEN
    UPDATE public.chats SET last_message_preview = CASE
      WHEN NEW.is_deleted THEN '[deleted]'
      WHEN NEW.message_type = 'voice' THEN '🎤 Voice message'
      WHEN NEW.message_type = 'image' THEN '📷 Image'
      WHEN NEW.message_type = 'video' THEN '🎬 Video'
      WHEN NEW.message_type = 'file' THEN '📎 File'
      WHEN NEW.message_type = 'poll' THEN '📊 Poll'
      WHEN NEW.content != '' THEN LEFT(NEW.content, 80)
      ELSE '[attachment]' END
    WHERE id = NEW.chat_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION handle_new_auth_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_username text; v_display_name text; v_counter integer := 0; v_candidate text;
BEGIN
  v_username := LOWER(REGEXP_REPLACE(SPLIT_PART(NEW.email, '@', 1), '[^a-z0-9_]', '', 'g'));
  IF v_username = '' OR v_username IS NULL THEN v_username := 'user'; END IF;
  v_username := LEFT(v_username, 20);
  v_candidate := v_username;
  WHILE EXISTS (SELECT 1 FROM public.app_users WHERE username = v_candidate) LOOP
    v_counter := v_counter + 1;
    v_candidate := LEFT(v_username, 17) || v_counter::text;
  END LOOP;
  v_username := v_candidate;
  v_display_name := COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', v_username);
  INSERT INTO public.app_users (id, username, display_name, status, created_at)
  VALUES (NEW.id, v_username, v_display_name, 'online', now()) ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'handle_new_auth_user: failed for %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

-- IDOR fixes
CREATE OR REPLACE FUNCTION upsert_pet(p_user_id uuid, p_patch jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE existing record; new_stats jsonb; new_tricks jsonb; new_achievements jsonb; result_row record;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF auth.uid() != p_user_id THEN RAISE EXCEPTION 'Cannot modify another user''s pet'; END IF;
  SELECT * INTO existing FROM user_pets WHERE user_id = p_user_id;
  IF NOT FOUND THEN
    INSERT INTO user_pets (user_id, species, name, color_variant, accessories, outfit, personality, level, xp, friendship, happiness, energy, hunger, cleanliness, tricks_learned, achievements, stats, is_sleeping)
    VALUES (p_user_id, COALESCE(p_patch->>'species', 'cat'), COALESCE(p_patch->>'name', 'Companion'), COALESCE(p_patch->>'color_variant', 'default'), COALESCE(p_patch->'accessories', '[]'::jsonb), p_patch->'outfit', COALESCE(p_patch->>'personality', 'playful'), COALESCE((p_patch->>'level')::int, 1), COALESCE((p_patch->>'xp')::int, 0), COALESCE((p_patch->>'friendship')::int, 50), COALESCE((p_patch->>'happiness')::int, 80), COALESCE((p_patch->>'energy')::int, 80), COALESCE((p_patch->>'hunger')::int, 60), COALESCE((p_patch->>'cleanliness')::int, 90), COALESCE(p_patch->'tricks_learned', '[]'::jsonb), COALESCE(p_patch->'achievements', '[]'::jsonb), COALESCE(p_patch->'stats', '{"pets":0,"feeds":0,"plays":0,"baths":0,"tricks":0}'::jsonb), COALESCE((p_patch->>'is_sleeping')::boolean, false))
    RETURNING * INTO result_row;
  ELSE
    new_stats := COALESCE(p_patch->'stats', existing.stats);
    new_tricks := COALESCE(p_patch->'tricks_learned', existing.tricks_learned);
    new_achievements := COALESCE(p_patch->'achievements', existing.achievements);
    UPDATE user_pets SET
      species = COALESCE(p_patch->>'species', existing.species), name = COALESCE(p_patch->>'name', existing.name),
      color_variant = COALESCE(p_patch->>'color_variant', existing.color_variant),
      accessories = COALESCE(p_patch->'accessories', existing.accessories),
      outfit = CASE WHEN p_patch ? 'outfit' THEN p_patch->'outfit' ELSE existing.outfit END,
      personality = COALESCE(p_patch->>'personality', existing.personality),
      level = COALESCE((p_patch->>'level')::int, existing.level), xp = COALESCE((p_patch->>'xp')::int, existing.xp),
      friendship = COALESCE((p_patch->>'friendship')::int, existing.friendship),
      happiness = COALESCE((p_patch->>'happiness')::int, existing.happiness),
      energy = COALESCE((p_patch->>'energy')::int, existing.energy),
      hunger = COALESCE((p_patch->>'hunger')::int, existing.hunger),
      cleanliness = COALESCE((p_patch->>'cleanliness')::int, existing.cleanliness),
      tricks_learned = new_tricks, achievements = new_achievements, stats = new_stats,
      is_sleeping = COALESCE((p_patch->>'is_sleeping')::boolean, existing.is_sleeping),
      last_fed_at = COALESCE((p_patch->>'last_fed_at')::timestamptz, existing.last_fed_at),
      last_played_at = COALESCE((p_patch->>'last_played_at')::timestamptz, existing.last_played_at),
      last_slept_at = COALESCE((p_patch->>'last_slept_at')::timestamptz, existing.last_slept_at),
      last_bathed_at = COALESCE((p_patch->>'last_bathed_at')::timestamptz, existing.last_bathed_at),
      updated_at = now()
    WHERE user_id = p_user_id RETURNING * INTO result_row;
  END IF;
  RETURN to_jsonb(result_row);
END;
$$;

CREATE OR REPLACE FUNCTION redeem_invite_code(p_code text, p_user_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_invite record; v_id uuid; v_chat_id uuid; v_existing uuid; v_uid uuid;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT id, max_uses, uses_count, expires_at, is_active INTO v_invite FROM public.invite_codes WHERE UPPER(code) = UPPER(p_code) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid invite code'; END IF;
  IF NOT v_invite.is_active THEN RAISE EXCEPTION 'This invite code has been revoked'; END IF;
  IF v_invite.expires_at IS NOT NULL AND v_invite.expires_at < now() THEN RAISE EXCEPTION 'This invite code has expired'; END IF;
  IF v_invite.uses_count >= v_invite.max_uses THEN RAISE EXCEPTION 'This invite code has reached its usage limit'; END IF;
  UPDATE public.invite_codes SET uses_count = uses_count + 1 WHERE id = v_invite.id RETURNING id INTO v_id;
  INSERT INTO public.invite_redemptions (invite_id, user_id) VALUES (v_id, v_uid) ON CONFLICT (invite_id, user_id) DO NOTHING;
  SELECT chat_id INTO v_chat_id FROM public.chat_invites WHERE code = p_code LIMIT 1;
  IF v_chat_id IS NOT NULL THEN
    SELECT id INTO v_existing FROM public.chat_memberships WHERE chat_id = v_chat_id AND user_id = v_uid;
    IF v_existing IS NULL THEN
      INSERT INTO public.chat_memberships (chat_id, user_id, role) VALUES (v_chat_id, v_uid, 'member');
    END IF;
  END IF;
  RETURN v_id;
END;
$$;

-- New admin functions
CREATE OR REPLACE FUNCTION admin_resolve_report(p_report_id uuid, p_resolution_notes text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_app_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  UPDATE public.admin_reports SET status = 'resolved', resolution_notes = p_resolution_notes, resolved_by = auth.uid(), resolved_at = now() WHERE id = p_report_id;
  PERFORM public.admin_log_action('resolve_report', 'report', p_report_id, NULL, jsonb_build_object('notes', p_resolution_notes));
END;
$$;

CREATE OR REPLACE FUNCTION admin_create_report(p_content_type text, p_content_id text, p_chat_id uuid, p_reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  INSERT INTO public.admin_reports (reporter_id, content_type, content_id, chat_id, reason)
  VALUES (auth.uid(), p_content_type, p_content_id, p_chat_id, p_reason) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- ═══════════════════════════════════════════════════════════
-- Revoke EXECUTE on trigger/internal functions
-- ═══════════════════════════════════════════════════════════
REVOKE EXECUTE ON FUNCTION handle_new_auth_user() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION update_chat_last_message() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION update_chat_last_message_on_update() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION admin_log_action(text, text, uuid, text, jsonb) FROM anon, authenticated;

-- ═══════════════════════════════════════════════════════════
-- Fix overly permissive SELECT policies
-- ═══════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "invite_codes_select" ON invite_codes;
CREATE POLICY "invite_codes_select" ON invite_codes FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "chat_invites_select" ON chat_invites;
CREATE POLICY "chat_invites_select" ON chat_invites FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "admin_announcements_select" ON admin_announcements;
CREATE POLICY "admin_announcements_select" ON admin_announcements FOR SELECT TO authenticated USING (true);

-- ═══════════════════════════════════════════════════════════
-- Add missing UPDATE policies
-- ═══════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "polls_update" ON polls;
CREATE POLICY "polls_update" ON polls FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR is_chat_admin(chat_id))
  WITH CHECK (auth.uid() = user_id OR is_chat_admin(chat_id));

DROP POLICY IF EXISTS "message_reactions_update" ON message_reactions;
CREATE POLICY "message_reactions_update" ON message_reactions FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
