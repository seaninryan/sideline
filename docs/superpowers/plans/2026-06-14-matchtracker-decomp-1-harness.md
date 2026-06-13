# MatchTracker decomposition ① — test harness + editor render smoke test

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a component-render test harness (jsdom + Testing Library + a Supabase/store mock) and add the first-ever editor test: a render smoke test that mounts `MatchTracker` and asserts it renders the score without throwing — the regression guard that all later decomposition steps rely on.

**Architecture:** Vitest gains a jsdom environment for `.test.tsx` files. A shared test setup mocks `@/lib/supabase/client` (so the module-load `createClient()` in `store.ts`/`MatchTracker` is inert) and seeds the in-memory `store` `cache`. The smoke test mounts `<MatchTracker initialId>` against a seeded `SAMPLE_RECORD` and asserts the home/away score + team names appear.

**Tech Stack:** Vitest 2, React 18, jsdom, `@testing-library/react`. Node 20 — prefix every command with `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH`. Dev server is live; **never `npm run build`** — use `npx tsc --noEmit`.

**Spec:** `docs/superpowers/specs/2026-06-13-matchtracker-decomposition-design.md` (sub-project ①, foundation slice — the `useMatchEditor` hook + `DetailsView` extraction are deferred to ②, built under this guard).

**Branch:** `matchtracker-decomp-1` (off `main` v85, post-#26).

> **Why harness-only for ①:** the smoke test is the prerequisite guard for the risky hook/view extraction. It's independently valuable (first editor coverage; would have caught both ④a editor crashes), low-risk, and mergeable on its own. The big `useMatchEditor` extraction lands as ② *under* this guard.

---

## Task 1: Add the test-render dependencies + Vitest jsdom config

**Files:** Modify `package.json`, `vitest.config.ts`.

- [ ] **Step 1: Install dev dependencies**

Run: `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm install -D jsdom @testing-library/react @testing-library/dom`
Expected: installs cleanly, `package.json` gains the three devDependencies. (React/React-DOM are already deps via Next.) **If the registry is unreachable in this environment, STOP and report** — the harness can't proceed without these, and the user may need to install them.

- [ ] **Step 2: Allow `.test.tsx` + keep node default**

Edit `vitest.config.ts` so the include picks up `.test.tsx` and per-file environment overrides are honoured (pure-lib `.test.ts` stay on node; the `.tsx` smoke test opts into jsdom via a file pragma):

```ts
import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    environmentMatchGlobs: [["test/**/*.test.tsx", "jsdom"]],
    include: ["test/**/*.test.ts", "test/**/*.test.tsx"],
  },
  resolve: { alias: { "@": resolve(__dirname, ".") } },
});
```

- [ ] **Step 3: Verify the existing suite still runs**

Run: `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test`
Expected: the existing 333 tests still pass (no `.tsx` tests yet, so behaviour is unchanged).

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "test: add jsdom + testing-library harness for component tests (decomp ①)"
```

---

## Task 2: Shared test setup — Supabase mock + editor mount helper

**Files:** Create `test/support/editor-harness.tsx`.

`store.ts` and `MatchTracker` both call `createClient()` (from `@/lib/supabase/client`) at module load / on mount (`auth.getUser`, the admin profile query, realtime channel). The harness mocks that module with an inert chainable stub and exposes a helper that seeds the store `cache` and renders the editor.

- [ ] **Step 1: Create the harness module**

Create `test/support/editor-harness.tsx`:

```tsx
import React from "react";
import { vi } from "vitest";
import { render } from "@testing-library/react";

// An inert, chainable Supabase stub: every query-builder method returns the
// builder, and the builder is awaitable → resolves { data: null, error: null }.
// auth + realtime are no-ops. Enough for MatchTracker to mount without network.
export function makeSupabaseStub() {
  const qb: any = {};
  for (const m of ["select", "insert", "upsert", "update", "delete", "eq", "neq", "is", "order", "limit", "range", "maybeSingle", "single"]) {
    qb[m] = () => qb;
  }
  qb.then = (resolve: (v: any) => any) => resolve({ data: null, error: null });
  return {
    auth: {
      getUser: async () => ({ data: { user: null } }),
      signInWithOAuth: async () => ({}),
      signOut: async () => ({}),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
    from: () => qb,
    channel: () => ({ on() { return this; }, subscribe() { return this; } }),
    removeChannel: () => {},
  };
}

// Mock the supabase client module so createClient() returns the inert stub.
// vi.mock is hoisted; the factory must be self-contained.
vi.mock("@/lib/supabase/client", () => ({ createClient: () => makeSupabaseStub() }));

// Seed the in-memory store cache with a record under `id`, then render the editor
// pointed at it. Returns the Testing Library render result.
export async function mountEditor(id: string, record: any) {
  const { cache } = await import("@/lib/store");
  cache[id] = record;
  const { default: MatchTracker } = await import("@/components/MatchTracker");
  return render(<MatchTracker initialId={id} />);
}
```

(Dynamic `import` of `store`/`MatchTracker` after the `vi.mock` guarantees the mock is in place before those modules instantiate the client.)

- [ ] **Step 2: Commit**

```bash
git add test/support/editor-harness.tsx
git commit -m "test: editor harness — supabase stub + mountEditor helper (decomp ①)"
```

---

## Task 3: The editor render smoke test

**Files:** Create `test/editor-smoke.test.tsx`.

- [ ] **Step 1: Write the smoke test**

Create `test/editor-smoke.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { mountEditor } from "./support/editor-harness";
import { SAMPLE_RECORD } from "@/lib/sample";

describe("MatchTracker render smoke test", () => {
  it("mounts a home/away match and renders the score + team names without throwing", async () => {
    await mountEditor("smoke-1", { ...SAMPLE_RECORD });
    // SAMPLE_RECORD is home/away v3: Wildebeests (home) 2-7, Racoons (away) 2-6.
    expect(await screen.findByText("Wildebeests")).toBeTruthy();
    expect(await screen.findByText("Racoons")).toBeTruthy();
    expect(await screen.findByText("2-7")).toBeTruthy();
    expect(await screen.findByText("2-6")).toBeTruthy();
  });

  it("does not leave any us/them artifact in the rendered score header", async () => {
    const { container } = await mountEditor("smoke-2", { ...SAMPLE_RECORD });
    await screen.findByText("Wildebeests");
    expect(container.textContent || "").not.toMatch(/My Team|Opposition/);
  });
});
```

- [ ] **Step 2: Run it**

Run: `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test -- editor-smoke`
Expected: PASS. If it fails because `MatchTracker`'s mount load is async (the `doLoad(initialId)` effect at ~line 252 reads `cache[id]` and calls `applyRecord`), the `findByText` (which retries) should cover the timing. If the score text is split across elements (e.g. ScoreHeader renders `homeStr` in its own node), `findByText("2-7")` still matches a text node — confirm by reading `components/ScoreHeader.tsx` (it renders `{homeStr}` in a `.sh-sc` div). If a query genuinely can't match, adjust the assertion to the actual rendered text (read the DOM via `screen.debug()`), keeping the intent: the score + both team names render.

> If mounting throws (e.g. a missing browser API like `matchMedia`/`ResizeObserver` referenced by a child), add the minimal stub to the harness (`test/support/editor-harness.tsx`) — `window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} } as any)` etc. — and note it. Do NOT change app code to satisfy the test.

- [ ] **Step 3: Full suite + typecheck**

Run: `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test` then `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npx tsc --noEmit`
Expected: all green (334+), tsc clean.

- [ ] **Step 4: Commit**

```bash
git add test/editor-smoke.test.tsx
git commit -m "test(editor): render smoke test — guards MatchTracker against render-crash/blank-state (decomp ①)"
```

---

## Notes / scope

- **No app-code changes** — ① is pure test scaffolding. (If a browser-API stub is needed it lives in the harness, not the app.)
- **This is the guard, not the decomposition.** ② extracts `useMatchEditor` (state + actions) under this smoke test; ③+ extract the views. The smoke test must stay green through all of it.
- The two assertions encode exactly the failure modes ④a hit: a render-time throw (the test would error) and blank teams (`/My Team|Opposition/` would appear instead of the real names).

## Self-review (spec coverage)

- ①.1 render-smoke-test harness (jsdom + RTL + supabase/store mock) → Tasks 1-2. The smoke test asserting the score renders → Task 3.
- Deferred to ② (per the harness-first rescope, flagged above): the `useMatchEditor` hook extraction + `DetailsView`. The spec's ① bundled these; splitting the guard out first is the lower-risk ordering.
