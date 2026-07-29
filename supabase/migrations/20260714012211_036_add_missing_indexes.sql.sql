/*
# Add missing indexes on foreign key columns
# These improve DELETE performance and prevent lock contention
*/

-- Admin tables
CREATE INDEX IF NOT EXISTS idx_admin_announcements_admin_id ON admin_announcements(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_notes_admin_id ON admin_notes(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_notifications_admin_id ON admin_notifications(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_reports_reporter_id ON admin_reports(reporter_id);
CREATE INDEX IF NOT EXISTS idx_admin_reports_resolved_by ON admin_reports(resolved_by);

-- Social tables
CREATE INDEX IF NOT EXISTS idx_blocked_users_blocked_id ON blocked_users(blocked_id);
CREATE INDEX IF NOT EXISTS idx_chat_invites_created_by ON chat_invites(created_by);
CREATE INDEX IF NOT EXISTS idx_chats_created_by ON chats(created_by);
CREATE INDEX IF NOT EXISTS idx_invite_codes_created_by ON invite_codes(created_by);
CREATE INDEX IF NOT EXISTS idx_invite_redemptions_user_id ON invite_redemptions(user_id);

-- Communication tables
CREATE INDEX IF NOT EXISTS idx_missed_calls_caller_id ON missed_calls(caller_id);
CREATE INDEX IF NOT EXISTS idx_missed_calls_chat_id ON missed_calls(chat_id);
CREATE INDEX IF NOT EXISTS idx_poll_votes_user_id ON poll_votes(user_id);
CREATE INDEX IF NOT EXISTS idx_polls_user_id ON polls(user_id);
CREATE INDEX IF NOT EXISTS idx_read_receipts_last_read_message_id ON read_receipts(last_read_message_id);
CREATE INDEX IF NOT EXISTS idx_typing_indicators_user_id ON typing_indicators(user_id);

-- Additional performance indexes for common queries
CREATE INDEX IF NOT EXISTS idx_messages_chat_id_created_at ON messages(chat_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chats_type ON chats(type);
CREATE INDEX IF NOT EXISTS idx_chat_memberships_user_id ON chat_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_friends_addressee_id ON friends(addressee_id);
CREATE INDEX IF NOT EXISTS idx_friends_requester_id ON friends(requester_id);
CREATE INDEX IF NOT EXISTS idx_friends_status ON friends(status);
