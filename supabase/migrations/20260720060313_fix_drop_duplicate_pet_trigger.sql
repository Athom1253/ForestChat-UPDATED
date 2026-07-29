-- Fix: Duplicate trigger on app_users
-- Two triggers (trg_auto_create_pet_for_new_user, trigger_auto_create_pet)
-- both fire AFTER INSERT calling the same function. The function has
-- ON CONFLICT (user_id) DO NOTHING so it's harmless but wastes a cycle
-- and is confusing. Drop the duplicate.
DROP TRIGGER IF EXISTS trigger_auto_create_pet ON app_users;
