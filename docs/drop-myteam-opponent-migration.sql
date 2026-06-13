-- ③.1: drop the vestigial promoted columns my_team/opponent.
-- Nothing SELECTs them; team identity lives in home_team_id/away_team_id + data jsonb
-- (data.myTeam / data.opponent remain the load-bearing record fields).
-- Run once in the Supabase SQL editor.
alter table matches drop column if exists my_team;
alter table matches drop column if exists opponent;
