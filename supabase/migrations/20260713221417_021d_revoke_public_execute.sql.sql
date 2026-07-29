/*
# Revoke PUBLIC EXECUTE on trigger/internal functions

PostgreSQL grants EXECUTE to PUBLIC by default on all functions.
REVOKE FROM anon, authenticated only removes direct grants but PUBLIC
still applies. Need to REVOKE FROM PUBLIC to fully block direct calls.
*/

REVOKE EXECUTE ON FUNCTION handle_new_auth_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION update_chat_last_message() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION update_chat_last_message_on_update() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION admin_log_action(text, text, uuid, text, jsonb) FROM PUBLIC;
