-- Migration: rank overtake notifications ("Sarah passed you!")
-- Run this in the Supabase SQL editor AFTER schema.sql.

-- 1. Table: one row per overtake event, scoped to the person who got passed.
create table if not exists public.rank_overtakes (
  id bigint generated always as identity primary key,
  overtaken_user_id uuid not null references public.profiles(user_id) on delete cascade,
  overtaken_by_user_id uuid not null references public.profiles(user_id) on delete cascade,
  overtaken_by_username text not null,
  seen boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_rank_overtakes_overtaken_user
  on public.rank_overtakes(overtaken_user_id, seen);

-- 2. Trigger function: fires on ladder_leaderboard insert/update.
-- Squad = mutual invite relationship (same definition fetchSquad() uses:
-- people the mover invited, plus whoever invited the mover).
-- Only fires at the exact moment the mover's score crosses from
-- at-or-behind a squadmate's score to ahead of it -- not on every
-- subsequent lead-extending update -- so no duplicate spam rows.
create or replace function public.detect_rank_overtakes() returns trigger as $$
declare
  squadmate record;
  old_score integer;
begin
  old_score := coalesce(OLD.score, -1);

  -- Only relevant when score actually increased.
  if NEW.score <= old_score then
    return NEW;
  end if;

  for squadmate in
    select ll.user_id, ll.score
    from public.ladder_leaderboard ll
    where ll.user_id in (
      -- people the mover invited
      select p.user_id from public.profiles p where p.invited_by = NEW.user_id
      union
      -- whoever invited the mover
      select p.invited_by from public.profiles p
      where p.user_id = NEW.user_id and p.invited_by is not null
    )
    and ll.user_id <> NEW.user_id
  loop
    -- Only fire the moment the mover's new score crosses past this
    -- squadmate -- i.e. the mover's previous score was at or behind them,
    -- and the new score is now ahead.
    if old_score <= squadmate.score and NEW.score > squadmate.score then
      insert into public.rank_overtakes (
        overtaken_user_id, overtaken_by_user_id, overtaken_by_username
      ) values (
        squadmate.user_id, NEW.user_id, NEW.username
      );
    end if;
  end loop;

  return NEW;
end;
$$ language plpgsql;

drop trigger if exists trg_detect_rank_overtakes on public.ladder_leaderboard;
create trigger trg_detect_rank_overtakes
  after insert or update on public.ladder_leaderboard
  for each row execute function public.detect_rank_overtakes();

-- 3. RLS -- permissive, matching the existing pattern in schema.sql
-- (guest-mode writes go through the anon key with no service role).
alter table public.rank_overtakes enable row level security;

create policy "public read overtakes" on public.rank_overtakes for select using (true);
create policy "insert overtakes" on public.rank_overtakes for insert with check (true);
create policy "update own overtakes" on public.rank_overtakes for update using (true);
