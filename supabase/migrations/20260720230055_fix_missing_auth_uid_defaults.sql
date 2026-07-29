-- Fix: Multiple tables missing DEFAULT auth.uid() on user-reference columns.
-- Same bug pattern as friends.requester_id: if the frontend omits the field
-- on insert, the row fails to insert (or worse, inserts with NULL if the
-- column is nullable, bypassing ownership checks).

ALTER TABLE chat_invites
  ALTER COLUMN created_by SET DEFAULT auth.uid();

ALTER TABLE typing_indicators
  ALTER COLUMN user_id SET DEFAULT auth.uid();

ALTER TABLE message_reactions
  ALTER COLUMN user_id SET DEFAULT auth.uid();

ALTER TABLE bookmarks
  ALTER COLUMN user_id SET DEFAULT auth.uid();

ALTER TABLE missed_calls
  ALTER COLUMN caller_id SET DEFAULT auth.uid();
