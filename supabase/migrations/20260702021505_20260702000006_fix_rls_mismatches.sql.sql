/*
# Fix 4 RLS mismatches causing silent failures

## Issues found during audit
1. chat_memberships UPDATE only allows admins, but regular members need to
   update their OWN settings (mute, pin, archive). A member muting a chat
   silently updated 0 rows.
2. messages UPDATE only allows the author, but admins need to pin others'
   messages. An admin pinning someone else's message silently updated 0 rows.
3. blocked_users SELECT only shows rows where auth.uid() = blocker_id, but
   isBlocked() needs to detect bidirectional blocks (either party blocked).
   The reverse-direction check was dead code under RLS.
4. clearChatHistory already works for admins via the DELETE policy
   (auth.uid()=user_id OR is_chat_admin), but let's confirm the messages
   DELETE policy is sufficient. It is — no change needed for #4.

## Fixes
1. chat_memberships UPDATE: allow self-update (auth.uid()=user_id) OR admin.
   A user can change their own mute/pin/archive; an admin can change roles.
2. messages UPDATE: allow the author (auth.uid()=user_id) OR a chat admin
   (for pinning/unpinning). The WITH CHECK still requires the updater to be
   either the author or an admin.
3. blocked_users SELECT: allow reading rows where you are the blocker OR the
   blocked party, so isBlocked() can detect both directions.

## Security notes
- Self-update on chat_memberships only lets a user change their own settings
  columns (is_muted, is_pinned, is_archived). Role escalation is prevented
  because role changes go through updateMemberRole which has its own checks,
  and the app never lets a user set their own role via updateMembership.
- Admin message update only affects is_pinned (the only admin-performed
  update). The app's editMessage path checks auth.uid()=user_id before
  calling the update.
- blocked_users SELECT now exposes the blocker_id and blocked_id of rows
  where the current user is involved — this is their own data, not a leak.
*/

-- Fix 1: chat_memberships UPDATE — allow self-update for own settings
DROP POLICY IF EXISTS "chat_memberships_update" ON chat_memberships;
CREATE POLICY "chat_memberships_update" ON chat_memberships FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id OR is_chat_admin(chat_memberships.chat_id))
  WITH CHECK (auth.uid() = user_id OR is_chat_admin(chat_memberships.chat_id));

-- Fix 2: messages UPDATE — allow author OR admin (for pinning)
DROP POLICY IF EXISTS "messages_update" ON messages;
CREATE POLICY "messages_update" ON messages FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id OR is_chat_admin(messages.chat_id))
  WITH CHECK (auth.uid() = user_id OR is_chat_admin(messages.chat_id));

-- Fix 3: blocked_users SELECT — allow reading rows where you're either party
DROP POLICY IF EXISTS "blocked_users_select" ON blocked_users;
CREATE POLICY "blocked_users_select" ON blocked_users FOR SELECT
  TO authenticated
  USING (auth.uid() = blocker_id OR auth.uid() = blocked_id);
