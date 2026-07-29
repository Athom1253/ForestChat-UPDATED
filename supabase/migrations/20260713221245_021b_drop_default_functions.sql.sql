/*
# Security Hardening Part 2a: Drop functions with defaults before recreating

Three functions have DEFAULT parameters that prevent CREATE OR REPLACE
from changing the function body. Drop them first, then recreate in 021b.
*/

DROP FUNCTION IF EXISTS admin_create_announcement(text, text, boolean, timestamptz);
DROP FUNCTION IF EXISTS admin_send_notification(uuid, text, text, text);
DROP FUNCTION IF EXISTS create_group_chat(text, text, text, text, uuid);
