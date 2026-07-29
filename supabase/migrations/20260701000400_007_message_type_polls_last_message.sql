-- Add message_type column to messages (if not exists)
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS message_type text NOT NULL DEFAULT 'text';

-- Add last_message_at and last_message_preview to chats
ALTER TABLE chats
  ADD COLUMN IF NOT EXISTS last_message_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_message_preview text;

-- Polls table
CREATE TABLE IF NOT EXISTS polls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id uuid NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  question text NOT NULL,
  options jsonb NOT NULL DEFAULT '[]',
  allow_multiple boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS poll_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id uuid NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  option_index integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(poll_id, user_id, option_index)
);

ALTER TABLE polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE poll_votes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "polls_select" ON polls;
CREATE POLICY "polls_select" ON polls FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "polls_insert" ON polls;
CREATE POLICY "polls_insert" ON polls FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "polls_delete" ON polls;
CREATE POLICY "polls_delete" ON polls FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "poll_votes_select" ON poll_votes;
CREATE POLICY "poll_votes_select" ON poll_votes FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "poll_votes_insert" ON poll_votes;
CREATE POLICY "poll_votes_insert" ON poll_votes FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "poll_votes_delete" ON poll_votes;
CREATE POLICY "poll_votes_delete" ON poll_votes FOR DELETE TO anon, authenticated USING (true);

-- Index
CREATE INDEX IF NOT EXISTS idx_polls_chat_id ON polls(chat_id);
CREATE INDEX IF NOT EXISTS idx_poll_votes_poll_id ON poll_votes(poll_id);

-- Function to update chat last_message
CREATE OR REPLACE FUNCTION update_chat_last_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE chats
  SET
    last_message_at = NEW.created_at,
    last_message_preview = CASE
      WHEN NEW.is_deleted THEN '[deleted]'
      WHEN NEW.message_type = 'voice' THEN '🎤 Voice message'
      WHEN NEW.message_type = 'image' THEN '📷 Image'
      WHEN NEW.message_type = 'video' THEN '🎬 Video'
      WHEN NEW.message_type = 'file' THEN '📎 File'
      WHEN NEW.content != '' THEN LEFT(NEW.content, 80)
      ELSE '[attachment]'
    END
  WHERE id = NEW.chat_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_chat_last_message ON messages;
CREATE TRIGGER trigger_update_chat_last_message
  AFTER INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION update_chat_last_message();

-- Missed calls table
CREATE TABLE IF NOT EXISTS missed_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  caller_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  callee_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  chat_id uuid REFERENCES chats(id) ON DELETE SET NULL,
  mode text NOT NULL DEFAULT 'voice',
  called_at timestamptz NOT NULL DEFAULT now(),
  seen boolean NOT NULL DEFAULT false
);

ALTER TABLE missed_calls ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "missed_calls_select" ON missed_calls;
CREATE POLICY "missed_calls_select" ON missed_calls FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "missed_calls_insert" ON missed_calls;
CREATE POLICY "missed_calls_insert" ON missed_calls FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "missed_calls_update" ON missed_calls;
CREATE POLICY "missed_calls_update" ON missed_calls FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_missed_calls_callee ON missed_calls(callee_id);
