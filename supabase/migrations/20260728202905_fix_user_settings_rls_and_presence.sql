/*
# Fix user_settings RLS, presence status, and add email update helper

## Problems Fixed
1. `user_settings` table had RLS disabled and no policies — settings toggles and theme changes silently failed
2. `profiles` table had RLS disabled — presence/online status updates were unreliable
3. No way to update a user's auth email from the client

## Changes

### 1. user_settings RLS
- Enable RLS on `user_settings`
- Add SELECT, INSERT, UPDATE, DELETE policies scoped to the owning user via `user_id`
- Add a trigger to auto-create a `user_settings` row when a new `app_users` row is created

### 2. profiles RLS
- Enable RLS on `profiles`
- Add SELECT (all authenticated users can see profiles for online status), INSERT, UPDATE, DELETE policies scoped to owner

### 3. Auto-create user_settings row
- Function `ensure_user_settings_row()` inserts a default settings row if none exists for a user
- Called from the app before updating settings
*/
