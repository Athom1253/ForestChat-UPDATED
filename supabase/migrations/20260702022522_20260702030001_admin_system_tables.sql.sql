/*
# Admin system tables and user status fields

## User status
Adds is_disabled, is_suspended, suspended_until columns to app_users.
Disabled = cannot sign in; suspended = temporary, auto-restores after date.

## Tables
- admin_audit_log: every admin action (timestamp, admin_id, action, target, details)
- admin_reports: reported content (type=message/user/chat, reporter, reason, status)
- admin_notes: internal notes on users (admin-only)
- admin_announcements: broadcast messages to all users
- admin_notifications: targeted system notifications
- sign_in_activity: recent sign-in records (user_id, ip, user_agent, timestamp)
*/

-- ── app_users status columns ──
ALTER TABLE app_users
  ADD COLUMN IF NOT EXISTS is_disabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_suspended boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS suspended_until timestamptz,
  ADD COLUMN IF NOT EXISTS profile_reset_at timestamptz;

-- ── admin_audit_log ──
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  action text NOT NULL,
  target_type text,
  target_id uuid,
  target_name text,
  details jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_audit_log_select" ON admin_audit_log FOR SELECT
  TO authenticated USING (is_app_admin());
CREATE POLICY "admin_audit_log_insert" ON admin_audit_log FOR INSERT
  TO authenticated WITH CHECK (is_app_admin());

-- ── admin_reports ──
CREATE TABLE IF NOT EXISTS admin_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  content_type text NOT NULL DEFAULT 'message',
  content_id text,
  chat_id uuid,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  resolution_notes text,
  resolved_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
ALTER TABLE admin_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_reports_select" ON admin_reports FOR SELECT
  TO authenticated USING (is_app_admin() OR auth.uid() = reporter_id);
CREATE POLICY "admin_reports_insert" ON admin_reports FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = reporter_id);
CREATE POLICY "admin_reports_update" ON admin_reports FOR UPDATE
  TO authenticated USING (is_app_admin()) WITH CHECK (is_app_admin());
CREATE POLICY "admin_reports_delete" ON admin_reports FOR DELETE
  TO authenticated USING (is_app_admin());

-- ── admin_notes ──
CREATE TABLE IF NOT EXISTS admin_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  admin_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  note text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE admin_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_notes_select" ON admin_notes FOR SELECT
  TO authenticated USING (is_app_admin());
CREATE POLICY "admin_notes_insert" ON admin_notes FOR INSERT
  TO authenticated WITH CHECK (is_app_admin());
CREATE POLICY "admin_notes_update" ON admin_notes FOR UPDATE
  TO authenticated USING (is_app_admin()) WITH CHECK (is_app_admin());
CREATE POLICY "admin_notes_delete" ON admin_notes FOR DELETE
  TO authenticated USING (is_app_admin());

-- ── admin_announcements ──
CREATE TABLE IF NOT EXISTS admin_announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL,
  is_pinned boolean NOT NULL DEFAULT true,
  dismissible boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz
);
ALTER TABLE admin_announcements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_announcements_select" ON admin_announcements FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "admin_announcements_insert" ON admin_announcements FOR INSERT
  TO authenticated WITH CHECK (is_app_admin());
CREATE POLICY "admin_announcements_update" ON admin_announcements FOR UPDATE
  TO authenticated USING (is_app_admin()) WITH CHECK (is_app_admin());
CREATE POLICY "admin_announcements_delete" ON admin_announcements FOR DELETE
  TO authenticated USING (is_app_admin());

-- ── admin_notifications ──
CREATE TABLE IF NOT EXISTS admin_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  target_user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL,
  type text NOT NULL DEFAULT 'system',
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE admin_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_notifications_select" ON admin_notifications FOR SELECT
  TO authenticated USING (auth.uid() = target_user_id OR is_app_admin());
CREATE POLICY "admin_notifications_insert" ON admin_notifications FOR INSERT
  TO authenticated WITH CHECK (is_app_admin());
CREATE POLICY "admin_notifications_update" ON admin_notifications FOR UPDATE
  TO authenticated USING (auth.uid() = target_user_id) WITH CHECK (auth.uid() = target_user_id);
CREATE POLICY "admin_notifications_delete" ON admin_notifications FOR DELETE
  TO authenticated USING (auth.uid() = target_user_id OR is_app_admin());

-- ── sign_in_activity ──
CREATE TABLE IF NOT EXISTS sign_in_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  ip_address text,
  user_agent text,
  success boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE sign_in_activity ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sign_in_activity_select" ON sign_in_activity FOR SELECT
  TO authenticated USING (auth.uid() = user_id OR is_app_admin());
CREATE POLICY "sign_in_activity_insert" ON sign_in_activity FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

-- ── user_pets ──
CREATE TABLE IF NOT EXISTS user_pets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES app_users(id) ON DELETE CASCADE,
  species text NOT NULL DEFAULT 'cat',
  name text NOT NULL DEFAULT 'Companion',
  color_variant text NOT NULL DEFAULT 'default',
  accessories jsonb NOT NULL DEFAULT '[]'::jsonb,
  outfit jsonb,
  personality text NOT NULL DEFAULT 'playful',
  level integer NOT NULL DEFAULT 1,
  xp integer NOT NULL DEFAULT 0,
  friendship integer NOT NULL DEFAULT 50,
  happiness integer NOT NULL DEFAULT 80,
  energy integer NOT NULL DEFAULT 80,
  hunger integer NOT NULL DEFAULT 60,
  cleanliness integer NOT NULL DEFAULT 90,
  tricks_learned jsonb NOT NULL DEFAULT '[]'::jsonb,
  achievements jsonb NOT NULL DEFAULT '[]'::jsonb,
  stats jsonb NOT NULL DEFAULT '{"pets":0,"feeds":0,"plays":0,"baths":0,"tricks":0}'::jsonb,
  last_fed_at timestamptz,
  last_played_at timestamptz,
  last_slept_at timestamptz,
  last_bathed_at timestamptz,
  is_sleeping boolean NOT NULL DEFAULT false,
  invisible_admin_mode boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE user_pets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_pets_select" ON user_pets FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "user_pets_insert" ON user_pets FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "user_pets_update" ON user_pets FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "user_pets_delete" ON user_pets FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ── Indexes ──
CREATE INDEX IF NOT EXISTS idx_admin_audit_admin ON admin_audit_log(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON admin_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_reports_status ON admin_reports(status);
CREATE INDEX IF NOT EXISTS idx_admin_notes_target ON admin_notes(target_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_notifications_target ON admin_notifications(target_user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_sign_in_activity_user ON sign_in_activity(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_announcements_pinned ON admin_announcements(is_pinned, created_at DESC);

-- ── Ensure Amy is admin ──
UPDATE app_users SET is_admin = true WHERE username = 'amy';
