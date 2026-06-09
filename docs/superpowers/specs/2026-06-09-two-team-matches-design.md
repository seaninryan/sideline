# Two-Team Matches + Neutral Display — Design

**Date:** 2026-06-09
**Status:** Approved (design)
**Sub-project:** ③b — second phase of ③ (Home/Away model). Follows ③a (teams foundation, shipped). ③c (event-only notation) is last.

## Context

③a shipped reusable `teams` entities (table, editor, public `/t/[id]` pages with a Fixtures *placeholder*). ③b connects teams into matches: a match references a home + away team, the opponent's lineup is shown (a frozen snapshot), home/away can be swapped, and team pages list real fixtures — **while keeping today's us-centric scoring engine** (the parser rewrite is ③c). It also fixes match-list ordering to be by start time.

Locked transitional reality: until ③c, the **notation still owns one roster** (the "us"/notated side) and scores via `T`/roster names. ③b layers neutral *identity + display + opponent lineup + fixtures* on top, accepting that one side is still notation-driven.

## Goal

Link matches to team entities so the **opponent has a real identity + lineup**, home/away is **swappable**, **team pages list fixtures**, and all match lists order by **start time** — with no change to scoring.

## Non-goals (③b)

- No parser/scoring change (→ ③c). The notation still carries the us roster and `T`-based opposition scoring.
- **No new-match wizard rebuild** — that (team-picking + lineup-from-last-game) is ④. ③b uses one **"Link teams"** flow that serves new *and* legacy matches.
- No structured us-roster / event-only notation (→ ③c). The us lineup still comes from the notation.

## 1. Data model + migration

Matches gain two promoted columns referencing `teams`:

```sql
alter table matches add column if not exists home_team_id uuid;
alter table matches add column if not exists away_team_id uuid;
create index if not exists matches_home_team_idx on matches (home_team_id);
create index if not exists matches_away_team_idx on matches (away_team_id);
```

(Manual one-time migration, as with prior phases. No FK constraint — teams are deletable independently; a dangling id just yields no team page, handled gracefully.)

- The match `data` jsonb gains: `homeTeamId`, `awayTeamId` (the links, source of truth), and **`oppRoster`** — a frozen `TeamRoster` snapshot of the opponent at link time.
- `store.set` derives the promoted `home_team_id`/`away_team_id` columns from `data.homeTeamId`/`data.awayTeamId` (so the Fixtures query can filter/index on them), exactly as it already derives `match_date` etc.
- The notated/"us" side is still derived from the existing `homeAway` header flag (`us = home` iff `homeAway==="home"`). So `homeTeamId`/`awayTeamId` + `homeAway` fully determine which linked team is "us".
- **Rendering source is unchanged:** the match keeps its self-contained inline `myTeam`/opponent/colours (already rendered neutrally by ②'s `ScoreHeader`/rows). Teams are the *source at link time*, not a render-time dependency — so rendering a match never needs to fetch a team. Legacy (unlinked) matches render exactly as today.

## 2. "Link teams" flow (new + legacy matches)

A **"Link teams"** affordance on the match edit screen (a panel, like ShareSheet). It lets you pick **your team** and the **opponent** from your `/teams` (or create one inline via the ③a editor), and choose **home/away**. On confirm, a pure `applyTeamLinks(record, { usTeam, oppTeam, homeAway })` produces the match patch:

- sets `data.homeTeamId` / `data.awayTeamId` from the us/opp teams per `homeAway`;
- seeds the **notation roster block** from the us team's roster (so your lineup matches the team) — only when the notation has no roster yet, or on explicit "reseed", to avoid clobbering hand-entered lineups;
- copies the opponent team's roster into `data.oppRoster` (the frozen snapshot);
- refreshes `myTeam` + the four colours from the two teams (so identity/colours match).

**Legacy matches** reach this via **link-on-edit**: opening an unlinked match surfaces a gentle prompt ("Link this match to teams?") pre-filled from its existing names; dismissable (the match keeps working unlinked).

## 3. Both lineups

- **Your side:** renders from the notation roster (unchanged).
- **Opponent side:** renders from `data.oppRoster` (the frozen snapshot), shown on the Lineup tab + the public page as a second pitch/list. A small **"Re-sync from team"** action re-copies the linked opponent team's current roster into `oppRoster` (for when their squad changed). If a match is unlinked / has no `oppRoster`, the opponent lineup simply isn't shown (today's behaviour).

## 4. Home/Away swap

A swap control (the arrows) on the edit screen flips `homeAway` in the notation header (`v`↔`@`) **and** swaps `data.homeTeamId`↔`data.awayTeamId`. Display order follows automatically (`ScoreHeader` + `MatchRow` already order home-left/away-right by `homeAway`). Scores/notation/scorers are untouched — only venue + ordering change.

## 5. Team-page Fixtures

The `/t/[id]` Fixtures section (placeholder in ③a) now queries public matches where `home_team_id = teamId OR away_team_id = teamId`, ordered by **start time** desc, rendered as ①'s `MatchRow`s (linking to `/m/<code>`). RLS already allows public reads of `is_public=true` matches.

## 6. Match-list ordering by start time

Change all match lists to order by **`match_date` (start time) descending**, not `updated_at`:

- Landing **"Your matches"** (owner query) — order by `match_date` desc.
- Landing **"Recent public matches"** feed — order by `match_date` desc (a match played today ranks above one merely *edited* today). Pagination cursor switches to `match_date`.
- Team **Fixtures** (§5) — order by `match_date` desc.

The displayed row date uses the match's **start time** (`relativeDate(match_date)`) everywhere (the feed previously showed `updated_at`). Null/missing `match_date` sorts last.

## 7. Scope / boundaries / testing

- **Schema:** the two-column migration above (manual). `store.set` derives the columns.
- **Pure, tested seams:** `applyTeamLinks(record, {usTeam, oppTeam, homeAway})` → match patch (links + oppRoster snapshot + roster seed + identity); `swapHomeAway(record)` → patched record (flips homeAway + team ids). Unit-tested. The match-list ordering is a query change (build-verified) + the existing `relativeDate` (already tested).
- **No scoring/parser change** → all parser/model tests stand. `APP_VERSION` → v49.
- **Deferred:** new-match wizard team-picking + lineup-from-last-game (④); structured us-roster + event-only notation + uniform per-match snapshots for both sides (③c). The `oppRoster` snapshot is ③b's only roster-snapshot; ③c generalises it to both sides.

## 8. Risks / watch-items

- **Asymmetry is intentional + temporary:** us-from-notation, opponent-from-snapshot. It reads as a half-measure until ③c unifies them — keep the snapshot shape (`TeamRoster`) identical to the team roster so ③c can generalise without reshaping.
- **Reseed guard:** seeding the notation roster from the us team must not silently overwrite a hand-entered lineup — seed only when empty or on explicit reseed.
- **Dangling team ids:** a team deleted after linking leaves a `team_id` with no team — the match still renders (inline data) and its Fixtures link 404s gracefully; don't FK-constrain.
- **Feed ordering by `match_date`:** ensure `match_date` is populated (it's a derived promoted column already); the infinite-scroll cursor must use `match_date` consistently to avoid dupes/skips.
