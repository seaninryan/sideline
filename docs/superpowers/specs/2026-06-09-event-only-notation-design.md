# Event-Only Notation (Two-Team Parser) — Design

**Date:** 2026-06-09
**Status:** Approved (design)
**Sub-project:** ③c — final phase of ③ (Home/Away model). Follows ③a (teams) + ③b (two-team matches). **The highest-risk change in the project** (rewrites the parser + migrates all matches), done in one shot per the user's call.

## Context

After ③a/③b, teams are structured entities, matches link two teams, and both have rosters (your roster still lives in the notation; the opponent's is a snapshot). ③c finishes the model: the **roster leaves the notation entirely**, the notation becomes an **event-only timeline**, and events resolve against **both** teams' structured rosters so **both teams' scorers are tracked by name**. This rewrites `lib/parser.ts` and migrates existing matches.

The user has little data, can reconstruct it, and has no other users — so migration can be simple (non-destructive but not over-engineered).

## Goal

Replace the us/them, roster-in-notation parser with a **two-team, event-only** parser: each event is tagged to a team (stably, independent of venue) by resolving its "who" against both rosters; totals/series/scorers are produced symmetrically for both teams; existing matches are migrated.

## Non-goals

- No new match/teams schema (reuses ③a/③b: team links + roster snapshots). One match-record field is added (`legacyRaw`).
- No UI restructure beyond what the two-team scorers + both-team who-grid require (tabs/shell/game-mode-flow from ① /② stay).
- The infographic/OG result wording stays neutral as established (②); now it also shows both scorer sets.

## 1. Parser model + signature

`parseMatch(raw, settings)` becomes two-team aware. New settings carry **both rosters + team names**:

```ts
parseMatch(raw, {
  teamA: { name: string; roster: TeamRoster },   // stable side A (e.g. the owner's team)
  teamB: { name: string; roster: TeamRoster },   // stable side B (the opponent)
  scoringMode?, sport?,
})
```

- **Sides are stable (A/B = the two linked teams), not venue.** Home/away swap reorders *display* only; events never re-side. (The caller maps A/B → us/them or home/away for display.)
- The notation has **no roster block** — parsing starts straight into halves + events.
- Output generalises: `scorers` carry `side: "A" | "B"` (+ team name); `totals` becomes `{ A, B }`; `series` plots both. Back-compat shims (`us`/`them` aliases) are provided where the model/UI still expect them during the transition (the caller decides which side is "us"/home).

## 2. "Who" resolution (your priority order)

For each scoring/sub/card line, the "who" token resolves in order:

1. **Player name** — matched across **both** rosters (reusing the existing exact-beats-fuzzy `matchPlayer`, now scanning both). The matched player's team sets the side.
2. **`Team number`** — a token matching a team name (first-word/squashed, like today's opposition match) followed by a shirt number → that team, that player (name from its roster).
3. **`Team`** alone → that team, **team-level/unattributed** event (today's unattributed-scorer behaviour).

**Disambiguation:** a player-name match wins over a team-name match. If a bare name matches players on **both** teams, it's ambiguous → require a team qualifier (`Wildebeests Smith`); if still unresolved, the event counts for the inferable side if any, else emits a `warning` (as today for unattributable scores). Game mode always writes an unambiguous reference.

## 3. Totals + series from counted events (removes the fragile core)

Because every event is explicitly team-tagged, **totals and the running chart series are counted directly per team** — the **`written-score-is-truth` logic and the column-vote are removed**. This is the biggest simplification: the parser's most intricate, bug-prone section (≈ lines 218–290 today) goes away. A written running score on a line is now **optional display sugar** (ignored for attribution; may be retained in the timeline text). Goal-vs-point inference for live entry stays (keyword/`goal` word), but with explicit sides there's no column inference. `leadChanges`/`timesLevel`/`maxLead`/`htLine`/`goalDots` are recomputed from the per-team cumulative series.

## 4. Notation grammar (event-only)

- **Halves:** clock line (`HH:MM`) starts a half; bare-minute lines as today; `HT`/`FT` markers; `+N` added time — unchanged.
- **Scoring/event:** `min <who> [goal|free|'65|'45|own goal|yellow card|red card|corner] [optional-score]`, where `<who>` is resolved per §2.
- **Subs:** `min X for Y` — both resolved within the same team (the team inferred from X/Y).
- **Notes:** any non-matching line, as today (misses, water breaks, etc.).
- Examples: `12 Rick goal` · `34 Wildebeests 11 goal` · `40 Morty free` · `52 Wildebeests` (team point) · `61 Wildebeests 7 yellow card` · `70 corner` (team inferred? — a bare `corner` with no team is a **note** unless qualified; `70 Racoons corner` / `70 Wildebeests corner`).

## 5. Migration (one shot, non-destructive but simple)

A pure `migrateLegacyNotation(record, { usTeamName, oppTeamName })` → new record:
- Detect legacy format (has a roster block / uses `T`/`T11`).
- **Strip the roster block** (the roster now lives on the team snapshot — ③b's `oppRoster` + a new `usRoster` snapshot seeded from the stripped block).
- Rewrite opposition refs `T<n>` → `<oppTeamName> <n>`, and bare `T` → `<oppTeamName>`.
- Leave your players as names (they resolve against your roster).
- Preserve the original `raw` in **`legacyRaw`** (cheap insurance; not relied upon).

Applied as a **guarded one-time client-side backfill** on `loadAll` (transform + re-save each legacy match once; idempotent via a `migratedAt`/format marker). Matches not yet team-linked are linked from their inline names first (reusing ③b's link logic) so both rosters exist. Given the data situation, edge cases that don't transform cleanly are logged + left as `legacyRaw` for manual fix-up rather than blocking.

## 6. Game mode + Advanced

- `buildEventLine` emits the new grammar (player name when known, else `Team number`; team-level when "Unknown").
- The **who-grid now offers both teams' players** (tap team → that team's roster), so opposition events pick a named opponent player.
- Block-insert/edit forms resolve against both rosters; the team toggle picks which team's roster the who-grid shows.

## 7. Model / public page / infographic

- `buildModel` exposes **both** scorer sets + the per-team series.
- `PublicMatch` + the editor Details tab show **two scorer tables** (team A / team B); `ScoreChart` plots both sides (already two-series capable).
- `buildInfographicSVG`/`buildScoreCardSVG` show both scorer lists; result wording stays the neutral ② form.

## 8. Testing (parity-first)

- **Translate, don't discard:** every `parser.test.ts` case (~87) is re-expressed in the two-team grammar, preserving coverage of cards, corners, '65/'45, own goals, added time, subs, goal-vs-point inference, name disambiguation.
- The **canonical SAMPLE** is restated in the new model (event-only `raw` + two team rosters) and must still produce the same finals/result (e.g. Racoons 2-6, Wildebeests 2-7, Loss-for-Racoons, Rick 2-4 (4 frees), Morty 0-1, leadChanges/timesLevel/maxLead unchanged) — now also asserting the opponent's named scorers.
- New **`migrate` suite:** legacy `raw` (+ team names) → migrated record → parsed totals equal the legacy parse's totals (round-trip integrity).
- `model.test.ts`/`name-display.test.ts` updated for both-side scorers. `APP_VERSION` → v50.

## 9. Risk / mitigations

Highest-risk change in the project. Mitigations: (a) the parser gets **simpler** (column-vote/written-truth removed) — net less code to be wrong; (b) **explicit test parity** translation, not a rewrite-from-scratch of coverage; (c) **non-destructive migration** with `legacyRaw`, and the user can reconstruct data if needed; (d) ships behind the established per-task spec+quality review + a final integration review; (e) sides are stable, so the ②/③b display/swap logic is unaffected. Because this is one large spec, the implementation plan will sequence it so the **new parser + its tests land and go green before** the migration + UI-render changes build on top.
