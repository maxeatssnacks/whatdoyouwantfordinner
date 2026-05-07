-- Ensure SELECT on recipes allows reading any row where status = 'published' (any creator),
-- plus creators reading their own rows regardless of status. Replaces prior policy names
-- from migrations 003/005 so deployed DBs pick up the intended rule.

DROP POLICY IF EXISTS "Users can view approved or own recipes" ON recipes;
DROP POLICY IF EXISTS "Users can view published or own recipes" ON recipes;

CREATE POLICY "Users can view approved recipes and their own pending recipes"
  ON recipes
  FOR SELECT
  USING (
    status = 'published'
    OR auth.uid() = created_by
  );
