-- Update recipe status model to: draft / published / hidden
-- Previously: pending / approved / rejected

-- Drop existing status constraint
ALTER TABLE recipes DROP CONSTRAINT IF EXISTS recipes_status_check;

-- Backfill old status values to new model
UPDATE recipes SET status = 'published' WHERE status = 'approved';
UPDATE recipes SET status = 'draft'     WHERE status IN ('pending', 'rejected');

-- Apply new constraint
ALTER TABLE recipes
  ADD CONSTRAINT recipes_status_check
  CHECK (status IN ('draft', 'published', 'hidden'));

-- New default: draft (frontend will set published on create)
ALTER TABLE recipes ALTER COLUMN status SET DEFAULT 'draft';

-- Update RLS select policy
DROP POLICY IF EXISTS "Users can view approved or own recipes" ON recipes;

-- Published recipes are visible to everyone; creators can see all their own recipes
CREATE POLICY "Users can view published or own recipes" ON recipes
  FOR SELECT USING (
    status = 'published'
    OR auth.uid() = created_by
  );
