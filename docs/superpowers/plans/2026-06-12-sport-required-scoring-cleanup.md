# Sport-required + Scoring-from-Sport Cleanup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `sport` mandatory and derive scoring mode solely from it — removing the `autoMode`/stored-`scoringMode`/`detectedMode` auto-detect machinery — and keep a match's sport consistent with its linked teams by re-picking teams whenever the sport changes in the editor.

**Architecture:** A pure `scoringModeForSport` helper becomes the single mode source. The low-level `parseEvents` engine gets a required `scoringMode` (the `parseMatch` adapter defaults it so structure-only callers are untouched), and `detectedMode` is deleted. The editor drops its scoring-mode state, turns the Sport control into a required 4-sport picker, and — because team identity is `(sport, name)` — a sport change opens an inline team re-pick (reusing the wizard's `<TeamPicker>` + `teamStore.findOrCreate` + `teamLinkPatch`).

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase, Vitest. Node 20 (`nvm use 20` before every npm command — the default shell node is v14).

**Source spec:** `docs/superpowers/specs/2026-06-12-sport-required-scoring-cleanup-design.md`
**Branch:** `sport-cleanup` (already checked out; stacked on the admin-screen work).

---

## File Structure

**New:** `lib` gains no new file (helper lives in `constants.ts`); `test/sport-mode.test.ts`; `docs/sport-required-migration.sql`.

**Modified:** `lib/constants.ts` (+helper, version), `lib/parse-events.ts` (required mode, drop detectedMode), `lib/parser.ts` (default mode, drop detectedMode from return), `lib/model.ts` + `lib/match-list.ts` (use helper), `lib/types.ts` (MatchRecord.sport required; drop autoMode/scoringMode), `lib/sample.ts`, `lib/store.ts` (matchCols guard), `components/MatchTracker.tsx` (state/picker/recordPayload + re-pick flow), `test/parse-events.test.ts` (+ `test/half-time.test.ts`, `test/event-line.test.ts` if they call `parseEvents` directly).

Tasks are ordered so `npm test` + `npm run build` pass at **every commit**. Baseline before this plan: **294 tests passing**.

---

## Task 1: `scoringModeForSport` helper

**Files:**
- Modify: `lib/constants.ts`
- Test: `test/sport-mode.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/sport-mode.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { scoringModeForSport } from "@/lib/constants";

describe("scoringModeForSport", () => {
  it("GAA sports → gaa", () => {
    expect(scoringModeForSport("hurling")).toBe("gaa");
    expect(scoringModeForSport("camogie")).toBe("gaa");
    expect(scoringModeForSport("gaelic")).toBe("gaa");
  });
  it("soccer → goals", () => {
    expect(scoringModeForSport("soccer")).toBe("goals");
  });
  it("unknown or blank → goals (soccer fallback)", () => {
    expect(scoringModeForSport("")).toBe("goals");
    expect(scoringModeForSport(undefined)).toBe("goals");
    expect(scoringModeForSport("quidditch")).toBe("goals");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use 20; npx vitest run test/sport-mode.test.ts`
Expected: FAIL — `scoringModeForSport` is not exported.

- [ ] **Step 3: Implement in `lib/constants.ts`**

Directly after the `SPORTS` object, add:

```ts
// Scoring mode is fully determined by sport. Unknown/blank → "goals" (soccer-family default).
export function scoringModeForSport(sport?: string): "gaa" | "goals" {
  return (SPORTS[sport ?? ""]?.mode as "gaa" | "goals") ?? "goals";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/sport-mode.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/constants.ts test/sport-mode.test.ts
git commit -m "feat(sport): scoringModeForSport helper (soccer-family default)"
```

---

## Task 2: Parser — required engine mode, drop `detectedMode`

**Files:**
- Modify: `lib/parse-events.ts`, `lib/parser.ts`
- Test: `test/parse-events.test.ts` (and `test/half-time.test.ts`, `test/event-line.test.ts` if they call `parseEvents` directly)

Do the test edits and the implementation together (the engine signature changes), then run green.

- [ ] **Step 1: Update the engine + adapter**

In `lib/parse-events.ts`:

Make the setting required (line ~50):
```ts
export interface EventSettings { teamA: TeamArg; teamB: TeamArg; scoringMode: "gaa" | "goals" }
```

Remove `detectedMode` from the result interface (line ~55) — delete this line from `interface ParsedEvents`:
```ts
  detectedMode: "gaa" | "goals";
```

Replace the `detectedMode` computation block (lines ~100–115, the comment + `let pairLines…` loop + `const detectedMode = …` + `const mode = …`) with just:
```ts
  const mode = settings.scoringMode;
```
(Delete the whole `pairLines`/`soloHyphens` loop and the `detectedMode` ternary — they were only feeding `detectedMode`.)

In the return statement (line ~341), remove `detectedMode,`:
```ts
  return { mode, totals, result, scoring, notes, halfMarks, series, goalDots, chartMarkers, scorers: Object.values(scorers), leadChanges, timesLevel, maxLead, maxLeadSide, htLine, warnings };
```

In `lib/parser.ts`:

Default the mode when calling the engine (line ~23):
```ts
  const pe = parseEvents(events, { teamA, teamB, scoringMode: settings.scoringMode ?? "goals" });
```

Remove `detectedMode: pe.detectedMode,` from the returned object (line ~44) — change:
```ts
    warnings: pe.warnings, mode: pe.mode, detectedMode: pe.detectedMode,
```
to:
```ts
    warnings: pe.warnings, mode: pe.mode,
```
(`ParsedMatch` in `lib/types.ts` never declared `detectedMode`, so no type change is needed there. `Settings.scoringMode` stays optional.)

- [ ] **Step 2: Update the tests that call the engine directly**

`parseEvents` now requires `scoringMode`. In `test/parse-events.test.ts`:
- Find every call: `grep -n "parseEvents(" test/parse-events.test.ts`.
- Add `scoringMode` to each settings object: use `"gaa"` for GAA-shaped fixtures (scores like `1-3`, points) and `"goals"` for soccer-shaped ones. Concretely, a call like
  `parseEvents(raw, { teamA, teamB })` becomes `parseEvents(raw, { teamA, teamB, scoringMode: "gaa" })`
  (pick `"goals"` instead where the test is asserting goals-only behaviour — i.e. the tests that previously asserted `detectedMode === "goals"` or a goals-mode total).
- Delete every assertion referencing `detectedMode` (e.g. `expect(r.detectedMode).toBe(...)`). Assertions on `mode` stay — set the matching `scoringMode` so they still hold.
- Repeat the same `grep -n "parseEvents("` check in `test/half-time.test.ts` and `test/event-line.test.ts`; add `scoringMode: "gaa"` to any direct `parseEvents` calls there. (If a file only calls `parseMatch`, leave it — `parseMatch` still defaults the mode.)

- [ ] **Step 3: Run the parser tests**

Run: `nvm use 20; npx vitest run test/parse-events.test.ts test/half-time.test.ts test/event-line.test.ts`
Expected: PASS. If a `mode` assertion fails, the `scoringMode` you passed for that fixture doesn't match what it used to detect — flip it to the other mode.

- [ ] **Step 4: Run the full suite**

Run: `npm test 2>&1 | tail -5`
Expected: all passing (`model.test`/`match-list.test` still pass — `parseMatch` defaults the mode for now; the sport-derived wiring lands in Task 3).

- [ ] **Step 5: Commit**

```bash
git add lib/parse-events.ts lib/parser.ts test/parse-events.test.ts test/half-time.test.ts test/event-line.test.ts
git commit -m "refactor(parser): require scoringMode on engine, drop detectedMode score-shape guess"
```

---

## Task 3: Derive mode from sport in `model.ts` + `match-list.ts`

**Files:**
- Modify: `lib/model.ts`, `lib/match-list.ts`

- [ ] **Step 1: Update `lib/model.ts`**

Add the import (top of file): `import { scoringModeForSport } from "@/lib/constants";` (if `SPORTS` is already imported from constants, add `scoringModeForSport` to that import).

Replace the `scoringMode` derivation (line ~13) — change:
```ts
    scoringMode: (sp ? sp.mode : (r.autoMode ? undefined : r.scoringMode)) as "gaa" | "goals" | undefined,
```
to:
```ts
    scoringMode: scoringModeForSport(r.sport),
```
If `sp` (the `SPORTS[...]` lookup) is now unused elsewhere in the function, remove its declaration.

- [ ] **Step 2: Update `lib/match-list.ts`**

Add `scoringModeForSport` to the `@/lib/constants` import.

At both line ~44 and line ~121, replace:
```ts
  const scoringMode = sp ? (sp.mode as "gaa" | "goals") : (rec.autoMode ? undefined : rec.scoringMode);
```
with:
```ts
  const scoringMode = scoringModeForSport(rec.sport);
```
Remove now-unused `sp` declarations if they aren't used for anything else (e.g. sport emoji) in that function — check each; keep `sp` if it's still referenced.

- [ ] **Step 3: Run tests**

Run: `nvm use 20; npm test 2>&1 | tail -5`
Expected: all passing. `model.test`'s `SAMPLE_RECORD` finals are unchanged (hurling → gaa → Racoons 2-6, Wildebeests 2-7, etc.). `match-list.test` still derives the right mode (now from sport).

- [ ] **Step 4: Commit**

```bash
git add lib/model.ts lib/match-list.ts
git commit -m "refactor(sport): derive scoring mode from sport in model + match-list"
```

---

## Task 4: Types, sample, and store guard

**Files:**
- Modify: `lib/types.ts`, `lib/sample.ts`, `lib/store.ts`

- [ ] **Step 1: Make `sport` required, drop the scoring fields (`lib/types.ts`)**

In `interface MatchRecord`:
- Change `sport?: string;` → `sport: string;`
- Delete the lines `autoMode?: boolean;` and `scoringMode?: "gaa" | "goals";`.

Leave `interface Settings` untouched (its `scoringMode?` and `sport?` stay optional — `parseMatch` callers rely on that).

- [ ] **Step 2: Clean `SAMPLE_RECORD` (`lib/sample.ts`)**

Find the line (~44): `sport: "hurling", scoringMode: "gaa", autoMode: true,` and change it to:
```ts
  sport: "hurling",
```

- [ ] **Step 3: Non-null guard in `store.ts` `matchCols`**

In `lib/store.ts`, in `matchCols`, change:
```ts
    sport: data.sport || null,
```
to:
```ts
    sport: data.sport || "soccer",
```

- [ ] **Step 4: Run tests + typecheck**

Run: `nvm use 20; npm test 2>&1 | tail -5` → all passing (`SAMPLE_RECORD` finals unchanged).
Run: `npx tsc --noEmit` → no NEW errors. (`MatchTracker.tsx` is `// @ts-nocheck`; it still writes `scoringMode`/`autoMode` until Task 5 — harmless extra jsonb keys. No *typed* file reads `MatchRecord.scoringMode`/`.autoMode` anymore after Task 3 — confirm with `grep -rn "\.autoMode\|\.scoringMode" lib app | grep -v "Settings\|node_modules"`.)

- [ ] **Step 5: Commit**

```bash
git add lib/types.ts lib/sample.ts lib/store.ts
git commit -m "refactor(sport): MatchRecord.sport required; drop autoMode/scoringMode; store non-null sport guard"
```

---

## Task 5: Editor — remove scoring state, required 4-sport picker

**Files:**
- Modify: `components/MatchTracker.tsx` (`// @ts-nocheck` — verify via `npm test` + `npm run build` + manual)

- [ ] **Step 1: Remove the scoring-mode state**

Delete these two state lines (~105–106):
```tsx
  const [scoringMode, setScoringMode] = useState(SAMPLE_RECORD.scoringMode || "gaa");
  const [autoMode, setAutoMode] = useState(SAMPLE_RECORD.autoMode !== undefined ? SAMPLE_RECORD.autoMode : true);
```

- [ ] **Step 2: Feed the parser the sport-derived mode**

Add `scoringModeForSport` to the `@/lib/constants` import. Change the `parseMatch` memo (line ~205) — replace `scoringMode: SPORTS[sport] ? SPORTS[sport].mode : (autoMode ? undefined : scoringMode)` with `scoringMode: scoringModeForSport(sport)`, and update the dependency array to drop `scoringMode, autoMode` (keep `sport`):
```tsx
  const parsed = useMemo(() => parseMatch(raw, { myTeam, scoringMode: scoringModeForSport(sport), label, homeAway, opponent, usRoster, oppRoster }), [raw, myTeam, sport, label, homeAway, opponent, usRoster, oppRoster]);
```
`const effMode = parsed.mode;` (line ~207) stays as-is.

- [ ] **Step 3: Stop writing the dropped fields**

In `recordPayload` (line ~257) remove `scoringMode: effMode, autoMode,` (keep everything else). Then update the two autosave `useEffect` dependency arrays (lines ~266 and ~291) to remove `effMode, autoMode` (and any standalone `scoringMode`) — keep `sport` and the rest.

In `applyRecord` (line ~293, added in the realtime task) delete the two lines:
```tsx
    setScoringMode(d.scoringMode || "gaa");
    setAutoMode(d.autoMode !== undefined ? d.autoMode : true);
```

- [ ] **Step 4: Fix `doNew` and `finishNew`**

`doNew` (line ~347): in the `store.set(id, { … })` record literal, remove `scoringMode: "gaa", autoMode: true,` and add `sport: "soccer",` (so a blank-template match has a real sport).

`finishNew` (line ~569): change the fallback to soccer and drop the scoring fields:
- `const sportKey = nw.sport || nw.home.sport || nw.away.sport || "soccer";`
- delete `const mode = SPORTS[sportKey] ? SPORTS[sportKey].mode : "gaa";` (no longer used).
- in the `rec` literal, remove `scoringMode: mode, autoMode: true,`; change `sport: sportKey || undefined,` → `sport: sportKey,`.
- delete the line `setSport(sportKey); setScoringMode(mode); setAutoMode(true);` → replace with `setSport(sportKey);`.

- [ ] **Step 5: Sport `<select>` → required 4-sport picker**

Replace the whole Sport `<label>…</label>` block (lines ~905–914) with:
```tsx
        <label>Sport
          <select className="mt-sel" style={{ color: "#222", background: "#fffdf6", borderColor: "#d8cfb8" }}
            value={sport}
            onChange={(e) => setSport(e.target.value)}>
            {Object.entries(SPORTS).map(([k, s]) => <option key={k} value={k}>{s.emoji} {s.label}</option>)}
          </select>
        </label>
```
(Direct `setSport` for now; Task 6 replaces this `onChange` with the re-pick trigger. No "Auto" or legacy-scoring options.)

- [ ] **Step 6: Verify**

Run: `nvm use 20; npm test 2>&1 | tail -5` → all passing.
Run: `npm run build 2>&1 | tail -6` → success.
Run: `grep -nE "autoMode|scoringMode|\"auto\"|Auto:" components/MatchTracker.tsx` → expect no matches.
Manual (dev server): open a match → Details → Sport shows the four sports only (no "Auto"); the score renders in the sport's mode; auto-save still works.

- [ ] **Step 7: Commit**

```bash
git add components/MatchTracker.tsx
git commit -m "feat(editor): scoring mode from sport; required 4-sport picker; remove auto/manual scoring"
```

---

## Task 6: Editor — sport-edit team re-pick flow

**Files:**
- Modify: `components/MatchTracker.tsx`

Reuses the wizard's building blocks: `<TeamPicker>` (already imported), `nwTeams` state, `teamStore.findOrCreate`, `teamLinkPatch`, `pairingError` (already imported).

- [ ] **Step 1: Add re-pick state**

Near the wizard state (the `const [nw, setNw] = useState(null);` / `const [nwTeams, setNwTeams] = useState([]);` lines, ~188–190) add:
```tsx
  const [reTeam, setReTeam] = useState(null); // null | { sport, prevSport, home: TeamRecord|null, away: TeamRecord|null }
```

- [ ] **Step 2: Add the handlers**

Near `nwPickHome`/`nwCreateHome` (~552), add the parallel re-pick handlers:
```tsx
  const reTeamPickHome = (t) => setReTeam({ ...reTeam, home: t });
  const reTeamCreateHome = async (name, squad) => {
    if (!userUid) return;
    const t = await teamStore.findOrCreate(userUid, { name, sport: reTeam.sport, squad, color1: "#f5c518", color2: "#1f7a4d" });
    if (t) { setNwTeams((xs) => [t, ...xs.filter((x) => x.id !== t.id)]); setReTeam({ ...reTeam, home: t }); }
  };
  const reTeamPickAway = (t) => setReTeam({ ...reTeam, away: t });
  const reTeamCreateAway = async (name, squad) => {
    if (!userUid) return;
    const t = await teamStore.findOrCreate(userUid, { name, sport: reTeam.sport, squad, color1: "#c0392b", color2: "#2c5fa8" });
    if (t) { setNwTeams((xs) => [t, ...xs.filter((x) => x.id !== t.id)]); setReTeam({ ...reTeam, away: t }); }
  };
  const reTeamApply = () => {
    if (!reTeam.home || !reTeam.away || pairingError(reTeam.home.sport, reTeam.away.sport)) return;
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

- [ ] **Step 3: Sport `<select>` onChange → open re-pick**

Change the Sport `<select>` `onChange` (from Task 5) to:
```tsx
            onChange={(e) => {
              const v = e.target.value;
              if (v === sport) return;
              setReTeam({ sport: v, prevSport: sport, home: null, away: null });
              if (userUid) teamStore.list(userUid).then(setNwTeams).catch(() => {});
            }}
```
(The select still shows `value={sport}`; because `sport` isn't changed until `reTeamApply`, cancelling snaps it back.)

- [ ] **Step 4: Render the re-pick panel**

Immediately after the Sport `<label>…</label>` block, add the panel:
```tsx
        {reTeam && (
          <div className="mt-live" style={{ marginTop: 10 }}>
            <div className="mt-row">
              <span className="mt-h" style={{ margin: 0, flex: 1 }}>Re-pick teams for {SPORTS[reTeam.sport]?.label || "new sport"}</span>
              <button className="mt-add alt" onClick={() => setReTeam(null)}>✕ Cancel</button>
            </div>
            {!reTeam.home ? (
              <>
                <p className="mt-note" style={{ marginTop: 0, marginBottom: 8 }}>Pick your team, or create one.</p>
                <TeamPicker teams={nwTeams} sport={reTeam.sport} side="us" onPick={reTeamPickHome} onCreate={reTeamCreateHome} />
              </>
            ) : (
              <>
                <p className="mt-note" style={{ marginTop: 0, marginBottom: 8 }}>Your team: <b>{reTeam.home.name}</b>. Now pick the opponent{reTeam.away ? <> — <b>{reTeam.away.name}</b></> : ", or create one"}.</p>
                <TeamPicker teams={nwTeams} sport={reTeam.sport} side="them" exclude={reTeam.home.id} onPick={reTeamPickAway} onCreate={reTeamCreateAway} />
                <div className="mt-row" style={{ marginTop: 10 }}>
                  <button className="mt-add alt" onClick={() => setReTeam({ ...reTeam, home: null, away: null })}>← Back</button>
                  <button className="mt-add" style={{ flex: 1, marginLeft: 8 }} disabled={!reTeam.away} onClick={reTeamApply}>Apply {SPORTS[reTeam.sport]?.label} teams</button>
                </div>
              </>
            )}
          </div>
        )}
```

- [ ] **Step 5: Close the re-pick on disruptive transitions**

Find the cleanup line that closes open editors on match switch / resync / view toggle (the one calling `setBlkEdit(null); setBlkIns(null); setLineupEdit(null);` — e.g. in `doResync`/`doResyncLatest`/the realtime apply path and `closeWizard`/`cancelNew`). Add `setReTeam(null);` alongside those so a stale re-pick can't survive a match change. (At minimum: the realtime `apply`/`doResyncLatest` paths and wherever `nw` is cancelled.)

- [ ] **Step 6: Verify**

Run: `nvm use 20; npm test 2>&1 | tail -5` → all passing.
Run: `npm run build 2>&1 | tail -6` → success.
Manual (dev server): open a match → Details → change Sport to a different sport → re-pick panel appears scoped to the new sport → pick/create your team then opponent → Apply → sport changes, teams + colours + rosters update, score re-renders in the new mode. Cancel (or ✕) leaves the original sport and teams untouched. Verify the picked/created teams are in the new sport (open Teams page).

- [ ] **Step 7: Commit**

```bash
git add components/MatchTracker.tsx
git commit -m "feat(editor): changing a match's sport re-picks teams (keeps sport==teams invariant)"
```

---

## Task 7: DB migration doc, version bump, final verification

**Files:**
- Create: `docs/sport-required-migration.sql`
- Modify: `lib/constants.ts`

- [ ] **Step 1: Write the migration SQL**

Create `docs/sport-required-migration.sql`:
```sql
-- Make matches.sport mandatory. Run ONCE in the Supabase SQL editor.
-- Pre-check (should return 0 after the manual sport backfill):
--   select count(*) from matches where sport is null;
-- If non-zero, set those rows' sport first, then run:
alter table matches alter column sport set not null;
-- (Teams table intentionally unchanged: blank-sport team identity is valid.)
```

- [ ] **Step 2: Bump `APP_VERSION`**

In `lib/constants.ts`, change `APP_VERSION` from `"v73"` to `"v74"`.

- [ ] **Step 3: Full verification**

Run: `nvm use 20; npm test 2>&1 | grep -E "Test Files|Tests "`
Expected: all passing (295 = the prior 294 + the new `sport-mode` suite; net 0 from removed `detectedMode` assertions since those were assertions, not separate test cases — accept whatever the green total is, the point is 0 failures).

Run: `npm run build 2>&1 | tail -6` → success.

Run: `grep -rnE "detectedMode|autoMode" lib components app | grep -v node_modules` → expect no matches (all removed).

- [ ] **Step 4: Commit**

```bash
git add docs/sport-required-migration.sql lib/constants.ts
git commit -m "chore: matches.sport NOT NULL migration; bump APP_VERSION to v74"
```

> **Tell the user:** look for **v74**. Run `docs/sport-required-migration.sql` in Supabase to enforce the NOT NULL (optional but recommended — the app already never writes a null sport).

---

## Self-Review notes (addressed)

- **Spec coverage:** §1 helper → T1; §2 parser → T2; §1-derivation in model/match-list → T3; §3 types/sample/store → T4; §4 editor state+picker → T5; §5 re-pick flow → T6; §6 DB migration → T7. All mapped.
- **Ordering / green-at-each-commit:** helper (T1) precedes its consumers (T3, T5); parser mode required (T2) is paired with its test updates + adapter default in one commit; typed readers of `.scoringMode`/`.autoMode` are rewired (T3) before the fields are dropped from the type (T4); the editor still writes the dropped fields harmlessly between T4 and T5 (`@ts-nocheck`, extra jsonb keys); the Sport `onChange` is direct in T5 then swapped to the re-pick trigger in T6 (a one-line transient where sport could change without re-link, resolved in the next commit).
- **Type consistency:** `scoringModeForSport(sport?: string): "gaa" | "goals"` used identically in T1/T3/T5; `reTeam` shape `{ sport, prevSport, home, away }` consistent across T6 steps; `teamLinkPatch`/`findOrCreate`/`pairingError` signatures match existing wizard usage.
- **Placeholder scan:** the parse-events test edit (T2 Step 2) is a mechanical transform across many call sites given as an exact rule + example rather than a full file paste (the file is large); this is a complete instruction, not a TODO.
