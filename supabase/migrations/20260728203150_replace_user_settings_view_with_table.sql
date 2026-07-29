/*
# Replace user_settings view with real table + RLS + auto-create trigger

## What
- Drops the `user_settings` VIEW (which had hardcoded constants and couldn't be updated)
- Creates a real `user_settings` TABLE with the same columns
- Enables RLS with owner-scoped CRUD policies
- Inserts default rows for all existing app_users
- Adds a trigger to auto-create a settings row for new app_users

## Security
- RLS enabled, 4 policies (SELECT/INSERT/UPDATE/DELETE), all scoped to auth.uid() = user_id
*/

-- 1. Drop the view
DROP VIEW IF EXISTS user_settings;

-- 2. Create the real table
CREATE TABLE user_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  theme text NOT NULL DEFAULT 'forest',
  animated_background text NOT NULL DEFAULT 'none',
  notifications_enabled boolean NOT NULL DEFAULT true,
  notification_sound boolean NOT NULL DEFAULT true,
  email_notifications boolean NOT NULL DEFAULT false,
  show_online_status boolean NOT NULL DEFAULT true,
  allow_dm_from_friends_only boolean NOT NULL DEFAULT false,
  read_receipts_enabled boolean NOT NULL DEFAULT true,
  typing_indicators_enabled boolean NOT NULL DEFAULT true,
  compact_mode boolean NOT NULL DEFAULT false,
  reduced_motion boolean NOT NULL DEFAULT false,
  custom_data jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Enable RLS
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

-- 4. Policies
DROP POLICY IF EXISTS "user_settings_select_own" ON user_settings;
CREATE POLICY "user_settings_select_own" ON user_settings
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_settings_insert_own" ON user_settings;
CREATE POLICY "user_settings_insert_own" ON user_settings
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_settings_update_own" ON user_settings;
CREATE POLICY "user_settings_update_own" ON user_settings
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_settings_delete_own" ON user_settings;
CREATE POLICY "user_settings_delete_own" ON user_settings
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- 5. Insert default rows for existing app_users
INSERT INTO user_settings (user_id, theme, animated_background, notifications_enabled, notification_sound, email_notifications, show_online_status, allow_dm_from_friends_only, read_receipts_enabled, typing_indicators_enabled, compact_mode, reduced_motion, updated_at)
SELECT id, 'forest', 'none', true, true, false, true, false, true, true, false, false, now()
FROM app_users
WHERE NOT EXISTS (SELECT 1 FROM user_settings us WHERE us.user_id = app_users.id);

-- 6. Auto-create trigger for new users
CREATE OR REPLACE FUNCTION handle_new_app_user_settings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO user_settings (user_id, theme, animated_background, notifications_enabled, notification_sound, email_notifications, show_online_status, allow_dm_from_friends_only, read_receipts_enabled, typing_indicators_enabled, compact_mode, reduced_motion, updated_at)
  VALUES (NEW.id, 'forest', 'none', true, true, false, true, false, true, true, false, false, now())
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_app_user_created_settings ON app_users;
CREATE TRIGGER on_app_user_created_settings
  AFTER INSERT ON app_users
  FOR EACH ROW EXECUTE FUNCTION handle_new_app_user_settings();
