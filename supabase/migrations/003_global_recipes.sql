-- Global recipe database migration
-- Adds: created_by, status fields on recipes
-- New tables: recipe_favorites, recipe_notes
-- Updated RLS policies for global access

-- Add created_by and status to recipes
alter table recipes add column if not exists created_by uuid references auth.users(id);
alter table recipes add column if not exists status text default 'pending' check (status in ('pending', 'approved', 'rejected'));

-- Backfill existing recipes: created_by = user_id, status = 'approved'
update recipes set created_by = user_id where created_by is null;
update recipes set status = 'approved' where status is null;

-- Drop old catch-all policy
drop policy if exists "Users can manage their own recipes" on recipes;

-- New RLS policies for global recipe database
-- Any authenticated user can view approved recipes, or their own recipes regardless of status
create policy "Users can view approved or own recipes" on recipes
  for select using (status = 'approved' or auth.uid() = created_by);

-- Users can only create recipes for themselves
create policy "Users can create their own recipes" on recipes
  for insert with check (auth.uid() = created_by);

-- Users can only update their own recipes
create policy "Users can update their own recipes" on recipes
  for update using (auth.uid() = created_by);

-- Users can only delete their own recipes
create policy "Users can delete their own recipes" on recipes
  for delete using (auth.uid() = created_by);

-- Recipe favorites table
create table if not exists recipe_favorites (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  recipe_id uuid references recipes(id) on delete cascade not null,
  created_at timestamp with time zone default now(),
  unique(user_id, recipe_id)
);

alter table recipe_favorites enable row level security;

create policy "Users can manage their own favorites" on recipe_favorites
  for all using (auth.uid() = user_id);

-- Recipe notes table (private per-user notes on any recipe)
create table if not exists recipe_notes (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  recipe_id uuid references recipes(id) on delete cascade not null,
  notes text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  unique(user_id, recipe_id)
);

alter table recipe_notes enable row level security;

create policy "Users can manage their own recipe notes" on recipe_notes
  for all using (auth.uid() = user_id);
