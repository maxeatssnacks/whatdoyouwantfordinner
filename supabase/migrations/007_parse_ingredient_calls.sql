-- Rate-limit log for the parse-ingredients Edge Function
create table parse_ingredient_calls (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  called_at timestamptz default now()
);

-- Index for fast daily count lookups
create index on parse_ingredient_calls (user_id, called_at);

-- RLS
alter table parse_ingredient_calls enable row level security;

create policy "Users can read own call logs"
  on parse_ingredient_calls for select
  using (auth.uid() = user_id);
