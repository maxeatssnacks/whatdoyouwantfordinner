-- Rate-limit log for the parse-changes Edge Function (v2 build step 7a: voice
-- changes). Additive only: a new table, nothing existing changes.
--
-- One row per call that reaches the model, written by the function with the
-- service role before it calls the model, so failed calls count too. The
-- function allows 30 calls per person in any rolling 24 hours. Only the
-- person and the time are kept: never the words or the changes.

create table if not exists voice_calls (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  called_at timestamptz default now()
);

-- Index for fast daily count lookups
create index if not exists voice_calls_user_called_at_idx on voice_calls (user_id, called_at);

-- RLS: people can read their own rows; only the function (service role) writes.
alter table voice_calls enable row level security;

create policy "Users can read own voice calls"
  on voice_calls for select
  using (auth.uid() = user_id);
