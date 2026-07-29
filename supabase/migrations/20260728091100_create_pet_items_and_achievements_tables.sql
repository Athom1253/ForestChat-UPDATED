/*
# Create pet_items and pet_achievements tables

1. New Tables
- `pet_items`: stores items (food, toys, accessories, potions) belonging to a pet
- `pet_achievements`: stores achievement unlocks for pets
2. Security
- RLS enabled on both tables, owner-scoped (auth.uid() = owner_id)
*/

CREATE TABLE IF NOT EXISTS pet_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pet_id uuid NOT NULL REFERENCES user_pets(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  item_type text NOT NULL DEFAULT 'food',
  item_name text NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  metadata jsonb DEFAULT '{}'::jsonb,
  acquired_at timestamptz DEFAULT now()
);

ALTER TABLE pet_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_pet_items" ON pet_items;
CREATE POLICY "select_own_pet_items" ON pet_items FOR SELECT
  TO authenticated USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "insert_own_pet_items" ON pet_items;
CREATE POLICY "insert_own_pet_items" ON pet_items FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "update_own_pet_items" ON pet_items;
CREATE POLICY "update_own_pet_items" ON pet_items FOR UPDATE
  TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "delete_own_pet_items" ON pet_items;
CREATE POLICY "delete_own_pet_items" ON pet_items FOR DELETE
  TO authenticated USING (auth.uid() = owner_id);

CREATE TABLE IF NOT EXISTS pet_achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pet_id uuid NOT NULL REFERENCES user_pets(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  achievement_id text NOT NULL,
  achievement_name text NOT NULL,
  unlocked_at timestamptz DEFAULT now()
);

ALTER TABLE pet_achievements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_pet_achievements" ON pet_achievements;
CREATE POLICY "select_own_pet_achievements" ON pet_achievements FOR SELECT
  TO authenticated USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "insert_own_pet_achievements" ON pet_achievements;
CREATE POLICY "insert_own_pet_achievements" ON pet_achievements FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "update_own_pet_achievements" ON pet_achievements;
CREATE POLICY "update_own_pet_achievements" ON pet_achievements FOR UPDATE
  TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "delete_own_pet_achievements" ON pet_achievements;
CREATE POLICY "delete_own_pet_achievements" ON pet_achievements FOR DELETE
  TO authenticated USING (auth.uid() = owner_id);
