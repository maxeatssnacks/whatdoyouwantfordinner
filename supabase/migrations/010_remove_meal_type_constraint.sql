-- Dynamic meal slot names: allow any text in meal_type (not only breakfast/lunch/dinner/snack).
-- Unnamed column CHECK constraints from the initial schema use PostgreSQL’s default names:
--   meal_plan_entries_meal_type_check
--   recipes_meal_type_check

ALTER TABLE meal_plan_entries
  DROP CONSTRAINT IF EXISTS meal_plan_entries_meal_type_check;

ALTER TABLE recipes
  DROP CONSTRAINT IF EXISTS recipes_meal_type_check;
