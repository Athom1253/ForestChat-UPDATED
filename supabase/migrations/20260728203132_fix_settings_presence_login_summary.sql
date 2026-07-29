/*
# Fix user_settings (view → real table), presence, and add username login

## Problems Fixed
1. `user_settings` was a VIEW with hardcoded constant columns — UPDATEs silently failed, so theme switching and all settings toggles did nothing
2. `profiles` is a VIEW on `app_users` — the `status` column was never set to 'offline' when users went away, causing false "online" status for many users
3. No way to look up an email by username for username-based login

## Changes

### 1. Replace user_settings view with real table
- Drop the `user_settings` view
- Create a real `user_settings` table with all the same columns
- Enable RLS with owner-scoped CRUD policies (user_id = auth.uid())
- Insert default settings rows for all existing app_users
- Add a trigger to auto-create a settings row when a new app_users row is inserted

### 2. Fix stale online statuses
- Set status = 'offline' for all users whose last_seen is more than 15 minutes ago

### 3. Add username login support
- Create `get_email_by_username(p_username)` RPC that returns the auth email for a given username
- SECURITY DEFINER so it can access auth.users table
- Only returns the email (still need password to sign in)
*/
