-- Run once in the Supabase SQL editor (project ref in SETUP.md).
create table if not exists teams (
  id          uuid primary key default gen_random_uuid(),
  owner       uuid not null default auth.uid(),
  short_code  text unique,
  name        text not null,
  color1      text,
  color2      text,
  sport       text,
  roster      jsonb not null default '{"formation":[],"players":[]}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table teams enable row level security;
create policy teams_own_all on teams for all using (owner = auth.uid()) with check (owner = auth.uid());
create policy teams_public_read on teams for select using (true);

-- ③b: link matches to teams (run once).
alter table matches add column if not exists home_team_id uuid;
alter table matches add column if not exists away_team_id uuid;
create index if not exists matches_home_team_idx on matches (home_team_id);
create index if not exists matches_away_team_idx on matches (away_team_id);

-- ④ new-match wizard: enforce one team per (owner, sport, name).
-- Run the dup-check first; it must return zero rows:
--   select owner, coalesce(sport,'') s, lower(name) n, count(*) from teams
--   group by owner, coalesce(sport,''), lower(name) having count(*) > 1;
create unique index if not exists teams_owner_sport_name_key
  on teams (owner, coalesce(sport, ''), lower(name));

