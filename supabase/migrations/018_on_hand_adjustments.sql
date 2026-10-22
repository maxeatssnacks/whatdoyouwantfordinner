-- "How much is left?" answers for what's on hand from earlier weeks (v2 build
-- step 5c). Additive only: a new table, nothing existing changes.
--
-- What's on hand is worked out, never stored (src/v2/lib/onHand.js). A row
-- here is a person's correction on top of that: on as_of (the local day they
-- answered), that ingredient's amount on hand becomes `amount`. Later meals
-- use from it and later purchases add to it. Deleting the rows gives back the
-- pure inference.
--
-- ingredient_key is an entry id from the built-in package table
-- (src/v2/lib/packageSizes.js). amount is in that entry's unit, and unit
-- records which unit that was, so a row saved before an entry's unit changed
-- is ignored rather than misread (as in 017). answer is the bucket picked
-- ('used_up', 'a_little', 'about_half', 'plenty'), or 'amount' for a number
-- given some other way later (voice, receipts). inferred_amount and
-- package_amount keep what the app had worked out and what the answer was a
-- share of, so defaults can learn from corrections later. One row per person,
-- ingredient and day: a second answer the same day replaces the first.

create table if not exists on_hand_adjustments (
  user_id uuid not null references auth.users(id) on delete cascade,
  ingredient_key text not null,
  as_of date not null,
  answer text not null check (answer in ('used_up', 'a_little', 'about_half', 'plenty', 'amount')),
  amount numeric not null check (amount >= 0),
  unit text not null,
  inferred_amount numeric check (inferred_amount is null or inferred_amount >= 0),
  package_amount numeric check (package_amount is null or package_amount >= 0),
  source text not null default 'meal_sheet' check (source in ('meal_sheet', 'shopping', 'voice', 'receipt')),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  primary key (user_id, ingredient_key, as_of)
);

alter table on_hand_adjustments enable row level security;

create policy "Users can view their own on-hand adjustments"
  on on_hand_adjustments for select
  using (auth.uid() = user_id);

create policy "Users can insert their own on-hand adjustments"
  on on_hand_adjustments for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own on-hand adjustments"
  on on_hand_adjustments for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own on-hand adjustments"
  on on_hand_adjustments for delete
  using (auth.uid() = user_id);
