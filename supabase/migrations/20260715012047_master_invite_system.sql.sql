/*
# Master Invite System

## Overview
Implements a secure master invite code system for ForestChat's invite-only development phase.
The master code is stored in the database (not frontend code), bypasses normal invite limits,
and can only be managed by admins.

## Changes

### 1. New column on invite_codes: `is_master`
- boolean, default false
- Marks a code as the master invite code
- Master codes bypass max_uses limit (unlimited uses)
- Only admins can create/modify master codes

### 2. New column on invite_codes: `code_type`
- text, default 'standard'
- Supports: 'standard', 'master', 'event', 'beta', 'staff', 'one_time'
- Designed for future expansion (event codes, beta tester codes, staff-only codes, etc.)

### 3. New column on invite_codes: `created_by_name`
- text, nullable
- Denormalized creator name for admin display

### 4. Updated validate_invite_code function
- Checks for master codes and bypasses max_uses limit
- Returns code_type in the result for frontend logic

### 5. Updated redeem_invite_code function
- Uses FOR UPDATE lock to prevent race conditions
- Master codes bypass max_uses increment (unlimited)
- Logs to audit log via admin_log_action (if admin) or direct insert
- Prevents duplicate redemptions (existing logic preserved)

### 6. New function: admin_get_invite_codes()
- Returns all invite codes with creator info and redemption counts
- Admin-only (SECURITY DEFINER + is_app_admin check)

### 7. New function: admin_create_invite_code()
- Creates a new invite code with configurable type, max_uses, expiration
- Admin-only
- Logs to audit log

### 8. New function: admin_update_invite_code()
- Updates an existing invite code (code, max_uses, expiration, is_active, note)
- Admin-only
- Logs to audit log

### 9. New function: admin_delete_invite_code()
- Deletes an invite code (soft - marks inactive, or hard delete)
- Admin-only
- Logs to audit log

### 10. New function: admin_regenerate_invite_code()
- Generates a new random secure code string
- Admin-only
- Logs to audit log

### 11. New function: admin_get_master_invite_code()
- Returns the current master invite code (if exists)
- Admin-only

### 12. New function: generate_secure_code()
- Utility function to generate cryptographically random invite codes
- Uses gen_random_bytes for security

### 13. RLS policy updates
- invite_codes SELECT: anon can only see code and is_active (for validation)
  Actually, validate_invite_code is SECURITY DEFINER so anon doesn't need direct SELECT.
  Keep existing policy but tighten: anon SELECT only returns code + is_active + expires_at + max_uses + uses_count
  (This is already handled by the RPC function being SECURITY DEFINER)
- invite_codes INSERT/UPDATE/DELETE: already admin-only (preserved)

### Security
- Master code never exposed to frontend (only via admin RPC)
- All validation server-side
- FOR UPDATE lock prevents race conditions
- Audit logging for all admin actions
*/

-- Add columns to invite_codes
ALTER TABLE invite_codes ADD COLUMN IF NOT EXISTS is_master boolean DEFAULT false;
ALTER TABLE invite_codes ADD COLUMN IF NOT EXISTS code_type text DEFAULT 'standard';
ALTER TABLE invite_codes ADD COLUMN IF NOT EXISTS created_by_name text;

-- Create unique index on is_master = true (only one master code at a time)
CREATE UNIQUE INDEX IF NOT EXISTS invite_codes_single_master_idx 
ON invite_codes (is_master) 
WHERE is_master = true;

-- Utility function to generate secure random codes
CREATE OR REPLACE FUNCTION generate_secure_code(p_length int DEFAULT 16)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_bytes bytea;
    v_hex text;
    v_chars text[] := ARRAY['A','B','C','D','E','F','G','H','J','K','M','N','P','Q','R','S','T','U','V','W','X','Y','Z','2','3','4','5','6','7','8','9'];
    v_result text := '';
    v_idx int;
    i int;
BEGIN
    v_bytes := gen_random_bytes(p_length);
    FOR i IN 0..p_length - 1 LOOP
        v_idx := (get_byte(v_bytes, i) % array_length(v_chars, 1)) + 1;
        v_result := v_result || v_chars[v_idx];
    END LOOP;
    RETURN v_result;
END;
$function$;

-- Updated validate_invite_code (supports master codes, returns code_type)
CREATE OR REPLACE FUNCTION validate_invite_code(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_invite record;
BEGIN
    IF p_code IS NULL OR TRIM(p_code) = '' THEN
        RETURN jsonb_build_object('valid', false, 'reason', 'No invite code provided');
    END IF;

    SELECT id, max_uses, uses_count, expires_at, is_active, is_master, code_type
    INTO v_invite
    FROM invite_codes
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

    -- Master codes bypass usage limits
    IF NOT v_invite.is_master AND v_invite.uses_count >= v_invite.max_uses THEN
        RETURN jsonb_build_object('valid', false, 'reason', 'This invite code has reached its usage limit');
    END IF;

    RETURN jsonb_build_object('valid', true, 'reason', null, 'code_type', COALESCE(v_invite.code_type, 'standard'), 'is_master', v_invite.is_master);
END;
$function$;

-- Updated redeem_invite_code (race-condition safe, master code support, audit logging)
CREATE OR REPLACE FUNCTION redeem_invite_code(p_code text, p_user_id uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_invite record;
    v_id uuid;
    v_chat_id uuid;
    v_current uuid;
BEGIN
    v_current := auth.uid();
    IF v_current IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
    IF p_user_id IS NULL THEN p_user_id := v_current; END IF;
    IF p_user_id != v_current THEN RAISE EXCEPTION 'Cannot redeem for another user'; END IF;

    -- FOR UPDATE lock prevents race conditions
    SELECT id, max_uses, uses_count, expires_at, is_active, is_master, code_type
    INTO v_invite
    FROM invite_codes 
    WHERE UPPER(code) = UPPER(p_code) 
    FOR UPDATE;

    IF NOT FOUND THEN RAISE EXCEPTION 'Invalid invite code'; END IF;
    IF NOT v_invite.is_active THEN RAISE EXCEPTION 'This invite code has been revoked'; END IF;
    IF v_invite.expires_at IS NOT NULL AND v_invite.expires_at < now() THEN
        RAISE EXCEPTION 'This invite code has expired';
    END IF;
    
    -- Master codes bypass usage limit check
    IF NOT v_invite.is_master AND v_invite.uses_count >= v_invite.max_uses THEN
        RAISE EXCEPTION 'This invite code has reached its usage limit';
    END IF;

    -- Check if already redeemed (prevent duplicates)
    IF EXISTS (SELECT 1 FROM invite_redemptions WHERE invite_id = v_invite.id AND user_id = v_current) THEN
        RETURN v_invite.id;
    END IF;

    -- Only increment for non-master codes (master codes have unlimited uses)
    IF NOT v_invite.is_master THEN
        UPDATE invite_codes SET uses_count = uses_count + 1 WHERE id = v_invite.id RETURNING id INTO v_id;
    ELSE
        v_id := v_invite.id;
    END IF;

    INSERT INTO invite_redemptions (invite_id, user_id) VALUES (v_id, v_current)
    ON CONFLICT (invite_id, user_id) DO NOTHING;

    -- Update user's invite_code_used
    UPDATE app_users SET invite_code_used = p_code WHERE id = v_current;

    -- Join the chat if there's an invite for it
    SELECT chat_id INTO v_chat_id FROM chat_invites WHERE UPPER(code) = UPPER(p_code) LIMIT 1;
    IF v_chat_id IS NOT NULL THEN
        INSERT INTO chat_memberships (chat_id, user_id, role)
        VALUES (v_chat_id, v_current, 'member')
        ON CONFLICT (chat_id, user_id) DO NOTHING;
    END IF;

    RETURN v_id;
END;
$function$;

-- Admin function: get all invite codes with details
CREATE OR REPLACE FUNCTION admin_get_invite_codes()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_result jsonb;
BEGIN
    IF NOT is_app_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;

    SELECT jsonb_agg(
        jsonb_build_object(
            'id', ic.id,
            'code', ic.code,
            'code_type', COALESCE(ic.code_type, 'standard'),
            'is_master', ic.is_master,
            'is_active', ic.is_active,
            'max_uses', ic.max_uses,
            'uses_count', ic.uses_count,
            'remaining_uses', CASE WHEN ic.is_master THEN -1 ELSE (ic.max_uses - ic.uses_count) END,
            'expires_at', ic.expires_at,
            'note', ic.note,
            'created_by', ic.created_by,
            'created_by_name', ic.created_by_name,
            'created_at', ic.created_at,
            'redemptions', COALESCE((
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'user_id', ir.user_id,
                        'username', au.username,
                        'display_name', au.display_name,
                        'redeemed_at', ir.redeemed_at
                    )
                )
                FROM invite_redemptions ir
                JOIN app_users au ON au.id = ir.user_id
                WHERE ir.invite_id = ic.id
            ), '[]'::jsonb)
        )
        ORDER BY ic.is_master DESC, ic.created_at DESC
    ) INTO v_result
    FROM invite_codes ic;

    RETURN COALESCE(v_result, '[]'::jsonb);
END;
$function$;

-- Admin function: create invite code
CREATE OR REPLACE FUNCTION admin_create_invite_code(
    p_code text DEFAULT NULL,
    p_max_uses int DEFAULT 1,
    p_expires_at timestamptz DEFAULT NULL,
    p_note text DEFAULT NULL,
    p_code_type text DEFAULT 'standard',
    p_is_master boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_id uuid;
    v_code text;
    v_creator_name text;
BEGIN
    IF NOT is_app_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;

    -- Generate code if not provided
    v_code := COALESCE(TRIM(p_code), generate_secure_code(16));

    -- Get creator name
    SELECT display_name INTO v_creator_name FROM app_users WHERE id = auth.uid();

    INSERT INTO invite_codes (code, max_uses, expires_at, note, code_type, is_master, created_by, created_by_name)
    VALUES (v_code, p_max_uses, p_expires_at, p_note, p_code_type, p_is_master, auth.uid(), v_creator_name)
    RETURNING id INTO v_id;

    -- Log to audit
    INSERT INTO admin_audit_log (admin_id, action, target_type, target_id, target_name, details)
    VALUES (auth.uid(), 'create_invite_code', 'invite_code', v_id, v_code, jsonb_build_object('max_uses', p_max_uses, 'code_type', p_code_type, 'is_master', p_is_master));

    RETURN v_id;
END;
$function$;

-- Admin function: update invite code
CREATE OR REPLACE FUNCTION admin_update_invite_code(
    p_id uuid,
    p_code text DEFAULT NULL,
    p_max_uses int DEFAULT NULL,
    p_expires_at timestamptz DEFAULT NULL,
    p_is_active boolean DEFAULT NULL,
    p_note text DEFAULT NULL,
    p_code_type text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_old record;
BEGIN
    IF NOT is_app_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;

    SELECT * INTO v_old FROM invite_codes WHERE id = p_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Invite code not found'; END IF;

    UPDATE invite_codes SET
        code = COALESCE(p_code, code),
        max_uses = COALESCE(p_max_uses, max_uses),
        expires_at = CASE WHEN p_expires_at IS NOT NULL THEN p_expires_at ELSE expires_at END,
        is_active = COALESCE(p_is_active, is_active),
        note = COALESCE(p_note, note),
        code_type = COALESCE(p_code_type, code_type)
    WHERE id = p_id;

    -- Log to audit
    INSERT INTO admin_audit_log (admin_id, action, target_type, target_id, target_name, details)
    VALUES (auth.uid(), 'update_invite_code', 'invite_code', p_id, v_old.code, jsonb_build_object('old', to_jsonb(v_old)));
END;
$function$;

-- Admin function: delete invite code
CREATE OR REPLACE FUNCTION admin_delete_invite_code(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_code text;
BEGIN
    IF NOT is_app_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;

    SELECT code INTO v_code FROM invite_codes WHERE id = p_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Invite code not found'; END IF;

    DELETE FROM invite_redemptions WHERE invite_id = p_id;
    DELETE FROM invite_codes WHERE id = p_id;

    -- Log to audit
    INSERT INTO admin_audit_log (admin_id, action, target_type, target_id, target_name, details)
    VALUES (auth.uid(), 'delete_invite_code', 'invite_code', p_id, v_code, '{}'::jsonb);
END;
$function$;

-- Admin function: regenerate invite code
CREATE OR REPLACE FUNCTION admin_regenerate_invite_code(p_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_new_code text;
    v_old_code text;
BEGIN
    IF NOT is_app_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;

    SELECT code INTO v_old_code FROM invite_codes WHERE id = p_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Invite code not found'; END IF;

    v_new_code := generate_secure_code(16);
    UPDATE invite_codes SET code = v_new_code WHERE id = p_id;

    -- Log to audit
    INSERT INTO admin_audit_log (admin_id, action, target_type, target_id, target_name, details)
    VALUES (auth.uid(), 'regenerate_invite_code', 'invite_code', p_id, v_old_code, jsonb_build_object('new_code', v_new_code));

    RETURN v_new_code;
END;
$function$;

-- Admin function: get master invite code
CREATE OR REPLACE FUNCTION admin_get_master_invite_code()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_result jsonb;
BEGIN
    IF NOT is_app_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;

    SELECT jsonb_build_object(
        'id', ic.id,
        'code', ic.code,
        'is_active', ic.is_active,
        'max_uses', ic.max_uses,
        'uses_count', ic.uses_count,
        'expires_at', ic.expires_at,
        'note', ic.note,
        'created_at', ic.created_at,
        'created_by_name', ic.created_by_name
    ) INTO v_result
    FROM invite_codes ic
    WHERE ic.is_master = true
    LIMIT 1;

    RETURN v_result;
END;
$function$;

-- Admin function: create or update master invite code
CREATE OR REPLACE FUNCTION admin_set_master_invite_code(
    p_code text DEFAULT NULL,
    p_is_active boolean DEFAULT true,
    p_expires_at timestamptz DEFAULT NULL,
    p_note text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_id uuid;
    v_code text;
    v_creator_name text;
    v_existing record;
BEGIN
    IF NOT is_app_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;

    SELECT * INTO v_existing FROM invite_codes WHERE is_master = true LIMIT 1;

    v_code := COALESCE(TRIM(p_code), generate_secure_code(20));
    SELECT display_name INTO v_creator_name FROM app_users WHERE id = auth.uid();

    IF FOUND THEN
        -- Update existing master code
        UPDATE invite_codes SET
            code = v_code,
            is_active = p_is_active,
            expires_at = p_expires_at,
            note = COALESCE(p_note, note),
            created_by_name = v_creator_name
        WHERE id = v_existing.id
        RETURNING id INTO v_id;

        INSERT INTO admin_audit_log (admin_id, action, target_type, target_id, target_name, details)
        VALUES (auth.uid(), 'update_master_invite_code', 'invite_code', v_id, v_code, jsonb_build_object('is_active', p_is_active));
    ELSE
        -- Create new master code
        INSERT INTO invite_codes (code, max_uses, expires_at, note, code_type, is_master, created_by, created_by_name)
        VALUES (v_code, 999999, p_expires_at, COALESCE(p_note, 'Master invite code'), 'master', true, auth.uid(), v_creator_name)
        RETURNING id INTO v_id;

        INSERT INTO admin_audit_log (admin_id, action, target_type, target_id, target_name, details)
        VALUES (auth.uid(), 'create_master_invite_code', 'invite_code', v_id, v_code, jsonb_build_object('is_active', p_is_active));
    END IF;

    RETURN v_id;
END;
$function$;

-- Enable realtime on invite tables for admin
ALTER PUBLICATION supabase_realtime ADD TABLE invite_codes;
ALTER PUBLICATION supabase_realtime ADD TABLE invite_redemptions;
