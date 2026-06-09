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
