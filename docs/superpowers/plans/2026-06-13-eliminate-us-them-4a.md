# Eliminate us/them — ④a typed core (+ editor shim) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Flip the parser adapter + every typed consumer + the record type to home/away (deleting the venue-mapping layer), with a reconcile-from-teams migration, while a throwaway shim keeps the untyped editor (`MatchTracker`) working unchanged.

**Architecture:** `ParsedMatch` and `MatchRecord` become home/away-shaped; `parser.ts` feeds home=A and emits home/away; `model.ts`/`match-list.ts`/`lineup-badges.ts` read home/away directly; `recordHomeAway` is retained only as a shim (for the editor's still-us/them payloads + a `parseMatchLegacy` wrapper) and deleted in ④b. A shared `reconcileHomeAwayFromTeams` runs in both `loadAll` and `Landing` so the home screen self-heals. Behaviour is unchanged — the bar is the canonical `SAMPLE_RECORD` finals reproducing identically, re-expressed home/away.

**Tech Stack:** TypeScript, Next.js, Vitest. Node 20 — prefix every command with `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH`. Dev server is live; **never `npm run build`** — use `npx tsc --noEmit`.

**Spec:** `docs/superpowers/specs/2026-06-13-eliminate-us-them-design.md`

**Branch:** `eliminate-us-them` (④a) off `main` (v82).

**Refactor note (not feature TDD):** behaviour is preserved, so most "tests" are *updating existing tests to the home/away shape with identical asserted values*. Each task: make the change, update its tests, run the suite green, commit. `tsc --noEmit` must stay clean (except `MatchTracker.tsx`, which is `@ts-nocheck`).

---

## Type-coupling note (task ordering)

`ParsedMatch` is consumed by `model.ts`, `match-list.ts`, and (untyped) `MatchTracker`. Flipping its shape cascades to the typed readers at once, so **Task 2 (parser) and Task 3 (model + match-list) land together-ish** — after Task 2, `tsc` will error in model/match-list until Task 3; that's expected within the sequence (run `tsc` after Task 3, not between). Commit Task 2+3 close together. The editor is insulated by the shim (Task 2) so it never breaks.

---

## Task 1: Record + Settings + ParsedMatch types → home/away

**Files:** Modify `lib/types.ts`.

- [ ] **Step 1: Flip `MatchRecord`**

In `interface MatchRecord`, REMOVE `myTeam`, `opponent`, `colorUs`, `colorUs2`, `colorThem`, `colorThem2`, `oppRoster`, `usRoster`, `homeAway`, `usSquad`, `oppSquad`. The home/away fields (added in ③.1) stay and become non-optional-by-convention (keep them optional `?` to avoid churn). Final `MatchRecord`:

```ts
export interface MatchRecord {
  raw: string;
  matchDate?: string;
  date?: string;
  sport: string;
  nameDisplay?: NameDisplay;
  homeTeamId?: string | null;
  awayTeamId?: string | null;
  label?: string;
  homeTeam?: string;
  awayTeam?: string;
  colorHome?: string;
  colorHome2?: string;
  colorAway?: string;
  colorAway2?: string;
  homeRoster?: TeamRoster;
  awayRoster?: TeamRoster;
  homeSquad?: string;
  awaySquad?: string;
  legacyRaw?: string;
  notationV?: number;
  savedAt?: number;
}
```

- [ ] **Step 2: Flip `Settings` (the parser input)**

```ts
export interface Settings {
  homeTeam?: string;
  awayTeam?: string;
  scoringMode?: "gaa" | "goals";
  sport?: string;
  label?: string;
  homeRoster?: TeamRoster;
  awayRoster?: TeamRoster;
}
```

- [ ] **Step 3: Flip `ParsedMatch` to home/away**

Change `opp` → `away`, `totals` to `{ home; away }`, `maxLeadSide` to `"home" | "away" | null`, and drop `result`:

```ts
export interface ParsedMatch {
  mode: "gaa" | "goals";
  away: string | null;
  totals: { home: { g: number; p: number; str: string }; away: { g: number; p: number; str: string } };
  scorers: any[];
  roster: any[];
  formationRows: any[];
  series: any[];
  goalDots: any[];
  chartMarkers: any[];
  htLine: any;
  leadChanges: number;
  timesLevel: number;
  maxLead: number;
  maxLeadSide: "home" | "away" | null;
  warnings: any[];
  scoring: any[];
  notes: any[];
  halfMarks: any[];
  [k: string]: any;
}
```

(Leave `MatchRow` as-is — it already has no us/them.)

- [ ] **Step 4: Typecheck (expected to fail in consumers — that's fine here)**

Run: `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npx tsc --noEmit`
Expected: errors in `lib/parser.ts`, `lib/model.ts`, `lib/match-list.ts`, `lib/sample.ts`, `lib/team-link.ts`, `lib/store.ts`, `lib/home-away.ts` (they still use the old shape). These are resolved by Tasks 2–9. Do NOT commit yet — Task 1 commits together with Task 2.

---

## Task 2: Parser flip (home=A) + `parseMatchLegacy` shim

**Files:** Modify `lib/parser.ts`. Test `test/parse-events.test.ts` (Task 8 updates assertions; here just keep the engine green).

- [ ] **Step 1: Rewrite `parseMatch`**

`parse-events.ts` is unchanged. Replace `lib/parser.ts`'s `parseMatch` body with the home/away adapter:

```ts
export function parseMatch(raw: string, settings: Settings = {}): ParsedMatch {
  let { label, homeTeam, awayTeam, homeRoster, awayRoster } = settings;
  let events = raw;
  if (isLegacy(raw)) {
    const m = migrateLegacyNotation({ raw } as any, { teamAName: homeTeam || "Home", teamBName: awayTeam || "" });
    events = m.raw;
    homeRoster = homeRoster || m.usRoster;            // lifted roster is the home side by default
    label = label ?? m.label;
    awayTeam = awayTeam ?? m.opponent;
  }
  const homeName = homeTeam || "Home";
  const awayName = awayTeam || "Away";
  const teamA: TeamArg = { name: homeName, roster: homeRoster || { formation: [], players: [] } };
  const teamB: TeamArg = { name: awayName, roster: awayRoster || { formation: [], players: [] } };
  const pe = parseEvents(events, { teamA, teamB, scoringMode: settings.scoringMode ?? "goals" });

  const mapSide = (s: "A" | "B" | null) => (s === "A" ? "home" : "away"); // home = team A
  const scoring = pe.scoring.map((s: any) => ({ ...s, side: mapSide(s.side), homeScore: s.aScore, awayScore: s.bScore }));
  const notes = pe.notes.map((n: any) => (n.side ? { ...n, side: mapSide(n.side) } : n));
  const series = pe.series.map((p: any) => ({ ...p, home: p.a, away: p.b, homeScore: p.aScore, awayScore: p.bScore }));
  const scorers = pe.scorers.map((sc: any) => ({ ...sc, side: mapSide(sc.side) }));
  const goalDots = pe.goalDots.map((d: any) => ({ ...d, side: mapSide(d.side) }));
  const chartMarkers = (pe.chartMarkers || []).map((mk: any) => ({ ...mk, side: mk.side ? mapSide(mk.side) : null }));
  const header = { raw: "", sport: "", away: awayName, label: label || "" };

  return {
    header,
    roster: homeRoster ? homeRoster.players : [],
    formationRows: homeRoster ? homeRoster.formation : [],
    scoring, notes, halfMarks: pe.halfMarks, series, goalDots, chartMarkers, scorers,
    totals: { home: pe.totals.A, away: pe.totals.B },
    leadChanges: pe.leadChanges, timesLevel: pe.timesLevel, maxLead: pe.maxLead,
    maxLeadSide: pe.maxLeadSide == null ? null : mapSide(pe.maxLeadSide),
    warnings: pe.warnings, mode: pe.mode,
    htLine: pe.htLine, away: awayName || null,
  } as ParsedMatch;
}
```

- [ ] **Step 2: Add the throwaway `parseMatchLegacy` shim (for the editor only)**

Append to `lib/parser.ts`:

```ts
// ④a SHIM (deleted in ④b): lets the still-us/them editor keep its existing reads.
// Maps the editor's us/them inputs → home/away, parses, then converts the home/away
// ParsedMatch back to a us/them-shaped one. home = us-side iff homeAway === "home".
type UsThemSettings = { myTeam?: string; opponent?: string; usRoster?: TeamRoster; oppRoster?: TeamRoster; homeAway?: "home" | "away"; scoringMode?: "gaa" | "goals"; label?: string };
export function parseMatchLegacy(raw: string, s: UsThemSettings = {}): any {
  const usIsHome = s.homeAway === "home";
  const p = parseMatch(raw, {
    homeTeam: usIsHome ? s.myTeam : s.opponent,
    awayTeam: usIsHome ? s.opponent : s.myTeam,
    homeRoster: usIsHome ? s.usRoster : s.oppRoster,
    awayRoster: usIsHome ? s.oppRoster : s.usRoster,
    scoringMode: s.scoringMode, label: s.label,
  });
  const v = (side: "home" | "away" | null) => side == null ? null : ((side === "home") === usIsHome ? "us" : "them");
  const reside = (x: any) => (x && x.side !== undefined ? { ...x, side: v(x.side) } : x);
  const usScore = (homeScore: string, awayScore: string) => usIsHome ? homeScore : awayScore;
  return {
    ...p,
    opp: usIsHome ? (p.away || null) : (s.opponent || null),
    totals: { us: usIsHome ? p.totals.home : p.totals.away, them: usIsHome ? p.totals.away : p.totals.home },
    result: p.totals.home.total === p.totals.away.total ? "Draw"
      : (p.totals.home.total > p.totals.away.total) === usIsHome ? "Win" : "Loss",
    maxLeadSide: v(p.maxLeadSide),
    scoring: p.scoring.map((x: any) => ({ ...x, side: v(x.side), usScore: usScore(x.homeScore, x.awayScore), themScore: usScore(x.awayScore, x.homeScore) })),
    notes: p.notes.map(reside),
    scorers: p.scorers.map(reside),
    goalDots: p.goalDots.map(reside),
    chartMarkers: p.chartMarkers.map(reside),
    series: p.series.map((x: any) => ({ ...x, us: usIsHome ? x.home : x.away, them: usIsHome ? x.away : x.home, usScore: usScore(x.homeScore, x.awayScore), themScore: usScore(x.awayScore, x.homeScore) })),
    header: { raw: "", sport: "", opposition: s.opponent || "", homeAway: s.homeAway || "", label: s.label || "" },
    roster: (usIsHome ? s.usRoster : s.usRoster) ? (s.usRoster?.players || []) : [],
    formationRows: s.usRoster?.formation || [],
  };
}
```

> Note: `parse-events` is the engine; `parseEvents`, `TeamArg`, `migrateLegacyNotation`, `isLegacy` imports stay. `totals.*.total` is provided by `parse-events` (`TeamTotals.total`).

- [ ] **Step 3: (do not typecheck/commit alone — proceed to Task 3, then verify together)**

---

## Task 3: `model.ts` + `match-list.ts` read home/away

**Files:** Modify `lib/model.ts`, `lib/match-list.ts`. Tests updated in Task 8.

- [ ] **Step 1: Rewrite `buildModel`**

`buildModel` must accept BOTH a v3 home/away record (server/Landing) AND the editor's in-memory us/them payload (it calls `buildModel(recordPayload())` for the share image). Detect the editor payload by `record.myTeam !== undefined` and normalize via the retained `recordHomeAway` (kept in `home-away.ts`, Task 6). Replace `lib/model.ts` with:

```ts
import { parseMatch } from "@/lib/parser";
import { fmtDateDow, gpTotal } from "@/lib/util";
import { htScore } from "@/lib/half-time";
import { SPORTS, scoringModeForSport } from "@/lib/constants";
import { matchOutcome } from "@/lib/home-away";
import { recordHomeAway } from "@/lib/home-away"; // ④a shim path (deleted in ④b)
import type { MatchRecord, Model } from "@/lib/types";

export function buildModel(record: any): Model {
  // Normalize: a legacy/editor us/them payload (has myTeam) → home/away identity.
  const ha = record && record.myTeam !== undefined
    ? { ...record, ...recordHomeAway(record) }
    : record;
  const r = ha as MatchRecord;
  const sportKey = r.sport || "";
  const sp = (SPORTS as Record<string, { label: string; mode: string }>)[sportKey];
  const parsed = parseMatch(r.raw, {
    homeTeam: r.homeTeam, awayTeam: r.awayTeam,
    scoringMode: scoringModeForSport(r.sport),
    label: r.label, homeRoster: r.homeRoster, awayRoster: r.awayRoster,
  });
  const { roster, totals, series, goalDots, chartMarkers, scorers, scoring, notes, halfMarks, htLine } = parsed;
  const effMode = parsed.mode;
  const sportLabel = sp ? sp.label : parsed.header.sport;
  const homeName = r.homeTeam || "Home";
  const awayName = r.awayTeam || parsed.away || "Away";

  const timeline: any[] = [];
  scoring.forEach((s: any) => timeline.push({ kind: "score", ...s }));
  notes.forEach((n: any) => timeline.push({ kind: n.type, ...n }));
  timeline.sort((a, b) => (a.half - b.half) || (a.seq - b.seq));

  const homeScorers = scorers.filter((s: any) => s.side === "home").sort((a: any, b: any) => gpTotal(b.g, b.p, effMode) - gpTotal(a.g, a.p, effMode));
  const awayScorers = scorers.filter((s: any) => s.side === "away").sort((a: any, b: any) => gpTotal(b.g, b.p, effMode) - gpTotal(a.g, a.p, effMode));
  const starters = roster.filter((p: any) => p.role === "starting");
  const subs = roster.filter((p: any) => p.role === "sub");
  const missing = roster.filter((p: any) => p.role === "missing");
  const formationRows = parsed.formationRows && parsed.formationRows.length ? parsed.formationRows : [];
  const ht = htScore(series, effMode);

  const cHome = r.colorHome || "#f5c518", cHome2 = r.colorHome2 || "#1f7a4d";
  const cAway = r.colorAway || "#c0392b", cAway2 = r.colorAway2 || "#2c5fa8";
  const outcome = matchOutcome(gpTotal(totals.home.g, totals.home.p, effMode), gpTotal(totals.away.g, totals.away.p, effMode));

  return {
    grade: r.label || "", sport: sportLabel || "",
    dateStr: r.matchDate ? fmtDateDow(r.matchDate) : "",
    effMode, ht,
    leadChanges: parsed.leadChanges, timesLevel: parsed.timesLevel,
    maxLead: parsed.maxLead, maxLeadVenue: parsed.maxLeadSide,
    series, goalDots, chartMarkers, htLine, halfMarks, timeline,
    nameDisplay: r.nameDisplay || "full",
    homeName, awayName,
    homeColors: [cHome, cHome2], awayColors: [cAway, cAway2],
    homeTotals: totals.home, awayTotals: totals.away,
    homeScorers, awayScorers,
    homeSquad: r.homeSquad || "", awaySquad: r.awaySquad || "",
    homeRoster: r.homeRoster || null, awayRoster: r.awayRoster || null,
    starters, subs, missing, formationRows,
    homeSeries: series, timelineHA: timeline,   // parser already home/away
    outcome, parsed,
  };
}
```

(`homeSeries`/`timelineHA` are now plain aliases — consumers still read those keys. `goalDots`/`chartMarkers` are home/away-tagged from the parser and consumed only positionally by `ScoreChart`.)

- [ ] **Step 2: Rewrite `matchRowView` + `matchProgress` in `match-list.ts`**

Both call `parseMatch`. Read the record's home/away fields and feed the parser home/away. Replace the two functions' parse calls and `matchRowView`'s identity block:

```ts
// matchRowView:
export function matchRowView(rec: MatchRecord): RowView {
  const scoringMode = scoringModeForSport(rec.sport);
  const parsed = parseMatch(rec.raw, {
    homeTeam: rec.homeTeam, awayTeam: rec.awayTeam, scoringMode,
    homeRoster: rec.homeRoster, awayRoster: rec.awayRoster, label: rec.label,
  });
  const { totals } = parsed;
  const mode = parsed.mode;
  const homePts = gpTotal(totals.home.g, totals.home.p, mode);
  const awayPts = gpTotal(totals.away.g, totals.away.p, mode);
  const out = matchOutcome(homePts, awayPts);
  const winner: RowView["winner"] = out.winner ?? "draw";
  return {
    homeName: rec.homeTeam || "Home",
    awayName: rec.awayTeam || parsed.away || "Away",
    homeStr: totals.home.str,
    awayStr: totals.away.str,
    winner,
    sport: resolveSportKey(rec.sport, parsed.header.sport, mode),
    sportEmoji: resolveSportEmoji(rec.sport, parsed.header.sport, mode),
    homeColors: [rec.colorHome || "#f5c518", rec.colorHome2 || "#1f7a4d"],
    awayColors: [rec.colorAway || "#c0392b", rec.colorAway2 || "#2c5fa8"],
    homeSquad: rec.homeSquad || "",
    awaySquad: rec.awaySquad || "",
  };
}
```

Add `import { matchOutcome } from "@/lib/home-away";` to `match-list.ts`. For `matchProgress`, change its parse call to the home/away settings (it only reads `parsed.scoring`/`notes`/`halfMarks` lengths — no identity):

```ts
  const parsed = parseMatch(rec.raw, {
    homeTeam: rec.homeTeam, awayTeam: rec.awayTeam, scoringMode,
    homeRoster: rec.homeRoster, awayRoster: rec.awayRoster, label: rec.label,
  });
```

- [ ] **Step 3: Typecheck (model/match-list/parser should now align)**

Run: `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npx tsc --noEmit`
Expected: remaining errors only in `lib/sample.ts`, `lib/team-link.ts`, `lib/store.ts`, `lib/home-away.ts` (Tasks 4–9). `MatchTracker.tsx` is `@ts-nocheck` (no errors surface there).

---

## Task 4: `lineup-badges.ts` — stays dual-keyed in ④a

**No change in ④a.** `lineupBadges` is already venue-aware (dual-keyed `"us"|"them"` + `"home"|"away"`, from ③.2a). The public page + infographic already pass `"home"|"away"`; the editor still passes `"us"|"them"` via its own `mdl` (built in `MatchTracker` ~747) and stays untouched in ④a. **Collapsing to home/away-only is deferred to ④b**, when the editor's `mdl` + lineup calls flip. So `lib/lineup-badges.ts` and `test/lineup-badges.test.ts` are **untouched in ④a**. (This task is a no-op placeholder kept so the spec's "collapse lineupBadges" item is explicitly tracked as ④b work.)

---

## Task 5: `home-away.ts` trim (keep `recordHomeAway` shim + `matchOutcome`)

**Files:** Modify `lib/home-away.ts`.

- [ ] **Step 1: Delete `sideToVenue`, `venueSeries`, `venueItems`.** Keep `matchOutcome` and `recordHomeAway` (the latter is the ④a shim, deleted in ④b). `recordHomeAway` currently reads `r.myTeam`/`r.colorUs`/… — leave it exactly as-is (it operates on the editor's us/them payload). Remove the now-unused `TeamRoster` import only if nothing else needs it (recordHomeAway uses it — keep).
- [ ] **Step 2: Update `test/home-away.test.ts`** — delete the `sideToVenue`/`venueSeries`/`venueItems` describe blocks; keep `matchOutcome` + `recordHomeAway` tests. Run `npm test -- home-away`; green.

---

## Task 6: `team-link.ts` → home/away

**Files:** Modify `lib/team-link.ts`; Test `test/team-link.test.ts`, `test/team-templates.test.ts` (whichever assert the patch).

- [ ] **Step 1: Rewrite `teamLinkPatch` + `linkExistingMatchPatch` + `swapHomeAway`**

```ts
export function teamLinkPatch(
  record: MatchRecord,
  { homeTeam, awayTeam }: { homeTeam: TeamRecord; awayTeam: TeamRecord },
) {
  const hasHome = !!(record.homeRoster && record.homeRoster.formation.length);
  const homeRoster = hasHome ? clone(record.homeRoster!) : clone(homeTeam.roster);
  return {
    label: record.label,
    homeTeam: homeTeam.name,
    awayTeam: awayTeam.name,
    colorHome: homeTeam.color1 || record.colorHome,
    colorHome2: homeTeam.color2 || record.colorHome2,
    colorAway: awayTeam.color1 || record.colorAway,
    colorAway2: awayTeam.color2 || record.colorAway2,
    homeTeamId: homeTeam.id,
    awayTeamId: awayTeam.id,
    homeRoster,
    awayRoster: clone(awayTeam.roster),
    homeSquad: homeTeam.squad || "",
    awaySquad: awayTeam.squad || "",
  };
}

export function linkExistingMatchPatch(
  record: MatchRecord,
  { homeTeam, awayTeam }: { homeTeam: TeamRecord; awayTeam: TeamRecord },
): Partial<MatchRecord> {
  const patch: Partial<MatchRecord> = { homeTeamId: homeTeam.id, awayTeamId: awayTeam.id };
  if (!(record.homeRoster && record.homeRoster.formation.length)) patch.homeRoster = clone(homeTeam.roster);
  if (!(record.awayRoster && record.awayRoster.formation.length)) patch.awayRoster = clone(awayTeam.roster);
  if (!record.homeSquad && homeTeam.squad) patch.homeSquad = homeTeam.squad;
  if (!record.awaySquad && awayTeam.squad) patch.awaySquad = awayTeam.squad;
  return patch;
}

export function swapHomeAway(record: MatchRecord) {
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

`teamsToPublish` is unchanged (reads `homeTeamId`/`awayTeamId`). Update callers that pass `{ usTeam, oppTeam, homeAway }` (Task 7/9 wiring + tests) to `{ homeTeam, awayTeam }`.

- [ ] **Step 2: Update `test/team-link.test.ts`** to the home/away patch shape (assertions: `homeTeam`/`awayTeam`/`colorHome`/`homeTeamId` etc.). Run `npm test -- team-link`; green.

---

## Task 7: Reconcile helper + `store.ts` migration & `set` shim

**Files:** Modify `lib/store.ts`, `lib/team-link.ts` (add the pure reconcile helper) ; Test `test/team-link.test.ts` (reconcile cases).

- [ ] **Step 1: Add a pure reconcile helper (in `team-link.ts`)**

```ts
// ④a: derive a record's home/away identity, preferring the linked teams (the durable
// source). homeById = a map of teamId → TeamRecord. Falls back to whatever the record
// already carries (post-③.1 home/away fields). Returns a Partial to merge.
export function reconcileHomeAwayFromTeams(
  record: MatchRecord,
  teamsById: Record<string, TeamRecord>,
): Partial<MatchRecord> {
  const home = record.homeTeamId ? teamsById[record.homeTeamId] : undefined;
  const away = record.awayTeamId ? teamsById[record.awayTeamId] : undefined;
  const patch: Partial<MatchRecord> = {};
  if (home) {
    patch.homeTeam = home.name; patch.homeSquad = home.squad || "";
    patch.colorHome = home.color1 || record.colorHome; patch.colorHome2 = home.color2 || record.colorHome2;
  }
  if (away) {
    patch.awayTeam = away.name; patch.awaySquad = away.squad || "";
    patch.colorAway = away.color1 || record.colorAway; patch.colorAway2 = away.color2 || record.colorAway2;
  }
  return patch;
}
```

(Rosters are NOT reconciled — a match's lineup is its own snapshot, possibly hand-edited; only name/squad/colours come from the team. This matches today's `linkExistingMatchPatch` which never overwrites an existing roster.)

- [ ] **Step 2: `store.set` shim** — accept the editor's us/them payload and write canonical home/away

```ts
async set(id: string, data: any): Promise<boolean> {
  // ④a: editor still passes us/them; convert via recordHomeAway. Records from the
  // migration/Landing are already home/away (no myTeam) and pass through unchanged.
  const rec: MatchRecord = data && data.myTeam !== undefined ? stripUsThem({ ...data, ...recordHomeAway(data) }) : data;
  cache[id] = rec;
  const { error } = await sb.from("matches").upsert(Object.assign({ id, data: rec, updated_at: new Date().toISOString() }, matchCols(rec)));
  if (error) console.warn("save failed", error.message);
  return !error;
},
```

with a local helper:

```ts
// drop the dead us/them keys so the persisted record is clean home/away (④a)
function stripUsThem(r: any): MatchRecord {
  const { myTeam, opponent, colorUs, colorUs2, colorThem, colorThem2, usRoster, oppRoster, usSquad, oppSquad, homeAway, ...rest } = r;
  return rest as MatchRecord;
}
```

Import `recordHomeAway` from `@/lib/home-away` in `store.ts`.

- [ ] **Step 3: Migration pass in `loadAll`** (guarded by `notationV: 3`)

`loadAll` has no `userId`, so the team-reconcile lives in a separate exported pass (like `linkUnlinkedMatches`). Add:

```ts
import { reconcileHomeAwayFromTeams } from "@/lib/team-link";
import { teamStore } from "@/lib/team-store";
import type { TeamRecord } from "@/lib/types";

// ④a one-time: bring every record to v3 home/away, reconciling name/squad/colours
// from the linked teams. Idempotent (skips notationV === 3); resilient per-record.
export async function migrateHomeAway(userId: string | null) {
  const teams: TeamRecord[] = userId ? await teamStore.list(userId) : [];
  const byId: Record<string, TeamRecord> = {};
  teams.forEach((t) => { if (t.id) byId[t.id] = t; });
  const ids = Object.keys(cache).filter((id) => cache[id] && cache[id].notationV !== 3);
  for (const id of ids) {
    try {
      const cur: any = cache[id];
      // ③.1 already populated home/away fields; recordHomeAway re-derives them if a
      // legacy us/them record somehow lacks them.
      const base = cur.homeTeam !== undefined ? cur : { ...cur, ...recordHomeAway(cur) };
      const reconciled = { ...base, ...reconcileHomeAwayFromTeams(base, byId), notationV: 3 };
      const clean = stripUsThem(reconciled);
      cache[id] = clean;
      await store.set(id, clean);
    } catch (e) { console.warn("home/away migration failed for", id, e); }
  }
}
```

(`store.set` on a home/away record — `data.myTeam === undefined` — passes through unchanged; `matchCols` unchanged.) Also remove the old ③.1 home/away backfill block in `loadAll` (superseded) and the `linkUnlinkedMatches`'s `linkExistingMatchPatch` call must pass `{ homeTeam, awayTeam }` now — update it to find-or-create then build `{homeTeam: usTeam-as-home?, ...}`. **Simplify `linkUnlinkedMatches`** to: for an unlinked record, find-or-create teams from `record.homeTeam`/`record.awayTeam` (falling back to `recordHomeAway(record)` for legacy), then `linkExistingMatchPatch(record, { homeTeam, awayTeam })`.

- [ ] **Step 4: Wire `migrateHomeAway` into the bootstrap.** In `components/EditorApp.tsx`, after `linkUnlinkedMatches(...)`, call `await migrateHomeAway(userId)`. Reload the open match if needed (mirror the existing pattern).

- [ ] **Step 5: Wire the reconcile into `Landing`.** In `components/Landing.tsx`, after the user's own matches are fetched, run `reconcileHomeAwayFromTeams` per record against the user's teams (fetch `teamStore.list(userId)` once) and, when the patch changes anything, `store.set` the updated record (and use the reconciled values for display). This is what makes the **home screen self-heal** without opening the editor. Keep it resilient (per-record try/catch) and only for the user's own rows (not the public feed).

- [ ] **Step 6: Verify** — `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npx tsc --noEmit` clean (except MatchTracker @ts-nocheck); suite green after Task 8.

---

## Task 8: `sample.ts` + test suite → home/away

**Files:** Modify `lib/sample.ts`; update `test/model.test.ts`, `test/parse-events.test.ts`, `test/match-list.test.ts`, `test/migrate-notation.test.ts`, `test/score-card.test.ts`, `test/score-header.test.ts`, `test/name-display.test.ts`.

- [ ] **Step 1: `SAMPLE_RECORD` → home/away.** SAMPLE is `homeAway:"away"` today (Racoons away). Convert to the equivalent home/away record (Wildebeests home, Racoons away), preserving the SAME match (raw unchanged):

```ts
export const SAMPLE_RECORD: MatchRecord = {
  raw: SAMPLE,
  homeTeam: "Wildebeests", awayTeam: "Racoons", label: "U13A Hurling",
  sport: "hurling",
  colorHome: "#c0392b", colorHome2: "#2c5fa8", colorAway: "#f5c518", colorAway2: "#1f7a4d",
  nameDisplay: "full",
  awayRoster: RACOONS,
  homeRoster: { formation: [], players: [] },
  matchDate: "2026-06-02T18:21",
  notationV: 3,
};
```

(Racoons are now the AWAY team — so `awayRoster: RACOONS`; the home/away colours swap to match. The raw notation is unchanged, so the parser must still credit Rick/Morty as before — they're in `awayRoster` now and resolve there.)

- [ ] **Step 2: Update the canonical finals tests.** In `test/model.test.ts` the values are unchanged but re-expressed: Racoons (now away) finish 2-6 → `m.awayTotals.str === "2-6"`; Wildebeests (home) 2-7 → `m.homeTotals.str === "2-7"`; `m.outcome` `{ winner: "home", margin: 1 }`; Rick/Morty are `m.awayScorers`; `m.maxLeadVenue === "away"` (Racoons led). Remove the `recordHomeAway(SAMPLE_RECORD)` describe (helper now operates only on us/them payloads — replace with a parseMatch-of-SAMPLE assertion if useful, else drop).

- [ ] **Step 3: Update `parse-events.test.ts`** — assertions reference the engine's A/B output, unchanged. Only update any that went through the old `parseMatch` us/them adapter to the home/away shape (`totals.home`/`away`, `side: "home"`).

- [ ] **Step 4: Update remaining test files** mechanically: any literal record using `myTeam`/`colorUs`/`usRoster`/`homeAway` → home/away equivalent; any model/parsed read of `usName`/`totals.us`/`side:"us"` → home/away. `score-card.test.ts`/`score-header.test.ts` already read home/away (③.2). Run the full suite.

- [ ] **Step 5: Verify the canonical finals** (`npm test`): SAMPLE produces Wildebeests 2-7 (home) / Racoons 2-6 (away), Rick 2-4 (4 frees) + Morty 0-1 in `awayScorers`, leadChanges 1, timesLevel 3, maxLead 5, 0 warnings. **These values must match the pre-④ finals exactly.**

---

## Task 9: `MatchTracker` import swap + migration call site + APP_VERSION

**Files:** Modify `components/MatchTracker.tsx` (minimal), `lib/constants.ts`.

- [ ] **Step 1: Editor uses the legacy shim.** In `MatchTracker.tsx`, change the parser import + the one parse call:
  - `import { parseMatch, isPlaceholderLabel } from "@/lib/parser";` → `import { parseMatchLegacy, isPlaceholderLabel } from "@/lib/parser";`
  - line ~207: `parseMatch(raw, { myTeam, ... })` → `parseMatchLegacy(raw, { myTeam, scoringMode: scoringModeForSport(sport), label, homeAway, opponent, usRoster, oppRoster })`.
  These are the ONLY ④a edits to `MatchTracker`. Its us/them state, `recordPayload()` (us/them), `store.set`, and `buildModel(recordPayload())` are unchanged — the shims in Tasks 3/7 accept the us/them payload.

- [ ] **Step 2: `team-link` callers in `MatchTracker`** (the new-match wizard `finishNew`, re-pick `reTeamApply`) call `teamLinkPatch(record, { usTeam, oppTeam, homeAway })`. Update these call sites to `{ homeTeam, awayTeam }` (map the wizard's picked Home/Away teams directly — the wizard already picks home & away). Verify by reading `finishNew`/`reTeamApply`; pass the home-picked team as `homeTeam`, away-picked as `awayTeam`. (Editor still stores us/them state, but the LINK patch writes home/away — `store.set`'s shim handles the mixed payload; the migration/reconcile will normalize.)

> If wiring `teamLinkPatch` cleanly into the still-us/them wizard proves entangled, STOP and report — it may be cleaner to defer the wizard's link wiring to ④b with the rest of the editor. (The migration + reconcile still backfill links via `linkUnlinkedMatches`.)

- [ ] **Step 3: Bump APP_VERSION** in `lib/constants.ts` → `"v83"`.

- [ ] **Step 4: Full verify.** `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npx tsc --noEmit` (clean; MatchTracker @ts-nocheck), `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test` (green, canonical finals intact). Commit.

- [ ] **Step 5: Commit** the coupled core (Tasks 1–9) — given the type coupling, the implementer may commit in coherent groups (types+parser+shim; model+match-list; lineup-badges; home-away; team-link; store+migration; sample+tests; editor-swap+version) as long as `tsc`/suite are green at each commit. Final commit message e.g. `refactor(home-away): ④a typed core — parser/model/record home/away + reconcile migration; editor shimmed (v83)`.

---

## Manual verification (after ④a; reviewer/human)

- Public match page, OG, share poster, **home screen list (squads present!)**, editor read-only display — all unchanged vs v82.
- The editor still fully works (live entry, game mode, lineup, save, share) — it's running on the legacy shim.
- On next load, records migrate to `notationV: 3`; the home screen shows correct squads even without opening the editor (Landing reconcile).

## Self-review (spec coverage)

- Record/Settings/ParsedMatch home/away → Task 1. Parser flip + shim → Task 2. model/match-list → Task 3. lineup-badges → Task 4. home-away trim → Task 5. team-link → Task 6. migration (reconcile-from-teams) + store.set shim + **Landing reconcile** → Task 7. sample+tests (canonical parity) → Task 8. editor shim swap + version → Task 9.
- Deferred to ④b (per spec): MatchTracker state/flow/lineup flip; delete `parseMatchLegacy` + `recordHomeAway`; **collapse `lineupBadges` to home/away-only** (kept dual-keyed in ④a — Task 4 — because the editor still calls it `"us"/"them"` via its own `mdl` at MatchTracker ~747).
- Editor `mdl` note for ④b: `MatchTracker` builds `mdl = { timeline, usScorers, themScorers }` and calls `lineupBadges(mdl, "us"/"them", …)`. ④b flips `mdl` to `{ timelineHA, homeScorers, awayScorers }` + `"home"/"away"` calls, then removes the us/them branch from `lineupBadges`.
