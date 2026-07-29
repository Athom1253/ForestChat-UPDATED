-- Fix: Friend requests fail with RLS policy violation
-- Root cause: requester_id has no default, so if the frontend omits it
-- the WITH CHECK (auth.uid() = requester_id) evaluates to NULL = false.
-- Solution: default requester_id to auth.uid() (same pattern as chats.created_by)
ALTER TABLE friends ALTER COLUMN requester_id SET DEFAULT auth.uid();