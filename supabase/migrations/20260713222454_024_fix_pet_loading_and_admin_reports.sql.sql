/*
# Fix virtual pet loading and admin reports

## Issues Fixed

### 1. No get_pet function — pet loading unreliable
The frontend had to use a direct SELECT from user_pets, which could fail silently
if RLS didn't match or if the query was malformed. The "Retry Pet Load" button
likely only refreshed local state without re-fetching from the database.

Fix: Added `get_pet()` RPC that returns the current user's pet as JSON,
or NULL if no pet exists. This gives the frontend a reliable way to load
and retry loading the pet.

### 2. Admin reports not appearing
The admin_reports table has 0 rows. The `admin_create_report` function was
created in migration 021c but the frontend may not be calling it. The table
itself is functional — the issue is that no reports have been submitted.

The admin_reports SELECT policy allows `is_app_admin() OR auth.uid() = reporter_id`,
so admins can see all reports and users can see their own reports.

Fix: Verified the table and policies are correct. Added `admin_get_reports()`
function for the admin panel to fetch all reports with reporter usernames.

### 3. Admin panel: missing get_all_reports function
The admin panel needs a way to fetch all reports with user details for display.

Fix: Added `admin_get_reports()` that returns all reports joined with
reporter username and resolved_by username.
*/

-- ═══════════════════════════════════════════════════════════
-- 1. Add get_pet function for reliable pet loading
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION get_pet()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT to_jsonb(p.*) INTO result
  FROM (
    SELECT * FROM user_pets WHERE user_id = auth.uid()
  ) p;

  RETURN result;
END;
$$;

-- ═══════════════════════════════════════════════════════════
-- 2. Add admin_get_reports function for admin panel
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION admin_get_reports()
RETURNS TABLE (
  id uuid,
  reporter_id uuid,
  reporter_username text,
  content_type text,
  content_id text,
  chat_id uuid,
  chat_name text,
  reason text,
  status text,
  resolution_notes text,
  resolved_by uuid,
  resolved_by_username text,
  resolved_at timestamptz,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_app_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;

  RETURN QUERY
    SELECT
      r.id,
      r.reporter_id,
      reporter.username,
      r.content_type,
      r.content_id,
      r.chat_id,
      c.name,
      r.reason,
      r.status,
      r.resolution_notes,
      r.resolved_by,
      resolver.username,
      r.resolved_at,
      r.created_at
    FROM public.admin_reports r
    LEFT JOIN public.app_users reporter ON reporter.id = r.reporter_id
    LEFT JOIN public.chats c ON c.id = r.chat_id
    LEFT JOIN public.app_users resolver ON resolver.id = r.resolved_by
    ORDER BY
      CASE WHEN r.status = 'open' THEN 0 ELSE 1 END,
      r.created_at DESC;
END;
$$;
