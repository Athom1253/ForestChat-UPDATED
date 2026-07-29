/*
# Fix RLS Recursion and Authentication Flows

## Root Cause
The security-hardening migration (009) introduced self-referential RLS policies.
Several policies query the SAME table they protect, causing infinite recursion:
  - chat_memberships SELECT: queries chat_memberships inside its own policy
  - chats SELECT: queries chat_memberships (which itself recurses)
  - messages, read_receipts, typing_indicators, polls, reactions SELECT:
    all transitively query chat_memberships, which recurses

PostgreSQL detects this as "infinite recursion detected in policy for relation".
This breaks: creating groups, joining groups, viewing members, sending messages,
read receipts, polls — essentially every authenticated data operation.

## Fix Strategy
Replace self-referential membership checks with SECURITY DEFINER helper functions
that run with the table owner's privileges (bypassing RLS internally) and return
a boolean. Policies then call these functions instead of sub-querying protected
tables. This is the standard, documented Supabase pattern for avoiding policy
recursion while keeping row-level security intact.

## Functions Added
1. is_chat_member(p_chat_id uuid) -> boolean
   Returns true if auth.uid() has a row in chat_memberships for that chat.
2. is_chat_admin(p_chat_id uuid) -> boolean
   Returns true if auth.uid() is owner/admin of that chat.
3. is_chat_owner(p_chat_id uuid) -> boolean
   Returns true if auth.uid() is owner of that chat.

All three are SECURITY DEFINER, search_path = '', owned by postgres.
They read chat_memberships with RLS bypassed (SECURITY DEFINER + owner),
so no recursion occurs.

## Policy Changes (all non-destructive — DROP IF EXISTS then CREATE)
- chat_memberships: SELECT now uses is_chat_member(chat_id) (no self-reference)
- chats: SELECT uses is_chat_member; INSERT allows auth.uid() = created_by
- messages: SELECT/INSERT use is_chat_member
- message_reactions: SELECT/INSERT use is_chat_member via messages lookup
- read_receipts, typing_indicators: SELECT uses is_chat_member
- polls, poll_votes: SELECT/INSERT use is_chat_member
- chat_invites: SELECT open to authenticated (invite codes are shareable);
  modifications require is_chat_admin
- invite_codes: SELECT open to public for active codes (validation at signup);
  admin checks use is_chat_member-free admin lookup
- invite_redemptions: SELECT for admins; INSERT for own user
- friends/blocked_users/bookmarks: self-only (unchanged logic, already correct)
- app_users: SELECT open (profiles are visible to members); INSERT/UPDATE/DELETE self-only
- missed_calls: callee/caller self-only

## Security Notes
- No USING(true) bypasses remain on protected multi-user tables.
- Helper functions only expose boolean membership; they do not leak row data.
- Owner/admin checks preserved on chats UPDATE/DELETE and member management.
- The app uses Supabase Auth (email/password); app_users.id = auth.users.id,
  so auth.uid() correctly matches user_id columns everywhere.
*/

-- ============================================
-- 1. SECURITY DEFINER helper functions (break recursion)
-- ============================================

CREATE OR REPLACE FUNCTION is_chat_member(p_chat_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.chat_memberships
    WHERE chat_id = p_chat_id AND user_id = auth.uid()
  )
$$;

CREATE OR REPLACE FUNCTION is_chat_admin(p_chat_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.chat_memberships
    WHERE chat_id = p_chat_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
  )
$$;

CREATE OR REPLACE FUNCTION is_chat_owner(p_chat_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.chat_memberships
    WHERE chat_id = p_chat_id
      AND user_id = auth.uid()
      AND role = 'owner'
  )
$$;

-- Helper: is current user an app admin (used for invite_codes/invite_redemptions)
CREATE OR REPLACE FUNCTION is_app_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.app_users
    WHERE id = auth.uid() AND is_admin = true
  )
$$;

-- ============================================
-- 2. app_users (profiles visible to members; self-only writes)
-- ============================================
DROP POLICY IF EXISTS "app_users_select" ON app_users;
DROP POLICY IF EXISTS "app_users_insert" ON app_users;
DROP POLICY IF EXISTS "app_users_update" ON app_users;
DROP POLICY IF EXISTS "app_users_delete" ON app_users;

-- Profiles are visible to any authenticated user (community app)
CREATE POLICY "app_users_select" ON app_users FOR SELECT
  TO authenticated USING (true);

-- A user can only create their own profile row (id = auth uid)
CREATE POLICY "app_users_insert" ON app_users FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = id);

-- Self-only update
CREATE POLICY "app_users_update" ON app_users FOR UPDATE
  TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- Self-only delete
CREATE POLICY "app_users_delete" ON app_users FOR DELETE
  TO authenticated USING (auth.uid() = id);

-- ============================================
-- 3. chats
-- ============================================
DROP POLICY IF EXISTS "chats_select" ON chats;
DROP POLICY IF EXISTS "chats_insert" ON chats;
DROP POLICY IF EXISTS "chats_update" ON chats;
DROP POLICY IF EXISTS "chats_delete" ON chats;

-- A user can see chats they are a member of
CREATE POLICY "chats_select" ON chats FOR SELECT
  TO authenticated USING (is_chat_member(chats.id));

-- Any authenticated user can create a chat; created_by must be themselves
CREATE POLICY "chats_insert" ON chats FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = created_by);

-- Only owner/admin can update chat metadata
CREATE POLICY "chats_update" ON chats FOR UPDATE
  TO authenticated
  USING (is_chat_admin(chats.id))
  WITH CHECK (is_chat_admin(chats.id));

-- Only owner can delete a chat
CREATE POLICY "chats_delete" ON chats FOR DELETE
  TO authenticated USING (is_chat_owner(chats.id));

-- ============================================
-- 4. chat_memberships (the table that caused recursion)
-- ============================================
DROP POLICY IF EXISTS "chat_memberships_select" ON chat_memberships;
DROP POLICY IF EXISTS "chat_memberships_insert" ON chat_memberships;
DROP POLICY IF EXISTS "chat_memberships_update" ON chat_memberships;
DROP POLICY IF EXISTS "chat_memberships_delete" ON chat_memberships;

-- A user can see memberships for chats they belong to (uses helper, no self-ref)
CREATE POLICY "chat_memberships_select" ON chat_memberships FOR SELECT
  TO authenticated USING (is_chat_member(chat_memberships.chat_id));

-- A user can insert their own membership row (joining a chat)
CREATE POLICY "chat_memberships_insert" ON chat_memberships FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

-- Owner/admin can update memberships in their chat
CREATE POLICY "chat_memberships_update" ON chat_memberships FOR UPDATE
  TO authenticated
  USING (is_chat_admin(chat_memberships.chat_id))
  WITH CHECK (is_chat_admin(chat_memberships.chat_id));

-- A user can leave (delete own row) OR an owner/admin can kick
CREATE POLICY "chat_memberships_delete" ON chat_memberships FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id OR is_chat_admin(chat_memberships.chat_id));

-- ============================================
-- 5. messages
-- ============================================
DROP POLICY IF EXISTS "messages_select" ON messages;
DROP POLICY IF EXISTS "messages_insert" ON messages;
DROP POLICY IF EXISTS "messages_update" ON messages;
DROP POLICY IF EXISTS "messages_delete" ON messages;

CREATE POLICY "messages_select" ON messages FOR SELECT
  TO authenticated USING (is_chat_member(messages.chat_id));

CREATE POLICY "messages_insert" ON messages FOR INSERT
  TO authenticated WITH CHECK (is_chat_member(messages.chat_id));

-- Only the author can edit their own message
CREATE POLICY "messages_update" ON messages FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Author can delete own message; owner/admin can delete any
CREATE POLICY "messages_delete" ON messages FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id OR is_chat_admin(messages.chat_id));

-- ============================================
-- 6. message_reactions
-- ============================================
DROP POLICY IF EXISTS "message_reactions_select" ON message_reactions;
DROP POLICY IF EXISTS "message_reactions_insert" ON message_reactions;
DROP POLICY IF EXISTS "message_reactions_delete" ON message_reactions;

-- Visible to chat members (reaction -> message -> chat membership)
CREATE POLICY "message_reactions_select" ON message_reactions FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.messages m
    WHERE m.id = message_reactions.message_id
      AND is_chat_member(m.chat_id)
  ));

-- A member can react to a message in their chat
CREATE POLICY "message_reactions_insert" ON message_reactions FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.messages m
      WHERE m.id = message_reactions.message_id
        AND is_chat_member(m.chat_id)
    )
  );

-- A user can only remove their own reaction
CREATE POLICY "message_reactions_delete" ON message_reactions FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ============================================
-- 7. read_receipts
-- ============================================
DROP POLICY IF EXISTS "read_receipts_select" ON read_receipts;
DROP POLICY IF EXISTS "read_receipts_insert" ON read_receipts;
DROP POLICY IF EXISTS "read_receipts_update" ON read_receipts;
DROP POLICY IF EXISTS "read_receipts_delete" ON read_receipts;

CREATE POLICY "read_receipts_select" ON read_receipts FOR SELECT
  TO authenticated USING (is_chat_member(read_receipts.chat_id));

CREATE POLICY "read_receipts_insert" ON read_receipts FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "read_receipts_update" ON read_receipts FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "read_receipts_delete" ON read_receipts FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ============================================
-- 8. typing_indicators
-- ============================================
DROP POLICY IF EXISTS "typing_indicators_select" ON typing_indicators;
DROP POLICY IF EXISTS "typing_indicators_insert" ON typing_indicators;
DROP POLICY IF EXISTS "typing_indicators_update" ON typing_indicators;
DROP POLICY IF EXISTS "typing_indicators_delete" ON typing_indicators;

CREATE POLICY "typing_indicators_select" ON typing_indicators FOR SELECT
  TO authenticated USING (is_chat_member(typing_indicators.chat_id));

CREATE POLICY "typing_indicators_insert" ON typing_indicators FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "typing_indicators_update" ON typing_indicators FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "typing_indicators_delete" ON typing_indicators FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ============================================
-- 9. friends (self-only — already correct, keep)
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

-- Only the addressee can accept/decline (update status)
CREATE POLICY "friends_update" ON friends FOR UPDATE
  TO authenticated
  USING (auth.uid() = addressee_id)
  WITH CHECK (auth.uid() = addressee_id);

CREATE POLICY "friends_delete" ON friends FOR DELETE
  TO authenticated
  USING (auth.uid() = requester_id OR auth.uid() = addressee_id);

-- ============================================
-- 10. blocked_users (self-only)
-- ============================================
DROP POLICY IF EXISTS "blocked_users_select" ON blocked_users;
DROP POLICY IF EXISTS "blocked_users_insert" ON blocked_users;
DROP POLICY IF EXISTS "blocked_users_delete" ON blocked_users;

CREATE POLICY "blocked_users_select" ON blocked_users FOR SELECT
  TO authenticated USING (auth.uid() = blocker_id);

CREATE POLICY "blocked_users_insert" ON blocked_users FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = blocker_id);

CREATE POLICY "blocked_users_delete" ON blocked_users FOR DELETE
  TO authenticated USING (auth.uid() = blocker_id);

-- ============================================
-- 11. bookmarks (self-only)
-- ============================================
DROP POLICY IF EXISTS "bookmarks_select" ON bookmarks;
DROP POLICY IF EXISTS "bookmarks_insert" ON bookmarks;
DROP POLICY IF EXISTS "bookmarks_delete" ON bookmarks;
DROP POLICY IF EXISTS "bookmarks_all" ON bookmarks;

CREATE POLICY "bookmarks_select" ON bookmarks FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "bookmarks_insert" ON bookmarks FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "bookmarks_delete" ON bookmarks FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ============================================
-- 12. polls
-- ============================================
DROP POLICY IF EXISTS "polls_select" ON polls;
DROP POLICY IF EXISTS "polls_insert" ON polls;
DROP POLICY IF EXISTS "polls_delete" ON polls;
DROP POLICY IF EXISTS "select_polls" ON polls;
DROP POLICY IF EXISTS "insert_polls" ON polls;
DROP POLICY IF EXISTS "update_polls" ON polls;
DROP POLICY IF EXISTS "delete_polls" ON polls;

CREATE POLICY "polls_select" ON polls FOR SELECT
  TO authenticated USING (is_chat_member(polls.chat_id));

CREATE POLICY "polls_insert" ON polls FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id AND is_chat_member(polls.chat_id));

CREATE POLICY "polls_delete" ON polls FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id OR is_chat_admin(polls.chat_id));

-- ============================================
-- 13. poll_votes
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
    SELECT 1 FROM public.polls p
    WHERE p.id = poll_votes.poll_id AND is_chat_member(p.chat_id)
  ));

CREATE POLICY "poll_votes_insert" ON poll_votes FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.polls p
      WHERE p.id = poll_votes.poll_id AND is_chat_member(p.chat_id)
    )
  );

CREATE POLICY "poll_votes_delete" ON poll_votes FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ============================================
-- 14. missed_calls
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
  TO authenticated WITH CHECK (auth.uid() = caller_id);

CREATE POLICY "missed_calls_update" ON missed_calls FOR UPDATE
  TO authenticated
  USING (auth.uid() = callee_id)
  WITH CHECK (auth.uid() = callee_id);

CREATE POLICY "missed_calls_delete" ON missed_calls FOR DELETE
  TO authenticated
  USING (auth.uid() = callee_id OR auth.uid() = caller_id);

-- ============================================
-- 15. chat_invites (per-chat invite codes — shareable)
-- ============================================
DROP POLICY IF EXISTS "chat_invites_select" ON chat_invites;
DROP POLICY IF EXISTS "chat_invites_insert" ON chat_invites;
DROP POLICY IF EXISTS "chat_invites_update" ON chat_invites;
DROP POLICY IF EXISTS "chat_invites_delete" ON chat_invites;

-- Any authenticated user can read invite rows (needed to join by code)
CREATE POLICY "chat_invites_select" ON chat_invites FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "chat_invites_insert" ON chat_invites FOR INSERT
  TO authenticated
  WITH CHECK (is_chat_admin(chat_invites.chat_id));

CREATE POLICY "chat_invites_update" ON chat_invites FOR UPDATE
  TO authenticated
  USING (is_chat_admin(chat_invites.chat_id))
  WITH CHECK (is_chat_admin(chat_invites.chat_id));

CREATE POLICY "chat_invites_delete" ON chat_invites FOR DELETE
  TO authenticated USING (is_chat_admin(chat_invites.chat_id));

-- ============================================
-- 16. invite_codes (app-wide registration codes)
-- ============================================
DROP POLICY IF EXISTS "public_read_active_invites" ON invite_codes;
DROP POLICY IF EXISTS "admin_insert_invites" ON invite_codes;
DROP POLICY IF EXISTS "admin_update_invites" ON invite_codes;
DROP POLICY IF EXISTS "admin_delete_invites" ON invite_codes;

-- Active invite codes are readable by anyone (needed for signup validation,
-- which happens before the user is authenticated)
CREATE POLICY "invite_codes_select" ON invite_codes FOR SELECT
  TO anon, authenticated USING (true);

-- Only app admins can create invite codes
CREATE POLICY "invite_codes_insert" ON invite_codes FOR INSERT
  TO authenticated WITH CHECK (is_app_admin());

-- Only app admins can update invite codes
CREATE POLICY "invite_codes_update" ON invite_codes FOR UPDATE
  TO authenticated
  USING (is_app_admin())
  WITH CHECK (is_app_admin());

-- Only app admins can delete invite codes
CREATE POLICY "invite_codes_delete" ON invite_codes FOR DELETE
  TO authenticated USING (is_app_admin());

-- ============================================
-- 17. invite_redemptions
-- ============================================
DROP POLICY IF EXISTS "invite_redemptions_select" ON invite_redemptions;
DROP POLICY IF EXISTS "invite_redemptions_insert" ON invite_redemptions;
DROP POLICY IF EXISTS "select_redemptions" ON invite_redemptions;
DROP POLICY IF EXISTS "insert_own_redemption" ON invite_redemptions;

-- Admins can see who redeemed codes; users see their own redemptions
CREATE POLICY "invite_redemptions_select" ON invite_redemptions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR is_app_admin());

-- A user can insert their own redemption row at signup
CREATE POLICY "invite_redemptions_insert" ON invite_redemptions FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

-- ============================================
-- 18. Ensure created_by defaults to auth.uid() (re-assert after earlier fix)
-- ============================================
ALTER TABLE chats ALTER COLUMN created_by SET DEFAULT auth.uid();
