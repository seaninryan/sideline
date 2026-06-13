# MatchTracker decomposition — design

**Date:** 2026-06-13
**Status:** Approved (brainstorm) — **execution gated on PR #26 (④b) merging.** Detailed ① plan to be written against the settled post-#26 editor.
**Branch:** `matchtracker-decomposition` (spec only) off `main`.

## Why

`components/MatchTracker.tsx` is **~1453 lines, 75 hooks, `// @ts-nocheck`, zero tests** — the single largest untested risk in the app. Every editor bug this session (the two ④a runtime crashes, the production break, the swap bug) hid here, caught only by manual click-through. Decomposing it into a typed state hook + thin view components is the prerequisite for real automated coverage — and is already on the CLAUDE.md "next steps" list.

**Primary goal: testability** (with the natural maintainability + type-safety wins that follow).

## End-state architecture

A `components/match-tracker/` folder:

- **`useMatchEditor(initialId, wizard)`** — one custom hook owning all editor state (the 75 hooks today) and exposing a **typed action API** + derived values:
  - *state*: `homeTeam`/`awayTeam`/`colorHome*`/`colorAway*`/`homeRoster`/`awayRoster`/`homeSquad`/`awaySquad`/`raw`/`matchDate`/`sport`/`label`/`nameDisplay`/`curId`/`tab`/`gmStage`/`subPick`/… (post-④b home/away shape).
  - *actions*: `addLive`, `completeSub`, `applyRecord`, `save`, `swap`, the `set*` setters, `openInsert`/`insCommit`, `tapPlayer`, `doNew`/`finishNew`/`reTeamApply`, `undo`, `resync`, …
  - *derived*: `parsed`, `homeName`/`awayName`, `timeline`/`homeScorers`/`awayScorers`, `phase`, `blocks`, etc.
  - **This is the single unit tests target.** Its pure sub-logic (event-line building, the sub-pick state machine, `recordPayload` shaping, block classification) extracts further into pure helpers — several already exist (`lib/event-line.ts`, `lib/raw-edit.ts`, `lib/lineup-badges.ts`, parser, model).
- **Thin view components** consuming the hook, each focused and **`@ts-nocheck`-free**:
  - `<EditorChrome>` (header/conflict banner/share+backup modals/score header/details panel/colour picker/tabs)
  - `<DetailsView>` (read-only stats/chart/scorers/timeline)
  - `<GameModeView>` (staged live entry)
  - `<LineupView>` (the symmetric home/away editable pitches)
  - `<NotationView>` (block list + insert/edit + raw textarea)
  - `<NewMatchWizard>` (date → home → away)
- **`MatchTracker`** shrinks to a shell: call `useMatchEditor(...)`, render `<EditorChrome>` + the active view.

## This is a programme (sub-projects)

Too big for one spec. Sub-projects, brainstormed/planned individually:

- **① Foundation + proof-of-pattern.**
  1. **Render-smoke-test harness** (the regression guard for ALL later extraction): add `jsdom` (or `happy-dom`) + `@testing-library/react` + `@testing-library/jest-dom`; allow `.test.tsx`; mock `@/lib/supabase/client` + a way to seed the `store` cache so `MatchTracker`/`EditorApp` can mount. Add a smoke test: mount the editor seeded with `SAMPLE_RECORD`, assert it renders the score (`2-7`/`2-6`) without throwing. *(This single test would have caught both ④a editor crashes.)*
  2. **Extract `useMatchEditor`**: move state + actions out of the shell into the hook; `MatchTracker` consumes it; **behaviour unchanged**; type the hook (drop `@ts-nocheck` from it). Unit-test the hook's actions + the pure helpers.
  3. **Extract `<DetailsView>`** (read-only, lowest risk) consuming the hook — proves the hook→view→test pattern end-to-end; add its render test.
- **② Remaining views** — `<GameModeView>`, `<LineupView>`, `<NotationView>`, `<NewMatchWizard>`, `<EditorChrome>` extracted incrementally under the smoke guard, each with a render/interaction test.
- **③ Live-entry machinery** — extract `addLive`/`buildEventLine`/`whoGrid`/`gmPicker`/`completeSub`/the sub-pick state machine into pure, unit-tested helpers (the hook orchestrates them).
- **④ Remove `@ts-nocheck`** — as each piece lands typed; the shell ends fully typed.

## Testing approach

- The **render smoke test** (①.1) guards every subsequent extraction against the render-time-crash / blank-state class that actually bit us.
- The **hook + pure helpers** get real unit tests (the bulk of the durable coverage).
- Each **extracted view** gets a render test (and interaction tests for the stateful ones — live entry, sub, swap).
- The existing 333-test pure-lib suite stays green throughout; behaviour parity (canonical `SAMPLE_RECORD` finals) is the bar for the hook extraction.

## Constraints / sequencing

- **Builds on the post-#26 editor** (home/away, no us/them). Decomposing the pre-#26 editor would be wasted/conflicting work. **#26 must be verified (manual checklist) + merged first.** The detailed ① plan is written against the settled editor — not now (#26 is unverified and could shift).
- **Incremental, guard-first.** The smoke harness lands before any extraction; each extraction keeps the suite + smoke test green and is behaviour-preserving.
- **No feature changes** — pure structural refactor + test scaffolding. (The symmetric lineup etc. shipped in ④b; ① does not change behaviour.)

## Approaches considered (state architecture)

- **`useMatchEditor` hook (chosen):** isolates state+logic into one typed, testable unit; clean interface for views; most idiomatic; biggest payoff. ← decided.
- *Context + reducer:* avoids prop-drilling but adds boilerplate + a 75-`useState`→reducer rewrite for a shallow tree.
- *Prop-drill from the shell:* simplest per step but verbose and improves testability least (logic stays in the untested shell).

## Files (sub-project ① — indicative; pinned in the ① plan)

**New:** `components/match-tracker/useMatchEditor.ts`, `components/match-tracker/DetailsView.tsx`, `test/setup.tsx` (RTL/jsdom setup + store/supabase mock helper), `test/editor-smoke.test.tsx`, hook/helper unit tests; `vitest.config.ts` (jsdom env for `.tsx`, include `.test.tsx`); `package.json` (testing-library + jsdom devDeps).
**Changed:** `components/MatchTracker.tsx` (consume the hook; render `<DetailsView>`).
