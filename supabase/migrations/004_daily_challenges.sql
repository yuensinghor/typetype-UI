-- 004_daily_challenges.sql
-- NOTE: already applied directly via the Supabase SQL editor. This file is
-- committed for history/reproducibility; do not re-run against production.

create table if not exists daily_challenges (
  challenge_date date primary key,        -- UTC-anchored, e.g. '2026-07-16'
  equation_set jsonb not null,            -- ordered array of 10 equations (display only, no answer field)
  speed_benchmark_ms integer not null,    -- per-equation-set benchmark gating hidden bonus stages 6-10
  created_at timestamptz not null default now()
);

alter table daily_challenges enable row level security;

-- Anyone (guest or logged-in) can read today's or past challenge sets.
create policy if not exists "daily_challenges_select" on daily_challenges
  for select using (true);

-- Deliberately NO insert/update/delete policies for anon/authenticated roles.
-- Only the get-daily-challenge Edge Function's service-role key can write,
-- and challenge_date as primary key means each date can only ever be written once.
