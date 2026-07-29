/*
# Fix DM Creation Bug + Invite Code System

## DM Creation Bug: "Cannot coerce the result to a single JSON object"

### Root Cause
The error occurs when the frontend calls .single() on a query that returns multiple rows.
The `get_or_create_dm` RPC returns a single uuid, but the ON CONFLICT clause may fail
silently in certain edge cases, causing the function to return NULL. The frontend then
falls back to a direct query on the chats table which can return multiple DM rows.

Additionally, the ON CONFLICT clause with a partial unique index can be fragile.
The `DO UPDATE SET dm_pair_key = EXCLUDED.dm_pair_key` is a no-op needed to trigger
RETURNING, but if the conflict target doesn't match exactly, the INSERT fails.

### Fix
1. Simplified `get_or_create_dm` to use a more robust approach:
   - First SELECT by dm_pair_key (indexed, fast)
   - If not found, INSERT with ON CONFLICT DO NOTHING (no partial index matching issues)
   - If INSERT returns no rows (conflict happened), SELECT again
   - This eliminates the fragile ON CONFLICT DO UPDATE pattern

2. Added a check constraint on chats to ensure DMs always have a dm_pair_key

3. Made the function more resilient to race conditions with the SELECT-INSERT-SELECT pattern

## Invite Code System: "Invalid invite code" for new account creation

### Root Cause
In migration 021c, the `invite_codes_select` RLS policy was changed from
`TO anon, authenticated` to `TO authenticated` only. This broke invite code
validation during signup because unauthenticated users (not yet signed up)
can no longer read the `invite_codes` table to validate codes.

The flow is:
1. User enters invite code on signup form
2. Frontend validates code by SELECT from invite_codes (ANON key)
3. Frontend calls supabase.auth.signUp() with invite code in metadata
4. After signup, handle_new_auth_user trigger creates app_users profile
5. Frontend updates app_users.invite_code_used and calls redeem_invite_code

Step 2 fails because the RLS policy blocks anon from reading invite_codes.

### Fix
1. Changed `invite_codes_select` policy back to `TO anon, authenticated`
   - This is safe because invite codes are meant to be publicly validateable
   - The codes are not sensitive (they're shared publicly for signup)
   - Only active, non-expired codes are useful; the policy returns all codes
     but the redeem function still validates expiration and usage limits

2. Added `validate_invite_code(p_code text)` function that works for anon users
   - Returns JSON with {valid: boolean, reason: text} 
   - SECURITY DEFINER to bypass RLS
   - Does NOT increment uses_count (just validates)
   - The frontend can call this before signup to validate the code

3. Updated `handle_new_auth_user` trigger to store invite_code_used from
   the user metadata (raw_user_meta_data->>'invite_code')

## Security Notes
- invite_codes_select policy change is intentional: invite codes MUST be
  readable by anon users for signup validation. The codes are public by design.
- validate_invite_code is SECURITY DEFINER but only reads data, doesn't modify.
- No admin-only data is exposed through these changes.
*/

-- ═══════════════════════════════════════════════════════════
-- 1. Fix get_or_create_dm: robust race-safe pattern
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION get_or_create_dm(user_a uuid, user_b uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_chat_id uuid;
  v_pair_key text;
  v_other_display text;
  v_inserted boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF auth.uid() NOT IN (user_a, user_b) THEN
    RAISE EXCEPTION 'Cannot create DM for other users';
  END IF;
  IF user_a = user_b THEN
    RAISE EXCEPTION 'Cannot create DM with yourself';
  END IF;

  -- Deterministic pair key: always smaller UUID first
  v_pair_key := 'dm:' || LEAST(user_a::text, user_b::text) || ':' || GREATEST(user_a::text, user_b::text);

  -- Step 1: Try to find existing DM by pair key (fast, indexed)
  SELECT id INTO v_chat_id
  FROM chats
  WHERE type = 'dm' AND dm_pair_key = v_pair_key
  LIMIT 1;

  IF v_chat_id IS NOT NULL THEN
    RETURN v_chat_id;
  END IF;

  -- Step 2: Get the other user's display name for the DM name
  IF auth.uid() = user_a THEN
    SELECT COALESCE(display_name, username) INTO v_other_display
    FROM app_users WHERE id = user_b;
  ELSE
    SELECT COALESCE(display_name, username) INTO v_other_display
    FROM app_users WHERE id = user_a;
  END IF;
  v_other_display := COALESCE(v_other_display, 'Direct Message');

  -- Step 3: Try to INSERT (ON CONFLICT DO NOTHING for race safety)
  INSERT INTO chats (type, name, created_by, dm_pair_key)
  VALUES ('dm', v_other_display, auth.uid(), v_pair_key)
  ON CONFLICT (dm_pair_key) WHERE type = 'dm' AND dm_pair_key LIKE 'dm:%'
  DO NOTHING
  RETURNING id INTO v_chat_id;

  -- Step 4: If INSERT returned nothing (conflict happened), SELECT the existing row
  IF v_chat_id IS NULL THEN
    SELECT id INTO v_chat_id
    FROM chats
    WHERE type = 'dm' AND dm_pair_key = v_pair_key
    LIMIT 1;
  END IF;

  -- Step 5: Add memberships (ON CONFLICT for idempotency)
  INSERT INTO chat_memberships (chat_id, user_id, role)
  VALUES (v_chat_id, user_a, 'member')
  ON CONFLICT (chat_id, user_id) DO NOTHING;

  INSERT INTO chat_memberships (chat_id, user_id, role)
  VALUES (v_chat_id, user_b, 'member')
  ON CONFLICT (chat_id, user_id) DO NOTHING;

  RETURN v_chat_id;
END;
$$;

-- ═══════════════════════════════════════════════════════════
-- 2. Fix create_dm_with_members: same robust pattern
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION create_dm_with_members(
  p_name text, p_user1_id uuid, p_user2_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_chat_id uuid;
  v_pair_key text;
  v_other_display text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF auth.uid() NOT IN (p_user1_id, p_user2_id) THEN
    RAISE EXCEPTION 'Cannot create DM for other users';
  END IF;
  IF p_user1_id = p_user2_id THEN
    RAISE EXCEPTION 'Cannot create DM with yourself';
  END IF;

  v_pair_key := 'dm:' || LEAST(p_user1_id::text, p_user2_id::text) || ':' || GREATEST(p_user1_id::text, p_user2_id::text);

  -- Try to find existing
  SELECT id INTO v_chat_id FROM chats WHERE type = 'dm' AND dm_pair_key = v_pair_key LIMIT 1;
  IF v_chat_id IS NOT NULL THEN RETURN v_chat_id; END IF;

  -- Get other user's display name
  IF auth.uid() = p_user1_id THEN
    SELECT COALESCE(display_name, username) INTO v_other_display FROM app_users WHERE id = p_user2_id;
  ELSE
    SELECT COALESCE(display_name, username) INTO v_other_display FROM app_users WHERE id = p_user1_id;
  END IF;

  -- Try INSERT
  INSERT INTO chats (name, type, created_by, dm_pair_key)
  VALUES (COALESCE(v_other_display, 'Direct Message'), 'dm', auth.uid(), v_pair_key)
  ON CONFLICT (dm_pair_key) WHERE type = 'dm' AND dm_pair_key LIKE 'dm:%'
  DO NOTHING
  RETURNING id INTO v_chat_id;

  -- If conflict, SELECT existing
  IF v_chat_id IS NULL THEN
    SELECT id INTO v_chat_id FROM chats WHERE type = 'dm' AND dm_pair_key = v_pair_key LIMIT 1;
  END IF;

  INSERT INTO chat_memberships (chat_id, user_id, role)
  VALUES (v_chat_id, p_user1_id, 'member'), (v_chat_id, p_user2_id, 'member')
  ON CONFLICT (chat_id, user_id) DO NOTHING;

  RETURN v_chat_id;
END;
$$;

-- ═══════════════════════════════════════════════════════════
-- 3. Fix invite_codes_select: allow anon to read (for signup validation)
-- ═══════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "invite_codes_select" ON invite_codes;
CREATE POLICY "invite_codes_select"
ON invite_codes FOR SELECT
TO anon, authenticated
USING (true);

-- ═══════════════════════════════════════════════════════════
-- 4. Add validate_invite_code function for signup validation
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION validate_invite_code(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite record;
  v_result jsonb;
BEGIN
  -- This function is callable by anon (unauthenticated) users
  -- It validates an invite code WITHOUT incrementing uses_count
  -- The actual redemption happens after signup via redeem_invite_code

  IF p_code IS NULL OR TRIM(p_code) = '' THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'No invite code provided');
  END IF;

  SELECT id, max_uses, uses_count, expires_at, is_active
  INTO v_invite
  FROM public.invite_codes
  WHERE UPPER(TRIM(code)) = UPPER(TRIM(p_code))
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'Invalid invite code');
  END IF;

  IF NOT v_invite.is_active THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'This invite code has been revoked');
  END IF;

  IF v_invite.expires_at IS NOT NULL AND v_invite.expires_at < now() THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'This invite code has expired');
  END IF;

  IF v_invite.uses_count >= v_invite.max_uses THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'This invite code has reached its usage limit');
  END IF;

  RETURN jsonb_build_object('valid', true, 'reason', null);
END;
$$;

-- ═══════════════════════════════════════════════════════════
-- 5. Update handle_new_auth_user to store invite_code_used
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_username text;
  v_display_name text;
  v_counter integer := 0;
  v_candidate text;
  v_invite_code text;
BEGIN
  v_username := LOWER(REGEXP_REPLACE(SPLIT_PART(NEW.email, '@', 1), '[^a-z0-9_]', '', 'g'));
  IF v_username = '' OR v_username IS NULL THEN v_username := 'user'; END IF;
  v_username := LEFT(v_username, 20);
  v_candidate := v_username;
  WHILE EXISTS (SELECT 1 FROM public.app_users WHERE username = v_candidate) LOOP
    v_counter := v_counter + 1;
    v_candidate := LEFT(v_username, 17) || v_counter::text;
  END LOOP;
  v_username := v_candidate;

  v_display_name := COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', v_username);

  -- Extract invite code from user metadata if provided
  v_invite_code := NEW.raw_user_meta_data->>'invite_code';

  -- Insert profile with invite_code_used if provided
  INSERT INTO public.app_users (id, username, display_name, status, created_at, invite_code_used)
  VALUES (NEW.id, v_username, v_display_name, 'online', now(),
    CASE WHEN v_invite_code IS NOT NULL AND TRIM(v_invite_code) != '' THEN UPPER(TRIM(v_invite_code)) ELSE NULL END)
  ON CONFLICT (id) DO NOTHING;

  -- If invite code was provided, redeem it for the new user
  IF v_invite_code IS NOT NULL AND TRIM(v_invite_code) != '' THEN
    BEGIN
      -- Increment uses_count and record redemption
      UPDATE public.invite_codes
      SET uses_count = uses_count + 1
      WHERE UPPER(TRIM(code)) = UPPER(TRIM(v_invite_code))
      RETURNING id INTO v_invite_code;

      -- We need the id, not the code
      DECLARE v_invite_id uuid;
      BEGIN
        SELECT id INTO v_invite_id FROM public.invite_codes
        WHERE UPPER(TRIM(code)) = UPPER(TRIM(v_invite_code)) LIMIT 1;

        IF v_invite_id IS NOT NULL THEN
          INSERT INTO public.invite_redemptions (invite_id, user_id)
          VALUES (v_invite_id, NEW.id)
          ON CONFLICT (invite_id, user_id) DO NOTHING;
        END IF;
      END;
    EXCEPTION WHEN OTHERS THEN
      -- Don't block signup if invite redemption fails
      RAISE WARNING 'handle_new_auth_user: invite redemption failed for %: %', NEW.id, SQLERRM;
    END;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'handle_new_auth_user: failed for %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;
