/*
# Restore rich last_message_preview logic in trigger function

## Issue
Migration 009 redefined update_chat_last_message with SECURITY DEFINER and
search_path='' (good for security), but used the simple SUBSTRING(content,100)
body, overwriting the richer message_type-aware version from migration 007.

## Fix
Restore the message_type-aware preview logic while keeping SECURITY DEFINER
and search_path='' for security. Voice/image/video/file messages now show
descriptive preview text instead of empty content.
*/
CREATE OR REPLACE FUNCTION update_chat_last_message()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = ''
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.chats
  SET
    last_message_at = NEW.created_at,
    last_message_preview = CASE
      WHEN NEW.is_deleted THEN '[deleted]'
      WHEN NEW.message_type = 'voice' THEN '🎤 Voice message'
      WHEN NEW.message_type = 'image' THEN '📷 Image'
      WHEN NEW.message_type = 'video' THEN '🎬 Video'
      WHEN NEW.message_type = 'file' THEN '📎 File'
      WHEN NEW.message_type = 'poll' THEN '📊 Poll'
      WHEN NEW.content != '' THEN LEFT(NEW.content, 80)
      ELSE '[attachment]'
    END
  WHERE id = NEW.chat_id;
  RETURN NEW;
END;
$$;
