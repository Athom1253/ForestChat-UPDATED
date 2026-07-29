/*
# Fix chats table for Supabase Auth

## Changes
1. Add `DEFAULT auth.uid()` to `created_by` column so inserts automatically use the authenticated user's ID
2. Update INSERT policy to only allow authenticated users to create chats with their own user_id as created_by
*/

-- Add default to created_by
ALTER TABLE chats ALTER COLUMN created_by SET DEFAULT auth.uid();

-- Fix INSERT policy to require created_by matches auth.uid()
DROP POLICY IF EXISTS "chats_insert" ON chats;

CREATE POLICY "chats_insert" ON chats FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = created_by);