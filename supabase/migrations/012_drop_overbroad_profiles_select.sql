-- Pre-launch security fix: H1 from audits/security.md
-- Drop the overbroad profiles SELECT policy that leaked PII to any
-- authenticated user. The existing owner-scoped policy
-- (FOR ALL USING auth.uid() = id) is sufficient — no client feature
-- reads other users' profiles, and recipes.created_by is never joined
-- to profiles for display.

DROP POLICY IF EXISTS "Authenticated users can read any profile" ON profiles;

-- Verify the owner policy is still present (sanity check, no-op if exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'profiles'
      AND policyname = 'Users can manage their own profile'
  ) THEN
    RAISE EXCEPTION 'Owner-scoped policy missing on profiles — aborting migration';
  END IF;
END $$;
