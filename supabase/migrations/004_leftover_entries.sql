ALTER TABLE meal_plan_entries
  ADD COLUMN IF NOT EXISTS is_leftover boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS original_entry_id uuid REFERENCES meal_plan_entries(id) ON DELETE CASCADE;
