-- Add animation preferences column to app_users
ALTER TABLE app_users
  ADD COLUMN IF NOT EXISTS animation_prefs jsonb DEFAULT '{"enabled":false,"theme":"none","intensity":"medium","speed":"medium","paused":false,"chatOverrides":{}}'::jsonb;
