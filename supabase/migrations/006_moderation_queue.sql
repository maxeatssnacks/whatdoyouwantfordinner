-- Migration 006: Admin role + moderation queue
-- Adds: is_admin on profiles, admin_note + pending_edit_data on recipes,
--       expanded status constraint, and admin RLS policies.

-- 1. Admin flag on profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_admin boolean DEFAULT false;

-- 2. Allow any authenticated user to read profiles (display names for author attribution)
--    The existing "Users can manage their own profile" (for all) still covers writes.
CREATE POLICY "Authenticated users can read any profile" ON profiles
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- 3. Expand recipe status constraint to include pending and pending_edit
ALTER TABLE recipes DROP CONSTRAINT IF EXISTS recipes_status_check;
ALTER TABLE recipes
  ADD CONSTRAINT recipes_status_check
  CHECK (status IN ('draft', 'published', 'hidden', 'pending', 'pending_edit'));

-- 4. Moderation columns on recipes
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS admin_note text;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS pending_edit_data jsonb;

-- 5. Admins can read pending/pending_edit recipes from any user
CREATE POLICY "Admins can read pending recipes" ON recipes
  FOR SELECT USING (
    status IN ('pending', 'pending_edit')
    AND (SELECT is_admin FROM profiles WHERE id = auth.uid()) = true
  );

-- 6. Admins can update any recipe (approve / reject)
CREATE POLICY "Admins can update any recipe" ON recipes
  FOR UPDATE USING (
    (SELECT is_admin FROM profiles WHERE id = auth.uid()) = true
  );
