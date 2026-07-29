/*
# Fix invite code uses_count sync + handle_new_auth_user trigger cleanup

## Issue
The `invite_codes.uses_count` was 0 for FOREST-WELCOME despite 5 users having
redeemed it. The old handle_new_auth_user trigger created profiles with
invite_code_used but didn't increment uses_count or create invite_redemptions.

The invite_redemptions table was populated separately (5 redemptions exist),
but uses_count was never updated.

## Fix
1. Sync uses_count to match actual redemption count
2. Simplify handle_new_auth_user to remove the buggy nested DECLARE block
   that reused v_invite_code variable for both the code string and the id
*/

-- ═══════════════════════════════════════════════════════════
-- 1. Sync uses_count with actual redemption count
-- ═══════════════════════════════════════════════════════════
UPDATE invite_codes ic
SET uses_count = (
  SELECT COUNT(*) FROM invite_redemptions ir WHERE ir.invite_id = ic.id
)
WHERE ic.uses_count != (
  SELECT COUNT(*) FROM invite_redemptions ir WHERE ir.invite_id = ic.id
);

-- ═══════════════════════════════════════════════════════════
-- 2. Fix handle_new_auth_user: remove buggy nested DECLARE
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
  v_invite_id uuid;
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
      -- Find the invite code ID
      SELECT id INTO v_invite_id FROM public.invite_codes
      WHERE UPPER(TRIM(code)) = UPPER(TRIM(v_invite_code))
      AND is_active = true
      AND (expires_at IS NULL OR expires_at >= now())
      AND uses_count < max_uses
      LIMIT 1;

      IF v_invite_id IS NOT NULL THEN
        -- Increment uses_count
        UPDATE public.invite_codes
        SET uses_count = uses_count + 1
        WHERE id = v_invite_id;

        -- Record redemption
        INSERT INTO public.invite_redemptions (invite_id, user_id)
        VALUES (v_invite_id, NEW.id)
        ON CONFLICT (invite_id, user_id) DO NOTHING;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'handle_new_auth_user: invite redemption failed for %: %', NEW.id, SQLERRM;
    END;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'handle_new_auth_user: failed for %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;
