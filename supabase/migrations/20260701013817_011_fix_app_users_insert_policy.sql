/*
# Fix app_users INSERT policy for Supabase Auth

## Issue
The current INSERT policy allows any authenticated user to insert any app_users row. This needs to be restricted so users can only create their own profile using their Supabase Auth ID.

## Fix
- INSERT policy now requires `id = auth.uid()` so users can only create their own profile
- This happens during signup when the user's Supabase Auth ID matches the app_users.id
*/

DROP POLICY IF EXISTS "app_users_insert" ON app_users;

CREATE POLICY "app_users_insert" ON app_users FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = id);