# New-Match Wizard Polish (Team-Centric) — Design

**Date:** 2026-06-10
**Status:** Approved (design)
**Sub-project:** ④ of the 2026-06 restructure (follows ①②③a③b③c). Builds on the teams table (③a), two-team matches + `teamLinkPatch` (③b), and event-only structured rosters (③c).

## Context

The new-match wizard (`date → your team → opponent`) still mines *past matches* (`prevTeams`) for name/colour/sport quick-picks. A wizard-created match is **not** linked to any team record and has **no roster**, so the user must run the separate "Link teams" flow afterwards to get lineups. Meanwhile ③a gave us a real `teams` table (`teamStore`) with structured rosters, and ③b's `teamLinkPatch` already links a match to two teams and seeds both roster snapshots. ④ makes the wizard **team-centric**: pick (or create) real team records for both sides, link + seed rosters at creation, with type-ahead search and sport validation — and folds in the smaller polish asks (bigger date, grade placeholder, drop Skip, sport icons).

## Goal

A new match is **born linked to two real teams with both rosters seeded**, chosen via a type-ahead picker over the teams table, with sport derived from the teams and a mismatched sport/team pairing made structurally impossible.

## Team model: identity = (sport, name)

A team is identified by **(sport, name)**. `hurling/Spuds` and `football/Spuds` are two distinct, valid team records. A team always carries a sport.

- **No sport write-back to a team, ever** — a team can be in other matches; mutating its sport would corrupt those. To use a name under a different sport you get a *different* team record.
- **Find-or-create by (sport, name):** creating/selecting "Spuds" while the working sport is `football` reuses `football/Spuds` if it exists, else creates it — leaving any `hurling/Spuds` untouched.
- **DB uniqueness (migration, run once in Supabase):**
  ```sql
  create unique index if not exists teams_owner_sport_name_key
    on teams (owner, coalesce(sport, ''), lower(name));
  ```
  Code find-or-create is the primary path; the index is the guarantee that no duplicate `(sport, name)` team can exist.
- Existing ③a teams may have a null/empty `sport`. They still appear in the picker (generic icon); picking one with no sport leaves the working sport unset until a sport is chosen (which then find-or-creates the `(sport, name)` variant). `TeamRecord.sport` stays typed `sport?: string`; the wizard treats it as required at create time.

## Wizard flow

`Date → Your team → Opponent (+ home/away) → Create`. Same 3-step skeleton; the two team steps become pickers. The "Skip → blank match" path is dropped — the wizard always produces a linked match (a saved-team pick is one tap, so it stays fast). The standalone blank-match `doNew` path is unaffected (it remains the never-seeded safety net, but is no longer surfaced as "Skip").

### Step: Date
Bigger date + time inputs (the current `.nw-date` row is cramped). Default = now. Next →.

### Step: Your team — `<TeamPicker>`
- Shows **all** your saved teams (sport unset at this point), each as a big button with its **sport icon** + kit colours, most-recent first.
- A search box filters client-side as you type (type-ahead). No match → a **"Create '<name>'"** button.
- Picking a team sets the working **sport** (from that team) and your side `{id, name, colours, sport, roster}`.
- Grade/label stays a per-match field here (competition varies game to game), placeholder `e.g. U13A Championship`.

### Step: Opponent — `<TeamPicker>` (scoped to the working sport)
- Home/Away toggle (as today).
- The picker is **scoped to the working sport**: it only suggests / creates same-sport teams, so a mismatched pairing is structurally impossible. Each suggestion shows the (same) sport icon + colours.
- A small **sport toggle** (the `SPORTS` options, with icons) lets you change the working sport; doing so **re-resolves both already-picked sides** to their `(sport, name)` variant via find-or-create — never editing the original records. (e.g. picked `hurling/Spuds` then flip to football → the match uses `football/Spuds`, created if needed.)
- **Create** finishes (see below). A guard disables Create if a side is unresolved.

## Linking + roster seeding (`finishNew`)

On Create:
1. **Ensure both teams exist** as records via find-or-create by (sport, name) (`teamStore`), getting their ids + rosters. New teams are created with the working sport's roster template (`templateForSport`, blank names) and default kit colours (distinct us/them from the palette; editable later in the Teams editor / Lineup tab).
2. Build the match via ③b's **`teamLinkPatch(record, { usTeam, oppTeam, homeAway })`** — sets `myTeam`/`opponent`, `homeTeamId`/`awayTeamId`, kit colours, and **clones `usRoster`/`oppRoster`** from the team rosters.
3. Merge in `matchDate`, `label`, `sport` (the working sport), `notationV: 2`, empty event-only `raw`; `store.set`.
4. The post-create "Link teams" nudge (`linkNudged`) no longer fires for wizard matches (they're already linked).

`prevTeams` and the past-match quick-pick buttons are **retired** — the teams table is the source of suggestions now.

## Pure helpers (testable)

`lib/match-sport.ts`:
- `teamMatchKey(name: string, sport: string): string` — normalized identity for find-or-create matching (squashed lower-case name + sport). Used to dedupe against the loaded team list before hitting the DB.
- `pairingError(usSport?: string, oppSport?: string): string | null` — the Create guard: `null` when ok, else a message (e.g. "Both teams must play the same sport"). Rarely hit given the scoped opponent picker, but the final gate.

`teamStore` gains a `findOrCreate(userId, { name, sport, color1?, color2? }): Promise<TeamRecord>` that lists/matches by `teamMatchKey` then `set`s a new record (template roster) if absent.

## Component

`components/TeamPicker.tsx` (new, typed): props `{ teams: TeamRecord[]; sport?: string; onPick(team): void; onCreate(name): void }`. Renders most-recent team buttons (filtered to `sport` when set) + a search box (type-ahead) + a "Create '<query>'" affordance when no match. Pure-ish presentational; the wizard owns the team list (loaded via `teamStore.list(userId)` when the wizard opens) and the find-or-create on pick/create.

## Testing

- `lib/match-sport.ts` — unit tests: `teamMatchKey` (case/whitespace normalization, sport included so football/Spuds ≠ hurling/Spuds), `pairingError` (same → null; different → message; unset side → null until resolved).
- A team-search/filter helper (used by `TeamPicker`) — unit-tested (matches by name substring, scoped by sport).
- `teamLinkPatch` reuse is already covered by `test/team-link.test.ts`.
- `APP_VERSION` → v51.

## Non-goals

- No change to the match editor, game mode, parser, or public page beyond the wizard producing already-linked matches.
- No roster *editing* in the wizard (names are filled later via the Lineup tab / Teams editor, per ③c). New teams get template rosters with blank names.
- No team merge/rename tooling; no cross-sport "same club" grouping (a club fielding multiple sports is just multiple `(sport, name)` records).
- The standalone `doNew` blank-match path stays as-is (internal safety net), just no longer surfaced as "Skip".

## Risks / mitigations

- **Existing teams with no sport** (③a): handled — they show with a generic icon and require a sport choice before they constrain a pairing; find-or-create treats empty sport via the `coalesce(sport,'')` index.
- **Sparse teams table at first** (most past opponents aren't teams yet): acceptable — the create-on-type path makes the first match with each opponent mint its team; subsequent matches type-ahead to it. (Past-match-name mining is intentionally dropped.)
- **Monolith growth:** the picker is extracted as a typed component and sport logic as a pure helper, keeping new logic out of the `@ts-nocheck` `MatchTracker`.
- Ships behind the per-task spec + quality review + a final integration review (subagent-driven), like ①–③.
