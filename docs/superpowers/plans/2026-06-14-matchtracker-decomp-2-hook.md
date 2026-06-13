# MatchTracker decomposition ② — extract `useMatchEditor` hook

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move all of `MatchTracker`'s state + actions + derived values into a `useMatchEditor()` hook (behaviour-preserving), so the editor's logic becomes a directly unit-testable unit — guarded before and proven after by tests.

**Architecture:** A guard-first refactor. (1) Add a swap **interaction** test against the current editor (the render smoke test from ① only covers render, not actions). (2) Extract `components/match-tracker/useMatchEditor.ts` — the hook owns the 75 hooks + the action functions + derived values; `MatchTracker` consumes it and keeps only the JSX. Behaviour is identical. (3) Add hook **unit tests** via `renderHook` — the payoff: testing editor actions without the DOM.

**Tech Stack:** React 18, Vitest + jsdom + Testing Library (from ①). Node 20 — prefix every command with `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH`. Dev server is live; **never `npm run build`** — use `npx tsc --noEmit`.

**Spec:** `docs/superpowers/specs/2026-06-13-matchtracker-decomposition-design.md` (sub-project ②).

**Branch:** `matchtracker-decomp-2` (off `main`, post-#27).

> **Scope notes:** (a) The hook may keep `// @ts-nocheck` for this slice — the *move* is the goal (testability via `renderHook` doesn't need types); full typing is a later slice (④/⑤). (b) View extraction (`DetailsView` etc.) is **③**, not here. (c) This is the highest-risk task of the decomposition (relocating a 1453-line component's brain) — the guards + a thorough completeness review are the safety net; behaviour must not change.

---

## Task 1: Swap interaction guard (against the current editor)

**Files:** Modify `test/editor-smoke.test.tsx` (or create `test/editor-swap.test.tsx`).

The ① render smoke test proves the editor renders. This adds the first **action** guard: clicking ⇄ Swap reverses home/away — exercising an action → `setState` → re-render → derived-value path, which the hook extraction must preserve. (Swap also regressed in ④a/④b, so it's worth a permanent test.)

- [ ] **Step 1: Write the test**

Add to `test/editor-smoke.test.tsx` (it already imports `mountEditor`, `SAMPLE_RECORD`, `screen`; add `fireEvent` to the `@testing-library/react` import there, or in a new file `test/editor-swap.test.tsx` with `// @vitest-environment jsdom` and the same imports):

```tsx
import { fireEvent } from "@testing-library/react";

it("⇄ Swap reverses home/away in the score header", async () => {
  await mountEditor("swap-1", { ...SAMPLE_RECORD }); // home Wildebeests, away Racoons
  // open the Details panel (the ✎ Edit toggle on the score header)
  fireEvent.click(await screen.findByText("✎ Edit"));
  // click the ⇄ Swap button in the details panel
  fireEvent.click(await screen.findByText(/Swap/));
  // after swap, the home slot is Racoons and the score sides flip (Racoons 2-6 was away → now home 2-6)
  // assert the two team-name + score nodes still render and the home/away order reversed.
  // The score header renders home first; after swap the FIRST team name should be "Racoons".
  const teams = await screen.findAllByText(/Wildebeests|Racoons/);
  expect(teams.length).toBeGreaterThan(0);
  // home is now Racoons (2-6), away Wildebeests (2-7) — both still present, no crash:
  expect((await screen.findAllByText("Racoons")).length).toBeGreaterThan(0);
  expect((await screen.findAllByText("Wildebeests")).length).toBeGreaterThan(0);
  expect((await screen.findAllByText("2-6")).length).toBeGreaterThan(0);
  expect((await screen.findAllByText("2-7")).length).toBeGreaterThan(0);
});
```

> If the exact button text differs (read `MatchTracker.tsx` ~896 for the ScoreHeader `action` button label, ~951 for the Swap button), adjust the `findByText` to the real labels. If `fireEvent.click` on the `✎ Edit`/Swap needs the closest `<button>`, use `screen.findByRole("button", { name: /Swap/ })`. Keep the intent: clicking Swap reverses the sides without crashing. To assert the *order* flipped (stronger), query the score header container and check the first `.sh-nm` text is now "Racoons" — read `ScoreHeader.tsx` for the class.

- [ ] **Step 2: Run + commit**

Run: `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test -- editor` → PASS.
```bash
git add test/
git commit -m "test(editor): swap interaction guard (decomp ②)"
```

---

## Task 2: Extract `useMatchEditor` hook

**Files:** Create `components/match-tracker/useMatchEditor.ts`. Modify `components/MatchTracker.tsx`.

This is a **behaviour-preserving mechanical relocation**: everything in `MatchTracker`'s function body *except the returned JSX* moves into the hook; the hook returns it all; the component destructures it and renders the JSX. No logic changes.

- [ ] **Step 1: Create the hook file skeleton**

Create `components/match-tracker/useMatchEditor.ts`:
```ts
// @ts-nocheck
"use client";
// useMatchEditor — owns all editor state + actions + derived values for MatchTracker.
// Extracted from MatchTracker (decomposition ②); behaviour-identical. The hook is the
// single unit-testable seam for the editor's logic (see test/use-match-editor.test.ts).
// Typing is a later slice; @ts-nocheck retained for the move.
import React, { useState, useEffect, useMemo, useRef } from "react";
// (copy MatchTracker's other imports that the moved body needs — parser, store, lib helpers, etc.)

export function useMatchEditor({ initialId = null, wizard = false } = {}) {
  // ... (the entire current MatchTracker body, minus the `return (<JSX/>)`) ...
  return {
    // every state value, setter, ref, derived value, and action function the JSX references
  };
}
```

- [ ] **Step 2: Move the body.** Cut everything from `MatchTracker`'s body between the `export default function MatchTracker({...})` opening and its `return (` — all `useState`/`useRef`/`useMemo`/`useEffect`, every `const`/helper/action (`doLoad`, `applyRecord`, `recordPayload`, `addLive`, `completeSub`, `swapHomeAway` caller, `buildEventLine`, `whoGrid`, `gmPicker`, `tapPlayer`, `blk*`, `ins*`, `subArrows`/`playerMarks`/`scoreFor`/`renderEditPitch`, `liveRows`/`liveEvents`, the derived `homeName`/`timeline`/`homeScorers`/`phase`/`blocks`/etc.) — into `useMatchEditor`'s body. Move the matching imports too.

- [ ] **Step 3: Return everything the JSX uses.** Build the hook's return object: every identifier the JSX (`return (...)` in MatchTracker) references must be a key. (Mechanical: scan the JSX for referenced identifiers; return each.) Keep names identical so the JSX is untouched.

- [ ] **Step 4: Make `MatchTracker` consume the hook.** `MatchTracker` becomes:
```tsx
// @ts-nocheck
"use client";
import React from "react";
import { useMatchEditor } from "@/components/match-tracker/useMatchEditor";
// (keep ONLY the imports the JSX itself needs: child components like ScoreHeader/ScoreChart/Timeline/Scorers/Jersey/AppHeader/etc.)
export default function MatchTracker({ initialId = null, wizard = false }) {
  const m = useMatchEditor({ initialId, wizard });
  const { /* destructure everything the JSX uses */ } = m;
  return ( /* the exact same JSX, unchanged */ );
}
```
(Destructuring `const { ... } = m` with the full list keeps the JSX identical. Alternatively prefix JSX references with `m.` — but destructuring is less churn.)

- [ ] **Step 5: Verify behaviour-preserving.**
  - `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npx tsc --noEmit` — clean (both files `@ts-nocheck`, so this checks the rest compiles — confirm no OTHER file broke).
  - `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test` — the render smoke + swap interaction (Tasks ①/1) + full pure-lib suite all green. **These are the behaviour guard** — if the move dropped a reference or broke an action, the smoke/swap tests fail.
  - Grep sanity: `grep -c "useState\|useEffect" components/MatchTracker.tsx` → should be ~0 (all moved to the hook); the hook has them.
  - **If a guard fails:** a reference was missed or a closure broke during the move — fix the hook's return/body; do NOT change behaviour.

- [ ] **Step 6: Commit**
```bash
git add components/match-tracker/useMatchEditor.ts components/MatchTracker.tsx
git commit -m "refactor(editor): extract useMatchEditor hook; MatchTracker is now a shell (decomp ②)"
```

---

## Task 3: Hook unit tests (the payoff — testing actions without the DOM)

**Files:** Create `test/use-match-editor.test.ts` (or `.tsx`).

Now the editor's logic is directly testable via `renderHook` — no full-component mount. This adds the first such tests, proving the seam and giving durable action coverage.

- [ ] **Step 1: Write hook tests**

Create `test/use-match-editor.test.tsx`:
```tsx
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import "./support/editor-harness"; // registers the supabase + next/navigation mocks
import { cache } from "@/lib/store";
import { useMatchEditor } from "@/components/match-tracker/useMatchEditor";
import { SAMPLE_RECORD } from "@/lib/sample";

describe("useMatchEditor", () => {
  it("loads a seeded record into home/away state", async () => {
    cache["hk-1"] = { ...SAMPLE_RECORD };
    const { result } = renderHook(() => useMatchEditor({ initialId: "hk-1" }));
    await waitFor(() => expect(result.current.homeTeam).toBe("Wildebeests"));
    expect(result.current.awayTeam).toBe("Racoons");
  });

  it("swap reverses home/away", async () => {
    cache["hk-2"] = { ...SAMPLE_RECORD };
    const { result } = renderHook(() => useMatchEditor({ initialId: "hk-2" }));
    await waitFor(() => expect(result.current.homeTeam).toBe("Wildebeests"));
    // call the swap action exposed by the hook (use the actual name from the hook's return —
    // it's the onClick of the ⇄ Swap button in MatchTracker; e.g. `doSwap`/`onSwap`).
    act(() => { result.current.<SWAP_ACTION>(); });
    await waitFor(() => expect(result.current.homeTeam).toBe("Racoons"));
    expect(result.current.awayTeam).toBe("Wildebeests");
  });
});
```

> Replace `<SWAP_ACTION>` with the real action name the hook returns for the ⇄ Swap onClick (find it in `MatchTracker`'s Swap button `onClick` — it was an inline handler calling `swapHomeAway(recordPayload())` + setters; if it's inline, extract it into a named `doSwap` action on the hook as part of Task 2's return, and use that name here). If `homeTeam` isn't directly on the hook's return (e.g. it's internal state with a different exposed name), use the exposed name. The intent: load + swap are unit-testable through the hook.

- [ ] **Step 2: Run + full suite + tsc**

Run: `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test` (all green) + `npx tsc --noEmit` (clean).

- [ ] **Step 3: Commit**
```bash
git add test/use-match-editor.test.tsx components/match-tracker/useMatchEditor.ts
git commit -m "test(editor): useMatchEditor hook unit tests — load + swap (decomp ②)"
```

---

## Manual verification (the editor still has limited automated coverage)

After the extraction, the render smoke + swap + hook tests guard the core, but a quick manual click-through on the preview is still worthwhile before merge: open a match, live-entry a score in game mode, do a sub in the lineup tab, ⇄ Swap, save + reload. (Same as the ④b checklist, abbreviated — the extraction is behaviour-preserving, so anything that worked at v85 should still work.)

## Self-review (spec coverage)

- ② "extract `useMatchEditor`" → Task 2. Guard-first (interaction test before the move) → Task 1. The payoff (hook unit-testable) → Task 3.
- Deferred per scope notes: `DetailsView`/view extraction → ③; full typing of the hook (drop `@ts-nocheck`) → ④/⑤. Flagged above (the spec bundled DetailsView into ②; splitting keeps the risky hook move isolated).
