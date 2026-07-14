-- Digit Dash — Supabase schema
-- Run this in the Supabase SQL editor for your project.

-- 1. Profiles: one row per identity (Google-authed OR guest)
create table if not exists public.profiles (
  user_id uuid primary key default gen_random_uuid(),
  auth_uid uuid unique references auth.users(id) on delete cascade, -- null for guests
  username text not null unique,
  is_guest boolean not null default false,
  invite_code text unique not null default substr(md5(random()::text), 0, 9),
  invited_by uuid references public.profiles(user_id),
  created_at timestamptz not null default now()
);

create index if not exists idx_profiles_invited_by on public.profiles(invited_by);

-- 2. Player ladder progress: highest unlocked tier + cosmetic bonus-stage badges
create table if not exists public.player_progress (
  user_id uuid primary key references public.profiles(user_id) on delete cascade,
  highest_unlocked_tier text not null default 'easy'
    check (highest_unlocked_tier in ('easy','medium','hard','boss')),
  badge_easy boolean not null default false,
  badge_medium boolean not null default false,
  badge_hard boolean not null default false,
  badge_boss boolean not null default false,
  has_limit_break_award boolean not null default false,
  unlimited_quit_retry boolean not null default false,
  updated_at timestamptz not null default now()
);

-- 3. Ladder leaderboard: ONE combined ranking (climb progress + speed)
create table if not exists public.ladder_leaderboard (
  user_id uuid primary key references public.profiles(user_id) on delete cascade,
  username text not null,
  highest_tier text not null check (highest_tier in ('easy','medium','hard','boss')),
  best_total_time_ms integer not null,
  score integer not null default 0,
  cleared_hidden_bonus_tiers text[] not null default '{}',
  has_limit_break_award boolean not null default false,
  updated_at timestamptz not null default now()
);

-- Tier rank order for combined sort (higher tier always outranks lower tier regardless of speed)
create or replace function public.tier_rank(t text) returns int as $$
  select case t
    when 'boss' then 4
    when 'hard' then 3
    when 'medium' then 2
    when 'easy' then 1
    else 0
  end;
$$ language sql immutable;

-- 4. Run history (optional, useful for the dynamic community-median benchmark)
create table if not exists public.tier_runs (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles(user_id) on delete cascade,
  tier text not null,
  total_time_ms integer not null,
  cleared_basic boolean not null,
  beat_benchmark boolean not null,
  cleared_hidden_bonus boolean not null,
  reached_limit_break boolean not null default false,
  cleared_limit_break boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_tier_runs_tier_time on public.tier_runs(tier, total_time_ms)
  where cleared_basic = true;

-- View: dynamic per-tier median benchmark, based on cleared basic-stage runs
create or replace view public.tier_benchmarks as
select
  tier,
  percentile_cont(0.5) within group (order by total_time_ms) as median_time_ms
from public.tier_runs
where cleared_basic = true
group by tier;

-- View: leaderboard rows with a numeric rank column, so queries can ORDER BY
-- correctly at the database level instead of pulling an arbitrary slice and
-- sorting client-side (which silently drops top players once the table grows
-- past whatever LIMIT the client requested).
create or replace view public.ladder_leaderboard_ranked as
select *, tier_rank(highest_tier) as tier_rank_val
from public.ladder_leaderboard;

-- Row Level Security
alter table public.profiles enable row level security;
alter table public.player_progress enable row level security;
alter table public.ladder_leaderboard enable row level security;
alter table public.tier_runs enable row level security;

-- Anyone can read leaderboard/profiles (public rankings); writes go through the anon key
-- scoped to the caller's own row via auth_uid match, or unrestricted for guest inserts
-- handled entirely from the client with the user's own generated uuid.
create policy "public read profiles" on public.profiles for select using (true);
create policy "public read progress" on public.player_progress for select using (true);
create policy "public read ladder" on public.ladder_leaderboard for select using (true);
create policy "public read runs" on public.tier_runs for select using (true);

create policy "insert own profile" on public.profiles for insert with check (true);
create policy "update own profile" on public.profiles for update using (
  auth_uid = auth.uid() or auth_uid is null
);

create policy "upsert own progress" on public.player_progress for insert with check (true);
create policy "update own progress" on public.player_progress for update using (true);

create policy "upsert own ladder row" on public.ladder_leaderboard for insert with check (true);
create policy "update own ladder row" on public.ladder_leaderboard for update using (true);

create policy "insert own run" on public.tier_runs for insert with check (true);
