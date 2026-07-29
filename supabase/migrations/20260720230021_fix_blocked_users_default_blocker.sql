-- Fix: blocked_users.blocker_id has no default, so inserts fail if the
-- frontend omits the field. Same bug pattern as friends.requester_id had.
ALTER TABLE blocked_users
  ALTER COLUMN blocker_id SET DEFAULT auth.uid();
