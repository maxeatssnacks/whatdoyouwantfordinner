-- Quick meals: free-form logged meals that skip the full recipe form.
-- No new table — quick meals are recipes with recipe_type='quick', so the
-- planner, shopping list, and macro calculations work on them unchanged.

ALTER TABLE recipes ADD COLUMN recipe_type text NOT NULL DEFAULT 'standard' CHECK (recipe_type IN ('standard', 'quick'));
