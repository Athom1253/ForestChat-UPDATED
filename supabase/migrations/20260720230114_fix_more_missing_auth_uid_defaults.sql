-- Fix: More tables missing DEFAULT auth.uid() on user-reference columns.
ALTER TABLE sign_in_activity
  ALTER COLUMN user_id SET DEFAULT auth.uid();

ALTER TABLE poll_votes
  ALTER COLUMN user_id SET DEFAULT auth.uid();

ALTER TABLE polls
  ALTER COLUMN user_id SET DEFAULT auth.uid();
