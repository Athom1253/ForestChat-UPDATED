-- Add allow_multiple to polls if not exists
ALTER TABLE polls ADD COLUMN IF NOT EXISTS allow_multiple BOOLEAN NOT NULL DEFAULT false;

-- Fix poll_votes: rename option_idx to option_index for consistency
ALTER TABLE poll_votes ADD COLUMN IF NOT EXISTS option_index INTEGER;
UPDATE poll_votes SET option_index = option_idx WHERE option_index IS NULL;
ALTER TABLE poll_votes ALTER COLUMN option_index SET NOT NULL;
ALTER TABLE poll_votes DROP COLUMN IF EXISTS option_idx;

-- Add unique constraint to prevent double voting on same option
ALTER TABLE poll_votes ADD CONSTRAINT poll_votes_poll_user_option_unique
  UNIQUE (poll_id, user_id, option_index);

-- Add missed calls RLS policies if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'missed_calls' AND policyname = 'select_own_missed_calls'
  ) THEN
    CREATE POLICY "select_own_missed_calls" ON missed_calls FOR SELECT
      TO anon, authenticated USING (true);
    CREATE POLICY "insert_missed_calls" ON missed_calls FOR INSERT
      TO anon, authenticated WITH CHECK (true);
    CREATE POLICY "update_own_missed_calls" ON missed_calls FOR UPDATE
      TO anon, authenticated USING (true) WITH CHECK (true);
    CREATE POLICY "delete_own_missed_calls" ON missed_calls FOR DELETE
      TO anon, authenticated USING (true);
  END IF;
END $$;
