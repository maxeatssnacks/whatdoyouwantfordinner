-- Reset slots that were renamed via the removed "Use numbered meals" Profile toggle.
-- Application uses sort_order 0–3 for the four default slots.

UPDATE meal_slots
SET name = CASE sort_order
  WHEN 0 THEN 'Breakfast'
  WHEN 1 THEN 'Lunch'
  WHEN 2 THEN 'Dinner'
  WHEN 3 THEN 'Snack'
  ELSE name
END
WHERE name IN ('Meal 1', 'Meal 2', 'Meal 3', 'Meal 4', 'Meal 5');
