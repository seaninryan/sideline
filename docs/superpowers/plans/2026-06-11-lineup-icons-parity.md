# Lineup Icons Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Show the same per-player lineup icons — sub arrows (▲▼), card chips, own-goal mark, and goal/point tally — for **both** teams (home AND away), consistently across all three lineup renderers (editor, public page, share image).

**Root cause being fixed:** Three independent renderers each hand-roll "which icon for which player": `PublicMatch.tsx` (side-aware `badges`, but no away score), `MatchTracker.tsx` (`subArrows`/`playerMarks`/`scoreFor` — home-only, NOT side-filtered), and `infographic.ts` `drawPitch` (home-only via a `withScores` flag; cards never drawn on jerseys). They have drifted. The fix introduces **one pure side-aware helper** consumed by all three, so they can't drift again.

**Architecture:** New pure helper `lineupBadges(model, side, num)` in `lib/lineup-badges.ts`, reading only `model.timeline` + `model.usScorers`/`model.themScorers` — a shape that BOTH the model (`lib/model.ts:27-37`) and the editor (`MatchTracker.tsx:578-588`) already build identically. Each renderer calls it instead of its own logic.

**Tech Stack:** TypeScript, React, Vitest, inline-SVG string builder (poster). No new deps.

**Branch:** `lineup-icons-parity` (off `main`). NOTE: PR #9 (live-public-updates) also edits `PublicMatch.tsx` but in different regions (subscription/state/score-header wrapper) than this work (the `badges` helper + lineup JSX). A small merge conflict is possible; resolve by keeping both.

---

## Data shapes (verified, for reference)

- `model.timeline` (and the editor's `timeline`, built identically): array of items.
  - sub: `{ kind: "sub", side: "us"|"them", onNum?: number, offNum?: number }`
  - card: `{ kind: "card", side: "us"|"them", num: number, card: "yellow"|"red" }`
  - score: `{ kind: "score", side: "us"|"them", num?: number, og?: boolean, ogNum?: number, ... }`
- `model.usScorers` / `model.themScorers`: `{ num, g, p, side, ... }[]` (a player appears once with their totals).
- Own goals: a score item with `og:true` and `ogNum` = the **conceding** player's shirt number; `side` = the team that **benefited**. The conceding player is therefore on the OPPOSITE side from the score item's `side`.

---

## File Structure

- **Create:** `lib/lineup-badges.ts` — the pure helper + its `LineupBadges` type.
- **Create:** `test/lineup-badges.test.ts` — unit tests.
- **Modify:** `components/PublicMatch.tsx` — replace ad-hoc `subOn/subOff/cardsBy`+`badges`+`usScoreFor` with the helper; render arrows+cards+og+score for BOTH teams (away gains a score line).
- **Modify:** `components/MatchTracker.tsx` — make `subArrows`/`playerMarks`/`scoreFor` side-aware via the helper; wire the away pitch + away bench (currently bare).
- **Modify:** `lib/infographic.ts` — `drawPitch` becomes side-aware via the helper (arrows+cards+og+score for both teams); render the away bench too.
- **Modify:** `lib/constants.ts` (`APP_VERSION`) + `CLAUDE.md`.

---

## Task 1: Pure `lineupBadges` helper (TDD)

**Files:** Create `lib/lineup-badges.ts`, `test/lineup-badges.test.ts`

- [ ] **Step 1: Write the failing test** — create `test/lineup-badges.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { lineupBadges } from "@/lib/lineup-badges";

// Minimal model-shaped fixture. The helper reads only timeline + scorer lists.
const model: any = {
  timeline: [
    { kind: "sub", side: "us", onNum: 17, offNum: 10 },
    { kind: "sub", side: "them", onNum: 21, offNum: 4 },
    { kind: "card", side: "us", num: 6, card: "yellow" },
    { kind: "card", side: "us", num: 6, card: "red" },
    { kind: "card", side: "them", num: 6, card: "yellow" },
    // own goal: them benefit (side:"them"), conceded by our #3
    { kind: "score", side: "them", og: true, ogNum: 3 },
  ],
  usScorers: [{ num: 14, g: 1, p: 2 }, { num: 6, g: 0, p: 0 }],
  themScorers: [{ num: 9, g: 0, p: 3 }],
};

describe("lineupBadges", () => {
  it("sub arrows are side-scoped (our #10 off, our #17 on; their #10 unaffected)", () => {
    expect(lineupBadges(model, "us", 10)).toMatchObject({ subOff: true, subOn: false });
    expect(lineupBadges(model, "us", 17)).toMatchObject({ subOn: true, subOff: false });
    expect(lineupBadges(model, "them", 10)).toMatchObject({ subOn: false, subOff: false });
    expect(lineupBadges(model, "them", 4)).toMatchObject({ subOff: true });
  });
  it("cards are side-scoped and collect multiple", () => {
    expect(lineupBadges(model, "us", 6).cards).toEqual(["yellow", "red"]);
    expect(lineupBadges(model, "them", 6).cards).toEqual(["yellow"]);
  });
  it("score comes from the correct side's scorer list", () => {
    expect(lineupBadges(model, "us", 14).score).toEqual({ g: 1, p: 2 });
    expect(lineupBadges(model, "them", 9).score).toEqual({ g: 0, p: 3 });
    expect(lineupBadges(model, "us", 9).score).toBeNull();   // 9 is a them scorer
    expect(lineupBadges(model, "us", 6).score).toBeNull();   // 0-0 ⇒ not a scorer
  });
  it("own goal marks the conceding player (our #3), not the beneficiary side", () => {
    expect(lineupBadges(model, "us", 3).og).toBe(true);
    expect(lineupBadges(model, "them", 3).og).toBe(false);
  });
});
```

- [ ] **Step 2: Run it, expect FAIL** — `npx vitest run test/lineup-badges.test.ts` (module not found).

- [ ] **Step 3: Implement** — create `lib/lineup-badges.ts`:

```ts
import type { Model } from "./types";

export interface LineupBadges {
  subOn: boolean;
  subOff: boolean;
  cards: string[];                       // e.g. ["yellow"] or ["yellow","red"]
  og: boolean;                           // player put through their own net
  score: { g: number; p: number } | null;
}

// Side-aware lineup badges for ONE player (by shirt number) on ONE side.
// Single source of truth shared by the editor lineup, the public page, and the
// poster image — all of which previously hand-rolled (and diverged on) this.
// Reads only timeline + per-side scorer lists; the editor builds these in the
// identical shape (MatchTracker timeline/usScorers/themScorers).
export function lineupBadges(
  m: Pick<Model, "timeline" | "usScorers" | "themScorers">,
  side: "us" | "them",
  num: number,
): LineupBadges {
  const scorers = side === "them" ? m.themScorers : m.usScorers;
  const sc = (scorers || []).find((s: any) => s.num === num && (s.g || s.p));
  let subOn = false, subOff = false, og = false;
  const cards: string[] = [];
  (m.timeline || []).forEach((t: any) => {
    const tSide = t.side === "them" ? "them" : "us";
    if (t.kind === "sub" && tSide === side) {
      if (t.onNum === num) subOn = true;
      if (t.offNum === num) subOff = true;
    } else if (t.kind === "card" && tSide === side && t.num === num) {
      cards.push(t.card);
    } else if (t.kind === "score" && t.og && t.ogNum === num && tSide !== side) {
      og = true; // the conceding player is on the side opposite the beneficiary
    }
  });
  return { subOn, subOff, cards, og, score: sc ? { g: sc.g, p: sc.p } : null };
}
```

- [ ] **Step 4: Run it, expect PASS** — `npx vitest run test/lineup-badges.test.ts` (4 passed).

- [ ] **Step 5: Commit**

```bash
git add lib/lineup-badges.ts test/lineup-badges.test.ts
git commit -m "feat(lineup): add pure side-aware lineupBadges helper"
```

---

## Task 2: Public page — icons for both teams via the helper

**Files:** Modify `components/PublicMatch.tsx`

Read the file first. Today (v68 baseline) it has, near the top of the component:
- a `subOn`/`subOff`/`cardsBy` derivation + a `badges(n, side)` that renders arrows + cards (NO og), and
- `const usScoreFor = (n) => (m.usScorers||[]).find(...)` (home-only score).
The home lineup section renders `badges(n,"us")` + a `.sc` score div; the away section renders only `badges(n,"them")` (NO score) for both formation jerseys and away subs.

- [ ] **Step 1: Import the helper.** Add near the other lib imports:
```tsx
import { lineupBadges } from "@/lib/lineup-badges";
```

- [ ] **Step 2: Replace the ad-hoc badge derivation.** Delete the `subOn`/`subOff`/`cardsBy` `Record` declarations and the `(m.timeline||[]).forEach(...)` block that fills them, and replace the `badges` + `usScoreFor` definitions with side-aware versions driven by the helper:

```tsx
  const badges = (n: number, side: "us" | "them") => {
    const b = lineupBadges(m, side, n);
    return (
      <>
        {(b.subOn || b.subOff) && (
          <span className="pm-arrows">{b.subOn && <span className="on">▲</span>}{b.subOff && <span className="off">▼</span>}</span>
        )}
        {b.cards.map((c, i) => <span key={i} className={"pm-card " + (c === "red" ? "red" : "yellow")} />)}
        {b.og && <span className="pm-og" style={{ marginLeft: 2, fontSize: 9, fontWeight: 700, color: "#ff6e63" }}>OG</span>}
      </>
    );
  };
  // per-player score tally (either side), e.g. "1-2" in GAA or ● per goal in soccer
  const scoreFor = (n: number, side: "us" | "them") => {
    const sc = lineupBadges(m, side, n).score;
    if (!sc) return null;
    return <div className="sc">{m.effMode === "goals" ? "●".repeat(sc.g) : `${sc.g}-${sc.p}`}</div>;
  };
```

NOTE: `subOff.us.has(...)` is also used elsewhere in the flat-starters fallback list (a `subOff.us.has(p.num)` check rendering a `▼`). Replace that usage with `lineupBadges(m, "us", p.num).subOff`.

- [ ] **Step 3: Use `scoreFor` in BOTH lineups.** In the HOME pitch + home subs, replace the existing inline `usScoreFor(n)` score rendering with `{scoreFor(n, "us")}` (keep the same `.sc` markup the helper now returns). In the AWAY pitch jerseys and away subs (which currently render only `badges(n,"them")`), add `{scoreFor(n, "them")}` right after the name/badges `<div className="nm">…</div>`, mirroring the home `.pm-jersey` structure (jersey → `nm` → `sc`).

- [ ] **Step 4: Verify** — `npm run build` (clean) + `npm test` (all pass). Then commit:
```bash
git add components/PublicMatch.tsx
git commit -m "feat(lineup): public page shows cards/arrows/og/score for both teams"
```

---

## Task 3: Editor — side-aware lineup icons; wire the away team

**Files:** Modify `components/MatchTracker.tsx` (carries `// @ts-nocheck` — no type annotations needed)

Read the file first. Today:
- `subArrows(num)`, `playerMarks(num)`, `scoreFor(num)` (around lines 687–710) are home-only: `subbedOn/subbedOff` come from `notes` un-filtered by side; `playerMarks` filters cards by `num` only; `scoreFor` hard-codes `side === "us"`.
- `timeline`, `usScorers`, `themScorers` are all in scope (defined at ~578/587/588).
- The HOME pitch + home subs call `subArrows(n)`, `playerMarks(n)`, `scoreFor(n)` (around lines 1190/1206).
- The AWAY/opponent lineup (around lines 1238–1253) renders bare jerseys + names only (formation rows AND away subs).

- [ ] **Step 1: Import the helper.** Add to the imports at the top:
```tsx
import { lineupBadges } from "@/lib/lineup-badges";
```

- [ ] **Step 2: Make the three helpers side-aware.** Replace the existing `subArrows`/`playerMarks`/`scoreFor` (and you may delete the now-unused `subbedOn`/`subbedOff` sets if nothing else uses them — check first) with versions that take a `side` and use the helper. Preserve the existing visual markup/colours:

```jsx
  const mdl = { timeline, usScorers, themScorers };
  const subArrows = (num, side) => {
    const b = lineupBadges(mdl, side, num);
    return (b.subOn || b.subOff) ? (
      <span style={{ fontSize: 10, letterSpacing: 1 }}>
        {b.subOn && <span style={{ color: "#2ecc71" }}>▲</span>}
        {b.subOff && <span style={{ color: "#ff6e63" }}>▼</span>}
      </span>
    ) : null;
  };
  const playerMarks = (num, side) => {
    const b = lineupBadges(mdl, side, num);
    if (!b.cards.length && !b.og) return null;
    return (
      <span style={{ marginLeft: 2, whiteSpace: "nowrap" }}>
        {b.cards.map((c, i) => <span key={i} style={{ display: "inline-block", width: 7, height: 10, borderRadius: 1.5, background: c === "red" ? "#e74c3c" : "#f1c40f", border: "1px solid rgba(0,0,0,.25)", marginLeft: 2, verticalAlign: "-1px" }} />)}
        {b.og && <span style={{ color: "#ff6e63", fontSize: 9, fontWeight: 600, marginLeft: 2 }}>OG</span>}
      </span>
    );
  };
  const scoreFor = (num, side) => {
    const sc = lineupBadges(mdl, side, num).score;
    if (!sc) return null;
    return <span className="pts">{effMode === "goals" ? "⚽".repeat(sc.g) : fmtScore(sc.g, sc.p, effMode)}</span>;
  };
```

- [ ] **Step 3: Pass `"us"` at the existing home call sites.** Update the home pitch + home subs calls: `subArrows(n)` → `subArrows(n, "us")`, `playerMarks(n)` → `playerMarks(n, "us")`, `scoreFor(n)` → `scoreFor(n, "us")` (and the `p.num` variants in the home subs block).

- [ ] **Step 4: Wire the away/opponent lineup.** In the opponent formation jerseys (around line 1241, `<div className="nm">{op ? op.name : ""}</div>`) add the badges + score so it mirrors the home jersey:
```jsx
                            <div className="nm">{op ? op.name : ""} {subArrows(n, "them")}{playerMarks(n, "them")}</div>
                            {scoreFor(n, "them")}
```
And in the away subs block (around line 1250, the `<div className="mt-jersey" ...><Jersey .../><div className="nm">{p.name}</div></div>`) add the same for `p.num`:
```jsx
                          <div className="mt-jersey" key={p.num}><Jersey c1={colorThem} c2={colorThem2} num={p.num} size={36} /><div className="nm">{p.name} {subArrows(p.num, "them")}{playerMarks(p.num, "them")}</div>{scoreFor(p.num, "them")}</div>
```

- [ ] **Step 5: Verify** — `npm run build` (clean) + `npm test` (all pass). Manual check is ideal but optional in-agent. Commit:
```bash
git add components/MatchTracker.tsx
git commit -m "feat(lineup): editor shows cards/arrows/og/score for the away team too"
```

---

## Task 4: Share image (poster) — icons for both teams via the helper

**Files:** Modify `lib/infographic.ts`

Read `buildInfographicSVG` first, especially `drawPitch` (~line 230), the bench-chip block (~258–281), the us call (`drawPitch(..., true)`, ~257) and the opponent call (`drawPitch(..., false)`, ~290). SVG primitives available: `T(x,y,text,size,color,{w,a,ls})` text, `R(x,y,w,h,fill,radius,{stroke,sw})` rect, `jersey(x,y,w,c1,c2,n)`. Card chips in the timeline are drawn as `R(x, y, 8, 11, cardCol, 1.5, {stroke:"rgba(0,0,0,.3)"})` with `cardCol = card==="red" ? "#e74c3c" : "#f1c40f"`.

- [ ] **Step 1: Import the helper** at the top of `lib/infographic.ts`:
```ts
import { lineupBadges } from "./lineup-badges";
```

- [ ] **Step 2: Make `drawPitch` side-aware.** Change its signature from `(rows, c1, c2, nameFor, withScores)` to `(rows, c1, c2, nameFor, side)` where `side` is `"us"|"them"`. For each jersey at `(jx, ry)` with shirt `n`, after drawing the jersey + name, compute `const b = lineupBadges(m, side, n);` and draw, all gated on the relevant flag (no more `withScores`):
  - sub-on arrow: `if (b.subOn) body.push(T(jx - 2, ry + 9, "▲", 8, "#2ecc71"));`
  - sub-off arrow: `if (b.subOff) body.push(T(jx + jw + 1, ry + 9, "▼", 8, "#ff6e63"));`
  - card chips: stack `b.cards` as small rects near the top-right of the jersey, e.g. `b.cards.forEach((c, ci) => body.push(R(jx + jw - 3 - ci * 5, ry - 3, 4, 6, c === "red" ? "#e74c3c" : "#f1c40f", 1, { stroke: "rgba(0,0,0,.3)", sw: 0.5 })));`
  - own goal: `if (b.og) body.push(T(jx + jw / 2, ry + jw + 22, "OG", 8, "#ff6e63", { w: 700, a: "middle" }));`
  - score: `if (b.score) body.push(T(jx + jw / 2, ry + jw + (b.og ? 32 : 22), m.effMode === "goals" ? "●".repeat(b.score.g) : `${b.score.g}-${b.score.p}`, 9, "#f5c518", { w: 700, a: "middle", ls: m.effMode === "goals" ? 2 : 0 }));`
  (Tune the y-offsets so OG + score don't overlap the name; keep within the row's 56px pitch.)

- [ ] **Step 3: Update the two call sites.** `drawPitch(m.formationRows..., m.colorUs, m.colorUs2, findName, true)` → `..., "us")`; `drawPitch(m.oppRoster.formation, m.colorThem, m.colorThem2, oppName, false)` → `..., "them")`.

- [ ] **Step 4: Make the bench-chip renderer reusable for the away bench.** The current us-bench block (`m.subs`) hard-codes `subOnSet`/`subOffSet` (global, un-sided) + `m.usScorers` + `m.colorUs`. Refactor it into a small inline function `drawBench(players, side, c1, c2)` that uses `lineupBadges(m, side, p.num)` for the on/off arrows + score, and call it for the us subs (`drawBench(m.subs, "us", m.colorUs, m.colorUs2)`) AND, inside the opponent block after the opp pitch, for the away subs (`const oppSubs = (m.oppRoster.players||[]).filter(p => p.role === "sub"); if (oppSubs.length) drawBench(oppSubs, "them", m.colorThem, m.colorThem2);`). You may delete the now-unused global `subOnSet`/`subOffSet` sets (line ~226-227) if nothing else references them (check the chart-marker code first — if it uses them, leave them).

- [ ] **Step 5: Verify** — `npm run build` (clean) + `npm test` (all pass). A poster visual check is ideal but optional in-agent. Commit:
```bash
git add lib/infographic.ts
git commit -m "feat(lineup): poster shows cards/arrows/og/score + bench for both teams"
```

---

## Task 5: Version bump + docs

**Files:** Modify `lib/constants.ts`, `CLAUDE.md`

- [ ] **Step 1: Bump version.** In `lib/constants.ts` set `APP_VERSION = "v70"`. (If PR #9 / live-updates with v69 has NOT merged yet that's fine — v70 is still ahead of main's v68; if a clash is later noticed, renumber.)

- [ ] **Step 2: CLAUDE.md.** Update the `Current: **v68**.` note to `**v70**`. In the Share-image section (and/or a brief note in the public-page section), add: "Per-player lineup icons (sub arrows, card chips, own-goal mark, goal/point tally) are computed by one shared pure helper `lineupBadges(model, side, num)` in `lib/lineup-badges.ts`, consumed by the editor lineup (`MatchTracker`), the public page (`PublicMatch`), and the poster (`buildInfographicSVG`) — for BOTH teams. Keep all three calling the helper rather than re-deriving badges, to prevent the home/away drift this replaced."

- [ ] **Step 3: Verify + commit.**
```bash
npm run build && npm test
git add lib/constants.ts CLAUDE.md
git commit -m "docs(lineup): document shared lineupBadges helper; bump APP_VERSION to v70"
```

---

## Final verification
- [ ] `npm test` — all pass (previous total + 4 new).
- [ ] `npm run build` — clean.
- [ ] Manual: open a match with away subs/cards/scorers → away jerseys now show arrows/cards/OG/tally in the editor, the public page, AND the downloaded share image.
- [ ] Tell the user to look for **v70**.

## Notes for the implementer
- The helper is the single source of truth — do NOT reintroduce per-renderer badge derivation.
- `MatchTracker.tsx` is `// @ts-nocheck`; match its existing JS style.
- Keep each renderer's existing look (colours, glyphs); only change WHICH players get icons and add the away score.
- Don't widen scope (no new stats, no layout redesign).
