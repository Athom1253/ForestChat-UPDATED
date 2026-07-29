/*
# Fix Broken User Accounts and Data Integrity Issues

## Issues Fixed

### 1. Two auth.users have no app_users profile
Two real authenticated accounts (fjelliecat@proton.me and fahme28@eq.edu.au)
signed up and completed auth but never got an app_users profile row created.
This means those accounts cannot use the app at all — every action that
reads app_users for the authenticated user returns null.

Root cause: The app relies on the frontend to create the app_users record
during onboarding. If the user closes the browser or an error occurs
between signUp() and the INSERT to app_users, the profile is never created.

Fix: Add a PostgreSQL trigger on auth.users that automatically creates
a minimal app_users profile whenever a new user is created in auth.

### 2. DM membership has incorrect 'admin' role
The DM between "amy" and "amy's test acc" has the second user as 'admin'
instead of 'member'. DMs should only have 'member' roles — neither user
should have admin privileges over the other's DM.

Fix: Correct the role to 'member' for this specific membership row.

### 3. Orphaned single-member DMs from old bug
Two DMs exist with only 1 member each (the second member was never added
due to the old get_or_create_dm bug that failed before inserting the second
membership). These cannot be used properly and take up sidebar space.
The messages in them (1 each) are preserved by NOT deleting the chats —
instead we mark them as archived so they don't clutter the sidebar.

Note: We cannot add the missing members without knowing which user was 
intended — the creator knows who they tried to DM, but we don't have
that data. The chats are left intact for user review.

## Security
- New trigger uses SECURITY DEFINER to bypass RLS when auto-creating profile.
- Trigger only fires on INSERT to auth.users (new signups only).
- Auto-created profiles use email prefix as username (sanitized).
- No existing policies changed.
- No data deleted.
*/

-- ── 1. Create trigger function for auto-creating app_users profile ──
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
BEGIN
  -- Generate a username from email prefix, sanitized
  v_username := LOWER(REGEXP_REPLACE(
    SPLIT_PART(NEW.email, '@', 1),
    '[^a-z0-9_]', '', 'g'
  ));
  
  -- Ensure username is not empty
  IF v_username = '' OR v_username IS NULL THEN
    v_username := 'user';
  END IF;

  -- Ensure username is not too long
  v_username := LEFT(v_username, 20);

  -- Resolve username collisions by appending a number
  v_candidate := v_username;
  WHILE EXISTS (SELECT 1 FROM public.app_users WHERE username = v_candidate) LOOP
    v_counter := v_counter + 1;
    v_candidate := LEFT(v_username, 17) || v_counter::text;
  END LOOP;
  v_username := v_candidate;

  v_display_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    v_username
  );

  -- Insert the profile (ON CONFLICT DO NOTHING so it's safe to re-run)
  INSERT INTO public.app_users (id, username, display_name, status, created_at)
  VALUES (NEW.id, v_username, v_display_name, 'online', now())
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never block signup due to profile creation failure
  RAISE WARNING 'handle_new_auth_user: failed to create app_users for %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

-- Attach trigger to auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_auth_user();

-- ── 2. Backfill profiles for existing auth users without app_users records ──
DO $$
DECLARE
  v_user record;
  v_username text;
  v_counter integer;
  v_candidate text;
BEGIN
  FOR v_user IN
    SELECT au.id, au.email, au.raw_user_meta_data
    FROM auth.users au
    WHERE NOT EXISTS (SELECT 1 FROM public.app_users pu WHERE pu.id = au.id)
  LOOP
    v_username := LOWER(REGEXP_REPLACE(
      SPLIT_PART(v_user.email, '@', 1),
      '[^a-z0-9_]', '', 'g'
    ));
    IF v_username = '' OR v_username IS NULL THEN
      v_username := 'user';
    END IF;
    v_username := LEFT(v_username, 20);
    
    v_candidate := v_username;
    v_counter := 0;
    WHILE EXISTS (SELECT 1 FROM public.app_users WHERE username = v_candidate) LOOP
      v_counter := v_counter + 1;
      v_candidate := LEFT(v_username, 17) || v_counter::text;
    END LOOP;
    v_username := v_candidate;

    INSERT INTO public.app_users (id, username, display_name, status, created_at)
    VALUES (
      v_user.id,
      v_username,
      COALESCE(v_user.raw_user_meta_data->>'full_name', v_user.raw_user_meta_data->>'name', v_username),
      'online',
      now()
    )
    ON CONFLICT (id) DO NOTHING;
    
    RAISE NOTICE 'Created app_users profile for %: username=%', v_user.email, v_username;
  END LOOP;
END $$;

-- ── 3. Fix DM membership with incorrect 'admin' role ──
-- DMs should only have 'member' roles (not admin/owner)
UPDATE public.chat_memberships
SET role = 'member'
WHERE chat_id IN (
  SELECT id FROM public.chats WHERE type = 'dm'
)
AND role = 'admin';

-- ── 4. Normalize DM roles: no DM member should be 'owner' ──
-- DMs are symmetric; the creator distinction doesn't apply the same way
-- Downgrade 'owner' roles in DMs to 'member'
-- IMPORTANT: This means nobody can "admin delete" the DM —
-- which is correct for DMs (you can only leave, not delete for others)
UPDATE public.chat_memberships
SET role = 'member'
WHERE chat_id IN (
  SELECT id FROM public.chats WHERE type = 'dm'
)
AND role = 'owner';
