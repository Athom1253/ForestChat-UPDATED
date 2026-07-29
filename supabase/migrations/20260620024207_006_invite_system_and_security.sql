-- Add is_admin + animation_prefs to app_users
ALTER TABLE app_users
  ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS animation_prefs jsonb;

-- Invite codes table
CREATE TABLE IF NOT EXISTS invite_codes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code          text NOT NULL UNIQUE,
  created_by    uuid REFERENCES app_users(id) ON DELETE SET NULL,
  max_uses      integer NOT NULL DEFAULT 1,
  uses_count    integer NOT NULL DEFAULT 0,
  expires_at    timestamptz,
  is_active     boolean NOT NULL DEFAULT true,
  note          text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Track which invite each user used
ALTER TABLE app_users
  ADD COLUMN IF NOT EXISTS invite_code_used text;

-- Track redemptions per invite
CREATE TABLE IF NOT EXISTS invite_redemptions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invite_id     uuid NOT NULL REFERENCES invite_codes(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  redeemed_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (invite_id, user_id)
);

-- RLS
ALTER TABLE invite_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE invite_redemptions ENABLE ROW LEVEL SECURITY;

-- Anyone can read active invite codes (needed for validation on sign-up, no auth yet)
CREATE POLICY "public_read_active_invites" ON invite_codes
  FOR SELECT TO public USING (is_active = true);

-- Only admins can insert invite codes
CREATE POLICY "admin_insert_invites" ON invite_codes
  FOR INSERT TO public
  WITH CHECK (
    EXISTS (SELECT 1 FROM app_users WHERE id = created_by AND is_admin = true)
  );

-- Only admins can update (revoke/edit) invite codes
CREATE POLICY "admin_update_invites" ON invite_codes
  FOR UPDATE TO public
  USING (
    EXISTS (SELECT 1 FROM app_users WHERE id = created_by AND is_admin = true)
  );

-- Only admins can delete invite codes
CREATE POLICY "admin_delete_invites" ON invite_codes
  FOR DELETE TO public
  USING (
    EXISTS (SELECT 1 FROM app_users WHERE id = created_by AND is_admin = true)
  );

-- Redemptions: insert allowed for anyone registering
CREATE POLICY "insert_own_redemption" ON invite_redemptions
  FOR INSERT TO public WITH CHECK (true);

CREATE POLICY "select_redemptions" ON invite_redemptions
  FOR SELECT TO public USING (true);

-- Ensure at least one bootstrap admin exists (first user can be promoted manually)
-- Index for fast code lookup
CREATE INDEX IF NOT EXISTS invite_codes_code_idx ON invite_codes(code);
CREATE INDEX IF NOT EXISTS invite_redemptions_invite_idx ON invite_redemptions(invite_id);
