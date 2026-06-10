# Event-Only Notation (Two-Team Parser) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **This is a TDD rewrite of the parser — the test code in each task is the contract; build the implementation to pass it.**

**Goal:** Replace the us/them, roster-in-notation parser with a two-team, event-only parser whose events resolve against both teams' structured rosters (player-name → `Team number` → `Team`), count totals per team (no written-score column-vote), and produce both teams' scorers — and migrate existing matches.

**Architecture:** Build the new parser in a fresh `lib/parse-events.ts` (TDD, in isolation, old `parser.ts` untouched) until green; then swap `parseMatch` over and update callers with a side→us/them/home/away mapping shim; then migrate matches (`migrateLegacyNotation`, non-destructive via `legacyRaw`) and wire both-team scorers through the model/UI/game-mode. The legacy `parser.ts` is retired once the new one is integrated and the translated suite is green.

**Tech Stack:** TypeScript, Vitest. Node 20 — prefix with `bash -lc 'source ~/.nvm/nvm.sh; nvm use 20 >/dev/null; cd /home/sean/workspace/sideline && <cmd>'`.

**Design doc:** `docs/superpowers/specs/2026-06-09-event-only-notation-design.md`. Branch: `event-notation`.

**Highest-risk sub-project.** Sequencing rule: **the new parser + its tests must be fully green (Tasks 1–4) before any caller/migration/UI change (Tasks 5+).**

---

## File Structure

**Create:**
- `lib/parse-events.ts` — the new two-team parser (`resolveWho`, `parseEvents`). Pure.
- `lib/migrate-notation.ts` — `migrateLegacyNotation(record, {teamAName, teamBName})`. Pure.
- `test/parse-events.test.ts` — resolution + event-walk + totals (new contract).
- `test/migrate-notation.test.ts` — legacy→new round-trip.

**Modify (Task 5+):**
- `lib/types.ts` — `ParsedMatch` gains `sides`/two-team `totals`+`scorers`; `MatchRecord` += `usRoster?`, `legacyRaw?`, `notationV?`.
- `lib/parser.ts` — re-exported as a thin adapter over `parse-events` (keeps the `parseMatch` name + the us/them/home/away view the callers expect), or replaced and callers updated. (Plan keeps `parseMatch` as the public entry, delegating to `parseEvents`.)
- `lib/model.ts`, `components/PublicMatch.tsx`, `components/MatchTracker.tsx`, `lib/infographic.ts` — both-team scorers + counted series.
- `lib/store.ts` / `components/EditorApp.tsx` — one-time backfill migration on load.
- `test/parser.test.ts` → translated to the two-team grammar (or replaced by `parse-events.test.ts` + a restated SAMPLE suite). `lib/sample.ts` — event-only SAMPLE + the two rosters.
- `lib/constants.ts` — `APP_VERSION` → v50.

---

## Task 1: `resolveWho` — the resolution core (TDD)

**Files:** Create `lib/parse-events.ts`, `test/parse-events.test.ts`.

The heart: resolve an event's "who" token against both teams in priority order.

- [ ] **Step 1: Write the failing test** — `test/parse-events.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { resolveWho } from "@/lib/parse-events";
import type { TeamRoster } from "@/lib/types";

const A = { name: "Racoons", roster: { formation: [[10],[11]], players: [
  { num: 10, name: "Morty", role: "starting" }, { num: 11, name: "Rick", role: "starting" }] } as TeamRoster };
const B = { name: "Wildebeests", roster: { formation: [[9]], players: [
  { num: 9, name: "Gerald", role: "starting" }, { num: 11, name: "Rick", role: "starting" }] } as TeamRoster };

describe("resolveWho", () => {
  it("player name unique across teams → that player + side", () => {
    expect(resolveWho("Morty", A, B)).toMatchObject({ side: "A", num: 10, name: "Morty", teamLevel: false });
  });
  it("Team + number → that team's player", () => {
    expect(resolveWho("Wildebeests 9", A, B)).toMatchObject({ side: "B", num: 9, name: "Gerald", teamLevel: false });
  });
  it("Team name alone → team-level (unattributed)", () => {
    expect(resolveWho("Wildebeests", A, B)).toMatchObject({ side: "B", teamLevel: true });
    expect(resolveWho("Racoons", A, B)).toMatchObject({ side: "A", teamLevel: true });
  });
  it("name on both teams → ambiguous (no side) unless qualified", () => {
    expect(resolveWho("Rick", A, B)).toMatchObject({ side: null, ambiguous: true });
    expect(resolveWho("Wildebeests Rick", A, B)).toMatchObject({ side: "B", num: 11, name: "Rick" });
  });
  it("unknown token → unresolved (no side)", () => {
    expect(resolveWho("Nobody", A, B)).toMatchObject({ side: null, ambiguous: false });
  });
  it("first-name shorthand resolves within a team", () => {
    expect(resolveWho("Gerald", A, B)).toMatchObject({ side: "B", num: 9 });
  });
});
```

- [ ] **Step 2: Run `npm test -- parse-events`** → FAIL (module not found).

- [ ] **Step 3: Implement `resolveWho` in `lib/parse-events.ts`** (build to pass; here is the intended logic):

```ts
import { squash, titleCase } from "@/lib/util";
import type { TeamRoster } from "@/lib/types";

export interface TeamArg { name: string; roster: TeamRoster }
export interface WhoResult { side: "A" | "B" | null; num: number | null; name: string; teamLevel: boolean; ambiguous: boolean }

const findPlayer = (roster: TeamRoster, txt: string) => {
  const c = squash(txt); if (!c) return null;
  for (const p of roster.players) if (squash(p.name) === c) return p;          // exact full-name beats fuzzy
  for (const p of roster.players) { const f = squash(p.name.split(" ")[0]); if (f === c) return p; }
  return null;
};
const teamMatches = (name: string, txt: string) => {
  const c = squash(txt); const n = squash(name);
  return !!c && (c === n || c === squash(name.split(" ")[0]));
};

// Resolve "who" against both teams: player-name (either) → "Team number" → "Team".
export function resolveWho(token: string, a: TeamArg, b: TeamArg): WhoResult {
  const none: WhoResult = { side: null, num: null, name: "", teamLevel: false, ambiguous: false };
  const t = (token || "").trim(); if (!t) return none;

  // 1) bare player name across both rosters
  const pa = findPlayer(a.roster, t), pb = findPlayer(b.roster, t);
  if (pa && pb) return { ...none, ambiguous: true };                          // same name both sides → needs a qualifier
  if (pa) return { side: "A", num: pa.num, name: pa.name, teamLevel: false, ambiguous: false };
  if (pb) return { side: "B", num: pb.num, name: pb.name, teamLevel: false, ambiguous: false };

  // 2) "<Team> <number>" or "<Team> <name>" — try the longest team-name prefix (handles multi-word names)
  for (const [side, team] of [["A", a] as const, ["B", b] as const]) {
    const words = t.split(/\s+/);
    for (let take = words.length - 1; take >= 1; take--) {
      if (!teamMatches(team.name, words.slice(0, take).join(" "))) continue;
      const rest = words.slice(take).join(" ").trim();
      const numOnly = rest.match(/^(\d{1,2})$/);
      if (numOnly) { const p = team.roster.players.find((x) => x.num === +numOnly[1]); return { side, num: +numOnly[1], name: p ? p.name : "", teamLevel: false, ambiguous: false }; }
      const p = findPlayer(team.roster, rest);
      if (p) return { side, num: p.num, name: p.name, teamLevel: false, ambiguous: false };
    }
  }

  // 3) bare "<Team>" → team-level
  if (teamMatches(a.name, t)) return { side: "A", num: null, name: "", teamLevel: true, ambiguous: false };
  if (teamMatches(b.name, t)) return { side: "B", num: null, name: "", teamLevel: true, ambiguous: false };

  return none;
}
```

> Build `resolveWho` to pass all 6 tests; the loop in branch (2) is illustrative — simplify it (iterate `[["A",a],["B",b]]`, regex `^(team-words)\s+(rest)$` won't pre-know team length, so instead: split first 1–N words and test `teamMatches`; a robust approach is to try the longest team-name prefix match). Keep it test-driven.

- [ ] **Step 4: Run `npm test -- parse-events`** → all pass.

- [ ] **Step 5: Commit** `git add lib/parse-events.ts test/parse-events.test.ts && git commit -m "feat: resolveWho — two-team who-resolution core (TDD)"`

---

## Task 2: `parseEvents` — event walk (TDD)

**Files:** `lib/parse-events.ts`, `test/parse-events.test.ts` (extend).

Port the legacy event walk (halves, scoring, cards, corners, subs, notes, '65/'45, own goal, added time, match-minute labels) to the two-team model. Sides are `A`/`B`; the "who" comes from `resolveWho`.

- [ ] **Step 1: Add event-walk tests** (extend `test/parse-events.test.ts`). Cover each behaviour translated from `parser.test.ts`:

```ts
import { parseEvents } from "@/lib/parse-events";

const teams = { teamA: A, teamB: B };

it("halves, a scored point and goal, both sides, counted totals", () => {
  const r = parseEvents("18:00\n3 Morty\n10 Wildebeests 9 goal\n12 Rick? \nHT\n18:30\n34 Morty goal", teams);
  // 1A point (Morty), 1B goal (Gerald), ... assert per-side totals from COUNTED events (no written score needed)
  expect(r.totals.A.g).toBe(1); expect(r.totals.A.p).toBe(1);  // Morty goal + point
  expect(r.totals.B.g).toBe(1); expect(r.totals.B.p).toBe(0);
  expect(r.scorers.find((s) => s.name === "Gerald")).toMatchObject({ side: "B", g: 1 });
});

it("free, '65/'45, own goal credit to the other side, cards, corners, subs, notes", () => {
  const r = parseEvents("18:00\n5 Morty free\n9 Morty '65\n20 Morty own goal\n23 Rick? yellow card\n31 Racoons corner\n44 Wildebeests 9 yellow card\n40 11 for 10\n46 Water Break", teams);
  expect(r.scorers.find((s) => s.name === "Morty")?.frees).toBe(1);             // free counted
  expect(r.scoring.find((s) => s.setPiece)).toMatchObject({ setPiece: "65" });
  // own goal by Morty (side A) scores for B:
  expect(r.scoring.find((s) => s.og)).toMatchObject({ side: "B", og: true });
  expect(r.notes.find((n) => n.type === "card")).toMatchObject({ side: "A", card: "yellow" });
  expect(r.notes.find((n) => n.type === "corner")).toMatchObject({ side: "A", type: "corner" });
  expect(r.notes.find((n) => n.type === "sub")).toBeTruthy();
  expect(r.notes.find((n) => n.type === "note")?.text).toMatch(/Water Break/);
});

it("added time deduced from a HT marker, +N override", () => {
  const r = parseEvents("18:00\n28 HT\n18:30\n63 FT +4", teams);
  expect(r.halfMarks.find((m) => m.marker === "HT")?.added).toBe(3);           // 28%5
  expect(r.halfMarks.find((m) => m.marker === "FT")?.added).toBe(4);           // override
});
```

> Add cases mirroring the remaining `parser.test.ts` scenarios (goal-vs-point by keyword, unattributed `Team` scorer, ambiguous-name warning, sport detection by header). Result / leadChanges / series assertions live in Task 3. The full translated set lands in Task 9; Task 2 needs enough to drive the event walk.

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement `parseEvents`** porting `parser.ts:104–207` (the event loop) with these changes: no roster/header parsing of players; the scorer/card/corner/sub "who" goes through `resolveWho(token, teamA, teamB)` → `side: "A"|"B"`; own goal flips A↔B; sport detection (`parser.ts:30–50`) reused for `mode`; `scoreToks` are parsed but **not** used for attribution (kept on the scoring item only as optional display). Match-minute labelling (`parser.ts:200–265`) ported unchanged. Output per-event `side: "A"|"B"`.

- [ ] **Step 4: Run → pass. Step 5: Commit** `git commit -am "feat: parseEvents event walk (two-team, TDD)"`

---

## Task 3: totals, series, both-team scorers (TDD)

**Files:** `lib/parse-events.ts`, test (extend).

- [ ] **Step 1: Tests** — assert `totals: { A:{g,p,total,str}, B:{...} }`, `scorers[]` with `side:"A"|"B"`, the cumulative `series` (per-A/per-B), `goalDots`, `leadChanges`/`timesLevel`/`maxLead`/`maxLeadSide` (now `"A"|"B"`), `htLine`, `result` as `"A"|"B"|"draw"`. Concrete numbers from a small two-team script. (Translate `parser.test.ts`'s stat assertions.)

- [ ] **Step 2: FAIL → Step 3: Implement** the counting loop (port `parser.ts:247–336` but **delete** `parseCol`/`writtenCols`/`writtenCount`/`scoreFromWritten`/`usCol`/the vote — totals are counted from each event's `side`+`type` directly; `effType` goal/point as today). `bump` keyed by `side+name`. `series` carries `a`/`b` running totals. `result` by `gpTotal(A) vs gpTotal(B)`.

- [ ] **Step 4: pass. Step 5: Commit** `git commit -am "feat: two-team totals/series/scorers, drop written-score column-vote (TDD)"`

---

## Task 4: `migrateLegacyNotation` (TDD)

**Files:** Create `lib/migrate-notation.ts`, `test/migrate-notation.test.ts`.

- [ ] **Step 1: Test** — legacy raw (roster block + names + `T<n>`) + team names → new record whose `parseEvents` totals equal the legacy `parseMatch` totals:

```ts
import { describe, it, expect } from "vitest";
import { migrateLegacyNotation } from "@/lib/migrate-notation";
import { parseEvents } from "@/lib/parse-events";

it("strips roster, rewrites T<n>, preserves totals + keeps legacyRaw", () => {
  const legacy = "U13A Hurling @ Wildebeests\n10. Morty | 11. Rick\n18:00\n5 Morty goal\n9 T11 goal\n12 Morty";
  const rec = migrateLegacyNotation({ raw: legacy } as any, { teamAName: "Racoons", teamBName: "Wildebeests" });
  expect(rec.legacyRaw).toBe(legacy);
  expect(rec.raw).not.toMatch(/10\. Morty/);     // roster stripped
  expect(rec.raw).toMatch(/Wildebeests 11 goal/); // T11 → opponent + number
  expect(rec.usRoster?.players.find((p) => p.num === 10)?.name).toBe("Morty"); // roster → snapshot
});
```

- [ ] **Step 2: FAIL → Step 3: Implement** — detect roster block (preamble lines after the header, before the first clock), build `usRoster` (`{formation, players}`) from it; drop those lines from `raw`; regex-rewrite `\bT(\d{1,2})\b` → `<teamBName> $1` and bare `\bT\b` (as a scorer/card/corner subject) → `<teamBName>`; set `legacyRaw = original raw`, `notationV = 2`. Pure.

- [ ] **Step 4: pass. Step 5: Commit** `git commit -am "feat: migrateLegacyNotation (legacy→event-only, non-destructive)"`

---

## Task 5: Integrate — `parseMatch` delegates to `parseEvents`; wire callers

**Files:** `lib/types.ts`, `lib/parser.ts`, `lib/model.ts`, `lib/store.ts`, `components/MatchTracker.tsx`.

- [ ] **Step 1:** `lib/types.ts` — extend `ParsedMatch` with two-team fields (`sides?`, two-team `totals`/`scorers`), keep `us`/`them` optional for the adapter; `MatchRecord` += `usRoster?: TeamRoster`, `legacyRaw?: string`, `notationV?: number`.
- [ ] **Step 2:** `lib/parser.ts` — keep the `parseMatch(raw, settings)` signature as the public entry, but internally: derive `teamA`/`teamB` from `settings` (callers will pass the match's two rosters/names; until a caller does, fall back to empty rosters so legacy/unlinked still parse) and call `parseEvents`, then map `A`/`B` → `us`/`them` using `settings.myTeam`/home-away so existing consumers keep working during transition. (Document this adapter; it is removed when callers are fully two-team.)
- [ ] **Step 3:** Update `lib/model.ts` and `MatchTracker`'s `parsed` to pass the match's `usRoster`/`oppRoster` + team names as `teamA`/`teamB`. Build-verify.
- [ ] **Step 4:** `npx tsc --noEmit && npm run build` → clean. **Commit.**

> This is the riskiest integration step — keep the adapter so the app renders throughout; only after Task 9's translated suite is green is the adapter simplified.

---

## Task 6: Both-team scorers through model + UI

**Files:** `lib/model.ts`, `components/PublicMatch.tsx`, `components/MatchTracker.tsx`, `lib/infographic.ts`.

- [ ] Model exposes `scorersA`/`scorersB` (+ keep `usScorers` alias). Details tab + PublicMatch render **two** scorer tables (already have the one-team table — duplicate for the other side). `ScoreChart` plots both series. Infographic/OG list both. Build-verify + visual check. **Commit per surface.**

---

## Task 7: Game mode + Advanced — two-team who-grid + grammar

**Files:** `components/MatchTracker.tsx`.

- [ ] `buildEventLine` emits the new grammar (player name when known; else `Team number`; team-level when "Unknown"). The who-grid renders the tapped team's roster (both teams selectable). Block-insert forms resolve against both rosters. Build-verify. **Commit.**

---

## Task 8: One-time backfill migration on load

**Files:** `lib/store.ts` (or `components/EditorApp.tsx`), `lib/constants.ts`.

- [ ] On `loadAll`, for each match without `notationV === 2`, run `migrateLegacyNotation` (deriving team names from the match's links/inline names) and `store.set` it back (idempotent; `legacyRaw` preserved). Log + skip any that don't cleanly transform. Bump `APP_VERSION` → v50. Build-verify. **Commit.**

---

## Task 9: Translate the test suite + restate SAMPLE + final verify

**Files:** `lib/sample.ts`, `test/parser.test.ts` (→ rewrite), `test/model.test.ts`, `test/name-display.test.ts`.

- [ ] **Step 1:** Rewrite `lib/sample.ts` as an event-only SAMPLE + the two team rosters (Racoons/Wildebeests) that reproduce the canonical finals.
- [ ] **Step 2:** Translate every `parser.test.ts` case to the two-team grammar/model (or fold into `parse-events.test.ts` and delete the old file). The **canonical invariant must hold**: Racoons 2-6, Wildebeests 2-7, Loss-for-Racoons, Rick 2-4 (4 frees), Morty 0-1, leadChanges 1, timesLevel 3, maxLead 6, 0 warnings — now also asserting Wildebeests' named scorers.
- [ ] **Step 3:** Update `model.test.ts`/`name-display.test.ts` for both-side scorers.
- [ ] **Step 4:** `npm test` (full) + `npm run build` + `npx tsc --noEmit` → all green. Update CLAUDE.md's parser/notation description + test count. **Commit.**

---

## Self-review notes

- **Spec coverage:** two-team parser + signature (T1–T3, T5); resolution order + disambiguation (T1); counted totals, no column-vote (T3); event-only grammar + all event types (T2); migration non-destructive (T4, T8); game-mode/Advanced two-team (T7); model/public/infographic both-team scorers (T6); parity-first test translation + SAMPLE (T9); v50 (T8). 
- **Sequencing:** Tasks 1–4 (new parser + migration, isolated, TDD) must be green before Tasks 5+ touch callers — stated in the header and Task 5.
- **TDD-rewrite caveat:** the parser implementations (T2/T3) are ported from `parser.ts` against the test contracts rather than pre-written verbatim — the tests are complete and authoritative; build the parser to pass them, reusing the legacy event-walk/labelling logic where unchanged.
- **Type consistency:** `resolveWho`→`WhoResult` (T1) consumed by `parseEvents` (T2); `parseEvents` output (`totals.A/B`, `scorers[].side`, `series`) used by T3/T5/T6; `migrateLegacyNotation` (T4) output (`usRoster`/`legacyRaw`/`notationV`) consumed by T8 + `MatchRecord` (T5).
- **Risk acknowledgements in-plan:** the adapter in T5 keeps the app rendering during the swap; the backfill in T8 is idempotent + non-destructive.
