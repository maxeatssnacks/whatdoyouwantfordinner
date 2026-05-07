-- Users are handled by Supabase Auth (auth.users)
-- We extend with a profiles table

create table profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  email text,
  display_name text,
  avatar_url text,
  tdee integer,
  macro_goal_calories integer,
  macro_goal_protein integer,
  macro_goal_carbs integer,
  macro_goal_fat integer,
  created_at timestamp with time zone default now()
);

create table recipes (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  title text not null,
  description text,
  image_url text,
  source_url text,
  cuisine_type text,
  meal_type text check (meal_type in ('breakfast', 'lunch', 'dinner', 'snack')),
  difficulty text check (difficulty in ('easy', 'medium', 'hard')),
  cook_time_minutes integer,
  servings integer default 1,
  calories integer,
  protein_g integer,
  carbs_g integer,
  fat_g integer,
  ingredients jsonb default '[]',
  instructions text,
  dietary_tags text[] default '{}',
  is_favorite boolean default false,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create table meal_plans (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  week_start_date date not null,
  created_at timestamp with time zone default now()
);

create table meal_plan_entries (
  id uuid default gen_random_uuid() primary key,
  meal_plan_id uuid references meal_plans(id) on delete cascade not null,
  recipe_id uuid references recipes(id) on delete set null,
  day_of_week text check (day_of_week in ('monday','tuesday','wednesday','thursday','friday','saturday','sunday')),
  meal_type text check (meal_type in ('breakfast', 'lunch', 'dinner', 'snack')),
  notes text
);

create table shopping_lists (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  meal_plan_id uuid references meal_plans(id) on delete set null,
  name text default 'Shopping List',
  items jsonb default '[]',
  created_at timestamp with time zone default now()
);

-- Row Level Security
alter table profiles enable row level security;
alter table recipes enable row level security;
alter table meal_plans enable row level security;
alter table meal_plan_entries enable row level security;
alter table shopping_lists enable row level security;

-- Policies: users can only access their own data
create policy "Users can manage their own profile" on profiles for all using (auth.uid() = id);
create policy "Users can manage their own recipes" on recipes for all using (auth.uid() = user_id);
create policy "Users can manage their own meal plans" on meal_plans for all using (auth.uid() = user_id);
create policy "Users can manage their own meal plan entries" on meal_plan_entries
  for all using (
    meal_plan_id in (select id from meal_plans where user_id = auth.uid())
  );
create policy "Users can manage their own shopping lists" on shopping_lists for all using (auth.uid() = user_id);

-- Auto-create profile on signup
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();
