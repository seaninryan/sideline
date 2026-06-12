# Sport-required + scoring-mode-from-sport cleanup

**Date:** 2026-06-12
**Status:** Approved (brainstorm) — pending implementation plan
**Branch context:** follows the admin-screen work; new branch off the current tip.

## Goal

Every match now has a sport set, so the scoring mode is fully determined by the
sport (`hurling/camogie/gaelic → gaa`, `soccer → goals`). Remove the now-dead
auto-detect / manual-scoring machinery ("Auto: GAA scoring" and friends), make
`sport` mandatory, and — because a team's identity is `(sport, name)` — keep a
match's sport and its linked teams' sport consistent by re-picking teams whenever
the sport changes in the editor.

## Decisions (from brainstorm)

- **Deepest cut:** mandatory sport + remove `autoMode`/stored `scoringMode`, derive
  mode solely from sport, AND strip the parser's `detectedMode` score-shape
  fallback (make `scoringMode` a required parser arg).
- **Fallback sport** (where none is derivable): `"soccer"`.
- **Sport edited in the editor → explicit team re-pick** (reuse the wizard's
  `<TeamPicker>` flow), not auto re-link and not read-only.
- **Invariant `match.sport == homeTeam.sport == awayTeam.sport` enforced in the
  app** (via the re-pick), not by a cross-table DB trigger.
- Teams table / `TeamRecord.sport` left as-is (blank-sport team identity is
  intentional in the existing `coalesce(sport,'')` unique index).
- Sequencing: this ships first; the paused Teams match-count + 0-match inline
  delete feature comes after.

## 1. `scoringModeForSport` — single source of mode-from-sport

In `lib/constants.ts`, beside `SPORTS`:

```ts
export function scoringModeForSport(sport?: string): "gaa" | "goals" {
  return (SPORTS[sport ?? ""]?.mode as "gaa" | "goals") ?? "goals";
}
```

The `?? "goals"` matches the soccer fallback. With clean data (every sport one of
the four keys) the fallback never triggers; it only guards an unrecognised/blank
sport string.

Replace the `sp ? sp.mode : (rec.autoMode ? undefined : rec.scoringMode)` ternaries
with `scoringModeForSport(rec.sport)`:
- `lib/model.ts:13`
- `lib/match-list.ts:44` and `:121`

Unit-tested in `test/sport-mode.test.ts` (each sport → its mode; unknown/blank →
`goals`).

## 2. Parser — required mode on the engine, no `detectedMode`

`parseMatch` is called for two different reasons, and they constrain where
`scoringMode` can be required:
- **Scoring callers** (`lib/model.ts`, `lib/match-list.ts`, `MatchTracker.tsx`)
  read totals/mode — they always pass a sport-derived mode (§1/§4).
- **Structure-only callers** (`lib/raw-edit.ts` ×3 — `parseMatch(raw, {})`; and
  `lib/store.ts:66` — for `.opp` only) never read mode. Forcing them to pass a
  meaningless `scoringMode` would be noise.

So make the mode **required on the low-level engine** (`parseEvents`, where
`detectedMode` lived) and **default it in the `parseMatch` adapter**, leaving the
adapter's settings ergonomic for structure-only callers.

`lib/parse-events.ts`:
- `EventSettings.scoringMode` becomes **required**: `scoringMode: "gaa" | "goals"`.
- Delete the `detectedMode` computation (the `const detectedMode = …` block) and
  the `detectedMode` field from the result interface + the returned object.
- `const mode = settings.scoringMode;` (no `|| detectedMode` fallback).

`lib/parser.ts`:
- `parseMatch`'s own `settings.scoringMode` stays **optional**; when calling the
  engine, default it: `parseEvents(events, { teamA, teamB, scoringMode: settings.scoringMode ?? "goals" })`.
  (The `?? "goals"` only ever applies to structure-only callers, which ignore mode;
  every scoring caller passes an explicit sport-derived mode.)
- Remove `detectedMode: pe.detectedMode` from the returned object.

`lib/types.ts`:
- Remove `detectedMode` from `interface ParsedMatch`.

Structure-only callers (`lib/raw-edit.ts`, `lib/store.ts`) need **no change** —
they keep calling `parseMatch` without a mode.

`test/parse-events.test.ts` (calls the engine `parseEvents` directly):
- Every `parseEvents(raw, { teamA, teamB })` call gains an explicit `scoringMode`
  (`"gaa"` for GAA-shaped fixtures, `"goals"` for soccer-shaped ones — match what
  each test implicitly detected before).
- Remove assertions on `detectedMode`. `mode` assertions stay (now equal to the
  passed `scoringMode`).
- `test/half-time.test.ts` and `test/event-line.test.ts`: if they call `parseEvents`
  directly, add `scoringMode`; if they go through `parseMatch`, no change needed.

(Nothing in `components/`/`app/` reads `detectedMode` — verified.)

## 3. Record model — sport required, scoring fields gone

`lib/types.ts`:
- `MatchRecord.sport?: string` → `sport: string` (required).
- Remove `MatchRecord.autoMode?` and `MatchRecord.scoringMode?`.

`lib/sample.ts`:
- `SAMPLE_RECORD` drops `scoringMode: "gaa"` and `autoMode: true`; keeps
  `sport: "hurling"`. (Finals unchanged: hurling → gaa, so the canonical
  Racoons 2-6 / Wildebeests 2-7 etc. still hold — re-run `npm test`.)

`lib/store.ts` `matchCols`:
- `sport: data.sport || "soccer"` (was `data.sport || null`) so the new NOT NULL
  constraint can never be violated by a stray blank.

## 4. Editor (`MatchTracker.tsx`)

- Remove `scoringMode`/`setScoringMode` (line 105) and `autoMode`/`setAutoMode`
  (line 106) state.
- `parseMatch` call (line 205): pass `scoringMode: scoringModeForSport(sport)`
  (import the helper). `effMode = parsed.mode` stays.
- `recordPayload` (line 257): remove `scoringMode: effMode, autoMode,` from the
  written record. `sport` stays. Update the two autosave dependency arrays
  (lines 266, 291) to drop `scoringMode`/`autoMode`/`effMode`-as-scoring (keep
  `sport`).
- `applyRecord` (line ~293, from the realtime task): drop
  `setScoringMode`/`setAutoMode` lines.
- `doNew` (line 347): create with `sport: "soccer"`; remove `scoringMode`/`autoMode`.
- `finishNew` (line ~569): `sportKey = nw.sport || nw.home.sport || nw.away.sport || "soccer"`;
  remove `scoringMode`/`autoMode` from `rec`; drop `setScoringMode(mode); setAutoMode(true);`.
  (`mode` local can go; nothing else uses it.)
- **Sport `<select>`** (lines 905–913): becomes a plain required picker —
  `value={sport}`, options = the four `SPORTS` entries only. Remove the `"auto"`
  option and the legacy explicit-scoring `<option>`. `onChange` → see §5.

## 5. Sport-edit re-pick flow (editor)

New editor state:
```ts
const [reTeam, setReTeam] = useState(null);
// null = inactive; else { sport, prevSport, home: TeamRecord|null, away: TeamRecord|null }
```

**Trigger.** The Sport `<select>` `onChange`:
```ts
const v = e.target.value;
if (v === sport) return;
setReTeam({ sport: v, prevSport: sport, home: null, away: null });
if (userUid) teamStore.list(userUid).then(setNwTeams).catch(() => {});
```
The `sport` state is **not** changed yet — it changes only when the re-pick
completes, so cancelling leaves the match untouched.

**Panel.** When `reTeam` is set, the details view renders a re-pick panel
(replacing the normal Sport/Opponent row) that mirrors the wizard's two team
steps, reusing `<TeamPicker>`:
- Step "home" (your team): `<TeamPicker teams={nwTeams} sport={reTeam.sport} side="us"
  onPick={reTeamPickHome} onCreate={reTeamCreateHome} />`
- Step "away" (opponent): once `reTeam.home` is set, the same with `side="them"`,
  `exclude={reTeam.home.id}`, `onPick`/`onCreate` for the away side.

Handlers (parallel to `nwPickHome`/`nwPickAway`/create, using `reTeam.sport`):
```ts
const reTeamPickHome = (t) => setReTeam({ ...reTeam, home: t });
const reTeamCreateHome = async (name, squad) => {
  const t = await teamStore.findOrCreate(userUid, { name, sport: reTeam.sport, squad, color1: "#f5c518", color2: "#1f7a4d" });
  if (t) { setNwTeams((xs) => [t, ...xs.filter((x) => x.id !== t.id)]); setReTeam({ ...reTeam, home: t }); }
};
// reTeamPickAway / reTeamCreateAway: mirror, color1/2 = #c0392b/#2c5fa8
```

**Commit.** A "Done" affordance is enabled once both `reTeam.home` and
`reTeam.away` are set (guard with `pairingError(home.sport, away.sport)` like the
wizard):
```ts
const reTeamApply = () => {
  const patch = teamLinkPatch(recordPayload(), { usTeam: reTeam.home, oppTeam: reTeam.away, homeAway: homeAway || "home" });
  setSport(reTeam.sport);
  setMyTeam(patch.myTeam); setOpponent(patch.opponent);
  setHomeTeamId(patch.homeTeamId); setAwayTeamId(patch.awayTeamId);
  setUsRoster(patch.usRoster); setOppRoster(patch.oppRoster);
  setUsSquad(patch.usSquad || ""); setOppSquad(patch.oppSquad || "");
  setColorUs(patch.colorUs); setColorUs2(patch.colorUs2); setColorThem(patch.colorThem); setColorThem2(patch.colorThem2);
  setReTeam(null);
};
```
Note: `teamLinkPatch` (not `linkExistingMatchPatch`) is correct here — an explicit
sport change SHOULD adopt the new teams' names/colours/rosters. It preserves an
existing `usRoster` only when present; on a sport change the user is deliberately
re-teaming, so seeding from the new teams is the intended behaviour. (If preserving
the old lineup across a sport change is ever wanted, that's a future tweak.)

**Cancel.** A "Cancel" button: `setReTeam(null)` — `sport` was never changed, so the
select snaps back to the original value on re-render.

**Invariant.** Because `sport` only changes via `reTeamApply`, which sets it from
`reTeam.sport` and links `reTeam.home`/`reTeam.away` (both found/created at that
sport), `match.sport == homeTeam.sport == awayTeam.sport` always holds.

**DRY note.** The wizard (`nw*`) and re-pick (`reTeam*`) share the actual UI
(`<TeamPicker>`) and the data layer (`teamStore.findOrCreate`, `teamLinkPatch`,
`pairingError`); only the thin pick/create/commit orchestration is duplicated.
A future refactor could extract a shared `<TeamSteps>`, but that is out of scope.

## 6. DB migration (`docs/sport-required-migration.sql`, run once)

```sql
-- Pre-check (should return 0 after the manual sport backfill):
--   select count(*) from matches where sport is null;
-- If non-zero, set those rows' sport before continuing.
alter table matches alter column sport set not null;
```
(Teams table unchanged.)

## Testing

- `test/sport-mode.test.ts` — `scoringModeForSport` (each sport → mode; unknown/blank → `goals`).
- `test/parse-events.test.ts` — every call passes `scoringMode`; `detectedMode` assertions removed; `mode` assertions retained.
- `test/model.test.ts` — `SAMPLE_RECORD` finals unchanged (hurling → gaa); the record no longer carries `scoringMode`/`autoMode`.
- `test/match-list.test.ts` — still derives mode correctly from sport (now via the helper).
- The re-pick flow is editor UI (in `// @ts-nocheck` `MatchTracker`); verified by build + manual: change a match's sport → re-pick panel → pick/create teams → score renders in the new mode, links updated; Cancel leaves sport+teams unchanged.

## Scope / YAGNI

- No cross-table DB trigger; the invariant is maintained by the re-pick flow.
- Teams table and `TeamRecord.sport` untouched.
- Stored `scoringMode`/`autoMode` left in old rows' jsonb (ignored, not read) —
  no data migration needed for them.
- No shared `<TeamSteps>` extraction (future).

## Files touched

**New:** `docs/sport-required-migration.sql`, `test/sport-mode.test.ts`.

**Changed:** `lib/constants.ts` (+`scoringModeForSport`, bump `APP_VERSION`),
`lib/parse-events.ts` (required mode, drop detectedMode), `lib/parser.ts`,
`lib/types.ts` (sport required; drop autoMode/scoringMode; drop ParsedMatch.detectedMode),
`lib/model.ts`, `lib/match-list.ts`, `lib/store.ts` (matchCols guard),
`lib/sample.ts`, `components/MatchTracker.tsx` (state/select/recordPayload/doNew/
finishNew/applyRecord + re-pick flow), `test/parse-events.test.ts`,
`test/model.test.ts`/`test/match-list.test.ts` if they reference the dropped fields.
