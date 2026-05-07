-- Add household members table
create table household_members (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  name text not null,
  sex text check (sex in ('male', 'female')),
  age integer,
  height_cm numeric,
  weight_kg numeric,
  activity_level text check (activity_level in ('sedentary', 'lightly_active', 'moderately_active', 'very_active', 'extra_active')),
  goal text check (goal in ('lose', 'maintain', 'gain')),
  foods_to_avoid text[] default '{}',
  tdee integer,
  macro_goal_calories integer,
  macro_goal_protein integer,
  macro_goal_carbs integer,
  macro_goal_fat integer,
  is_primary boolean default false,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Add recent_meal_filter_weeks to profiles
alter table profiles add column recent_meal_filter_weeks integer default 2;

-- Row Level Security for household_members
alter table household_members enable row level security;

-- Policy: users can only manage their own household members
create policy "Users can manage their own household members" 
  on household_members for all 
  using (auth.uid() = user_id);

-- Index for performance
create index household_members_user_id_idx on household_members(user_id);
create index household_members_is_primary_idx on household_members(user_id, is_primary);
