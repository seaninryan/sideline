-- Teams public/private (v54). Run once in Supabase.
--
-- Adds an is_public flag and a name_display privacy setting to teams, and a
-- public-read RLS policy so non-owners can read a team only when it is public.
-- Sharing a match flips its two linked teams public (sticky); a team can also be
-- published / made private directly from its editor. Player names on a public
-- team page are redacted per name_display ('full' | 'initials' | 'none').

alter table teams add column if not exists is_public boolean not null default false;
alter table teams add column if not exists name_display text not null default 'full';

-- public read (keep the existing own_all owner policy alongside this)
drop policy if exists public_read_teams on teams;
create policy public_read_teams on teams for select using (is_public = true);
