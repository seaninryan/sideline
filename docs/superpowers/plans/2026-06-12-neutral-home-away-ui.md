# Neutral home/away display (②) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Present every match neutrally — home-left / away-right ordering and a "Won by N / Leading by N / Level" result (no Win/Loss) — across the public page, the editor's read components, and the share image, building on ①'s home/away model view.

**Architecture:** Pure helpers `venueSeries`/`venueItems` (in `lib/home-away.ts`) re-orient side-keyed data to home/away; `buildModel` exposes `homeSeries` + `timelineHA`. The shared components `ScoreChart`/`Scorers`/`Timeline` switch to home/away props (mirroring the already-neutral `ScoreHeader`), each flipped together with its callers (`PublicMatch`, `MatchTracker`) in one commit. `PublicMatch` and the OG score card replace the us-perspective `result` with `model.outcome`. `infographic` (its own inline SVG) switches to home/away + neutral result.

**Tech Stack:** Next.js 14, TypeScript, Vitest. Node 20 (`nvm use 20` before npm/npx; default shell node is v14).

**Source spec:** `docs/superpowers/specs/2026-06-12-neutral-home-away-ui-design.md`
**Branch:** `neutral-home-away-ui` (already checked out; off `main`, v77 — has ①).

Baseline: **316 tests**. `APP_VERSION`: `v77`. `Model` is `Record<string,any>`. ① already added `homeName`/`awayName`/`homeColors`/`awayColors`/`homeTotals`/`awayTotals`/`homeScorers`/`awayScorers`/`homeSquad`/`awaySquad`/`outcome` + `sideToVenue`/`matchOutcome`.

**Data shapes (confirmed):** chart `series` points = `{ x, us, them, usScore, themScore, mmin }`; `goalDots` = `{ x, y, label, side }` (renderers use only `x/y/label`); `chartMarkers` = `{ x, kind, label, side }` (renderers use only `x/kind/label`); `timeline` events = `{ kind, side: "us"|"them"|null, half, seq, minute, mmin, usScore, themScore, scorer, type, … }`. Only `series` and `timeline` need home/away re-orientation (goalDots/chartMarkers carry `side` but no renderer reads it — left as pass-through, YAGNI).

---

## Task 1: `venueSeries` + `venueItems` pure helpers

**Files:** Modify `lib/home-away.ts`; extend `test/home-away.test.ts`.

- [ ] **Step 1: Add failing tests** (append to `test/home-away.test.ts`):

```ts
import { venueSeries, venueItems } from "@/lib/home-away";

describe("venueSeries", () => {
  const series = [{ x: 0, us: 1, them: 2, usScore: "0-1", themScore: "0-2", mmin: 5 }];
  it("usIsHome=true keeps us as home", () => {
    expect(venueSeries(series, true)[0]).toMatchObject({ x: 0, home: 1, away: 2, homeScore: "0-1", awayScore: "0-2" });
  });
  it("usIsHome=false swaps us→away", () => {
    expect(venueSeries(series, false)[0]).toMatchObject({ x: 0, home: 2, away: 1, homeScore: "0-2", awayScore: "0-1" });
  });
  it("preserves other point fields (mmin)", () => {
    expect(venueSeries(series, true)[0].mmin).toBe(5);
  });
});

describe("venueItems", () => {
  const items = [
    { side: "us", usScore: "1-0", themScore: "0-0", kind: "score" },
    { side: "them", usScore: "1-0", themScore: "0-1", kind: "score" },
    { side: null, kind: "note" },
  ];
  it("usIsHome=true: us→home, them→away; adds home/awayScore", () => {
    const r = venueItems(items as any, true);
    expect(r[0]).toMatchObject({ side: "home", homeScore: "1-0", awayScore: "0-0", kind: "score" });
    expect(r[1]).toMatchObject({ side: "away", homeScore: "1-0", awayScore: "0-1" });
    expect(r[2]).toMatchObject({ side: null, kind: "note" });
  });
  it("usIsHome=false: us→away, them→home", () => {
    const r = venueItems(items as any, false);
    expect(r[0].side).toBe("away");
    expect(r[1].side).toBe("home");
    // homeScore/awayScore follow venue: usIsHome=false → home shows themScore
    expect(r[0]).toMatchObject({ homeScore: "0-0", awayScore: "1-0" });
  });
});
```

- [ ] **Step 2: Run → FAIL.** `export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use 20; npx vitest run test/home-away.test.ts`

- [ ] **Step 3: Implement** (append to `lib/home-away.ts`; `sideToVenue` already exists there):

```ts
export function venueSeries(
  series: { x: number; us: number; them: number; usScore: string; themScore: string; [k: string]: any }[],
  usIsHome: boolean,
): { x: number; home: number; away: number; homeScore: string; awayScore: string; [k: string]: any }[] {
  return series.map((p) => ({
    ...p,
    home: usIsHome ? p.us : p.them,
    away: usIsHome ? p.them : p.us,
    homeScore: usIsHome ? p.usScore : p.themScore,
    awayScore: usIsHome ? p.themScore : p.usScore,
  }));
}

// Re-key side-tagged items ("us"/"them" → "home"/"away") preserving all other
// fields; when an item carries usScore/themScore, add home/awayScore too.
export function venueItems<T extends { side?: "us" | "them" | null; usScore?: string; themScore?: string }>(
  items: T[],
  usIsHome: boolean,
): (T & { side: "home" | "away" | null; homeScore?: string; awayScore?: string })[] {
  return items.map((it) => ({
    ...it,
    side: sideToVenue(it.side, usIsHome ? "home" : "away"),
    homeScore: usIsHome ? it.usScore : it.themScore,
    awayScore: usIsHome ? it.themScore : it.usScore,
  }));
}
```

- [ ] **Step 4: Run → PASS.** `npx vitest run test/home-away.test.ts`

- [ ] **Step 5: Commit.**
```bash
git add lib/home-away.ts test/home-away.test.ts
git commit -m "feat(home-away): venueSeries + venueItems display mappers"
```

---

## Task 2: `buildModel` exposes `homeSeries` + `timelineHA`

**Files:** Modify `lib/model.ts`; extend `test/model.test.ts`.

- [ ] **Step 1: Add test assertions** to the existing `SAMPLE_RECORD` model test (homeAway "away", so usIsHome=false):

```ts
    // ② display mapping (additive)
    expect(Array.isArray(m.homeSeries)).toBe(true);
    expect(m.homeSeries.length).toBe(m.series.length);
    // a score event tagged "us" maps to side "away" (SAMPLE is homeAway:"away")
    const usEvent = m.timeline.find((t: any) => t.side === "us");
    const mapped = m.timelineHA.find((t: any) => t.seq === usEvent.seq && t.half === usEvent.half);
    expect(mapped.side).toBe("away");
```

- [ ] **Step 2: Run → FAIL.** `npx vitest run test/model.test.ts`

- [ ] **Step 3: Implement** in `lib/model.ts`. Add to the import: `import { sideToVenue, matchOutcome, venueSeries, venueItems } from "@/lib/home-away";` (matchOutcome already imported from ①; add the others — `sideToVenue` IS now used transitively but only via venueItems, so import just the three used: `matchOutcome, venueSeries, venueItems`). Where `usIsHome` is computed (from ①), after `timeline` is built, add:
```ts
  const homeSeries = venueSeries(series as any, usIsHome);
  const timelineHA = venueItems(timeline as any, usIsHome);
```
and add to the returned object (additive):
```ts
    homeSeries, timelineHA,
```

- [ ] **Step 4: Run → PASS.** `npx vitest run test/model.test.ts`

- [ ] **Step 5: Commit.**
```bash
git add lib/model.ts test/model.test.ts
git commit -m "feat(home-away): model exposes homeSeries + timelineHA (display data)"
```

---

## Task 3: Flip `ScoreChart` → home/away (+ its 2 callers)

**Files:** Modify `components/ScoreChart.tsx`, `components/PublicMatch.tsx`, `components/MatchTracker.tsx`. (`@ts-nocheck` on MatchTracker; verify with `npm run build`.)

`ScoreChart` only reads `series` (lines + end-labels) and `colorUs`/`colorThem`; `nameUs`/`nameThem` are declared but unused. `goalDots`/`chartMarkers` use `x/y/kind/label` only — unchanged.

- [ ] **Step 1: ScoreChart props → home/away.** Change the signature + body:
  - Props: `series, goalDots, chartMarkers = [], htLine, colorHome, colorAway, mode = "gaa"` with types `colorHome: string; colorAway: string; mode?: string;` (drop the unused `nameUs?`/`nameThem?`).
  - `const cUs = chartColor(colorUs)` → `const cHome = chartColor(colorHome), cAway = chartColor(colorAway);`
  - `yMax`: `Math.max(p.us, p.them)` → `Math.max(p.home, p.away)`.
  - `stepPath("them")`/`stepPath("us")` → `stepPath("away")` then `stepPath("home")` (home drawn last/on top, width 3; away width 2.5 — same emphasis, now home-primary). Strokes `cAway`/`cHome`.
  - end-labels: `last.us`→`last.home`, `last.usScore`→`last.homeScore`, `cUs`→`cHome`; `last.them`→`last.away`, `last.themScore`→`last.awayScore`, `cThem`→`cAway`.

- [ ] **Step 2: Update callers.**
  - `components/PublicMatch.tsx:199`: `<ScoreChart series={m.homeSeries} goalDots={m.goalDots} chartMarkers={m.chartMarkers} htLine={m.htLine} colorHome={m.homeColors[0]} colorAway={m.awayColors[0]} mode={m.effMode} />`
  - `components/MatchTracker.tsx:1201`: the editor has `series`/`goalDots`/etc. in scope from `parsed`, plus `colorUs`/`colorThem`/`homeAway`. Compute the home/away series inline (or read from a model — the editor doesn't build the full model). Simplest: import `venueSeries` + `sideToVenue` are overkill; the editor has `homeAway`. Add near the editor's `parsed`: `const usIsHome = homeAway === "home"; const homeSeries = venueSeries(series, usIsHome);` (import `venueSeries` from `@/lib/home-away`), and `const homeColor = usIsHome ? colorUs : colorThem; const awayColor = usIsHome ? colorThem : colorUs;`. Then: `<ScoreChart series={homeSeries} goalDots={goalDots} chartMarkers={chartMarkers} htLine={htLine} colorHome={homeColor} colorAway={awayColor} mode={effMode} />`

- [ ] **Step 3: Verify.** `npm test 2>&1 | grep Tests` (unchanged); `npm run build 2>&1 | tail -4` (success); `grep -n "colorUs\|nameUs" components/ScoreChart.tsx` → none.

- [ ] **Step 4: Commit.**
```bash
git add components/ScoreChart.tsx components/PublicMatch.tsx components/MatchTracker.tsx
git commit -m "feat(home-away): ScoreChart uses home/away series + colours"
```

---

## Task 4: Flip `Scorers` → home/away (+ its 2 callers)

**Files:** Modify `components/Scorers.tsx`, `components/PublicMatch.tsx`, `components/MatchTracker.tsx`.

- [ ] **Step 1: Scorers props → home/away.** Signature → `{ home = [], away = [], colorHome, colorHome2, colorAway, colorAway2, mode = "gaa" }` (types mirror current). Body rows:
```tsx
  const rows = [
    ...home.map((s) => ({ ...s, c1: colorHome, c2: colorHome2 })),
    ...away.map((s) => ({ ...s, c1: colorAway, c2: colorAway2 })),
  ].sort((a, b) => gpTotal(b.g, b.p, mode) - gpTotal(a.g, a.p, mode));
```
(The list is sorted by total anyway, so the home/away split only affects each row's jersey colours — now correct per venue.)

- [ ] **Step 2: Update callers.**
  - `PublicMatch.tsx:206`: `<Scorers home={m.homeScorers} away={m.awayScorers} colorHome={m.homeColors[0]} colorHome2={m.homeColors[1]} colorAway={m.awayColors[0]} colorAway2={m.awayColors[1]} mode={m.effMode} />`
  - `MatchTracker.tsx:1205`: using the editor's `usIsHome`/`homeColor`/`awayColor` (from Task 3) and `usScorers`/`themScorers`: `<Scorers home={usIsHome ? usScorers : themScorers} away={usIsHome ? themScorers : usScorers} colorHome={usIsHome ? colorUs : colorThem} colorHome2={usIsHome ? colorUs2 : colorThem2} colorAway={usIsHome ? colorThem : colorUs} colorAway2={usIsHome ? colorThem2 : colorUs2} mode={effMode} />`

- [ ] **Step 3: Verify.** `npm test` unchanged; `npm run build` success; `grep -n "\bus\b\|colorUs" components/Scorers.tsx` → none.

- [ ] **Step 4: Commit.**
```bash
git add components/Scorers.tsx components/PublicMatch.tsx components/MatchTracker.tsx
git commit -m "feat(home-away): Scorers uses home/away arrays + colours"
```

---

## Task 5: Flip `Timeline` → home/away (+ CSS + its 3 callers)

**Files:** Modify `components/Timeline.tsx`, `app/globals.css`, `components/PublicMatch.tsx`, `components/MatchTracker.tsx`.

- [ ] **Step 1: Timeline props + body → home/away.** Signature → `{ timeline = [], halfMarks = [], colorHome, colorHome2, colorAway, colorAway2, nameHome = "Home", nameAway = "Away" }`. In the body, replace every `it.side === "us"`→`it.side === "home"` and `it.side === "them"`→`it.side === "away"`; `colorUs/colorUs2`→`colorHome/colorHome2`, `colorThem/colorThem2`→`colorAway/colorAway2`; `usName`→`nameHome`, `themName`→`nameAway`; in the score span use `it.homeScore`/`it.awayScore` (from `timelineHA`) instead of `it.usScore`/`it.themScore`, with the `chg` highlight keyed `it.side === "home"`/`"away"`. The `mt-ev ${it.side}` class now emits `home`/`away`.

- [ ] **Step 2: CSS `.them` → `.away`.** In `app/globals.css`, rename the timeline side rules (lines ~96–98, 111–113) from `.mt-ev.them` to `.mt-ev.away` (default `.mt-ev` stays = home/left). Exactly: `.mt-ev.them` → `.mt-ev.away`, `.mt-ev.them:before` → `.mt-ev.away:before`, `.mt-ev.them.goal:before` → `.mt-ev.away.goal:before`, `.mt-ev.them{flex-direction…}` → `.mt-ev.away{…}`, `.mt-ev.them .sc` → `.mt-ev.away .sc`, `.mt-ev.them .m` → `.mt-ev.away .m`.

- [ ] **Step 3: Update callers** (Timeline appears once in PublicMatch, twice in MatchTracker):
  - `PublicMatch.tsx:289`: `<Timeline timeline={m.timelineHA} halfMarks={m.halfMarks} colorHome={m.homeColors[0]} colorHome2={m.homeColors[1]} colorAway={m.awayColors[0]} colorAway2={m.awayColors[1]} nameHome={m.homeName} nameAway={m.awayName} />`
  - `MatchTracker.tsx:1180` and `:1208`: editor needs a `timelineHA`. Add near `parsed`: `const timelineHA = venueItems(timeline, usIsHome);` (import `venueItems`). Both call sites → `<Timeline timeline={timelineHA} halfMarks={halfMarks} colorHome={homeColor} colorHome2={usIsHome ? colorUs2 : colorThem2} colorAway={awayColor} colorAway2={usIsHome ? colorThem2 : colorUs2} nameHome={usIsHome ? usName : themName} nameAway={usIsHome ? themName : usName} />`

- [ ] **Step 4: Verify.** `npm test` unchanged; `npm run build` success; `grep -rn "\.mt-ev\.them\|it.side === \"us\"\|usName" components/Timeline.tsx app/globals.css` → none.

- [ ] **Step 5: Commit.**
```bash
git add components/Timeline.tsx app/globals.css components/PublicMatch.tsx components/MatchTracker.tsx
git commit -m "feat(home-away): Timeline uses home/away sides, colours, CSS"
```

---

## Task 6: PublicMatch — neutral result + home/away lineup order + biggest-lead label

**Files:** Modify `components/PublicMatch.tsx`.

- [ ] **Step 1: Neutral result chip.** Replace the us-perspective result (lines ~30–34: `margin`, `resTxt` WIN/DEFEAT/DRAW, `resBg`, `resFg`) and wherever the pill renders, with `m.outcome`-driven text. Compute:
```tsx
  const finished = (m.halfMarks || []).some((mk: any) => mk.marker === "FT");
  const resTxt = m.outcome.winner === null ? "Level"
    : `${finished ? "Won" : "Leading"} by ${m.outcome.margin}`;
```
Render it as a neutral chip (neutral background, e.g. the existing draw colour `#e7dec6` / ink `#11241b`) — drop the win-gold / loss-red `resBg`/`resFg` mapping (no team-perspective colour). Keep the chip element/placement; just swap text + neutral colours.

- [ ] **Step 2: Lineup pitches home/away order.** The two lineup sections (~lines 210–256: "Team · {usName}" then "Team · {themName}", rendering `usRoster`/`oppRoster`-derived data) render us-then-them. Order them home-then-away: show the home team's pitch first. Use `m.homeName`/`m.awayName` for the labels and select the corresponding roster/scorers/colours by `m.homeAway === "home"` (us is home). Concretely, compute `const usIsHome = m.homeAway === "home";` and render the us section first when `usIsHome`, else the them section first — or factor the two sections into an array `[homeSide, awaySide]` ordered by venue. Labels: `Team · {m.homeName.toUpperCase()}` / `Team · {m.awayName.toUpperCase()}`.

- [ ] **Step 3: Biggest-lead stat.** Line ~191 `m.maxLeadSide === "us" ? usShort : themShort` → use `sideToVenue(m.maxLeadSide, m.homeAway)` to pick the home/away short name. Import `sideToVenue` from `@/lib/home-away`; compute `homeShort`/`awayShort` from `m.homeName`/`m.awayName`.

- [ ] **Step 4: Verify.** `npm test` unchanged; `npm run build` success; grep PublicMatch for residual `m.result`/`WIN`/`DEFEAT` → none.

- [ ] **Step 5: Commit.**
```bash
git add components/PublicMatch.tsx
git commit -m "feat(home-away): PublicMatch neutral result + home/away lineup order"
```

---

## Task 7: Share image (`infographic.ts`) — home/away + neutral OG result

**Files:** Modify `lib/infographic.ts`; update `test/score-card.test.ts`.

`infographic` builds its own SVG (doesn't use the components). The poster already uses a neutral "Won by N / Tie" chip; switch its sides to home/away. The OG card (`buildScoreCardSVG`) still uses the us-perspective `result` string.

- [ ] **Step 1: OG score card → neutral + home/away.** In `buildScoreCardSVG` (~lines 33–65): `usS`/`themS` and the `m.usName`/`m.themName` labels → `m.homeName`/`m.awayName` and `m.homeTotals.str`/`m.awayTotals.str` (left=home). Replace `const result = m.result || ""` and its rendering with the neutral outcome: `const result = m.outcome.winner === null ? "Tie" : \`Won by ${m.outcome.margin}\`;`.

- [ ] **Step 2: Poster → home/away.** In `buildInfographicSVG`: team-name/score header (~111–116) → `m.homeName`/`m.awayName`, `m.homeTotals.str`/`m.awayTotals.str`; the neutral result chip (~118–119) compute from `m.homeTotals.total`/`m.awayTotals.total` (already neutral logic — just feed home/away); chart (`m.series` `p.us`/`p.them` → use `m.homeSeries` `p.home`/`p.away`, end labels `homeScore`/`awayScore`, colours `m.homeColors`/`m.awayColors`); scorers leaderboard (use `m.homeScorers`/`m.awayScorers` + home/away colours); lineup pitches order home-then-away; timeline (use `m.timelineHA`, side home/away); `maxLeadSide` (~136) via `sideToVenue(m.maxLeadSide, m.homeAway)`. Import `sideToVenue` from `@/lib/home-away`.

- [ ] **Step 3: Update `test/score-card.test.ts`.** Adjust assertions for the neutral result text ("Won by N"/"Tie") and home-left/away-right names/scores (for SAMPLE: home=Wildebeests 2-7 left, away=Racoons 2-6 right, "Won by 1"). Read the current test and update the expected strings accordingly.

- [ ] **Step 4: Verify.** `npm test 2>&1 | grep Tests` → passing (score-card updated); `npm run build` success.

- [ ] **Step 5: Commit.**
```bash
git add lib/infographic.ts test/score-card.test.ts
git commit -m "feat(home-away): share poster + OG card use home/away + neutral result"
```

---

## Task 8: Version bump + final verification

**Files:** Modify `lib/constants.ts`.

- [ ] **Step 1:** `APP_VERSION` `"v77"` → `"v78"`.
- [ ] **Step 2:** `nvm use 20; npm test 2>&1 | grep -E "Test Files|Tests "` → all passing. `npm run build 2>&1 | tail -4` → success. `grep -rnE "WIN|DEFEAT|m\.result|colorUs.*ScoreChart|<Scorers us=" components/PublicMatch.tsx` → no stale us-result references.
- [ ] **Step 3:** Commit.
```bash
git add lib/constants.ts
git commit -m "chore: bump APP_VERSION to v78 (neutral home/away display)"
```

> **Tell the user:** look for **v78**. Public page, editor, and share image now read home-left / away-right with a neutral "Won by N / Level" result. No DB change. Manual check recommended: a match where you're the *away* team should show you on the right everywhere (header, chart, scorers, timeline, lineup, share image), with no "WIN/DEFEAT".

---

## Self-Review notes (addressed)

- **Spec coverage:** §1 venueSeries/venueItems → T1; model homeSeries/timelineHA → T2 (goalDotsHA/chartMarkersHA dropped — no renderer reads goalDot/marker `side`; noted YAGNI); §2 component flips → T3 (ScoreChart), T4 (Scorers), T5 (Timeline+CSS); §3 callers → folded into T3–T5 + T6 (PublicMatch) + T7 (infographic); §4 neutral result → T6 (PublicMatch) + T7 (OG card); editor → T3–T5 caller updates. All mapped.
- **Atomicity:** each component flip lands with its callers in one commit (T3/T4/T5), so the build is green at every commit; infographic (own SVG) is independent (T7).
- **Type consistency:** `venueSeries(series, usIsHome)` → points with `home/away/homeScore/awayScore`; `venueItems(items, usIsHome)` → `side: "home"|"away"|null` + `homeScore/awayScore`; components consume exactly those (`p.home`/`p.away`, `it.side==="home"`, `it.homeScore`). `colorHome`/`colorAway` etc. consistent across components + callers. `m.homeColors`/`m.awayColors` are `[primary, secondary]` (from ①).
- **Placeholder scan:** the editor caller edits give exact props; CSS renames listed line-by-line; infographic (T7) is the one broad-strokes task (one cohesive file) — its edits are enumerated by region with the exact field substitutions.
