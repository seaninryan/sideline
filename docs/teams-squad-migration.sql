-- Team squads + per-team public-feed visibility (run once in Supabase).
-- squad: part of team identity (sport, name, squad). listed: mirror of matches.listed.
alter table teams add column if not exists squad text not null default '';
alter table teams add column if not exists listed boolean not null default true;

-- Identity is now (owner, sport, name, squad). Swap the unique index.
-- (Safe: the old index already enforced (sport, name) uniqueness, so no dupes exist.)
drop index if exists teams_owner_sport_name_key;
create unique index if not exists teams_owner_sport_name_squad_key
  on teams (owner, coalesce(sport,''), lower(name), lower(squad));
