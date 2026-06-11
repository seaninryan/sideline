# Team squads, duplication & unified privacy — design

**Date:** 2026-06-11
**Status:** Approved (ready for implementation plan)
**Builds on:** the teams subsystem (`teams` table, `team-store`, `TeamPicker`, `TeamEditor`, `TeamsList`, `LinkTeams`, `app/t/[id]`) and the v65 matches `listed` column.

## Problem / intent

1. The v65 "listed / hidden" button in `ShareSheet` isn't intuitive.
2. The same public-feed-visibility concept should apply to **teams**, not just matches.
3. A club fields multiple squads under one name — "Racoons U11 Boys", "Racoons Senior Men", "Racoons Ladies". Teams need a **squad label** that is part of the team's identity, so these are distinct teams.
4. The squad label should appear as a **sub-line** wherever a team is shown.
5. At season's end a user wants to **duplicate** a team (roster + colours intact) and relabel the squad (e.g. U11 → U12) without re-entering the panel.

## Decisions (locked)

- **Squad is part of team identity.** Identity becomes **(sport, name, squad)**; `Racoons/U11 Boys` and `Racoons/Senior Men` are separate teams. Squad is **optional** (blank = a plain club team, shown with no sub-line).
- **One 3-way privacy control** — **Private / Unlisted / Listed** — replaces the publish button + the v65 listed toggle, used identically by matches and teams. Maps to columns:
  - Private → `is_public = false`
  - Unlisted → `is_public = true, listed = false` (anyone with the link)
  - Listed → `is_public = true, listed = true` (also in the public feed)
- **Duplicate** copies roster + colours + sport + squad, sets **`name = "<name> (2)"`** to make the identity unique immediately, and starts **Private**. No smart age-grade bump; the user edits name/squad afterward.
- **Collision-safe saves:** any team save/edit/find-or-create that would land on an existing `(sport, name, squad)` appends ` (2)` (repeating if needed) and shows a small "renamed to avoid a clash" toast, instead of hard-failing. So `Racoons (2) (2)` is possible and self-healing.

## Data model (one Supabase migration)

```sql
-- squad label, part of team identity
alter table teams add column if not exists squad text not null default '';
-- public-feed visibility for teams (mirror of matches.listed)
alter table teams add column if not exists listed boolean not null default true;
-- identity is now (owner, sport, name, squad): swap the unique index
drop index if exists teams_owner_sport_name_key;
create unique index if not exists teams_owner_sport_name_squad_key
  on teams (owner, coalesce(sport,''), lower(name), lower(squad));
```

(Run once in Supabase, as with prior migrations. Check for pre-existing duplicates before the index swap — there should be none since the old index already enforced `(sport, name)` uniqueness.)

- `TeamRecord` gains `squad: string` and `listed?: boolean`.
- **Match snapshot:** the match record gains `usSquad` / `oppSquad` (strings), seeded by `teamLinkPatch` alongside the roster snapshots, so every match surface renders the sub-line without a live team lookup. `store.set` does not derive these (snapshot-at-link, like rosters).

## Phase 1 — unified 3-way privacy control

- New shared **`<PrivacyControl>`** component: a 3-segment selector (Private / Unlisted / Listed) plus, when not Private, the link + Copy row and the Names (`name_display`) dropdown. Pure mapping helper (`privacyLevel(is_public, listed)` ⇄ `levelToColumns(level)`) lives in a tested lib module (`lib/privacy.ts`).
- **`ShareSheet`** (matches): replace the publish/unshare buttons + v65 listed toggle with `<PrivacyControl>`. Keeps short-code minting on first publish, name-display sync to linked teams.
- **`TeamEditor`** (teams): replace publish/unpublish with `<PrivacyControl>`. `team-store` gains `setListed(id, bool)`; the public **teams** feed query in `TeamsList` gains `.eq("listed", true)` (mirror of the matches feed).

## Phase 2 — squad label on teams

- `TeamEditor`: a **Squad** field beside Name (free text, optional). Saving routes through the collision-safe path.
- `TeamPicker` (new-match wizard): the "Create '<name>'" step lets you set **name + squad**; the type-ahead shows `Name · Squad`. `teamMatchKey`, `findOrCreate`, `filterTeams` (`lib/match-sport.ts`) gain a `squad` argument and key on `(sport, name, squad)`.

## Phase 3 — duplicate a team

- A **Duplicate** action on each team (TeamsList row menu + a button in TeamEditor): copies roster + colours + sport + squad, sets `name = "<name> (2)"`, mints a new private team. Does not touch matches. Routes through the collision-safe save (so a second duplicate yields `… (2) (2)`).

## Phase 4 — squad sub-line everywhere

Render `name` with `squad` as a small sub-line in:
- `TeamsList` rows, `TeamPicker`, `LinkTeams` picker
- the public team page (`app/t/[id]` / its renderer)
- `MatchRow` (Landing) — via `matchRowView` (gains `usSquad`/`oppSquad`)
- the editor `ScoreHeader` and the public match page (`PublicMatch`)
- the share-image poster (`buildInfographicSVG`, under each team name in the header) and — if it fits — the OG score card.

Pure seams (`matchRowView`, score-header builders, `privacy.ts`, `match-sport.ts`) get unit tests; the canonical SAMPLE finals must still hold.

## Out of scope

- No migration of existing matches' display names (they keep `myTeam`/`opponent`; squad sub-lines come from the new snapshot fields, blank for legacy matches until re-linked).
- The broader "eliminate us/them → home/away" rework remains deferred.
