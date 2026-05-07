create table if not exists meal_slots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamp with time zone default now()
);

alter table meal_slots enable row level security;

create policy "Users can view their own meal slots"
  on meal_slots for select
  using (auth.uid() = user_id);

create policy "Users can insert their own meal slots"
  on meal_slots for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own meal slots"
  on meal_slots for update
  using (auth.uid() = user_id);

create policy "Users can delete their own meal slots"
  on meal_slots for delete
  using (auth.uid() = user_id);

create index if not exists meal_slots_user_id_idx on meal_slots(user_id);
create index if not exists meal_slots_sort_order_idx on meal_slots(user_id, sort_order);
