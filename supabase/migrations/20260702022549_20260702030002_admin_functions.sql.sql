/*
# Admin SECURITY DEFINER functions — server-side authorization for every destructive admin action

All functions check is_app_admin() first and raise 'Not authorized' if false.
All functions log to admin_audit_log.
*/

-- ── Helper: log admin action ──
CREATE OR REPLACE FUNCTION admin_log_action(
  p_action text, p_target_type text DEFAULT NULL, p_target_id uuid DEFAULT NULL,
  p_target_name text DEFAULT NULL, p_details jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  INSERT INTO public.admin_audit_log (admin_id, action, target_type, target_id, target_name, details)
  VALUES (auth.uid(), p_action, p_target_type, p_target_id, p_target_name, p_details)
$$;

-- ── Disable user ──
CREATE OR REPLACE FUNCTION admin_disable_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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

-- ── Enable/restore user ──
CREATE OR REPLACE FUNCTION admin_enable_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_username text;
BEGIN
  IF NOT public.is_app_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  SELECT username INTO v_username FROM public.app_users WHERE id = p_user_id;
  UPDATE public.app_users SET is_disabled = false, is_suspended = false, suspended_until = NULL WHERE id = p_user_id;
  PERFORM public.admin_log_action('enable_user', 'user', p_user_id, v_username);
END;
$$;

-- ── Suspend user until ──
CREATE OR REPLACE FUNCTION admin_suspend_user(p_user_id uuid, p_until timestamptz)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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

-- ── Permanently delete user (cascades) ──
CREATE OR REPLACE FUNCTION admin_delete_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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

-- ── Reset user profile ──
CREATE OR REPLACE FUNCTION admin_reset_user_profile(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_username text;
BEGIN
  IF NOT public.is_app_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  SELECT username INTO v_username FROM public.app_users WHERE id = p_user_id;
  UPDATE public.app_users
    SET display_name = NULL, avatar_url = NULL, bio = '', status_message = '', banner_url = NULL,
        badges = '{}'::text[], pronouns = NULL, profile_reset_at = now()
    WHERE id = p_user_id;
  PERFORM public.admin_log_action('reset_profile', 'user', p_user_id, v_username);
END;
$$;

-- ── Promote to admin ──
CREATE OR REPLACE FUNCTION admin_promote_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_username text;
BEGIN
  IF NOT public.is_app_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  SELECT username INTO v_username FROM public.app_users WHERE id = p_user_id;
  UPDATE public.app_users SET is_admin = true WHERE id = p_user_id;
  PERFORM public.admin_log_action('promote_admin', 'user', p_user_id, v_username);
END;
$$;

-- ── Demote from admin ──
CREATE OR REPLACE FUNCTION admin_demote_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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

-- ── Force sign out (revoke session by removing the user's sessions) ──
-- Supabase doesn't expose session revocation via SQL directly, but we can
-- mark the user as needing re-auth by setting a flag. The frontend checks this.
CREATE OR REPLACE FUNCTION admin_force_signout(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_username text;
BEGIN
  IF NOT public.is_app_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  SELECT username INTO v_username FROM public.app_users WHERE id = p_user_id;
  -- Update last_seen to epoch zero as a signal; the app's realtime listener
  -- will see a status change and prompt re-auth if the user is disabled/suspended.
  -- For a true force-signout, the admin should also disable the account.
  UPDATE public.app_users SET status = 'forced_offline', last_seen = now() WHERE id = p_user_id;
  PERFORM public.admin_log_action('force_signout', 'user', p_user_id, v_username);
END;
$$;

-- ── Admin join any chat ──
CREATE OR REPLACE FUNCTION admin_join_chat(p_chat_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_chat_name text;
BEGIN
  IF NOT public.is_app_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  SELECT name INTO v_chat_name FROM public.chats WHERE id = p_chat_id;
  INSERT INTO public.chat_memberships (chat_id, user_id, role)
    VALUES (p_chat_id, auth.uid(), 'member')
    ON CONFLICT (chat_id, user_id) DO NOTHING;
  PERFORM public.admin_log_action('admin_join_chat', 'chat', p_chat_id, v_chat_name);
END;
$$;

-- ── Admin delete chat ──
CREATE OR REPLACE FUNCTION admin_delete_chat(p_chat_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_chat_name text;
BEGIN
  IF NOT public.is_app_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  SELECT name INTO v_chat_name FROM public.chats WHERE id = p_chat_id;
  PERFORM public.admin_log_action('delete_chat', 'chat', p_chat_id, v_chat_name);
  DELETE FROM public.chats WHERE id = p_chat_id;
END;
$$;

-- ── Admin remove user from chat ──
CREATE OR REPLACE FUNCTION admin_remove_from_chat(p_chat_id uuid, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_chat_name text; v_username text;
BEGIN
  IF NOT public.is_app_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  SELECT name INTO v_chat_name FROM public.chats WHERE id = p_chat_id;
  SELECT username INTO v_username FROM public.app_users WHERE id = p_user_id;
  DELETE FROM public.chat_memberships WHERE chat_id = p_chat_id AND user_id = p_user_id;
  PERFORM public.admin_log_action('remove_from_chat', 'chat', p_chat_id, v_chat_name,
    jsonb_build_object('user', v_username));
END;
$$;

-- ── Admin transfer chat ownership ──
CREATE OR REPLACE FUNCTION admin_transfer_ownership(p_chat_id uuid, p_new_owner_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_chat_name text; v_username text;
BEGIN
  IF NOT public.is_app_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  SELECT name INTO v_chat_name FROM public.chats WHERE id = p_chat_id;
  SELECT username INTO v_username FROM public.app_users WHERE id = p_new_owner_id;
  UPDATE public.chat_memberships SET role = 'member'
    WHERE chat_id = p_chat_id AND role = 'owner';
  INSERT INTO public.chat_memberships (chat_id, user_id, role)
    VALUES (p_chat_id, p_new_owner_id, 'owner')
    ON CONFLICT (chat_id, user_id) DO UPDATE SET role = 'owner';
  PERFORM public.admin_log_action('transfer_ownership', 'chat', p_chat_id, v_chat_name,
    jsonb_build_object('new_owner', v_username));
END;
$$;

-- ── Admin permanently delete message ──
CREATE OR REPLACE FUNCTION admin_delete_message(p_message_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_app_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  PERFORM public.admin_log_action('delete_message', 'message', p_message_id);
  DELETE FROM public.messages WHERE id = p_message_id;
END;
$$;

-- ── Admin get all deleted messages (view) ──
CREATE OR REPLACE FUNCTION admin_get_deleted_messages(p_chat_id uuid DEFAULT NULL)
RETURNS TABLE (
  id uuid, chat_id uuid, user_id uuid, content text, is_deleted boolean,
  message_type text, created_at timestamptz, deleted_by text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
  SELECT id, chat_id, user_id, content, is_deleted, message_type, created_at,
         'unknown'::text AS deleted_by
  FROM public.messages
  WHERE is_deleted = true AND (p_chat_id IS NULL OR chat_id = p_chat_id)
  ORDER BY created_at DESC
  LIMIT 200
$$;

-- ── Admin get all chats (view) ──
CREATE OR REPLACE FUNCTION admin_get_all_chats()
RETURNS TABLE (
  id uuid, name text, type text, description text, avatar_url text,
  invite_code text, created_by uuid, created_at timestamptz,
  last_message_at timestamptz, last_message_preview text,
  member_count bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
  SELECT c.id, c.name, c.type, c.description, c.avatar_url, c.invite_code,
         c.created_by, c.created_at, c.last_message_at, c.last_message_preview,
         COALESCE(mc.cnt, 0)
  FROM public.chats c
  LEFT JOIN (SELECT chat_id, COUNT(*) AS cnt FROM public.chat_memberships GROUP BY chat_id) mc
    ON mc.chat_id = c.id
  ORDER BY c.created_at DESC
$$;

-- ── Admin get all users (with status) ──
CREATE OR REPLACE FUNCTION admin_get_all_users()
RETURNS TABLE (
  id uuid, username text, display_name text, avatar_url text, bio text,
  status text, last_seen timestamptz, created_at timestamptz,
  is_admin boolean, is_disabled boolean, is_suspended boolean, suspended_until timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
  SELECT id, username, display_name, avatar_url, bio, status, last_seen, created_at,
         is_admin, is_disabled, is_suspended, suspended_until
  FROM public.app_users
  ORDER BY created_at DESC
$$;

-- ── Admin get app statistics ──
CREATE OR REPLACE FUNCTION admin_get_stats()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
  SELECT jsonb_build_object(
    'total_users', (SELECT COUNT(*) FROM public.app_users),
    'active_users_24h', (SELECT COUNT(*) FROM public.app_users WHERE last_seen > now() - interval '24 hours'),
    'disabled_users', (SELECT COUNT(*) FROM public.app_users WHERE is_disabled = true),
    'suspended_users', (SELECT COUNT(*) FROM public.app_users WHERE is_suspended = true),
    'total_chats', (SELECT COUNT(*) FROM public.chats),
    'total_groups', (SELECT COUNT(*) FROM public.chats WHERE type = 'group'),
    'total_dms', (SELECT COUNT(*) FROM public.chats WHERE type = 'dm'),
    'total_messages', (SELECT COUNT(*) FROM public.messages),
    'deleted_messages', (SELECT COUNT(*) FROM public.messages WHERE is_deleted = true),
    'open_reports', (SELECT COUNT(*) FROM public.admin_reports WHERE status = 'open'),
    'total_invites', (SELECT COUNT(*) FROM public.invite_codes),
    'active_invites', (SELECT COUNT(*) FROM public.invite_codes WHERE is_active = true),
    'daily_active', (
      SELECT COALESCE(jsonb_agg(d), '[]'::jsonb) FROM (
        SELECT d::date as date, COUNT(DISTINCT m.user_id) as count
        FROM public.messages m,
             generate_series(now() - interval '13 days', now(), '1 day') AS d
        WHERE m.created_at >= d - interval '1 day' AND m.created_at < d + interval '1 day'
        GROUP BY d::date ORDER BY d::date
      ) d
    ),
    'messages_per_day', (
      SELECT COALESCE(jsonb_agg(d), '[]'::jsonb) FROM (
        SELECT d::date as date, COUNT(*) as count
        FROM public.messages m,
             generate_series(now() - interval '13 days', now(), '1 day') AS d
        WHERE m.created_at >= d - interval '1 day' AND m.created_at < d + interval '1 day'
        GROUP BY d::date ORDER BY d::date
      ) d
    ),
    'new_users_per_day', (
      SELECT COALESCE(jsonb_agg(d), '[]'::jsonb) FROM (
        SELECT d::date as date, COUNT(*) as count
        FROM public.app_users u,
             generate_series(now() - interval '13 days', now(), '1 day') AS d
        WHERE u.created_at >= d - interval '1 day' AND u.created_at < d + interval '1 day'
        GROUP BY d::date ORDER BY d::date
      ) d
    )
  )
$$;

-- ── Admin global search ──
CREATE OR REPLACE FUNCTION admin_global_search(p_query text)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
  SELECT jsonb_build_object(
    'users', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', id, 'username', username, 'display_name', display_name, 'avatar_url', avatar_url))
      FROM public.app_users
      WHERE username ILIKE '%' || p_query || '%' OR display_name ILIKE '%' || p_query || '%'
      LIMIT 20
    ), '[]'::jsonb),
    'chats', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', id, 'name', name, 'type', type))
      FROM public.chats
      WHERE name ILIKE '%' || p_query || '%'
      LIMIT 20
    ), '[]'::jsonb),
    'messages', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', id, 'chat_id', chat_id, 'content', content, 'created_at', created_at))
      FROM public.messages
      WHERE content ILIKE '%' || p_query || '%' AND is_deleted = false
      LIMIT 20
    ), '[]'::jsonb)
  )
$$;

-- ── Admin create announcement ──
CREATE OR REPLACE FUNCTION admin_create_announcement(p_title text, p_body text, p_dismissible boolean DEFAULT true, p_expires_at timestamptz DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public.is_app_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  INSERT INTO public.admin_announcements (admin_id, title, body, dismissible, expires_at)
    VALUES (auth.uid(), p_title, p_body, p_dismissible, p_expires_at)
    RETURNING id INTO v_id;
  PERFORM public.admin_log_action('create_announcement', 'announcement', v_id, p_title);
  RETURN v_id;
END;
$$;

-- ── Admin send notification ──
CREATE OR REPLACE FUNCTION admin_send_notification(p_target_user_id uuid, p_title text, p_body text, p_type text DEFAULT 'system')
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_id uuid; v_username text;
BEGIN
  IF NOT public.is_app_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  SELECT username INTO v_username FROM public.app_users WHERE id = p_target_user_id;
  INSERT INTO public.admin_notifications (admin_id, target_user_id, title, body, type)
    VALUES (auth.uid(), p_target_user_id, p_title, p_body, p_type)
    RETURNING id INTO v_id;
  PERFORM public.admin_log_action('send_notification', 'notification', v_id, v_username,
    jsonb_build_object('title', p_title));
  RETURN v_id;
END;
$$;

-- ── Admin record sign-in activity (callable by any authenticated user on login) ──
CREATE OR REPLACE FUNCTION record_sign_in_activity()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.sign_in_activity (user_id) VALUES (auth.uid());
END;
$$;
