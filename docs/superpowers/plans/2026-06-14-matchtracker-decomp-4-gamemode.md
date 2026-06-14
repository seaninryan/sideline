# MatchTracker decomposition ④ — extract `GameModeView` (first interactive view)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the editor's game-mode (staged live-entry) view into a typed `<GameModeView>` fed by data + **action callbacks** from the hook — establishing the interactive-view extraction pattern — and test it in isolation.

**Architecture:** The `view === "game"` block in the `MatchTracker` shell moves into `components/match-tracker/GameModeView.tsx` (typed, no `@ts-nocheck`). Unlike read-only `DetailsView`, it takes **action callbacks** as props (`addLive`, `pickGmTeam`, `completeSub`, `setGmStage`, `gmPicker`, `onPitchSet`, `benchSet`, `undoRaw`) plus data. The shell renders `<GameModeView … />` passing the hook's values + actions. Behaviour-identical.

**Tech Stack:** React 18, Vitest + jsdom + Testing Library. Node 20 — prefix commands with `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH`. Dev server live; **never `npm run build`** — `npx tsc --noEmit`.

**Spec:** `docs/superpowers/specs/2026-06-13-matchtracker-decomposition-design.md` (sub-project ④ — view extraction; this slice = the game view, one PR).

**Branch:** `matchtracker-decomp-4-gamemode` (off `main`, post-#29 v87).

---

## Task 1: Create the typed `GameModeView` + wire the shell

**Files:** Create `components/match-tracker/GameModeView.tsx`. Modify `components/MatchTracker.tsx`.

The current `view === "game"` block (a single `<div className="mt-game">…</div>`, ~MatchTracker.tsx:349-441) references, from the hook: `phase`, `halfMarks`, `gmStage`, `setGmStage`, `liveEvents`, `effMode`, `colorHome`, `colorAway`, `colorHome2`, `colorAway2`, `homeName`, `awayName`, `timelineHA`, `undoTarget`, `canUndo`, `addLive`, `pickGmTeam`, `gmPicker`, `onPitchSet`, `benchSet`, `completeSub`, `undoRaw` — plus module helpers `evIcon`, `evLabel`, `contrastOn` (imported directly in the shell today) and the `Timeline` child component. `gmPicker(team, onPick, opts)` is a hook function returning JSX (a render helper) — pass it as a prop and call it the same way.

- [ ] **Step 1: Create `components/match-tracker/GameModeView.tsx`**

Define the typed props interface, import the module helpers (`evIcon`/`evLabel` + `contrastOn` — confirm their source modules from `MatchTracker.tsx`'s imports) and `Timeline`, and **move the `<div className="mt-game">…</div>` JSX verbatim** into the component body (replace the shell's bare identifier references with the destructured props — names unchanged, so the JSX text is identical):

```tsx
"use client";
import React from "react";
import Timeline from "@/components/Timeline";
// import evIcon, evLabel, contrastOn from their real modules — MATCH the shell's import lines
// (e.g. evIcon/evLabel may be local helpers in MatchTracker or in @/lib/...; if they are
//  module-local helpers defined inside MatchTracker.tsx, MOVE them to a shared spot —
//  e.g. lib/event-icons.ts — and import from there in BOTH this view and the shell.
//  contrastOn is in @/lib/util or similar — confirm.)

export interface GameModeViewProps {
  phase: "pre" | "ht" | "play" | "over";
  halfMarks: any[];
  gmStage: any;
  setGmStage: (s: any) => void;
  liveEvents: any[];
  effMode: "gaa" | "goals";
  homeName: string;
  awayName: string;
  colorHome: string; colorAway: string; colorHome2: string; colorAway2: string;
  timelineHA: any[];
  undoTarget: any;
  canUndo: boolean;
  addLive: (ev: string, player: any, team?: string) => void;
  pickGmTeam: (team: string) => void;
  gmPicker: (team: string, onPick: (p: any) => void, opts?: any) => React.ReactNode;
  onPitchSet: (team: string) => any;
  benchSet: (team: string) => any;
  completeSub: (on: any, off: any, team?: string) => void;
  undoRaw: () => void;
}

export default function GameModeView(props: GameModeViewProps) {
  const {
    phase, halfMarks, gmStage, setGmStage, liveEvents, effMode,
    homeName, awayName, colorHome, colorAway, colorHome2, colorAway2,
    timelineHA, undoTarget, canUndo,
    addLive, pickGmTeam, gmPicker, onPitchSet, benchSet, completeSub, undoRaw,
  } = props;
  return (
    {/* the exact <div className="mt-game">…</div> JSX from the shell, unchanged */}
  );
}
```

> **`evIcon`/`evLabel` provenance matters.** Determine where they're defined (grep `const evIcon`/`function evIcon`/`evLabel` in `components/MatchTracker.tsx` and `lib/`). If they're **module-local helpers inside `MatchTracker.tsx`**, extract them to a small shared module (e.g. `lib/event-icons.ts` or `components/match-tracker/ev-icons.ts`) and import from there in BOTH `GameModeView` and the shell (the shell may still use them in other views). If they already live in `lib/`, just import them. Same check for `contrastOn`. Do NOT duplicate the helper bodies.

- [ ] **Step 2: Wire the shell.** In `MatchTracker.tsx`, add `import GameModeView from "@/components/match-tracker/GameModeView";` and replace the entire `{view === "game" && (<div className="mt-game">…</div>)}` with:

```tsx
        {view === "game" && (
          <GameModeView
            phase={phase} halfMarks={halfMarks} gmStage={gmStage} setGmStage={setGmStage}
            liveEvents={liveEvents} effMode={effMode} homeName={homeName} awayName={awayName}
            colorHome={colorHome} colorAway={colorAway} colorHome2={colorHome2} colorAway2={colorAway2}
            timelineHA={timelineHA} undoTarget={undoTarget} canUndo={canUndo}
            addLive={addLive} pickGmTeam={pickGmTeam} gmPicker={gmPicker}
            onPitchSet={onPitchSet} benchSet={benchSet} completeSub={completeSub} undoRaw={undoRaw}
          />
        )}
```

- [ ] **Step 3: Remove now-unused shell imports** (only those with zero remaining references — `Timeline` is still used by the lineup view? grep first; `evIcon`/`evLabel` may be used by the insert flow in the advanced view — check). Grep each before removing.

- [ ] **Step 4: Verify behaviour-preserving.**
  - `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npx tsc --noEmit` — clean (GameModeView is typed; its internals type-check).
  - `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test` — render smoke + swap + hook + DetailsView + suite all green (341).
  - **Mount-check the game view** (it's not the default tab, so the smoke test doesn't cover it): in the verification, mount the editor via the harness, switch to the game tab, and confirm it renders — OR rely on Task 2's isolated test which renders GameModeView directly. (Task 2 covers this.)
  - Bump `APP_VERSION` to `"v88"` in `lib/constants.ts`.

- [ ] **Step 5: Commit**
```bash
git add components/match-tracker/GameModeView.tsx components/MatchTracker.tsx lib/constants.ts lib/event-icons.ts 2>/dev/null
git commit -m "refactor(editor): extract typed GameModeView (decomp ④); bump v88"
```
(Include the extracted `ev-icons` module in the add if you created one.)

---

## Task 2: `GameModeView` render + interaction test (in isolation)

**Files:** Create `test/game-mode-view.test.tsx`.

The interactive-pattern proof: render the view with stub callbacks, assert the staged UI renders + a click fires the right callback — without the editor.

- [ ] **Step 1: Write the test**

Create `test/game-mode-view.test.tsx`:

```tsx
// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import GameModeView from "@/components/match-tracker/GameModeView";

function props(over: Partial<any> = {}) {
  return {
    phase: "play", halfMarks: [{}], gmStage: { stage: "event" },
    setGmStage: vi.fn(), liveEvents: [{ key: "point", label: "Point" }, { key: "goal", label: "Goal" }],
    effMode: "gaa", homeName: "Wildebeests", awayName: "Racoons",
    colorHome: "#111", colorAway: "#222", colorHome2: "#333", colorAway2: "#444",
    timelineHA: [], undoTarget: null, canUndo: false,
    addLive: vi.fn(), pickGmTeam: vi.fn(), gmPicker: () => null,
    onPitchSet: vi.fn(), benchSet: vi.fn(), completeSub: vi.fn(), undoRaw: vi.fn(),
    ...over,
  } as any;
}

describe("GameModeView", () => {
  it("in play, stage=event renders the event buttons + HT/FT + timeline", () => {
    render(<GameModeView {...props()} />);
    expect(screen.getByText("Point")).toBeTruthy();
    expect(screen.getByText("Goal")).toBeTruthy();
    expect(screen.getByText("HT")).toBeTruthy();
    expect(screen.getByText("FT")).toBeTruthy();
  });

  it("tapping an event advances to the team stage", () => {
    const setGmStage = vi.fn();
    render(<GameModeView {...props({ setGmStage })} />);
    fireEvent.click(screen.getByText("Point"));
    expect(setGmStage).toHaveBeenCalledWith({ stage: "team", ev: "point" });
  });

  it("stage=team shows both team buttons and picks one", () => {
    const pickGmTeam = vi.fn();
    render(<GameModeView {...props({ gmStage: { stage: "team", ev: "point" }, pickGmTeam })} />);
    fireEvent.click(screen.getByText("Wildebeests"));
    expect(pickGmTeam).toHaveBeenCalledWith("home");
  });

  it("at full time shows the closed-match note, not event buttons", () => {
    render(<GameModeView {...props({ phase: "over" })} />);
    expect(screen.getByText(/Full time — match closed/)).toBeTruthy();
    expect(screen.queryByText("Point")).toBeNull();
  });
});
```

> `evLabel(gmStage.ev)` renders in the stage-2/3 prompts — if the team-stage prompt text or button labels differ, `screen.debug()` and adjust. Keep the intent: the staged flow renders per `gmStage`/`phase`, and clicks fire `setGmStage`/`pickGmTeam`. If `evLabel`/`evIcon` need real implementations to render (they're imported in the view), the test exercises them as-is — good.

- [ ] **Step 2: Run + full suite + tsc**

Run: `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test -- game-mode-view` (PASS) then `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test` (green ~345) + `npx tsc --noEmit` (clean).

- [ ] **Step 3: Commit**
```bash
git add test/game-mode-view.test.tsx
git commit -m "test(editor): GameModeView render + interaction tests (decomp ④)"
```

---

## Notes / scope

- **Behaviour-preserving** verbatim JSX move; the shell passes the same values + actions. No logic change.
- **Interactive-view pattern** established: data + action callbacks as typed props; the isolated test drives the staged flow + asserts callbacks fire. ⑤ (lineup/notation/wizard/chrome) repeat this.
- **`evIcon`/`evLabel`/`contrastOn` sharing:** extract to a shared module if they were MatchTracker-local — don't duplicate.
- The game view isn't the default tab, so the ① smoke test doesn't cover it; Task 2's isolated test is its coverage (would catch a missing prop / broken stage).

## Self-review (spec coverage)

- ④ game view extraction (first interactive view, action callbacks as props) → Task 1; isolated render + interaction test → Task 2.
- Remaining views (lineup/notation/wizard/chrome) → ⑤, same pattern.
