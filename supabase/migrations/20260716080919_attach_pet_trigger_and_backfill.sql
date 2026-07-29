-- Attach the auto_create_pet_for_new_user trigger to app_users
-- The function already exists but the trigger was never created,
-- so users created before the pet system (or when the trigger was missing)
-- did not automatically receive a pet.

CREATE TRIGGER trg_auto_create_pet_for_new_user
  AFTER INSERT ON app_users
  FOR EACH ROW
  EXECUTE FUNCTION auto_create_pet_for_new_user();

-- Backfill: create a default pet for any existing user who doesn't have one.
-- ON CONFLICT (user_id) DO NOTHING preserves all existing pets and data.
INSERT INTO user_pets (user_id, species, name, color_variant, personality)
SELECT id, 'cat', 'Companion', 'default', 'playful'
FROM app_users
WHERE NOT EXISTS (
  SELECT 1 FROM user_pets WHERE user_pets.user_id = app_users.id
)
ON CONFLICT (user_id) DO NOTHING;
