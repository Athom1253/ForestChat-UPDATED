/*
# Security Hardening: Drop and recreate functions with changed signatures

This migration drops functions that had default parameters or signature
changes that prevent CREATE OR REPLACE, then recreates them with the
security fixes applied.
*/

-- Drop functions that need signature changes
DROP FUNCTION IF EXISTS admin_log_action(text, text, uuid, text, jsonb);
DROP FUNCTION IF EXISTS admin_get_deleted_messages(uuid);
DROP FUNCTION IF EXISTS admin_get_all_chats();
DROP FUNCTION IF EXISTS admin_get_all_users();
DROP FUNCTION IF EXISTS admin_get_stats();
DROP FUNCTION IF EXISTS admin_global_search(text);

-- Recreate with security fixes

-- admin_log_action with admin check
CREATE FUNCTION admin_log_action(
  p_action text, p_target_type text, p_target_id uuid, p_target_name text, p_details jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_app_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  INSERT INTO public.admin_audit_log (admin_id, action, target_type, target_id, target_name, details)
  VALUES (auth.uid(), p_action, p_target_type, p_target_id, p_target_name, p_details);
END;
$$;

-- admin_get_all_users with admin check
CREATE FUNCTION admin_get_all_users()
RETURNS TABLE (
  id uuid, username text, display_name text, avatar_url text, bio text,
  status text, last_seen timestamptz, created_at timestamptz,
  is_admin boolean, is_disabled boolean, is_suspended boolean, suspended_until timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_app_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  RETURN QUERY
    SELECT au.id, au.username, au.display_name, au.avatar_url, au.bio, au.status,
           au.last_seen, au.created_at, au.is_admin, au.is_disabled, au.is_suspended, au.suspended_until
    FROM public.app_users au
    ORDER BY au.created_at DESC;
END;
$$;

-- admin_get_all_chats with admin check
CREATE FUNCTION admin_get_all_chats()
RETURNS TABLE (
  id uuid, name text, type text, description text, avatar_url text,
  invite_code text, created_by uuid, created_at timestamptz,
  last_message_at timestamptz, last_message_preview text, member_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_app_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  RETURN QUERY
    SELECT c.id, c.name, c.type, c.description, c.avatar_url, c.invite_code,
           c.created_by, c.created_at, c.last_message_at, c.last_message_preview,
           COALESCE(mc.cnt, 0)::bigint
    FROM public.chats c
    LEFT JOIN (
      SELECT chat_id, COUNT(*) AS cnt FROM public.chat_memberships GROUP BY chat_id
    ) mc ON mc.chat_id = c.id
    ORDER BY c.created_at DESC;
END;
$$;

-- admin_get_deleted_messages with admin check
CREATE FUNCTION admin_get_deleted_messages(p_chat_id uuid)
RETURNS TABLE (
  id uuid, chat_id uuid, user_id uuid, content text, is_deleted boolean,
  message_type text, created_at timestamptz, deleted_by text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_app_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  RETURN QUERY
    SELECT m.id, m.chat_id, m.user_id, m.content, m.is_deleted, m.message_type,
           m.created_at, COALESCE(m.deleted_by::text, 'unknown')
    FROM public.messages m
    WHERE m.is_deleted = true AND (p_chat_id IS NULL OR m.chat_id = p_chat_id)
    ORDER BY m.created_at DESC
    LIMIT 200;
END;
$$;

-- admin_get_stats with admin check
CREATE FUNCTION admin_get_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE result jsonb;
BEGIN
  IF NOT public.is_app_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
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
        FROM public.messages m, generate_series(now() - interval '13 days', now(), '1 day') AS d
        WHERE m.created_at >= d - interval '1 day' AND m.created_at < d + interval '1 day'
        GROUP BY d::date ORDER BY d::date
      ) d
    ),
    'messages_per_day', (
      SELECT COALESCE(jsonb_agg(d), '[]'::jsonb) FROM (
        SELECT d::date as date, COUNT(*) as count
        FROM public.messages m, generate_series(now() - interval '13 days', now(), '1 day') AS d
        WHERE m.created_at >= d - interval '1 day' AND m.created_at < d + interval '1 day'
        GROUP BY d::date ORDER BY d::date
      ) d
    ),
    'new_users_per_day', (
      SELECT COALESCE(jsonb_agg(d), '[]'::jsonb) FROM (
        SELECT d::date as date, COUNT(*) as count
        FROM public.app_users u, generate_series(now() - interval '13 days', now(), '1 day') AS d
        WHERE u.created_at >= d - interval '1 day' AND u.created_at < d + interval '1 day'
        GROUP BY d::date ORDER BY d::date
      ) d
    )
  ) INTO result;
  RETURN result;
END;
$$;

-- admin_global_search with admin check and sanitized ILIKE
CREATE FUNCTION admin_global_search(p_query text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_sanitized text;
BEGIN
  IF NOT public.is_app_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  v_sanitized := REPLACE(REPLACE(p_query, '%', '\%'), '_', '\_');
  RETURN jsonb_build_object(
    'users', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', id, 'username', username, 'display_name', display_name, 'avatar_url', avatar_url))
      FROM public.app_users
      WHERE username ILIKE '%' || v_sanitized || '%' OR display_name ILIKE '%' || v_sanitized || '%'
      LIMIT 20
    ), '[]'::jsonb),
    'chats', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', id, 'name', name, 'type', type))
      FROM public.chats WHERE name ILIKE '%' || v_sanitized || '%' LIMIT 20
    ), '[]'::jsonb),
    'messages', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', id, 'chat_id', chat_id, 'content', content, 'created_at', created_at))
      FROM public.messages WHERE content ILIKE '%' || v_sanitized || '%' AND is_deleted = false LIMIT 20
    ), '[]'::jsonb)
  );
END;
$$;
