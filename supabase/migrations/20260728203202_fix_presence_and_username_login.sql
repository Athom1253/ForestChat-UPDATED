/*
# Fix stale online statuses + add username login RPC

## Changes
1. Set status = 'offline' for all users whose last_seen is more than 15 minutes ago (fixes false "online" status)
2. Create `get_email_by_username(p_username)` SECURITY DEFINER function to look up auth email by app_users.username — enables username-based login
3. Create `update_presence(p_status)` SECURITY DEFINER function to update both status and last_seen on app_users
*/

-- 1. Fix stale online statuses
UPDATE app_users
SET status = 'offline'
WHERE status = 'online'
  AND last_seen < now() - interval '15 minutes';

-- 2. Username login lookup function
CREATE OR REPLACE FUNCTION get_email_by_username(p_username text)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT au.email FROM auth.users au
  JOIN app_users appu ON au.id = appu.id
  WHERE LOWER(appu.username) = LOWER(p_username)
  LIMIT 1;
$$;

-- 3. Presence update function (updates both status and last_seen)
CREATE OR REPLACE FUNCTION update_presence(p_status text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE app_users
  SET status = p_status, last_seen = now()
  WHERE id = auth.uid();
$$;
