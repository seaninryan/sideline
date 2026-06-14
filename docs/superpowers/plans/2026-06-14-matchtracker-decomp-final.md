# MatchTracker decomposition — final: extract remaining views + EditorChrome

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the decomposition — extract the remaining views (`NewMatchWizard`, `LineupView`, `NotationView`) and the `EditorChrome` frame into typed components, plus a global test-cleanup fix, leaving `MatchTracker` a thin shell.

**Architecture:** Same proven pattern as ③ (DetailsView) / ④ (GameModeView): each `view === "…"` block (and the chrome frame) moves verbatim into a typed `components/match-tracker/*.tsx` component fed by data + **action callbacks** from `useMatchEditor` as props; the shell wires it. Behaviour-identical. Each gets an isolated render/interaction test. The hook stays `@ts-nocheck` (typing it is out of scope — confirmed with the user).

**Tech Stack:** React 18, Vitest + jsdom + Testing Library. Node 20 — prefix commands with `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH`. Dev server live; **never `npm run build`** — `npx tsc --noEmit`.

**Spec:** `docs/superpowers/specs/2026-06-13-matchtracker-decomposition-design.md` (the remaining view extractions).

**Branch:** `matchtracker-decomp-final` (off `main`, post-#30 v88).

> **The recurring risk (every task):** `MatchTracker` is `@ts-nocheck` and most views are NOT the default tab, so `tsc` + the render smoke test do NOT catch a missing prop on them — it's a runtime `undefined`. **Each extracted view's isolated test is its real coverage**, and the review must do a **prop-completeness sweep** per view (every JSX-referenced identifier is a destructured prop or an import). This caught issues in ④; treat it as mandatory.

> **Pattern per view (apply to Tasks 2–5):** (a) read the block; identify every identifier it references from the hook (state, setters, action callbacks, derived values) + module helpers/child components; (b) create `components/match-tracker/<View>.tsx` — typed (no `@ts-nocheck`), explicit props interface, the block's JSX moved **verbatim** (names unchanged); (c) wire the shell: import + replace the block with `<View …props… />`; (d) remove now-dead shell imports (grep each — only if zero remaining refs); (e) add `test/<view>.test.tsx` (isolated render + interaction). Keep names identical so the JSX text is untouched. No logic changes. If a shared module-local helper is needed by the view (like ④'s `evIcon`→`lib/event-icons.tsx`), extract it to a shared module rather than duplicating.

---

## Task 1: Global test cleanup (fixes the cross-test render-leak)

**Files:** Create `test/setup.ts`. Modify `vitest.config.ts`, `test/game-mode-view.test.tsx`, `test/details-view.test.tsx`.

Vitest has no global `afterEach(cleanup)`, so RTL renders leak across tests in a file (④ found this; `game-mode-view`/`details-view` added per-file `afterEach`). Fix it once.

- [ ] **Step 1:** Create `test/setup.ts`:
```ts
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
afterEach(() => cleanup());
```
- [ ] **Step 2:** In `vitest.config.ts`, add `setupFiles: ["test/setup.ts"]` to the `test` config (alongside `environment`/`environmentMatchGlobs`/`include`). (`setupFiles` runs for all environments; the `cleanup` import is harmless under node since no DOM tests run there.)
- [ ] **Step 3:** Remove the now-redundant per-file `afterEach(cleanup)` from `test/game-mode-view.test.tsx` and `test/details-view.test.tsx` (and their now-unused `cleanup`/`afterEach` imports).
- [ ] **Step 4:** `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test` — all green (345); `npx tsc --noEmit` clean.
- [ ] **Step 5:** Commit: `test: global afterEach(cleanup) via setupFiles (decomp)`.

---

## Task 2: Extract `NewMatchWizard` (`view === "new"`, ~MatchTracker:256–324)

The wizard view (date → home team → away team → Create). Interactive — uses the `nw` state + team-pick handlers (`finishNew`/`doNew`/team-picker callbacks, `TeamPicker`, the date input). Identify its exact props from the block.

- [ ] **Step 1:** Apply the per-view pattern → `components/match-tracker/NewMatchWizard.tsx` (typed). Read MatchTracker:256–324; the interface = every hook identifier the block uses (e.g. `nw` state, the setters/handlers it calls, `nwTeams`, the team-pick callbacks, `matchDate`/`setMatchDate`, `sport`, `finishNew`, etc. — read to confirm) + `TeamPicker` import.
- [ ] **Step 2:** Wire the shell (`{nw && ( <NewMatchWizard …/> )}` — note: the wizard is gated on `nw`, not `view`; replace the `nw &&` block at ~105).
- [ ] **Step 3:** Test `test/new-match-wizard.test.tsx`: render with stub props (a couple of `nwTeams`, `nw` state at the date/team step), assert the step renders + a pick/Create click fires the right callback. (Adapt to the real `nw` shape read in Step 1.)
- [ ] **Step 4:** tsc clean + `npm test` green. Commit: `refactor(editor): extract typed NewMatchWizard (decomp)`.

---

## Task 3: Extract `LineupView` (`view === "lineup"`, ~MatchTracker:346–449)

The most interactive view: two editable pitches (`renderEditPitch`), tap-to-sub (`tapPlayer`/`subPick`), per-team edit (`editLineup`/`setEditLineup`, `setHomeRoster`/`setAwayRoster`, `addPlayer`, `RosterPitch`), badges (`subArrows`/`playerMarks`/`scoreFor`). Identify the full prop set from the block.

- [ ] **Step 1:** Per-view pattern → `components/match-tracker/LineupView.tsx` (typed). The block has an `editLineup ? (editor) : (pitches)` branch — move BOTH branches verbatim. Props = all the lineup state/setters/callbacks it references (read MatchTracker:346–449 to enumerate) + `RosterPitch`/`Jersey` imports + any module helpers. `renderEditPitch` is a hook function returning JSX → pass as a prop (like `gmPicker` in ④).
- [ ] **Step 2:** Wire the shell (`{view === "lineup" && ( <LineupView …/> )}`).
- [ ] **Step 3:** Test `test/lineup-view.test.tsx`: render the non-edit pitches state with a roster, assert players render; render the `editLineup` state, assert the edit UI; an interaction (e.g. tap a player → `tapPlayer` fires, or "+ Player" → the add callback). Adapt to the real props.
- [ ] **Step 4:** tsc clean + `npm test` green. Commit: `refactor(editor): extract typed LineupView (decomp)`.

---

## Task 4: Extract `NotationView` (`view === "advanced"`, ~MatchTracker:450–end)

The notation tab: block list (`blocks`/`blkPill`/`openBlk`), block edit + delete (`blkEdit`/`blkOk`/`blkDelete`), insert flow (`blkIns`/`openInsert`/`insPickTeam`/`insCommit`/`whoGrid`), the raw-text toggle + textarea, live panel. Identify the full prop set.

- [ ] **Step 1:** Per-view pattern → `components/match-tracker/NotationView.tsx` (typed). Read MatchTracker:450–end; props = the block/insert/raw state + all the `blk*`/`ins*`/`whoGrid`/raw-edit callbacks + `buildEventLine` etc. (`whoGrid` returns JSX → pass as a prop).
- [ ] **Step 2:** Wire the shell.
- [ ] **Step 3:** Test `test/notation-view.test.tsx`: render with a couple of `blocks`, assert the block rows render; an interaction (tap a block → `openBlk` fires; or the raw toggle). Adapt to real props.
- [ ] **Step 4:** tsc clean + `npm test` green. Commit: `refactor(editor): extract typed NotationView (decomp)`.

---

## Task 5: Extract `EditorChrome` (the frame, ~MatchTracker:83–255) — the capstone

The persistent frame: `AppHeader`, the reconnect/conflict banner, share/backup modals, the score-header IIFE, the Details edit panel, the colour picker, the tab bar. It WRAPS the views (it renders before the view-switch; hidden in wizard mode via `!nw`).

- [ ] **Step 1:** Create `components/match-tracker/EditorChrome.tsx` (typed) holding the `!nw &&` chrome blocks (header, conflict banner, modals, score-header, details panel, colour picker, tabs). Props = everything those blocks reference from the hook (a large set — header email/admin/handlers, `remoteConflict`, `shareModel`/`modal`/`share`, the score-header values + `showDetails`/`setShowDetails`, the details-panel fields + setters + `reTeam` flow, the colour-picker `colorPick`/`usedColors`/the colour map, `tabs`/`tab`/`setTab`). Move the blocks verbatim. Extract any module-local helpers it needs to a shared module (don't duplicate).
- [ ] **Step 2:** Wire the shell. The shell render becomes roughly:
  ```tsx
  return (
    <div className="mt-root">
      {nw
        ? <NewMatchWizard …/>
        : <>
            <EditorChrome …/>
            <div className="mt-body">{/* the view-switch: details/game/lineup/advanced components */}</div>
          </>}
      {/* any always-on bits (toast) per the original */}
    </div>
  );
  ```
  Preserve the EXACT DOM structure/wrappers the original had (read the current `return (` at MatchTracker:77 carefully — the `.mt-root`, the `!nw` guards, where the view-switch sits relative to the chrome, the toast). Do NOT change the markup nesting.
- [ ] **Step 3:** Test `test/editor-chrome.test.tsx`: render `EditorChrome` with stub props (a sample score-header dataset, `tabs`, `tab`), assert the tab bar + score header render; a tab click fires `setTab`. Adapt to real props.
- [ ] **Step 4:** Remove all now-dead shell imports. The shell should now import only the view/chrome components + `useMatchEditor` (+ React). Grep to confirm.
- [ ] **Step 5:** tsc clean + `npm test` green. Commit: `refactor(editor): extract typed EditorChrome; MatchTracker is a thin shell (decomp)`.

> **Escape hatch:** EditorChrome wraps the views, so the markup composition is the one genuinely tricky part. If preserving the exact DOM nesting proves too entangled to do safely, STOP and report — extracting the 3 view bodies (Tasks 2–4) already achieves the decomposition's goal (the shell is then chrome + view-switch). Chrome can ship in a follow-up rather than risk the markup.

---

## Final verification + version

- [ ] After all tasks: `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npx tsc --noEmit` clean; `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test` green (all the new view tests + existing). 
- [ ] **Manual checklist (editor has no full-integration test):** open a match; each tab (details/game/lineup/notation) renders; live-entry a score; sub via the lineup tab; new-match wizard; ⇄ swap; edit→autosave→reload; share image. (Behaviour-preserving, so v88 behaviour should hold.)
- [ ] Bump `APP_VERSION` to `"v89"` (`lib/constants.ts`); commit.
- [ ] `grep -c "useState\|useEffect" components/MatchTracker.tsx` → 0 (already, from ②); the shell should now be a small wiring file (well under 200 lines).

## Self-review (spec coverage)

- Remaining views: NewMatchWizard (Task 2), LineupView (Task 3), NotationView (Task 4), EditorChrome (Task 5). Test-infra global cleanup (Task 1). Each typed + isolated test + prop-completeness review.
- Out of scope (confirmed with user): typing the `useMatchEditor` hook / dropping its `@ts-nocheck`.
