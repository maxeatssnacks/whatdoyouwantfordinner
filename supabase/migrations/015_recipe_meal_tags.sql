-- Replace the single recipes.meal_type field with a multi-select meal_tags array.
-- Allowed tags (enforced client/prompt-side only, same approach as dietary_tags):
--   breakfast, entree, side, snack, dessert

ALTER TABLE recipes ADD COLUMN meal_tags text[] NOT NULL DEFAULT '{}';

-- Backfill from the old meal_type value before dropping it.
UPDATE recipes SET meal_tags = ARRAY['breakfast'] WHERE meal_type = 'breakfast';
UPDATE recipes SET meal_tags = ARRAY['snack']     WHERE meal_type = 'snack';
UPDATE recipes SET meal_tags = ARRAY['entree']    WHERE meal_type IN ('dinner', 'lunch') OR meal_type IS NULL OR meal_type NOT IN ('breakfast', 'snack');

ALTER TABLE recipes DROP COLUMN meal_type;
