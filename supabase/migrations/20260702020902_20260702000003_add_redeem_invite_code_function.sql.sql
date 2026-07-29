/*
# Add redeem_invite_code function for atomic invite redemption

## Purpose
The previous client-side redemption read uses_count then wrote uses_count+1,
which is racy under concurrent signups. This SECURITY DEFINER function
atomically increments the usage counter and inserts the redemption row in a
single transaction, and validates the invite is still valid.

## Security
- SECURITY DEFINER, search_path = ''
- Validates the invite code exists, is active, not expired, and under max_uses
- Returns the invite id on success, raises an exception with a message on failure
*/
CREATE OR REPLACE FUNCTION redeem_invite_code(
  p_code text,
  p_user_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_invite record;
  v_id uuid;
BEGIN
  SELECT id, max_uses, uses_count, expires_at, is_active
    INTO v_invite
  FROM public.invite_codes
  WHERE UPPER(code) = UPPER(p_code)
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid invite code';
  END IF;
  IF NOT v_invite.is_active THEN
    RAISE EXCEPTION 'This invite code has been revoked';
  END IF;
  IF v_invite.expires_at IS NOT NULL AND v_invite.expires_at < now() THEN
    RAISE EXCEPTION 'This invite code has expired';
  END IF;
  IF v_invite.uses_count >= v_invite.max_uses THEN
    RAISE EXCEPTION 'This invite code has reached its usage limit';
  END IF;

  UPDATE public.invite_codes
    SET uses_count = uses_count + 1
    WHERE id = v_invite.id
    RETURNING id INTO v_id;

  INSERT INTO public.invite_redemptions (invite_id, user_id)
    VALUES (v_id, p_user_id)
    ON CONFLICT (invite_id, user_id) DO NOTHING;

  RETURN v_id;
END;
$$;
