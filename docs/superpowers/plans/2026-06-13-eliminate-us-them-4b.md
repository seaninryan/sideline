# Eliminate us/them — ④b editor flip + lineup symmetry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Flip the editor (`MatchTracker`) from us/them to home/away natively, make the lineup tab symmetric (home-then-away, both editable), collapse `lineupBadges`, and delete the ④a shims — completing the us/them elimination.

**Architecture:** `MatchTracker`'s state, parse feed, record payload, game-mode/insert/lineup flows all become home/away. The `homeAway` flag is dropped (home is always home). The editor calls `parseMatch` (home/away) directly — the `parseMatchLegacy`/`editorStateFromRecord`/venue-mapping shims are deleted. **`recordHomeAway`/`migrateRecordToV3`/`stripUsThem` STAY** (the load-time migration still needs them to convert any legacy v2 records in the DB).

**Tech Stack:** TypeScript/React. `MatchTracker.tsx` is `// @ts-nocheck` with **no unit tests** — the safety net is a complete grep-verified rename + a mandatory manual-verification checklist. Node 20 — prefix commands with `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH`. Dev server is live; **never `npm run build`** — use `npx tsc --noEmit`.

**Spec:** `docs/superpowers/specs/2026-06-13-eliminate-us-them-design.md` (the ④b section).

**Branch:** `eliminate-us-them-4b` off `main` (v84).

> ⚠️ **High-risk, no automated coverage.** Every task ends with a grep gate AND the manual checklist must pass before merge. Because the file is `@ts-nocheck`, a missed reference becomes a runtime `undefined`, not a compile error.

---

## Naming map (apply consistently everywhere in `MatchTracker.tsx`)

| us/them (old) | home/away (new) |
|---|---|
| `myTeam` / `setMyTeam` | `homeTeam` / `setHomeTeam` |
| `opponent` / `setOpponent` | `awayTeam` / `setAwayTeam` |
| `colorUs` / `setColorUs` | `colorHome` / `setColorHome` |
| `colorUs2` / `setColorUs2` | `colorHome2` / `setColorHome2` |
| `colorThem` / `setColorThem` | `colorAway` / `setColorAway` |
| `colorThem2` / `setColorThem2` | `colorAway2` / `setColorAway2` |
| `usRoster` / `setUsRoster` | `homeRoster` / `setHomeRoster` |
| `oppRoster` / `setOppRoster` | `awayRoster` / `setAwayRoster` |
| `usSquad` / `setUsSquad` | `homeSquad` / `setHomeSquad` |
| `oppSquad` / `setOppSquad` | `awaySquad` / `setAwaySquad` |
| `usName` | `homeName` |
| `themName` | `awayName` |
| `usScorers` | `homeScorers` |
| `themScorers` | `awayScorers` |
| team-key `"us"` / `"them"` (gm, lineup, side params) | `"home"` / `"away"` |
| `usIsHome` | (deleted — home is home) |
| `homeAway` / `setHomeAway` | (deleted) |

---

## Task 1: Rename the editor's state declarations + the colour-picker map

**Files:** Modify `components/MatchTracker.tsx`.

- [ ] **Step 1: Rename the `useState` declarations (lines ~107-118, ~202-204).** Apply the naming map to every `const [x, setX] = useState(...)`. The initial seeds read `SAMPLE_RECORD.*` — update to the home/away fields (SAMPLE is v3 home/away):
```tsx
  const [homeTeam, setHomeTeam] = useState(SAMPLE_RECORD.homeTeam || "Home");
  const [colorHome, setColorHome] = useState(SAMPLE_RECORD.colorHome || "#f5c518");
  const [colorHome2, setColorHome2] = useState(SAMPLE_RECORD.colorHome2 || "#1f7a4d");
  const [colorAway, setColorAway] = useState(SAMPLE_RECORD.colorAway || "#c0392b");
  const [colorAway2, setColorAway2] = useState(SAMPLE_RECORD.colorAway2 || "#2c5fa8");
  // ... (awayTeam, homeRoster, awayRoster, homeSquad, awaySquad similarly)
```
Delete the `homeAway`/`setHomeAway` state entirely. Remove the `usName`/`themName` derived consts (lines ~212-213) and replace with `const homeName = homeTeam || "Home"; const awayName = awayTeam || parsed.away || "Away";` (place after `parsed` is defined).

- [ ] **Step 2: Colour-picker map (lines ~998-999).** The `colorPick` map keyed `us/us2/them/them2` → `home/home2/away/away2`:
```tsx
        const map = {
          home: [colorHome, setColorHome, `${homeName} — primary`], home2: [colorHome2, setColorHome2, `${homeName} — secondary`],
          away: [colorAway, setColorAway, `${awayName} — primary`], away2: [colorAway2, setColorAway2, `${awayName} — secondary`],
        };
```
And the swatch `onClick={() => setColorPick(colorPick === "us" ? null : "us")}` buttons (details panel ~938-956) → `"home"`/`"home2"`/`"away"`/`"away2"`.

- [ ] **Step 3: tsc + grep.** `npx tsc --noEmit` (clean — @ts-nocheck means it won't catch editor issues, but other files must stay clean). This task does NOT reach a runnable editor yet (parse/payload still reference old names) — it's committed together with Tasks 2-3. Do not test-in-browser until Task 3.

---

## Task 2: Parse feed + read-only display → home/away directly (drop the shim + homeAway)

**Files:** Modify `components/MatchTracker.tsx`.

- [ ] **Step 1: The parse call (line ~207).** Use `parseMatch` (home/away) directly, no `parseMatchLegacy`:
```tsx
  const parsed = useMemo(() => parseMatch(raw, { homeTeam, awayTeam, scoringMode: scoringModeForSport(sport), label, homeRoster, awayRoster }), [raw, homeTeam, awayTeam, sport, label, homeRoster, awayRoster]);
```
Change the import (line 8): `import { parseMatch, isPlaceholderLabel } from "@/lib/parser";`

- [ ] **Step 2: Drop the venue-mapping (lines ~651-668).** The parser now emits home/away, so:
```tsx
  const homeScorers = scorers.filter((s) => s.side === "home").sort((a, b) => gpTotal(b.g, b.p, effMode) - gpTotal(a.g, a.p, effMode));
  const awayScorers = scorers.filter((s) => s.side === "away").sort((a, b) => gpTotal(b.g, b.p, effMode) - gpTotal(a.g, a.p, effMode));
  const homeSeries = series;            // parser already home/away
  const timelineHA = timeline;          // (timeline built from parsed scoring/notes — already home/away)
  const homeColor = colorHome, awayColor = colorAway;
  const maxLeadVenue = parsed.maxLeadSide;   // already "home"|"away"|null
```
Delete `usIsHome`, the `venueSeries`/`venueItems`/`sideToVenue` calls, and their import (line 44): remove `venueSeries, venueItems, sideToVenue, editorStateFromRecord` from the `@/lib/home-away` import (the editor no longer imports anything from home-away).

- [ ] **Step 3: The read-only display (ScoreHeader ~910-913, Timeline ~1155/1173, Scorers ~765, stats ~1164, ScoreChart).** These were `usIsHome ? … : …` via the ③.2b home/away vars. Now they read the renamed state directly. ScoreHeader:
```tsx
            homeName={homeName} awayName={awayName}
            homeStr={totals.home.str} awayStr={totals.away.str}
            homeColors={[colorHome, colorHome2]} awayColors={[colorAway, colorAway2]}
            homeTotal={gpTotal(totals.home.g, totals.home.p, effMode)} awayTotal={gpTotal(totals.away.g, totals.away.p, effMode)}
            homeSquad={homeSquad} awaySquad={awaySquad}
```
Timeline (both ~1155 and ~1173): `colorHome={colorHome} colorHome2={colorHome2} colorAway={colorAway} colorAway2={colorAway2} nameHome={homeName} nameAway={awayName} timeline={timelineHA}`. Scorers: `home={homeScorers} away={awayScorers} colorHome={colorHome} colorHome2={colorHome2} colorAway={colorAway} colorAway2={colorAway2}`. Stats biggest-lead (~1164): `${maxLeadVenue ? " · " + (maxLeadVenue === "home" ? homeName : awayName) : ""}`. ScoreChart: `series={homeSeries} colorHome={homeColor} colorAway={awayColor}`.

- [ ] **Step 4: Block pills (~691).** The notation block pill keyed `b.e.side === "us"`:
```tsx
    if (b.kind === "score") {
      const home = b.e.side === "home";
      return <span className="mt-bpill" style={{ background: home ? colorHome : colorAway, color: contrastOn(home ? colorHome : colorAway) }}>{home ? b.e.homeScore : b.e.awayScore}</span>;
    }
```

---

## Task 3: Record payload, load, new-match, swap → home/away

**Files:** Modify `components/MatchTracker.tsx`, `lib/team-link.ts` (rewrite `swapHomeAway` to a field swap).

- [ ] **Step 1: `recordPayload()` (~258).** Emit home/away, no `homeAway`/`myTeam`:
```tsx
  const recordPayload = () => ({ raw, matchDate, date: matchDate, sport: sport || undefined, colorHome, colorHome2, colorAway, colorAway2, nameDisplay, label, homeTeam, awayTeam, homeRoster, homeTeamId, awayTeamId, awayRoster, homeSquad, awaySquad, notationV: 3, ...(legacyRaw ? { legacyRaw } : {}) });
```
Update the `dirty`/auto-save dependency arrays (~267-268, ~309-310) to the renamed vars (drop `homeAway`/`opponent`/`myTeam`/`colorUs*`/`usRoster`…; add `homeTeam`/`awayTeam`/`colorHome*`/`homeRoster`/`awayRoster`/`homeSquad`/`awaySquad`).

- [ ] **Step 2: `applyRecord` (~311).** Read home/away directly (no `editorStateFromRecord`):
```tsx
  const applyRecord = (d) => {
    setRaw(d.raw); setHomeTeam(d.homeTeam || "Home");
    setSport(d.sport || "");
    setColorHome(d.colorHome || "#f5c518"); setColorHome2(d.colorHome2 || "#1f7a4d");
    setColorAway(d.colorAway || "#c0392b"); setColorAway2(d.colorAway2 || "#2c5fa8");
    setNameDisplay(d.nameDisplay || "full");
    setLabel(d.label || ""); setAwayTeam(d.awayTeam || "");
    setHomeRoster(d.homeRoster || null); setLegacyRaw(d.legacyRaw);
    setHomeTeamId(d.homeTeamId || null); setAwayTeamId(d.awayTeamId || null); setAwayRoster(d.awayRoster || null);
    setHomeSquad(d.homeSquad || ""); setAwaySquad(d.awaySquad || "");
    setMatchDate(d.date || d.matchDate || toLocalInput(new Date()));
    // ...(keep curId etc.)
  };
```
(Records are guaranteed v3 home/away by the load-time migration; no us/them fallback needed.)

- [ ] **Step 3: Backup-list label (~238).** Already reads `d.awayTeam ?? d.opponent` / `d.homeTeam ?? d.myTeam` (from the v84 hotfix) — simplify to `d.awayTeam` / `d.homeTeam` (no fallback needed post-migration).

- [ ] **Step 4: `doNew`/`finishNew`/`reTeamApply` (~364-372, ~602-624).** These build a new/relinked record. `doNew` (~364): write a v3 home/away blank — `store.set(id, { raw: newRaw, matchDate: date, date, homeTeam: team, sport: "soccer", colorHome, colorHome2, colorAway, colorAway2, label: "", awayTeam: "", notationV: 3, savedAt: Date.now() })` and set state via the renamed setters. `finishNew`/`reTeamApply` (~602, ~622) already map `patch.homeTeam`→state (from ④a) — update the setters to the renamed ones (`setHomeTeam(patch.homeTeam); setAwayTeam(patch.awayTeam); setColorHome(patch.colorHome); …; setHomeRoster(patch.homeRoster); setAwayRoster(patch.awayRoster)`), and drop any `setHomeAway(...)`.

- [ ] **Step 5: `swapHomeAway` → field swap (`lib/team-link.ts` ~109).** Replace the us/them shim with the home/away field swap (it was the ④b target all along):
```ts
export function swapHomeAway(record: any) {
  return {
    homeTeam: record.awayTeam, awayTeam: record.homeTeam,
    colorHome: record.colorAway, colorHome2: record.colorAway2,
    colorAway: record.colorHome, colorAway2: record.colorHome2,
    homeRoster: record.awayRoster ?? null, awayRoster: record.homeRoster ?? null,
    homeSquad: record.awaySquad ?? "", awaySquad: record.homeSquad ?? "",
    homeTeamId: record.awayTeamId ?? null, awayTeamId: record.homeTeamId ?? null,
  };
}
```
And the caller (`MatchTracker` ~952): `const p = swapHomeAway(recordPayload()); setHomeTeam(p.homeTeam); setAwayTeam(p.awayTeam); setColorHome(p.colorHome); setColorHome2(p.colorHome2); setColorAway(p.colorAway); setColorAway2(p.colorAway2); setHomeRoster(p.homeRoster); setAwayRoster(p.awayRoster); setHomeSquad(p.homeSquad); setAwaySquad(p.awaySquad); setHomeTeamId(p.homeTeamId); setAwayTeamId(p.awayTeamId);`

- [ ] **Step 6: Details panel labels (~921-948).** Remove the `homeAway`-driven dynamic labels + the home/away `<select>` dropdown (lines ~922-933) — they no longer make sense without a `homeAway` flag (the ⇄ Swap button covers reversing). Make the team fields static: the first team field is "Home team" bound to `homeTeam`/`setHomeTeam` + `colorHome`/`colorHome2` swatches; the second is "Away team" bound to `awayTeam`/`setAwayTeam` + `colorAway`/`colorAway2`. Keep the ⇄ Swap button. The `setHeaderField("opposition", …)` path (~389) becomes `setAwayTeam(value)`; remove the `homeAway` case from `setHeaderField`.

- [ ] **Step 7: tsc + grep gate.** `npx tsc --noEmit` clean. Grep for stragglers:
```
grep -n "colorUs\|colorThem\|usRoster\|oppRoster\|usSquad\|oppSquad\|\bmyTeam\b\|\bopponent\b\|usName\|themName\|usScorers\|themScorers\|usIsHome\|homeAway\|parseMatchLegacy\|editorStateFromRecord" components/MatchTracker.tsx
```
Expected: **no matches** (every editor reference renamed). Fix any straggler.

---

## Task 4: Symmetric lineup tab (home-then-away, both editable)

**Files:** Modify `components/MatchTracker.tsx`.

- [ ] **Step 1: Game-mode + insert flows keyed home/away (~410-516, ~755, ~1155-1319, ~1404-1423).** Every `"us"`/`"them"` team key in `pickGmTeam`, `gmStage.team`, `addLive(..,team)`, `buildEventLine`, `onPitchSet`/`benchSet`, the insert `who` flow, and the team buttons → `"home"`/`"away"`. The team buttons (~1155): `<button … style={{ background: colorHome … }} onClick={() => pickGmTeam("home")}>{homeName}</button>` and the away equivalent. The roster pickers `team === "them" ? awayRoster : homeRoster` etc.

- [ ] **Step 2: The lineup tab pitches (~1227-1319).** Currently renders an "us" pitch (rich, editable) then an "opp" pitch. Make them **symmetric and home-first**: extract a single `renderEditPitch(side: "home"|"away")` that reads `side === "home" ? { name: homeName, roster: homeRoster, setRoster: setHomeRoster, c1: colorHome, c2: colorHome2 } : { …away… }`, renders the editable pitch (jerseys, `subArrows(n, side)`/`playerMarks(n, side)`/`scoreFor(n, side)`, the `editLineup`/`tapPlayer`/`subPick` wiring keyed by `side`), and call it `renderEditPitch("home")` then `renderEditPitch("away")`. The `editLineup` state becomes `"home"|"away"` (was `"us"|"them"`); `tapPlayer`/`subPick` carry the venue side. Both pitches get the same treatment (the away pitch was display-only-ish before; now both are equally editable + show subs/missing). Keep behaviour otherwise identical.

- [ ] **Step 3: tsc + grep.** `npx tsc --noEmit` clean; grep for residual `"us"`/`"them"` string literals in `MatchTracker.tsx` (there may be unrelated ones — inspect each): `grep -n '"us"\|"them"\|'"'"'us'"'"'\|'"'"'them'"'"'' components/MatchTracker.tsx` → all remaining should be home/away now (or genuinely unrelated). 

---

## Task 5: Collapse `lineupBadges` + the editor `mdl`

**Files:** Modify `lib/lineup-badges.ts`, `components/MatchTracker.tsx`, `test/lineup-badges.test.ts`.

- [ ] **Step 1: Editor `mdl` (~765) → home/away.** `const mdl = { timelineHA, homeScorers, awayScorers };` and `subArrows`/`playerMarks`/`scoreFor` call `lineupBadges(mdl, side, num)` with `side: "home"|"away"`.

- [ ] **Step 2: Collapse `lineupBadges` to home/away-only.** Remove the dual-key `"us"|"them"` branch (added in ③.2a):
```ts
export function lineupBadges(
  m: Pick<Model, "timelineHA" | "homeScorers" | "awayScorers">,
  side: "home" | "away",
  num: number,
): LineupBadges {
  const scorers = side === "home" ? m.homeScorers : m.awayScorers;
  const sc = (scorers || []).find((s: any) => s.num === num && (s.g || s.p));
  let subOn = false, subOff = false, og = false;
  const cards: string[] = [];
  (m.timelineHA || []).forEach((t: any) => {
    const tSide = t.side === "away" ? "away" : "home";
    if (t.kind === "sub" && tSide === side) { if (t.onNum === num) subOn = true; if (t.offNum === num) subOff = true; }
    else if (t.kind === "card" && tSide === side && t.num === num) cards.push(t.card);
    else if (t.kind === "score" && t.og && t.ogNum === num && tSide !== side) og = true;
  });
  return { subOn, subOff, cards, og, score: sc ? { g: sc.g, p: sc.p } : null };
}
```

- [ ] **Step 3: `test/lineup-badges.test.ts`** — remove the `"us"|"them"` describe block(s); keep/keep-only the home/away cases. Run `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test -- lineup-badges` → green.

---

## Task 6: Delete the ④a shims

**Files:** Modify `lib/parser.ts`, `lib/home-away.ts`, `lib/model.ts`, `lib/store.ts`.

- [ ] **Step 1: `lib/parser.ts`** — delete `parseMatchLegacy` (+ its `UsThemSettings` type). No caller remains (editor uses `parseMatch`). Confirm: `grep -rn "parseMatchLegacy" components lib` → empty.
- [ ] **Step 2: `lib/home-away.ts`** — delete `editorStateFromRecord`, `sideToVenue`, `venueSeries`, `venueItems`. **KEEP `matchOutcome` and `recordHomeAway`** (`recordHomeAway` is still used by the load-time migration to convert legacy v2 records). Confirm no remaining callers of the deleted four: `grep -rn "editorStateFromRecord\|sideToVenue\|venueSeries\|venueItems" components lib` → empty.
- [ ] **Step 3: `lib/model.ts`** — `buildModel`'s `record.myTeam !== undefined ? {...recordHomeAway} : record` guard: keep it (it harmlessly normalizes any legacy us/them record still reaching buildModel — e.g. an unmigrated public row). It depends on `recordHomeAway` which stays. **No change** (the guard is defensive, not a shim to remove). Note this in the commit.
- [ ] **Step 4: `lib/store.ts`** — `store.set`'s `data.myTeam !== undefined ? {...recordHomeAway(data)…} : data` guard: keep (defensive for any legacy payload; the editor now passes home/away → the `else` branch). `migrateHomeAway`/`migrateRecordToV3`/`recordHomeAway` usage in the migration **stays**. **No change** beyond confirming. 
- [ ] **Step 5: tsc + full grep.** `npx tsc --noEmit` clean. Final repo-wide sweep:
```
grep -rIn "colorUs\|colorThem\|usRoster\|oppRoster\|usSquad\|oppSquad\|\bmyTeam\b\|\bopponent\b\|usName\|themName\|usScorers\|themScorers\|usIsHome\|homeAway\|parseMatchLegacy\|editorStateFromRecord\|sideToVenue\|venueSeries\|venueItems" lib app components --include=*.ts --include=*.tsx | grep -v "recordHomeAway\|migrateRecordToV3\|stripUsThem\|\.test\."
```
Expected matches ONLY inside `recordHomeAway`/`migrateRecordToV3`/`stripUsThem` (the legacy-migration converter, which by design reads the old us/them fields) and `lib/types.ts`'s `Settings`/legacy comments. Anything else is a straggler — fix it. (The DB column `home_team_id` etc. and sample/team-template player data are fine.)

- [ ] **Step 6: APP_VERSION → v85** in `lib/constants.ts`.

- [ ] **Step 7: Full verify.** `npx tsc --noEmit` clean; `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test` green (canonical SAMPLE finals still Wildebeests-home 2-7 / Racoons-away 2-6). Commit.

---

## Manual verification (MANDATORY before merge — the editor has no automated coverage)

Click through on the deployed preview (or `npm run dev` in a separate checkout), on **both** a match where your team was home and one where it was away:
1. **Open an existing match** — scoreboard, chart, scorers, timeline render correct home-left/away-right; correct names/colours/scores.
2. **Live entry / game mode** — start half, score for each team (home + away buttons show the right team names/colours), point/goal/free/card/sub all append correctly and update the score.
3. **Lineup tab** — both pitches render (home then away); edit each lineup (rename/renumber/add player/add sub); do a substitution via tap on each side; badges (sub arrows/cards/scores) show on the right players.
4. **Details panel** — edit home team name + colours, away team name + colours; ⇄ Swap reverses the two teams (names, colours, rosters, ids) and the score sides flip.
5. **New-match wizard** — Date → home team → away team → Create; rosters/colours seed; saves to `/m/<uuid>`.
6. **Re-pick teams** (change sport) — applies home/away teams correctly.
7. **Edit a score → auto-save → reload** — persists; reload shows the same.
8. **Share as image** — poster renders home/away correctly.

## Scope / what stays (NOT a regression)

`recordHomeAway`, `migrateRecordToV3`, `stripUsThem` remain (they read the old us/them fields **only** to migrate legacy v2 records still in the DB). The `record.myTeam !== undefined` guards in `buildModel`/`store.set` stay as defensive normalization for any unmigrated record. This is the isolated legacy-migration layer — everything else is home/away.

## Self-review (spec coverage)

- Editor state/flow rename → Tasks 1-4. Parse feed + display → Task 2. Payload/load/new/swap → Task 3. Symmetric lineup → Task 4. lineupBadges collapse → Task 5. Delete shims → Task 6.
- Deviation from spec: `recordHomeAway` is NOT deleted (the migration needs it) — flagged above; the spec's "grep us/them returns nothing" is met *except* the isolated migration converter, which is the correct end state for converting legacy data.
