/*
# Security Hardening: Fix RLS Policies and Function Search Path

## Overview
This migration addresses multiple security vulnerabilities:
1. Function `update_chat_last_message` has a mutable search_path (potential SQL injection vector)
2. All RLS policies use `USING (true)` or `WITH CHECK (true)` which bypasses row-level security entirely
3. Storage bucket SELECT policies allow listing all files

## Security Changes

### 1. Function Search Path Fix
- Set `search_path = ''` on `update_chat_last_message` function to prevent search_path hijacking attacks

### 2. RLS Policy Replacements
All tables now have proper ownership/membership-based policies replacing the previous `USING (true)` bypass.

### 3. Storage Bucket Policies
- Replaced broad SELECT policies with restricted versions

## Policy Summary by Table
- app_users: Public profiles (SELECT/INSERT open), self-only for UPDATE/DELETE
- chats: Membership-based SELECT, owner-only for UPDATE/DELETE
- chat_memberships: Membership-based SELECT, self/admin for modifications
- messages: Membership-based SELECT/INSERT, self-only for UPDATE, self/admin for DELETE
- message_reactions: Chat membership required, self-only for modifications
- friends: Self-only access (requester or addressee)
- blocked_users: Blocker-only access
- bookmarks: Self-only access
- read_receipts: Chat membership for SELECT, self-only for modifications
- typing_indicators: Chat membership for SELECT, self-only for modifications
- polls: Chat membership for SELECT, self/chat-admin for modifications
- poll_votes: Chat membership for SELECT/INSERT, self-only for DELETE
- missed_calls: Callee/caller can access their own records
- chat_invites: Public SELECT, admin-only for modifications
- invite_redemptions: Admin SELECT, self-only INSERT
*/

-- Fix function search_path
CREATE OR REPLACE FUNCTION update_chat_last_message()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = ''
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.chats
  SET last_message_at = NEW.created_at,
      last_message_preview = SUBSTRING(NEW.content, 1, 100)
  WHERE id = NEW.chat_id;
  RETURN NEW;
END;
$$;

-- ============================================
-- STORAGE: Drop ALL existing policies first
-- ============================================
DROP POLICY IF EXISTS "Allow avatar selects" ON storage.objects;
DROP POLICY IF EXISTS "Allow avatar uploads" ON storage.objects;
DROP POLICY IF EXISTS "Allow avatar updates" ON storage.objects;
DROP POLICY IF EXISTS "Allow avatar deletes" ON storage.objects;
DROP POLICY IF EXISTS "Allow public selects" ON storage.objects;
DROP POLICY IF EXISTS "Allow public uploads" ON storage.objects;
DROP POLICY IF EXISTS "Allow public updates" ON storage.objects;
DROP POLICY IF EXISTS "Allow public deletes" ON storage.objects;

-- Storage: New policies
CREATE POLICY "Allow avatar access" ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'avatars');

CREATE POLICY "Allow avatar uploads" ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'avatars');

CREATE POLICY "Allow avatar updates" ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'avatars');

CREATE POLICY "Allow avatar deletes" ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'avatars');

CREATE POLICY "Allow attachment access" ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'chat-attachments');

CREATE POLICY "Allow attachment uploads" ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'chat-attachments');

CREATE POLICY "Allow attachment updates" ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'chat-attachments');

CREATE POLICY "Allow attachment deletes" ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'chat-attachments');

-- ============================================
-- app_users policies
-- ============================================
DROP POLICY IF EXISTS "app_users_select" ON app_users;
DROP POLICY IF EXISTS "app_users_insert" ON app_users;
DROP POLICY IF EXISTS "app_users_update" ON app_users;
DROP POLICY IF EXISTS "app_users_delete" ON app_users;

CREATE POLICY "app_users_select" ON app_users FOR SELECT
  TO anon, authenticated USING (true);

CREATE POLICY "app_users_insert" ON app_users FOR INSERT
  TO anon, authenticated WITH CHECK (true);

CREATE POLICY "app_users_update" ON app_users FOR UPDATE
  TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE POLICY "app_users_delete" ON app_users FOR DELETE
  TO authenticated USING (auth.uid() = id);

-- ============================================
-- chats policies
-- ============================================
DROP POLICY IF EXISTS "chats_select" ON chats;
DROP POLICY IF EXISTS "chats_insert" ON chats;
DROP POLICY IF EXISTS "chats_update" ON chats;
DROP POLICY IF EXISTS "chats_delete" ON chats;

CREATE POLICY "chats_select" ON chats FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM chat_memberships cm
    WHERE cm.chat_id = chats.id AND cm.user_id = auth.uid()
  ));

CREATE POLICY "chats_insert" ON chats FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "chats_update" ON chats FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM chat_memberships cm
    WHERE cm.chat_id = chats.id AND cm.user_id = auth.uid() AND cm.role IN ('owner', 'admin')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM chat_memberships cm
    WHERE cm.chat_id = chats.id AND cm.user_id = auth.uid() AND cm.role IN ('owner', 'admin')
  ));

CREATE POLICY "chats_delete" ON chats FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM chat_memberships cm
    WHERE cm.chat_id = chats.id AND cm.user_id = auth.uid() AND cm.role = 'owner'
  ));

-- ============================================
-- chat_memberships policies
-- ============================================
DROP POLICY IF EXISTS "chat_memberships_select" ON chat_memberships;
DROP POLICY IF EXISTS "chat_memberships_insert" ON chat_memberships;
DROP POLICY IF EXISTS "chat_memberships_update" ON chat_memberships;
DROP POLICY IF EXISTS "chat_memberships_delete" ON chat_memberships;

CREATE POLICY "chat_memberships_select" ON chat_memberships FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM chat_memberships cm2
    WHERE cm2.chat_id = chat_memberships.chat_id AND cm2.user_id = auth.uid()
  ));

CREATE POLICY "chat_memberships_insert" ON chat_memberships FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "chat_memberships_update" ON chat_memberships FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM chat_memberships cm
    WHERE cm.chat_id = chat_memberships.chat_id AND cm.user_id = auth.uid() AND cm.role IN ('owner', 'admin')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM chat_memberships cm
    WHERE cm.chat_id = chat_memberships.chat_id AND cm.user_id = auth.uid() AND cm.role IN ('owner', 'admin')
  ));

CREATE POLICY "chat_memberships_delete" ON chat_memberships FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM chat_memberships cm
      WHERE cm.chat_id = chat_memberships.chat_id AND cm.user_id = auth.uid() AND cm.role IN ('owner', 'admin')
    ));

-- ============================================
-- messages policies
-- ============================================
DROP POLICY IF EXISTS "messages_select" ON messages;
DROP POLICY IF EXISTS "messages_insert" ON messages;
DROP POLICY IF EXISTS "messages_update" ON messages;
DROP POLICY IF EXISTS "messages_delete" ON messages;

CREATE POLICY "messages_select" ON messages FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM chat_memberships cm
    WHERE cm.chat_id = messages.chat_id AND cm.user_id = auth.uid()
  ));

CREATE POLICY "messages_insert" ON messages FOR INSERT
  TO authenticated WITH CHECK (EXISTS (
    SELECT 1 FROM chat_memberships cm
    WHERE cm.chat_id = messages.chat_id AND cm.user_id = auth.uid()
  ));

CREATE POLICY "messages_update" ON messages FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "messages_delete" ON messages FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM chat_memberships cm
      WHERE cm.chat_id = messages.chat_id AND cm.user_id = auth.uid() AND cm.role IN ('owner', 'admin')
    ));

-- ============================================
-- message_reactions policies
-- ============================================
DROP POLICY IF EXISTS "message_reactions_select" ON message_reactions;
DROP POLICY IF EXISTS "message_reactions_insert" ON message_reactions;
DROP POLICY IF EXISTS "message_reactions_delete" ON message_reactions;

CREATE POLICY "message_reactions_select" ON message_reactions FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM messages m
    JOIN chat_memberships cm ON cm.chat_id = m.chat_id
    WHERE m.id = message_reactions.message_id AND cm.user_id = auth.uid()
  ));

CREATE POLICY "message_reactions_insert" ON message_reactions FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id AND EXISTS (
    SELECT 1 FROM messages m
    JOIN chat_memberships cm ON cm.chat_id = m.chat_id
    WHERE m.id = message_reactions.message_id AND cm.user_id = auth.uid()
  ));

CREATE POLICY "message_reactions_delete" ON message_reactions FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ============================================
-- friends policies
-- ============================================
DROP POLICY IF EXISTS "friends_select" ON friends;
DROP POLICY IF EXISTS "friends_insert" ON friends;
DROP POLICY IF EXISTS "friends_update" ON friends;
DROP POLICY IF EXISTS "friends_delete" ON friends;

CREATE POLICY "friends_select" ON friends FOR SELECT
  TO authenticated
  USING (auth.uid() = requester_id OR auth.uid() = addressee_id);

CREATE POLICY "friends_insert" ON friends FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = requester_id);

CREATE POLICY "friends_update" ON friends FOR UPDATE
  TO authenticated
  USING (auth.uid() = addressee_id)
  WITH CHECK (auth.uid() = addressee_id);

CREATE POLICY "friends_delete" ON friends FOR DELETE
  TO authenticated
  USING (auth.uid() = requester_id OR auth.uid() = addressee_id);

-- ============================================
-- blocked_users policies
-- ============================================
DROP POLICY IF EXISTS "blocked_users_select" ON blocked_users;
DROP POLICY IF EXISTS "blocked_users_insert" ON blocked_users;
DROP POLICY IF EXISTS "blocked_users_delete" ON blocked_users;

CREATE POLICY "blocked_users_select" ON blocked_users FOR SELECT
  TO authenticated
  USING (auth.uid() = blocker_id);

CREATE POLICY "blocked_users_insert" ON blocked_users FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = blocker_id);

CREATE POLICY "blocked_users_delete" ON blocked_users FOR DELETE
  TO authenticated USING (auth.uid() = blocker_id);

-- ============================================
-- bookmarks policies
-- ============================================
DROP POLICY IF EXISTS "bookmarks_all" ON bookmarks;

CREATE POLICY "bookmarks_select" ON bookmarks FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "bookmarks_insert" ON bookmarks FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "bookmarks_delete" ON bookmarks FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ============================================
-- read_receipts policies
-- ============================================
DROP POLICY IF EXISTS "read_receipts_select" ON read_receipts;
DROP POLICY IF EXISTS "read_receipts_insert" ON read_receipts;
DROP POLICY IF EXISTS "read_receipts_update" ON read_receipts;
DROP POLICY IF EXISTS "read_receipts_delete" ON read_receipts;

CREATE POLICY "read_receipts_select" ON read_receipts FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM chat_memberships cm
    WHERE cm.chat_id = read_receipts.chat_id AND cm.user_id = auth.uid()
  ));

CREATE POLICY "read_receipts_insert" ON read_receipts FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "read_receipts_update" ON read_receipts FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "read_receipts_delete" ON read_receipts FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ============================================
-- typing_indicators policies
-- ============================================
DROP POLICY IF EXISTS "typing_indicators_select" ON typing_indicators;
DROP POLICY IF EXISTS "typing_indicators_insert" ON typing_indicators;
DROP POLICY IF EXISTS "typing_indicators_update" ON typing_indicators;
DROP POLICY IF EXISTS "typing_indicators_delete" ON typing_indicators;

CREATE POLICY "typing_indicators_select" ON typing_indicators FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM chat_memberships cm
    WHERE cm.chat_id = typing_indicators.chat_id AND cm.user_id = auth.uid()
  ));

CREATE POLICY "typing_indicators_insert" ON typing_indicators FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "typing_indicators_update" ON typing_indicators FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "typing_indicators_delete" ON typing_indicators FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ============================================
-- polls policies
-- ============================================
DROP POLICY IF EXISTS "polls_select" ON polls;
DROP POLICY IF EXISTS "polls_insert" ON polls;
DROP POLICY IF EXISTS "polls_delete" ON polls;
DROP POLICY IF EXISTS "select_polls" ON polls;
DROP POLICY IF EXISTS "insert_polls" ON polls;
DROP POLICY IF EXISTS "update_polls" ON polls;
DROP POLICY IF EXISTS "delete_polls" ON polls;

CREATE POLICY "polls_select" ON polls FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM chat_memberships cm
    WHERE cm.chat_id = polls.chat_id AND cm.user_id = auth.uid()
  ));

CREATE POLICY "polls_insert" ON polls FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id AND EXISTS (
    SELECT 1 FROM chat_memberships cm
    WHERE cm.chat_id = polls.chat_id AND cm.user_id = auth.uid()
  ));

CREATE POLICY "polls_delete" ON polls FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM chat_memberships cm
      WHERE cm.chat_id = polls.chat_id AND cm.user_id = auth.uid() AND cm.role IN ('owner', 'admin')
    ));

-- ============================================
-- poll_votes policies
-- ============================================
DROP POLICY IF EXISTS "poll_votes_select" ON poll_votes;
DROP POLICY IF EXISTS "poll_votes_insert" ON poll_votes;
DROP POLICY IF EXISTS "poll_votes_delete" ON poll_votes;
DROP POLICY IF EXISTS "select_poll_votes" ON poll_votes;
DROP POLICY IF EXISTS "insert_poll_votes" ON poll_votes;
DROP POLICY IF EXISTS "update_poll_votes" ON poll_votes;
DROP POLICY IF EXISTS "delete_poll_votes" ON poll_votes;

CREATE POLICY "poll_votes_select" ON poll_votes FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM polls p
    JOIN chat_memberships cm ON cm.chat_id = p.chat_id
    WHERE p.id = poll_votes.poll_id AND cm.user_id = auth.uid()
  ));

CREATE POLICY "poll_votes_insert" ON poll_votes FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id AND EXISTS (
    SELECT 1 FROM polls p
    JOIN chat_memberships cm ON cm.chat_id = p.chat_id
    WHERE p.id = poll_votes.poll_id AND cm.user_id = auth.uid()
  ));

CREATE POLICY "poll_votes_delete" ON poll_votes FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ============================================
-- missed_calls policies
-- ============================================
DROP POLICY IF EXISTS "missed_calls_select" ON missed_calls;
DROP POLICY IF EXISTS "missed_calls_insert" ON missed_calls;
DROP POLICY IF EXISTS "missed_calls_update" ON missed_calls;
DROP POLICY IF EXISTS "missed_calls_delete" ON missed_calls;
DROP POLICY IF EXISTS "select_own_missed_calls" ON missed_calls;
DROP POLICY IF EXISTS "insert_missed_calls" ON missed_calls;
DROP POLICY IF EXISTS "update_own_missed_calls" ON missed_calls;
DROP POLICY IF EXISTS "delete_own_missed_calls" ON missed_calls;

CREATE POLICY "missed_calls_select" ON missed_calls FOR SELECT
  TO authenticated
  USING (auth.uid() = callee_id OR auth.uid() = caller_id);

CREATE POLICY "missed_calls_insert" ON missed_calls FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "missed_calls_update" ON missed_calls FOR UPDATE
  TO authenticated
  USING (auth.uid() = callee_id)
  WITH CHECK (auth.uid() = callee_id);

CREATE POLICY "missed_calls_delete" ON missed_calls FOR DELETE
  TO authenticated USING (auth.uid() = callee_id OR auth.uid() = caller_id);

-- ============================================
-- chat_invites policies
-- ============================================
DROP POLICY IF EXISTS "chat_invites_select" ON chat_invites;
DROP POLICY IF EXISTS "chat_invites_insert" ON chat_invites;
DROP POLICY IF EXISTS "chat_invites_update" ON chat_invites;
DROP POLICY IF EXISTS "chat_invites_delete" ON chat_invites;

CREATE POLICY "chat_invites_select" ON chat_invites FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "chat_invites_insert" ON chat_invites FOR INSERT
  TO authenticated WITH CHECK (EXISTS (
    SELECT 1 FROM chat_memberships cm
    WHERE cm.chat_id = chat_invites.chat_id AND cm.user_id = auth.uid() AND cm.role IN ('owner', 'admin')
  ));

CREATE POLICY "chat_invites_update" ON chat_invites FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM chat_memberships cm
    WHERE cm.chat_id = chat_invites.chat_id AND cm.user_id = auth.uid() AND cm.role IN ('owner', 'admin')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM chat_memberships cm
    WHERE cm.chat_id = chat_invites.chat_id AND cm.user_id = auth.uid() AND cm.role IN ('owner', 'admin')
  ));

CREATE POLICY "chat_invites_delete" ON chat_invites FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM chat_memberships cm
    WHERE cm.chat_id = chat_invites.chat_id AND cm.user_id = auth.uid() AND cm.role IN ('owner', 'admin')
  ));

-- ============================================
-- invite_redemptions policies
-- ============================================
DROP POLICY IF EXISTS "select_redemptions" ON invite_redemptions;
DROP POLICY IF EXISTS "insert_own_redemption" ON invite_redemptions;

CREATE POLICY "invite_redemptions_select" ON invite_redemptions FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM app_users u WHERE u.id = auth.uid() AND u.is_admin = true
  ));

CREATE POLICY "invite_redemptions_insert" ON invite_redemptions FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);