-- Eating out and skipped meals (v2 build step 7b). Additive only: one new
-- nullable column and its checks; nothing existing changes, and every row
-- already there has kind null (a meal, as before).
--
-- A meal_plan_entries row with a kind takes its slot without a recipe:
--   'eating_out'  the slot shows "Eating out" (B2's fork and knife)
--   'skipped'     the slot shows "Skipped"
-- Such a row has no recipe and is never a leftover. Plan my week keeps these
-- rows and counts their slots as taken; the shopping list, what's on hand and
-- the rankings skip them, as they already skip entries without a recipe.

alter table meal_plan_entries
  add column if not exists kind text;

alter table meal_plan_entries
  drop constraint if exists meal_plan_entries_kind_check;
alter table meal_plan_entries
  add constraint meal_plan_entries_kind_check
  check (kind is null or kind in ('eating_out', 'skipped'));

alter table meal_plan_entries
  drop constraint if exists meal_plan_entries_kind_no_recipe;
alter table meal_plan_entries
  add constraint meal_plan_entries_kind_no_recipe
  check (kind is null or (recipe_id is null and is_leftover is not true));
