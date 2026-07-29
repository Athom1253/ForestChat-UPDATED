-- Add bookmarks table
CREATE TABLE IF NOT EXISTS bookmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  message_id uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, message_id)
);
ALTER TABLE bookmarks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bookmarks_all" ON bookmarks FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- Add message_type to messages for voice/video/file distinction
ALTER TABLE messages ADD COLUMN IF NOT EXISTS message_type text NOT NULL DEFAULT 'text';
-- message_type: 'text' | 'voice' | 'image' | 'video' | 'file' | 'mixed'

-- Add last_message_id to chats for efficient sidebar preview
ALTER TABLE chats ADD COLUMN IF NOT EXISTS last_message_at timestamptz;
ALTER TABLE chats ADD COLUMN IF NOT EXISTS last_message_preview text DEFAULT '';

-- Add forward count + report count
ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_bookmarked boolean NOT NULL DEFAULT false;

-- Index for bookmarks
CREATE INDEX IF NOT EXISTS idx_bookmarks_user_id ON bookmarks(user_id);
CREATE INDEX IF NOT EXISTS idx_bookmarks_message_id ON bookmarks(message_id);
CREATE INDEX IF NOT EXISTS idx_messages_type ON messages(message_type);

-- Update chats last_message_at when message is inserted (trigger)
CREATE OR REPLACE FUNCTION update_chat_last_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE chats 
  SET last_message_at = NEW.created_at,
      last_message_preview = LEFT(NEW.content, 100)
  WHERE id = NEW.chat_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_chat_last_message ON messages;
CREATE TRIGGER trigger_update_chat_last_message
  AFTER INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION update_chat_last_message();
