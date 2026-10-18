-- Package size a person prefers for an ingredient on the shopping list
-- (v2 build step 4). Additive only: a new table, nothing existing changes.
--
-- ingredient_key is an entry id from the built-in package table
-- (src/v2/lib/packageSizes.js). size is the chosen package size in that
-- entry's unit, and unit records which unit that was ('oz', 'fl oz', 'count',
-- ...), so a choice made before an entry's unit changed is ignored rather
-- than misread. No row means "smallest that fits", the default.

create table if not exists package_size_choices (
  user_id uuid not null references auth.users(id) on delete cascade,
  ingredient_key text not null,
  size numeric not null check (size > 0),
  unit text not null,
  updated_at timestamp with time zone not null default now(),
  primary key (user_id, ingredient_key)
);

alter table package_size_choices enable row level security;

create policy "Users can view their own package size choices"
  on package_size_choices for select
  using (auth.uid() = user_id);

create policy "Users can insert their own package size choices"
  on package_size_choices for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own package size choices"
  on package_size_choices for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own package size choices"
  on package_size_choices for delete
  using (auth.uid() = user_id);
