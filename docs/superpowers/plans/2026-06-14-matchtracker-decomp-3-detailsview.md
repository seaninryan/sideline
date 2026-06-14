# MatchTracker decomposition ③ — extract `DetailsView` (proof-of-pattern)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the editor's read-only Details view (stats/chart/scorers/timeline) into a typed `<DetailsView>` component fed by props, and render-test it in isolation — proving the hook→thin-typed-view→test pattern that ④/⑤ repeat for the other views.

**Architecture:** The `view === "details"` JSX in the `MatchTracker` shell moves into `components/match-tracker/DetailsView.tsx` — a **typed** component (NOT `@ts-nocheck`) with an explicit props interface. The shell renders `<DetailsView … />` for that view, passing the values it currently destructures from `useMatchEditor`. Behaviour-identical. A render test mounts `DetailsView` with constructed props (no full editor mount needed).

**Tech Stack:** React 18, Vitest + jsdom + Testing Library. Node 20 — prefix commands with `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH`. Dev server live; **never `npm run build`** — use `npx tsc --noEmit`.

**Spec:** `docs/superpowers/specs/2026-06-13-matchtracker-decomposition-design.md` (sub-project ③ — first view extraction).

**Branch:** `matchtracker-decomp-3` (off `main`, post-#28 v86).

---

## Task 1: Create the typed `DetailsView` component + wire the shell

**Files:** Create `components/match-tracker/DetailsView.tsx`. Modify `components/MatchTracker.tsx`.

The current details block in `MatchTracker.tsx` (the `view === "details"` `<>…</>`) reads: `parsed` (`.warnings`/`.series`/`.leadChanges`/`.timesLevel`/`.maxLead`), `effMode`, `homeName`, `awayName`, `maxLeadVenue`, `homeSeries`, `goalDots`, `chartMarkers`, `htLine`, `homeColor`, `awayColor`, `homeColor2`, `awayColor2`, `homeScorers`, `awayScorers`, `timelineHA`, `halfMarks` — plus child components `StatGrid`/`ScoreChart`/`Scorers`/`Timeline` and the `htScore` helper (`@/lib/half-time`).

- [ ] **Step 1: Create `components/match-tracker/DetailsView.tsx`**

```tsx
"use client";
import React from "react";
import StatGrid from "@/components/StatGrid";
import ScoreChart from "@/components/ScoreChart";
import Scorers from "@/components/Scorers";
import Timeline from "@/components/Timeline";
import { htScore } from "@/lib/half-time";

export interface DetailsViewProps {
  parsed: any;                 // ParsedMatch (warnings/series/leadChanges/timesLevel/maxLead)
  effMode: "gaa" | "goals";
  homeName: string;
  awayName: string;
  maxLeadVenue: "home" | "away" | null;
  homeSeries: any[];
  goalDots: any[];
  chartMarkers: any[];
  htLine: any;
  halfMarks: any[];
  homeScorers: any[];
  awayScorers: any[];
  timelineHA: any[];
  homeColor: string;
  awayColor: string;
  homeColor2: string;
  awayColor2: string;
}

// Read-only Details view: match stats, score-progression chart, scorers, timeline.
// Extracted from MatchTracker (decomposition ③) — behaviour-identical; first typed view.
export default function DetailsView({
  parsed, effMode, homeName, awayName, maxLeadVenue,
  homeSeries, goalDots, chartMarkers, htLine, halfMarks,
  homeScorers, awayScorers, timelineHA,
  homeColor, awayColor, homeColor2, awayColor2,
}: DetailsViewProps) {
  return (
    <>
      {parsed.warnings.length > 0 && (
        <div className="mt-warn">
          <b>Heads up — check {parsed.warnings.length} {parsed.warnings.length === 1 ? "entry" : "entries"}.</b>
          <span> {parsed.warnings.map((w: any) => `${w.minute}' — ${w.msg}`).join("; ")}.</span>
        </div>
      )}
      <StatGrid stats={[
        { k: "Half-time", v: htScore(parsed.series, effMode) },
        { k: "Lead changes", v: parsed.leadChanges },
        { k: "Times level", v: parsed.timesLevel },
        { k: `Biggest lead${maxLeadVenue ? " · " + (maxLeadVenue === "home" ? homeName : awayName) : ""}`, v: parsed.maxLead },
      ]} />

      <p className="mt-h">Score progression</p>
      <div style={{ width: "100%" }}>
        <ScoreChart series={homeSeries} goalDots={goalDots} chartMarkers={chartMarkers} htLine={htLine} colorHome={homeColor} colorAway={awayColor} mode={effMode} />
      </div>

      <p className="mt-h" style={{ marginTop: 18 }}>Scorers</p>
      <Scorers home={homeScorers} away={awayScorers} colorHome={homeColor} colorHome2={homeColor2} colorAway={awayColor} colorAway2={awayColor2} mode={effMode} />

      <p className="mt-h" style={{ marginTop: 18 }}>Timeline</p>
      <Timeline timeline={timelineHA} halfMarks={halfMarks} colorHome={homeColor} colorHome2={homeColor2} colorAway={awayColor} colorAway2={awayColor2} nameHome={homeName} nameAway={awayName} />
    </>
  );
}
```

> Verify the imported child components' default-vs-named export style + paths against the existing `MatchTracker.tsx` import lines (e.g. `import StatGrid from "@/components/StatGrid"`). Match them exactly. If `htScore`'s import in MatchTracker differs, mirror it.

- [ ] **Step 2: Wire the shell.** In `components/MatchTracker.tsx`, add `import DetailsView from "@/components/match-tracker/DetailsView";` and replace the entire `{view === "details" && ( <>…</> )}` block with:

```tsx
        {view === "details" && (
          <DetailsView
            parsed={parsed} effMode={effMode} homeName={homeName} awayName={awayName} maxLeadVenue={maxLeadVenue}
            homeSeries={homeSeries} goalDots={goalDots} chartMarkers={chartMarkers} htLine={htLine} halfMarks={halfMarks}
            homeScorers={homeScorers} awayScorers={awayScorers} timelineHA={timelineHA}
            homeColor={homeColor} awayColor={awayColor} homeColor2={homeColor2} awayColor2={awayColor2}
          />
        )}
```

- [ ] **Step 3: Remove now-unused imports from the shell.** If `StatGrid`/`ScoreChart`/`Scorers`/`Timeline`/`htScore` are no longer referenced anywhere else in `MatchTracker.tsx` (the game/lineup views may still use `ScoreChart`/`Timeline`/`Scorers` — CHECK before removing), drop the now-dead ones. Run `grep -n "StatGrid\|ScoreChart\|\bScorers\b\|Timeline\|htScore" components/MatchTracker.tsx` and only remove imports with zero remaining references.

- [ ] **Step 4: Verify behaviour-preserving.**
  - `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npx tsc --noEmit` — clean. (`DetailsView.tsx` is typed and NOT `@ts-nocheck`, so this genuinely type-checks the new component + its props at the shell call site… except the shell is `@ts-nocheck`, so the call-site prop types aren't enforced — but `DetailsView`'s internals are now type-checked.)
  - `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test` — the render smoke + swap + hook + full suite green (338). The editor's Details tab still renders identically.

- [ ] **Step 5: Commit**
```bash
git add components/match-tracker/DetailsView.tsx components/MatchTracker.tsx
git commit -m "refactor(editor): extract typed DetailsView (decomp ③)"
```

---

## Task 2: Render test for `DetailsView` in isolation

**Files:** Create `test/details-view.test.tsx`.

The proof: a view tested without mounting the whole editor.

- [ ] **Step 1: Write the test**

Create `test/details-view.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import DetailsView from "@/components/match-tracker/DetailsView";

const baseProps = {
  parsed: { warnings: [], series: [], leadChanges: 2, timesLevel: 3, maxLead: 5 },
  effMode: "gaa" as const,
  homeName: "Wildebeests",
  awayName: "Racoons",
  maxLeadVenue: "home" as const,
  homeSeries: [],
  goalDots: [],
  chartMarkers: [],
  htLine: null,
  halfMarks: [],
  homeScorers: [{ num: 10, name: "Rick", g: 1, p: 2, frees: 0 }],
  awayScorers: [],
  timelineHA: [],
  homeColor: "#111", awayColor: "#222", homeColor2: "#333", awayColor2: "#444",
};

describe("DetailsView", () => {
  it("renders the stats + section headers without throwing", () => {
    render(<DetailsView {...baseProps} />);
    expect(screen.getByText("Score progression")).toBeTruthy();
    expect(screen.getByText("Scorers")).toBeTruthy();
    expect(screen.getByText("Timeline")).toBeTruthy();
    expect(screen.getByText("Lead changes")).toBeTruthy();
    // biggest-lead names the home side when maxLeadVenue is "home"
    expect(screen.getByText(/Biggest lead · Wildebeests/)).toBeTruthy();
  });

  it("renders a scorer passed in homeScorers", () => {
    render(<DetailsView {...baseProps} />);
    expect(screen.getAllByText("Rick").length).toBeGreaterThan(0);
  });

  it("shows the warnings banner when parsed.warnings is non-empty", () => {
    render(<DetailsView {...baseProps} parsed={{ ...baseProps.parsed, warnings: [{ minute: 23, msg: "couldn't tell whose score" }] }} />);
    expect(screen.getByText(/Heads up — check 1 entry/)).toBeTruthy();
  });
});
```

> If a child component (`Scorers`/`StatGrid`) renders the names/labels differently than asserted, run `screen.debug()` and adjust the query to the actual rendered text — keep the intent (stats + headers + a scorer + the warnings banner render). If `getByText` throws on multiple matches, use `getAllByText`.

- [ ] **Step 2: Run + full suite + tsc**

Run: `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test -- details-view` (PASS), then `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test` (all green, 341) + `npx tsc --noEmit` (clean).

- [ ] **Step 3: Commit**
```bash
git add test/details-view.test.tsx
git commit -m "test(editor): DetailsView render test (decomp ③)"
```

---

## Notes / scope

- **Behaviour-preserving.** The details JSX is moved verbatim into a typed component; the shell passes the same values. No logic change.
- **First typed view** — `DetailsView.tsx` has no `@ts-nocheck`, so its internals + props interface are type-checked (the shell call site isn't, since the shell stays `@ts-nocheck` until ⑤).
- **Pattern for ④:** the remaining views (game/lineup/notation/wizard/chrome) extract the same way — but the interactive ones take action callbacks from the hook as props (not just data); plan those individually.
- No `APP_VERSION` bump needed for a behaviour-identical refactor unless deploying — bump to v87 in the commit if you want the footer to reflect the deploy (optional; include it in Task 1 Step 5 if so).

## Self-review (spec coverage)

- ③ first view extraction (DetailsView, read-only, proof-of-pattern) → Task 1; isolated render test → Task 2.
- The hook is consumed in the shell and its values passed to the view as typed props (the spec's "thin view consuming the hook / a slice via props").
