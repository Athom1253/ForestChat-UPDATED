/*
# Fix chat_memberships INSERT policy for Supabase Auth

## Issue
The INSERT policy checks `auth.uid() = user_id` with app_user.id. This needs to work with Supabase Auth IDs.

## Fix
Keep the same policy since app_users.id now equals auth.users.id.
*/

-- Policy is already correct: auth.uid() = user_id
-- Just verify it's in place
DROP POLICY IF EXISTS "chat_memberships_insert" ON chat_memberships;

CREATE POLICY "chat_memberships_insert" ON chat_memberships FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);