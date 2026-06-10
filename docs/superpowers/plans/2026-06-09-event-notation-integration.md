# Event-Only Notation — Integration Plan (header-out, revised T5+)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`). This **supersedes Tasks 5–9 of `2026-06-09-event-only-notation.md`** — Tasks 1–4 (parser core `lib/parse-events.ts` + `lib/migrate-notation.ts`, both green) are done and unchanged except the migration header-lift in Task A below.

**Goal:** Wire the new two-team `parseEvents` into the live app with **header-out notation** — `label`/`homeAway`/sport/opponent move onto the match record + linked teams, the notation is purely events, and every header read/write call-site reworks to the record; plus both-team scorers, two-team game mode, and the one-time backfill.

**Architecture:** `parseMatch` stays the public entry but becomes an **adapter**: it synthesises `parsed.header` from `settings` (record fields), migrates legacy raw on the fly, calls `parseEvents` with both teams' rosters, and maps `A/B → us/them` (us = `myTeam` side) so the legacy `ParsedMatch` shape is preserved and no consumer breaks. Header-editing UI mutates record state, not the notation.

**Tech Stack:** TypeScript, Next 14, Vitest. Node 20 — prefix with `bash -lc 'source ~/.nvm/nvm.sh; nvm use 20 >/dev/null; cd /home/sean/workspace/sideline && <cmd>'`. Branch: `event-notation`.

**Sequencing:** Task A (migration header-lift) and Task B (types) first; then Task C (the adapter) — after which `npm test`/`build` must stay green at every task. The riskiest task is C.

---

## Task A: extend `migrateLegacyNotation` to lift the header

**Files:** `lib/migrate-notation.ts`, `test/migrate-notation.test.ts`.

- [ ] **Step 1:** Add a test: a legacy `"U13A Hurling @ Wildebeests\n10. Morty\n18:00\n5 Morty goal"` migrates to a record with `label === "U13A Hurling"`, `homeAway === "away"`, and the opponent name captured (`opponent === "Wildebeests"` or via the teamB arg), with the header line dropped from `raw`.

```ts
it("lifts the legacy header into label/homeAway/opponent", () => {
  const rec = migrateLegacyNotation({ raw: "U13A Hurling @ Wildebeests\n10. Morty\n18:00\n5 Morty goal" } as any, { teamAName: "Racoons", teamBName: "Wildebeests" });
  expect(rec.label).toBe("U13A Hurling");
  expect(rec.homeAway).toBe("away");
  expect(rec.opponent).toBe("Wildebeests");
  expect(rec.raw.split("\n")[0]).toMatch(/^18:00/);   // header gone, raw starts at the clock
});
```

- [ ] **Step 2:** Run `npm test -- migrate-notation` → FAIL.
- [ ] **Step 3:** In `migrateLegacyNotation`, when reading the header line, parse it (`/^(.*?)\s+@\s*(.*)$/` → away; `/^(.*?)\s+v(?:s|\.)?\s*(.*)$/i` → home; else label only) and set `label`, `homeAway`, `opponent` on the returned record (in addition to the existing roster-strip + T-rewrite). `opponent` defaults to `teamBName` when the header has none.
- [ ] **Step 4:** `npm test -- migrate-notation` → pass; full `npm test` green.
- [ ] **Step 5:** `git commit -am "feat: migration lifts legacy header into label/homeAway/opponent"`

---

## Task B: `MatchRecord` header fields + types

**Files:** `lib/types.ts`.

- [ ] **Step 1:** Add to `MatchRecord` (after `oppRoster?`): `label?: string;` and `homeAway?: "home" | "away";` and `opponent?: string;` (opponent is the resolved away/them name; promoted column `opponent` already exists).
- [ ] **Step 2:** `npx tsc --noEmit` clean. **Commit** `git commit -am "feat: MatchRecord label/homeAway/opponent header fields"`

---

## Task C: `parseMatch` adapter (the high-wire task)

**Files:** `lib/parser.ts` (replace its body with the adapter), `lib/types.ts` (Settings).

Make `parseMatch(raw, settings)` keep the legacy `ParsedMatch` return shape but be powered by `parseEvents`. `settings` gains optional `label`, `homeAway`, `opponent`, `usRoster`, `oppRoster` (callers pass the record's fields).

- [ ] **Step 1:** Extend `Settings` (lib/types.ts): `label?: string; homeAway?: "home"|"away"; opponent?: string; usRoster?: TeamRoster; oppRoster?: TeamRoster;`.

- [ ] **Step 2:** Write the adapter in `lib/parser.ts` (keep `isPlaceholderLabel` export):

```ts
import { parseEvents, TeamArg } from "@/lib/parse-events";
import { migrateLegacyNotation } from "@/lib/migrate-notation";
import type { ParsedMatch, Settings } from "@/lib/types";

export const isPlaceholderLabel = (s?: string): boolean =>
  ["", "new match", "my team", "match"].includes((s || "").trim().toLowerCase());

const isLegacy = (raw: string) =>
  // legacy: a non-clock, non-empty first line (a header) OR a `T<n>`/bare-T scorer
  /\bT\d/.test(raw) || (() => { const f = raw.split("\n").find((l) => l.trim()); return !!f && !/^\s*\d{1,2}:\d{2}\s*$/.test(f) && !/^\s*\d{1,2}\b/.test(f); })();

export function parseMatch(raw: string, settings: Settings = {}): ParsedMatch {
  // migrate legacy notation on the fly (header + roster out) so parseEvents always sees event-only raw
  let label = settings.label, homeAway = settings.homeAway, opponent = settings.opponent;
  let usRoster = settings.usRoster, oppRoster = settings.oppRoster, events = raw;
  if (isLegacy(raw)) {
    const m = migrateLegacyNotation({ raw } as any, { teamAName: settings.myTeam || "My Team", teamBName: settings.opponent || "Opponent" });
    events = m.raw; usRoster = usRoster || m.usRoster; label = label ?? m.label; homeAway = homeAway ?? m.homeAway; opponent = opponent ?? m.opponent;
  }
  const usName = settings.myTeam || "My Team";
  const oppName = opponent || "Opposition";
  const teamA: TeamArg = { name: usName, roster: usRoster || { formation: [], players: [] } };
  const teamB: TeamArg = { name: oppName, roster: oppRoster || { formation: [], players: [] } };
  const pe = parseEvents(events, { teamA, teamB, scoringMode: settings.scoringMode });

  // map A/B → us/them (A is always the myTeam side here)
  const mapSide = (s: "A" | "B" | null) => (s === "A" ? "us" : s === "B" ? "them" : "them");
  const scoring = pe.scoring.map((s: any) => ({ ...s, side: mapSide(s.side), usScore: s.aScore, themScore: s.bScore }));
  const notes = pe.notes.map((n: any) => (n.side ? { ...n, side: mapSide(n.side) } : n));
  const series = pe.series.map((p: any) => ({ ...p, us: p.a, them: p.b, usScore: p.aScore, themScore: p.bScore }));
  const scorers = pe.scorers.map((sc: any) => ({ ...sc, side: mapSide(sc.side) }));
  const totals = { us: pe.totals.A, them: pe.totals.B };
  const result = pe.result === "A" ? "Win" : pe.result === "B" ? "Loss" : "Draw";
  const header = { raw: "", sport: "", opposition: opponent || "", homeAway: homeAway || "", label: label || "" };  // sport label is driven by settings.sport via SPORTS downstream; header.sport stays "" (header-out)
  // sport label: prefer an explicit settings.sport handled by callers; header.sport mirrors detected mode for legacy display
  return {
    header, roster: usRoster ? usRoster.players : [], formationRows: usRoster ? usRoster.formation : [],
    scoring, notes, halfMarks: pe.halfMarks, series, goalDots: pe.goalDots.map((d: any) => ({ ...d, side: mapSide(d.side) })),
    scorers, totals, result,
    leadChanges: pe.leadChanges, timesLevel: pe.timesLevel, maxLead: pe.maxLead,
    maxLeadSide: mapSide(pe.maxLeadSide), warnings: pe.warnings, mode: pe.mode, detectedMode: pe.detectedMode,
    htLine: pe.htLine, opp: opponent || null,
  } as ParsedMatch;
}
```

> The adapter preserves every field legacy consumers read (`header`, `roster`, `formationRows`, `totals.us/them`, `scorers[].side`, `series[].us/them`/`usScore`/`themScore`, `result`, `opp`, `mode`, `htLine`, stat counters). `header.sport`: callers that need the sport label already prefer `settings.sport` via `SPORTS` (MatchTracker/model do `SPORTS[sport] ? ... : header.sport`); keep `header.sport` best-effort (empty is acceptable since `settings.sport` drives the label). Tune to make the SAMPLE + caller behaviour match (Task H verifies).

- [ ] **Step 3:** `npx tsc --noEmit && npm run build`. The app builds; legacy matches still render (migrate-on-the-fly). Some `parser.test.ts` cases will now fail (they assert the old roster-in-notation behaviour) — that's expected; they're rewritten in Task H. Temporarily `it.skip` the parser.test.ts suite (or accept red) until Task H. **Commit** `git commit -am "feat: parseMatch adapter over parseEvents (header-out, A/B→us/them)"`

---

## Task D: header-editing reworks to the record (MatchTracker + team-link)

**Files:** `components/MatchTracker.tsx`, `lib/team-link.ts`.

- [ ] **Step 1: MatchTracker header state.** Add `label`/`homeAway`/`opponent` to editor state (loaded in `doLoad` from the record, saved in `recordPayload`, in the dirty/autosave dep arrays — same pattern as the ③b `homeTeamId` plumbing). Pass them into the `parsed` `useMemo`'s `settings` (`{ myTeam, scoringMode, label, homeAway, opponent, usRoster, oppRoster }`).
- [ ] **Step 2: `setHeaderField`** → set the corresponding state field directly (no `setRaw` header rewrite). The home/away `<select>` `onChange` → `setHomeAway(v)` + swap team ids when flipped (as ③b). The ⇄ swap → flip `homeAway` state + team ids.
- [ ] **Step 3: `refreshList`** — build the saved-match label from record fields (`label`/`myTeam`/`opponent`/`homeAway`) instead of `parseMatch(...).header`.
- [ ] **Step 4: new-match (`doNew`/`finishNew`)** — set `label`/`homeAway`/`opponent` as state; the notation template is now empty/events-only (no `Team @ Opp` line).
- [ ] **Step 5: `team-link.ts`** — `teamLinkPatch` sets `label`?/`homeAway`/`opponent` on the returned patch (record fields) instead of rewriting the raw header; `swapHomeAway` flips `homeAway` + team ids on the record (no raw edit). Update `test/team-link.test.ts` accordingly.
- [ ] **Step 6:** `npx tsc --noEmit && npm run build`; `npm test -- team-link` green. **Commit.**

---

## Task E: read-side callers off the header (match-list, store)

**Files:** `lib/match-list.ts`, `lib/store.ts`.

- [ ] **Step 1: `matchRowView`** — take `homeAway`/opponent from the record (`rec.homeAway`, `rec.opponent`/linked team) and pass `usRoster`/`oppRoster`/names into `parseMatch` so totals count correctly; map A/B→home/away via `homeAway`.
- [ ] **Step 2: `store.matchCols`** — `opponent` from `data.opponent` (fallback to the legacy header parse only if absent). Pass `usRoster`/`oppRoster` if needed (matchCols only needs opp name → use `data.opponent`).
- [ ] **Step 3:** tests for `match-list` updated; `npm test -- match-list` green; build. **Commit.**

---

## Task F: both-team scorers in model + UI + infographic

**Files:** `lib/model.ts`, `components/PublicMatch.tsx`, `components/MatchTracker.tsx`, `lib/infographic.ts`.

- [ ] Model exposes `scorersUs`/`scorersThem` (already has us; add them). Details tab + PublicMatch render **two** scorer tables. Infographic/OG list both. `ScoreChart` already two-series. Build + visual check. **Commit per surface.**

---

## Task G: game mode + Advanced two-team

**Files:** `components/MatchTracker.tsx`.

- [ ] `buildEventLine` emits the new grammar (player name when known, else `Team number`, team-level for "Unknown"); who-grid offers both teams' players. Build. **Commit.**

---

## Task H: backfill migration, test translation, SAMPLE, verify

**Files:** `lib/store.ts`/`EditorApp.tsx`, `lib/sample.ts`, `test/parser.test.ts`, `test/model.test.ts`, `lib/constants.ts`.

- [ ] **Step 1:** On `loadAll`, migrate any record without `notationV===2` (via `migrateLegacyNotation` using the record's team names) and `store.set` it back (idempotent; `legacyRaw` kept).
- [ ] **Step 2:** Rewrite `lib/sample.ts` as event-only SAMPLE + the two team rosters reproducing the canonical finals.
- [ ] **Step 3:** Rewrite `test/parser.test.ts` for the adapter/two-team model (or fold into `parse-events.test.ts`): the canonical invariant must hold (Racoons 2-6, Wildebeests 2-7, Loss, Rick 2-4 (4 frees), Morty 0-1, leadChanges 1, timesLevel 3, maxLead 6, 0 warnings) + Wildebeests' named scorers. Update `model.test.ts`/`name-display.test.ts`.
- [ ] **Step 4:** `APP_VERSION` → v50. Full `npm test` + `npm run build` + `npx tsc --noEmit` green. Update CLAUDE.md (parser/notation description + test count). **Commit.**

---

## Self-review notes

- **Spec coverage (incl. §9a header-out):** migration header-lift (A); record header fields (B); parseMatch adapter synthesising header + A/B→us/them + migrate-on-fly (C); header-editing reworks (D); read-side callers (E); both-team scorers (F); two-team game mode (G); backfill + test translation + SAMPLE + v50 (H). Parser core T1–T4 unchanged (A only extends migration).
- **Risk:** Task C is the high-wire moment — the adapter keeps every legacy `ParsedMatch` field so consumers don't break; `parser.test.ts` goes red between C and H (expected, flagged) — keep `parse-events`/`migrate-notation` suites green throughout as the safety net, and restore full green in H.
- **Type consistency:** `Settings` gains `label`/`homeAway`/`opponent`/`usRoster`/`oppRoster` (C) consumed by the adapter; `MatchRecord` gains `label`/`homeAway`/`opponent` (B) used by D/E/H; the adapter's A→us/B→them mapping is the single translation point.
- **Integrity (③b lesson):** verify branch + test count between tasks; expect the full count to dip when `parser.test.ts` is skipped in C and return (higher) in H.
