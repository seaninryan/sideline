# Eliminate us/them — neutralize editor, record, and parser to home/away (③.3 + ③.4)

**Date:** 2026-06-13
**Status:** Approved (brainstorm) — pending implementation plan
**Branch:** `eliminate-us-them` (④a) off `main` (v82). ④b branches off ④a.

## Context

The us/them → home/away conversion's final step. ① added a neutral home/away
model view; ② flipped viewer display; ③.1 added home/away **record fields**
(populated on save/backfill); ③.2 flipped the read-only consumers (public page,
infographic, OG, editor read-only display, name redaction) onto the home/away view.
What remains is **internal**: the editor's us/them edit-state + flows, the parser
adapter (A→us/them), the record's us/them fields + `homeAway` flag, and the whole
runtime venue-mapping layer that bridges us/them → home/away.

This sub-project removes all of it. The originally-separate ③.3 (symmetric editor)
and ③.4 (delete us/them) are **merged** here — the editor's edit-state *is* the
record shape, so they're one body of work — and the lineup-tab symmetry is folded
in. After it: `grep` for us/them across `lib`/`app`/`components` returns nothing
(modulo sample/team-template player data).

## The key insight: the venue-mapping layer collapses

Today the record stores `myTeam`/`opponent` + a `homeAway` flag, and a runtime
machinery maps "us/them" → "home/away": `recordHomeAway`, `sideToVenue`,
`venueSeries`, `venueItems`, the `usIsHome` locals. Once the record stores
**`homeTeam`/`awayTeam` directly** and the parser is **fed home = team A**, there is
nothing left to map:

- the `homeAway` flag is gone (no "my team" → nothing to be home *relative to*);
- `recordHomeAway` / `sideToVenue` / `venueSeries` / `venueItems` / `usIsHome` all
  **delete**;
- `buildModel` reads parser-home/away + record-home/away straight through (no remap);
- `matchRowView` likewise;
- `swapHomeAway` becomes a literal field swap.

So ④ is a net **simplification** (removes a layer), at the cost of a careful
one-time migration and touching nearly every module + the editor.

## Decisions (from brainstorm)

- **Merge ③.3 + ③.4** into this one sub-project; include lineup-tab symmetry.
- **Drop the `homeAway` flag entirely.** Home is always home.
- **Reconcile-from-teams migration:** existing records' home/away values are
  re-derived from the **linked teams** (`home_team_id`/`away_team_id`) — the durable
  source — falling back to the old us/them snapshot (oriented by the record's
  `homeAway`) for unlinked matches. This also retires the recurring
  squad/name snapshot-staleness.
- **Leave dead us/them keys** in the stored `data` jsonb (the *type* drops them, so
  no code reads them) — no destructive jsonb scrubbing.
- **Two PRs (Approach A):** ④a = typed core behind the full suite, with a throwaway
  editor shim so `MatchTracker` is untouched; ④b = the editor flip + lineup symmetry
  + delete the shim.

## End-state record (`lib/types.ts`)

`interface MatchRecord` keeps: `raw`, `matchDate`/`date`, `sport`, `nameDisplay`,
`label`, `notationV`, `homeTeamId`/`awayTeamId`, `legacyRaw?`, `savedAt?`, and the
home/away identity fields (already added in ③.1):
`homeTeam`, `awayTeam`, `colorHome`, `colorHome2`, `colorAway`, `colorAway2`,
`homeRoster`, `awayRoster`, `homeSquad`, `awaySquad`.

Removed: `myTeam`, `opponent`, `colorUs`, `colorUs2`, `colorThem`, `colorThem2`,
`usRoster`, `oppRoster`, `usSquad`, `oppSquad`, **`homeAway`**.

`interface Settings` and `interface ParsedMatch` go home/away too (see Parser).

## Parser (`lib/parser.ts`)

`parse-events.ts` (the A/B engine) is **unchanged** — it is already venue-neutral.
`parser.ts` (the adapter) flips:

- Feed **home → teamA, away → teamB**: `teamA = { name: homeTeam, roster: homeRoster }`,
  `teamB = { name: awayTeam, roster: awayRoster }`.
- `mapSide`: `A → "home"`, `B → "away"` (was `A → "us"`).
- Output field renames: `usScore`→`homeScore`, `themScore`→`awayScore` on scoring +
  series points; series `us`/`them` → `home`/`away`; `totals: { home: pe.totals.A,
  away: pe.totals.B }`; `maxLeadSide` → `"home"|"away"`; `header.opposition` → the
  away team name (or drop `header` in favour of explicit fields — pin in the plan).
- **Drop** the us-perspective `result` ("Win/Loss") — `model.outcome` is the neutral
  source already used by every viewer surface.
- `Settings` passed in becomes `{ homeTeam, awayTeam, homeRoster, awayRoster,
  scoringMode, label }` (no `myTeam`/`opponent`/`homeAway`).
- Legacy-notation migration (`isLegacy`/`migrateLegacyNotation`) keeps working: it
  lifts a header/roster from old notation — map its output into the home/away
  feed (teamA = the lifted "my team" as home by default, pinned in the plan; this
  only affects genuinely legacy raw text, covered by `migrate-notation.test.ts`).

## Consumers (read parser + record home/away directly)

- **`lib/model.ts`**: delete the `recordHomeAway`/`venueSeries`/`venueItems`/`usIsHome`
  bridge. Read `parsed` home/away (series/scorers/totals/timeline already home/away)
  + record home/away identity. `buildModel` emits the same home/away keys it emits
  today (`homeName`/`awayName`/`homeColors`/`awayColors`/`homeTotals`/`awayTotals`/
  `homeScorers`/`awayScorers`/`homeSeries`/`timelineHA`/`homeRoster`/`awayRoster`/
  `maxLeadVenue`/`outcome`/…), now sourced directly. `timelineHA`/`homeSeries`
  become plain aliases of the parser's already-home/away `timeline`/`series`.
- **`lib/match-list.ts`** (`matchRowView`): read record `homeTeam`/`awayTeam`/
  `colorHome`/…/`homeSquad`/`awaySquad` + parser home/away totals; `winner` via
  `matchOutcome(homePts, awayPts)`. Delete the `usIsHome` ladder.
- **`lib/lineup-badges.ts`**: collapse to home/away-only (remove the transitional
  us/them branch added in ③.2a).
- **`lib/home-away.ts`**: `matchOutcome` stays (neutral result). `sideToVenue`/
  `venueSeries`/`venueItems`/`recordHomeAway` delete (recordHomeAway is retained
  only as the ④a shim — see below — then deleted in ④b).
- **`lib/name-display.ts`**: already home/away (③.2a) — no change beyond confirming.
- **`lib/infographic.ts`**: already home/away (③.2a) — confirm it reads only the
  home/away model keys (it does).

## Migration (`lib/store.ts loadAll`, one-time, idempotent)

Guarded by `notationV: 3`. After the existing passes, add a pass over records with
`notationV !== 3`:

For each such record `r`:
1. Determine home/away identity, **preferring the linked teams**:
   - if `r.homeTeamId`/`r.awayTeamId` resolve against `teamStore` (needs `userId`):
     `homeTeam`/`homeRoster`/`colorHome*`/`homeSquad` ← the home team; same for away.
   - else (unlinked): derive from the us/them snapshot oriented by `r.homeAway`
     (i.e. the existing `recordHomeAway(r)` logic) — home = us-side iff
     `homeAway === "home"`.
2. Write a v3 record carrying **only** the home/away fields (+ the kept fields),
   `notationV: 3`. Old us/them keys are not copied forward (left dead in any prior
   jsonb; the new write omits them).
3. Idempotent (skips `notationV === 3`); resilient (per-record try/catch; one bad
   record doesn't abort the load). Runs after `linkUnlinkedMatches` so links exist
   first.

`store.set`: in ④a still accepts the editor's us/them payload and converts via the
retained `recordHomeAway` shim, writing canonical home/away. In ④b, accepts a
home/away payload directly; the shim is deleted.

`matchCols`: unchanged (it already derives `match_date`/`sport`/`name_display`/
`home_team_id`/`away_team_id`).

## ④a — typed core + editor shim

Everything above **except** `MatchTracker`. `MatchTracker` is **untouched** in ④a,
kept working by a throwaway shim:

- **`parseMatchLegacy(raw, { myTeam, opponent, usRoster, oppRoster, homeAway,
  scoringMode, label })`** (new, temporary, in `parser.ts` or a `parser-legacy.ts`):
  maps the editor's us/them inputs → home/away (home = us-side iff
  `homeAway === "home"`), calls the new `parseMatch`, then converts the home/away
  `ParsedMatch` back to a **us/them-shaped** `ParsedMatch` (side `home`→`us` etc.)
  so the editor's existing reads are unchanged. The editor calls `parseMatchLegacy`
  instead of `parseMatch` (a one-line import swap — the only ④a edit to
  `MatchTracker`).
- **`store.set`/`buildModel`** keep accepting the editor's us/them `recordPayload()`
  via the retained `recordHomeAway` helper (converts → home/away).
- Result: the public page, OG, share image, landing rows, and the editor's
  read-only display are all fully us/them-free and sourced from home/away; the
  editor's *internals* still think us/them but are bridged at these three seams.
- **Tests:** full suite updated to home/away; canonical `SAMPLE_RECORD` finals
  reproduce identically (Racoons 2-6 / Wildebeests 2-7, Rick 2-4 4 frees, Morty 0-1,
  leadChanges 1, timesLevel 3, maxLead 5) expressed home/away; new migration test.
- **APP_VERSION** bump.

## ④b — editor flip + lineup symmetry + delete shim

- `MatchTracker` state renamed us→home / them→away: `colorUs`→`colorHome`,
  `colorUs2`→`colorHome2`, `colorThem`→`colorAway`, `colorThem2`→`colorAway2`,
  `myTeam`→`homeTeam`, `opponent`→`awayTeam`, `usRoster`→`homeRoster`,
  `oppRoster`→`awayRoster`, `usSquad`→`homeSquad`, `oppSquad`→`awaySquad`.
- Game-mode / insert / live-entry flows keyed `"home"|"away"`
  (`pickGmTeam("home"/"away")`, `gmStage.team`, `addLive(..,team)`, `buildEventLine`,
  `onPitchSet`/`benchSet`, the insert `who` flow).
- Colour pickers keyed `home`/`home2`/`away`/`away2`.
- `recordPayload()` emits home/away; `doExport` + auto-save pass home/away.
- The editor parses via the **new `parseMatch`** (home/away) directly — delete the
  `parseMatchLegacy` call/import.
- **Notation block pills**: read parser home/away (`b.e.side === "home"`,
  `b.e.homeScore`).
- **Lineup tab symmetric:** render both pitches identically, **home-then-away**, from
  `homeRoster`/`awayRoster` (both editable: per-pitch `editLineup`, `tapPlayer`,
  `subPick`, `RosterPitch`); badges via the home/away `lineupBadges`.
- Delete the shim: `parseMatchLegacy`, the retained `recordHomeAway`, and any
  remaining venue-mapping import.
- **Verify:** `grep -rIn "colorUs\|colorThem\|usRoster\|oppRoster\|usSquad\|oppSquad\|myTeam\|\bopponent\b\|usScorers\|themScorers\|usIsHome\|recordHomeAway\|sideToVenue\|venueSeries\|venueItems\|homeAway" lib app components` returns nothing in code paths (sample/team-template player names + DB column `home_team_id` etc. excepted). `npm test` green; `tsc --noEmit` clean; **manual editor verification** (live entry, game mode, sub via lineup, colour edit, swap, share image) on a home and an away match.
- **APP_VERSION** bump.

## Testing

- **Behaviour parity is the bar:** the canonical `SAMPLE_RECORD` finals are unchanged
  in value, only re-expressed home/away. Update `test/model.test.ts`,
  `test/parse-events.test.ts`, `test/match-list.test.ts`, `test/migrate-notation.test.ts`,
  `test/score-card.test.ts`, `test/score-header.test.ts`, `test/team-link.test.ts`,
  `test/home-away.test.ts` (trim deleted helpers), `test/name-display.test.ts`,
  `test/lineup-badges.test.ts`, plus `lib/sample.ts` (`SAMPLE_RECORD` → home/away).
- **Migration test (new):** a v2 us/them record + matching linked teams → v3 home/away
  with reconciled squad/name/colours; an unlinked v2 record → v3 via the
  `homeAway`-oriented fallback; idempotent on a v3 record.
- ④b editor has no unit tests → `tsc --noEmit` (rest of app) + suite green + manual.

## Scope / YAGNI

- `parse-events.ts` engine unchanged (A/B already neutral).
- No new result concept (`matchOutcome` stays).
- Dead us/them jsonb keys left in place (not scrubbed).
- The migration is the highest-stakes piece (live data) — idempotent (v3 guard),
  reconciles from teams, safe fallback; unit-tested before it runs.

## Files touched

**④a:** `lib/parser.ts` (+`parseMatchLegacy` shim), `lib/types.ts`, `lib/model.ts`,
`lib/match-list.ts`, `lib/lineup-badges.ts`, `lib/home-away.ts` (trim),
`lib/store.ts` (migration; `set` shim), `lib/team-link.ts`, `lib/sample.ts`,
`components/MatchTracker.tsx` (import swap only), `lib/constants.ts`, and the test
files above (+ new migration test).

**④b:** `components/MatchTracker.tsx` (state/flow/lineup flip), `lib/parser.ts`
(delete `parseMatchLegacy`), `lib/home-away.ts` (delete `recordHomeAway`),
`lib/lineup-badges.ts` (drop us/them branch), `lib/store.ts` (`set` takes home/away),
`lib/constants.ts`.
