-- The live household_members_goal_check constraint drifted to long-form values
-- ('lose_weight', 'gain_muscle') while the repo migration 002, the frontend
-- Goal dropdown, and the TDEE math in utils.js all use the short values
-- ('lose', 'gain'). This re-applies the constraint matching the repo.
-- Existing data is safe: the two live rows both have goal='maintain'.
alter table household_members drop constraint household_members_goal_check;
alter table household_members add constraint household_members_goal_check
  check (goal in ('lose', 'maintain', 'gain'));
