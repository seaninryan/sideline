-- Make matches.sport mandatory. Run ONCE in the Supabase SQL editor.
-- Pre-check (should return 0 after the manual sport backfill):
--   select count(*) from matches where sport is null;
-- If non-zero, set those rows' sport first, then run:
alter table matches alter column sport set not null;
-- (Teams table intentionally unchanged: blank-sport team identity is valid.)
