# Next.js Migration — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the single-file Sideline app to a Next.js (App Router) + TypeScript codebase with a build step and tests, add a public read-only match page with an OG score-card image, and add a share wizard — deployed to Vercel, at feature parity with `index.html`.

**Architecture:** Pure logic (`parseMatch`, raw-edit helpers, infographic builders, model assembly, name redaction) is extracted into fully-typed, unit-tested `lib/` modules. The editor (`MatchTracker`) is ported **whole** as one `"use client"` component (carrying `// @ts-nocheck` for now — it gets properly typed in a later decomposition phase, deliberately out of scope here). Auth moves to cookie-based `@supabase/ssr` so the server can render the public match page; that page and the OG image route reuse the same pure `buildModel` + infographic code the editor uses.

**Tech Stack:** Next.js (App Router) 14+, TypeScript, `@supabase/ssr` + `@supabase/supabase-js`, `@resvg/resvg-js` (server SVG→PNG), Vitest. Deployed to Vercel. The old `index.html` stays live on GitHub Pages until cutover (final task).

**Source of truth during the port:** the existing `index.html` (2,452 lines). Tasks reference exact line ranges in it. Keep it untouched until the final cutover task.

---

## File Structure

**New (Next.js app):**
- `package.json`, `tsconfig.json`, `next.config.mjs`, `vitest.config.ts`, `.env.local`, `.env.example` — project config.
- `app/layout.tsx` — root layout: fonts (`next/font`), global CSS, `<html>`/`<body>`.
- `app/globals.css` — the ported `<style>` head block + the JS `CSS` string.
- `app/page.tsx` — `/`, server component: reads session, renders `<SignIn/>` or `<MatchTracker/>`.
- `app/auth/callback/route.ts` — OAuth code-exchange handler.
- `app/m/[id]/page.tsx` — public read-only match (server component).
- `app/m/[id]/opengraph-image.tsx` — compact OG score card (Node runtime, resvg).
- `middleware.ts` — `@supabase/ssr` session refresh.
- `lib/supabase/client.ts` — browser Supabase client factory.
- `lib/supabase/server.ts` — server Supabase client factory (cookies).
- `lib/store.ts` — `cache`, `loadAll`, `store` (list/get/set/del), `matchCols` — same surface as today, browser-backed.
- `lib/parser.ts` — `parseMatch` + parser helpers + types.
- `lib/raw-edit.ts` — `deleteEventLine`/`insertEventLine`/`replaceEventLine`/`placeEventLineByMinute`/`eventLineMinute`/`swapRosterNums`/`renumRoster`.
- `lib/infographic.ts` — `buildInfographicSVG` (full poster) + `buildScoreCardSVG` (compact OG card).
- `lib/svg-to-png.client.ts` — browser-canvas `svgToPng` (`"use client"`-only import).
- `lib/model.ts` — `buildModel(record, opts)` → the infographic/page model, reused by editor, public page, OG.
- `lib/name-display.ts` — `applyNameDisplay(model, mode)` redaction.
- `lib/util.ts` — pure helpers: `gpTotal`, `fmtScore`, `squash`, `titleCase`, `contrastOn`, `pad2`, `toLocalInput`, `fmtDate`, `fmtDateShort`, `dateKey`, `MONTHS`, `mkId`, `remapImport`.
- `lib/constants.ts` — `APP_VERSION`, `PALETTE`, `LIVE_EVENTS`, `LIVE_PLAYER_EVENTS`, `SPORTS`.
- `lib/types.ts` — `MatchRecord`, `ParsedMatch`, `Settings`, `NameDisplay`, `MatchRow`, `Model`.
- `lib/sample.ts` — `SAMPLE` fixture.
- `components/MatchTracker.tsx` — the editor (ported whole, `// @ts-nocheck`).
- `components/ScoreChart.tsx`, `components/MinuteStep.tsx`, `components/SignIn.tsx` — ported, typed.
- `components/PublicMatch.tsx` — read-only render used by the public page.
- `components/ShareWizard.tsx` — share takeover wizard.
- `test/parser.test.ts`, `test/raw-edit.test.ts`, `test/score-card.test.ts`, `test/name-display.test.ts` — Vitest.
- `assets/LiberationSans-Regular.ttf`, `assets/LiberationSans-Bold.ttf` — fonts for resvg.

**Removed at cutover:** `index.html`, `tools/parser-harness.js`, GitHub Pages serving.

**Convention for "move" steps:** "Move lines A–B of `index.html`" means copy that text verbatim into the target file, then apply the listed transforms (add `export`, swap a global reference for an `import`, etc.). The numbers are from the current `index.html`; if it has drifted, match on the function/const name instead.

---

## Task Group A — Scaffold the Next.js project

### Task A1: Initialize project config

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.mjs`, `.gitignore` (append), `.env.example`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "sideline",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@supabase/ssr": "^0.5.2",
    "@supabase/supabase-js": "^2.45.0",
    "@resvg/resvg-js": "^2.6.2",
    "next": "^14.2.5",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@types/node": "^20.14.0",
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "typescript": "^5.5.3",
    "vitest": "^2.0.5"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Create `next.config.mjs`**

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
};
export default nextConfig;
```

- [ ] **Step 4: Append to `.gitignore`**

```
/node_modules
/.next
/out
next-env.d.ts
.env.local
.vercel
```

- [ ] **Step 5: Create `.env.example`**

```
NEXT_PUBLIC_SUPABASE_URL=https://uobatagvcxbqynajojrt.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_5Bthln94hLtsYlgNXIzWSA_UGuhAze7
```

- [ ] **Step 6: Create `.env.local`** (same two lines as `.env.example`, real values above — this file is gitignored).

- [ ] **Step 7: Install and verify**

Run: `npm install && npx tsc --noEmit`
Expected: install succeeds; `tsc` prints nothing (no files to check yet) and exits 0.

- [ ] **Step 8: Commit**

```bash
git add package.json tsconfig.json next.config.mjs .gitignore .env.example
git commit -m "chore: scaffold Next.js + TypeScript project config"
```

### Task A2: Vitest config + smoke test

**Files:**
- Create: `vitest.config.ts`, `test/smoke.test.ts`

- [ ] **Step 1: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: { environment: "node", include: ["test/**/*.test.ts"] },
  resolve: { alias: { "@": resolve(__dirname, ".") } },
});
```

- [ ] **Step 2: Create `test/smoke.test.ts`**

```ts
import { describe, it, expect } from "vitest";

describe("toolchain", () => {
  it("runs", () => { expect(1 + 1).toBe(2); });
});
```

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: PASS (1 test).

- [ ] **Step 4: Commit**

```bash
git add vitest.config.ts test/smoke.test.ts
git commit -m "chore: add Vitest with a smoke test"
```

---

## Task Group B — Extract pure logic into typed, tested `lib/` modules

The pure region of `index.html` runs from `function gpTotal` (~line 89) to just before `const CSS` (~line 879), plus `isPlaceholderLabel`. We split it across modules. To keep diffs reviewable, port a module, type its public surface, then move on. Internal `any` is acceptable inside ported function bodies; the **exported signatures** must be typed.

### Task B1: `lib/types.ts` — shared types

**Files:**
- Create: `lib/types.ts`

- [ ] **Step 1: Write the types** (derived from `recordPayload()` at `index.html:1249`, `matchCols` at `:59`, and the `parseMatch` return object built in `:699`+ / `:1630`)

```ts
export type NameDisplay = "full" | "initials" | "none";

export interface Settings {
  myTeam?: string;
  scoringMode?: "gaa" | "goals";
  sport?: string;
}

export interface MatchRecord {
  raw: string;
  matchDate?: string;
  date?: string;
  myTeam?: string;
  scoringMode?: "gaa" | "goals";
  autoMode?: boolean;
  sport?: string;
  colorUs?: string;
  colorUs2?: string;
  colorThem?: string;
  colorThem2?: string;
  nameDisplay?: NameDisplay;
  savedAt?: number;
}

// Promoted columns + jsonb row in the `matches` table.
export interface MatchRow {
  id: string;
  owner?: string;
  is_public: boolean;
  name_display: NameDisplay;
  match_date: string | null;
  my_team: string | null;
  opponent: string | null;
  sport: string | null;
  data: MatchRecord;
  updated_at?: string;
}

// parseMatch output — intentionally loose; the parser is large and dynamically shaped.
export interface ParsedMatch {
  mode: "gaa" | "goals";
  opp: string | null;
  totals: { us: { g: number; p: number; str: string }; them: { g: number; p: number; str: string } };
  result: "Win" | "Loss" | "Draw" | string;
  scorers: any[];
  roster: any[];
  formationRows: any[];
  series: any[];
  goalDots: any[];
  htLine: any;
  leadChanges: number;
  timesLevel: number;
  maxLead: number;
  maxLeadSide: "us" | "them" | string;
  warnings: any[];
  scoring: any[];
  notes: any[];
  halfMarks: any[];
  [k: string]: any;
}

// The assembled infographic/page model (see lib/model.ts).
export type Model = Record<string, any>;
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add lib/types.ts
git commit -m "feat: add shared TypeScript types"
```

### Task B2: `lib/util.ts` — pure helpers

**Files:**
- Create: `lib/util.ts`
- Source: `index.html:89-135` (the helper block: `gpTotal`, `mkId`, `remapImport`, `fmtScore`, `squash`, `titleCase`, `MONTHS`, `pad2`, `toLocalInput`, `fmtDate`, `fmtDateShort`, `dateKey`) and `contrastOn` (`:124-129`).

- [ ] **Step 1: Move the helpers** into `lib/util.ts`, adding `export` to each and typing signatures. Result:

```ts
export function gpTotal(g: number, p: number, mode: string): number {
  return mode === "goals" ? g : g * 3 + p;
}
export function mkId(): string { return crypto.randomUUID(); }
export function remapImport(obj: any, gen: () => string = mkId): { id: string; rec: any }[] {
  const arr = (obj && obj.matches) || (Array.isArray(obj) ? obj : []);
  return arr.map((mm: any) => { const { id: _drop, ...rec } = mm; return { id: gen(), rec }; });
}
export function fmtScore(g: number, p: number, mode: string): string {
  return mode === "goals" ? String(g) : `${g}-${p}`;
}
export function squash(s: string): string { return (s || "").toLowerCase().replace(/[^a-z0-9]/g, ""); }
export const titleCase = (s: string): string => s.replace(/\b\w/g, (c) => c.toUpperCase());
export const contrastOn = (hex: string): string => {
  const h = (hex || "").replace("#", "");
  const v = h.length === 3 ? h.split("").map((c) => c + c).join("") : h.padEnd(6, "0");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) || 0);
  return 0.299 * r + 0.587 * g + 0.114 * b > 145 ? "#11241b" : "#ffffff";
};
export const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
export const pad2 = (n: number): string => String(n).padStart(2, "0");
export const toLocalInput = (d: Date): string =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
export const fmtDate = (s?: string): string => { if (!s) return ""; const d = new Date(s); if (isNaN(+d)) return ""; return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
export const fmtDateShort = (s?: string): string => { if (!s) return ""; const d = new Date(s); if (isNaN(+d)) return ""; return `${d.getDate()} ${MONTHS[d.getMonth()]} '${String(d.getFullYear()).slice(2)}`; };
export const dateKey = (s?: string, fb?: number): number => { const d = s ? Date.parse(s) : NaN; return isNaN(d) ? (fb || 0) : d; };
```

- [ ] **Step 2: Write the test** `test/util.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { gpTotal, fmtScore, squash, contrastOn, remapImport } from "@/lib/util";

describe("util", () => {
  it("gpTotal gaa vs goals", () => {
    expect(gpTotal(2, 6, "gaa")).toBe(12);
    expect(gpTotal(2, 6, "goals")).toBe(2);
  });
  it("fmtScore", () => {
    expect(fmtScore(2, 6, "gaa")).toBe("2-6");
    expect(fmtScore(2, 6, "goals")).toBe("2");
  });
  it("squash strips punctuation/case", () => { expect(squash("Cathal N.")).toBe("cathaln"); });
  it("contrastOn picks readable ink", () => {
    expect(contrastOn("#ffffff")).toBe("#11241b");
    expect(contrastOn("#111111")).toBe("#ffffff");
  });
  it("remapImport assigns fresh ids and drops incoming id", () => {
    let n = 0;
    const out = remapImport({ matches: [{ id: "old", raw: "x" }] }, () => `id${++n}`);
    expect(out).toEqual([{ id: "id1", rec: { raw: "x" } }]);
  });
});
```

- [ ] **Step 3: Run test**

Run: `npx vitest run test/util.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add lib/util.ts test/util.test.ts
git commit -m "feat: extract pure util helpers with tests"
```

### Task B3: `lib/constants.ts`

**Files:**
- Create: `lib/constants.ts`
- Source: `APP_VERSION` (`:40`), `PALETTE` (`:104`), `LIVE_EVENTS` (`:107`), `LIVE_PLAYER_EVENTS` (`:122`), and `SPORTS` (search `const SPORTS` in `index.html`).

- [ ] **Step 1: Find `SPORTS`**

Run: `grep -n "const SPORTS" index.html`
Expected: one line number; note it.

- [ ] **Step 2: Move the constants** into `lib/constants.ts`, each `export`ed. `APP_VERSION` keeps the current value (e.g. `"v37"`) — bump on each deployed change per repo convention. Type `PALETTE: string[]`, `LIVE_PLAYER_EVENTS: string[]`, leave `LIVE_EVENTS`/`SPORTS` inferred.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add lib/constants.ts
git commit -m "feat: extract app constants"
```

### Task B4: `lib/parser.ts` — `parseMatch`

**Files:**
- Create: `lib/parser.ts`
- Source: `parseMatch` (`index.html:381-761`) and `isPlaceholderLabel` (search `const isPlaceholderLabel`).

- [ ] **Step 1: Move `parseMatch` and `isPlaceholderLabel`** into `lib/parser.ts`. Transforms:
  - Add `import { squash, gpTotal, fmtScore } from "@/lib/util";` (and any other util the body calls — check by reading the moved body for `squash(`, `gpTotal(`, `fmtScore(`).
  - Add `import type { ParsedMatch, Settings } from "@/lib/types";`.
  - Export signature: `export function parseMatch(raw: string, settings: Settings = {}): ParsedMatch { ... }`.
  - `export const isPlaceholderLabel = ...`.
  - Body internals may stay untyped.

- [ ] **Step 2: Add the `@ts-nocheck`-free guard** — at top of file, above imports, if `tsc` reports body errors that are tedious to fix, add `// @ts-nocheck` **only as a last resort**; prefer fixing. Re-run step 3 either way.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 4: Port the canonical regression test** `test/parser.test.ts` (mirrors `tools/run-tests.js` canonical block)

```ts
import { describe, it, expect } from "vitest";
import { parseMatch } from "@/lib/parser";
import { SAMPLE } from "@/lib/sample";

describe("parseMatch — canonical GAA sample", () => {
  const p = parseMatch(SAMPLE, { myTeam: "Racoons" });
  it("mode", () => expect(p.mode).toBe("gaa"));
  it("us total", () => expect(p.totals.us.str).toBe("2-6"));
  it("them total", () => expect(p.totals.them.str).toBe("2-7"));
  it("result", () => expect(p.result).toBe("Loss"));
  it("Rick 2-4 (4 frees)", () => {
    const rick = p.scorers.find((s: any) => s.name === "Rick");
    expect([rick.g, rick.p, rick.frees]).toEqual([2, 4, 4]);
  });
  it("Morty 0-1", () => {
    const morty = p.scorers.find((s: any) => s.name === "Morty");
    expect([morty.g, morty.p]).toEqual([0, 1]);
  });
  it("leadChanges/timesLevel/maxLead", () => {
    expect(p.leadChanges).toBe(1);
    expect(p.timesLevel).toBe(3);
    expect([p.maxLead, p.maxLeadSide]).toEqual([6, "us"]);
  });
  it("no warnings", () => expect(p.warnings.length).toBe(0));
});
```

(This depends on `lib/sample.ts` from Task B6; if doing B4 first, temporarily inline `SAMPLE` and switch the import in B6. Recommended order: do B6 before running this test.)

- [ ] **Step 5: Run test** (after B6)

Run: `npx vitest run test/parser.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/parser.ts test/parser.test.ts
git commit -m "feat: extract parseMatch into a typed module"
```

### Task B5: `lib/raw-edit.ts` — raw-edit + roster helpers

**Files:**
- Create: `lib/raw-edit.ts`
- Source: `deleteEventLine` (`:762`), `placeEventLineByMinute` (`:771`), `insertEventLine` (`:793`), `replaceEventLine` (`:808`), plus `eventLineMinute`, `swapRosterNums`, `renumRoster` (search each name in `index.html`).

- [ ] **Step 1: Find the roster helpers**

Run: `grep -nE "function (eventLineMinute|swapRosterNums|renumRoster)" index.html`
Expected: three line numbers.

- [ ] **Step 2: Move all seven functions** into `lib/raw-edit.ts`, each `export`ed, signatures typed `(raw: string, ...) => string` (or as appropriate). Add `import { squash } from "@/lib/util";` if any body uses it.

- [ ] **Step 3: Write `test/raw-edit.test.ts`** (port the raw-edit assertions from `tools/run-tests.js` — find them with `grep -n "replaceEventLine\|insertEventLine\|deleteEventLine\|placeEventLineByMinute" tools/run-tests.js` and convert each `t(name, got, want)` to `it(name, () => expect(got).toEqual(want))`). Include at minimum:

```ts
import { describe, it, expect } from "vitest";
import { replaceEventLine, deleteEventLine, insertEventLine } from "@/lib/raw-edit";

describe("raw-edit", () => {
  it("replaceEventLine swaps one line by index", () => {
    const raw = "18:21\n5 Rick 0-1\n7 Morty 0-2";
    expect(replaceEventLine(raw, 1, "5 Rick free 0-1")).toBe("18:21\n5 Rick free 0-1\n7 Morty 0-2");
  });
  it("deleteEventLine removes one line by index", () => {
    const raw = "18:21\n5 Rick 0-1\n7 Morty 0-2";
    expect(deleteEventLine(raw, 1)).toBe("18:21\n7 Morty 0-2");
  });
});
```

(Plus every raw-edit assertion found in `run-tests.js`, converted 1:1.)

- [ ] **Step 4: Run test**

Run: `npx vitest run test/raw-edit.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/raw-edit.ts test/raw-edit.test.ts
git commit -m "feat: extract raw-edit + roster helpers with tests"
```

### Task B6: `lib/sample.ts`

**Files:**
- Create: `lib/sample.ts`
- Source: `SAMPLE` (`index.html:835-878`).

- [ ] **Step 1: Move `SAMPLE`** into `lib/sample.ts` as `export const SAMPLE = \`...\`;` (preserve the fictional teams/names verbatim — repo rule: no real names).

- [ ] **Step 2: Run the parser test** (now that SAMPLE exists)

Run: `npx vitest run test/parser.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add lib/sample.ts
git commit -m "feat: extract SAMPLE fixture"
```

### Task B7: `lib/infographic.ts` — full poster + `svg-to-png.client.ts`

**Files:**
- Create: `lib/infographic.ts`, `lib/svg-to-png.client.ts`
- Source: `buildInfographicSVG` (`:140-359`), `svgToPng` (`:360-380`).

- [ ] **Step 1: Move `buildInfographicSVG`** into `lib/infographic.ts`. Transforms:
  - `import { contrastOn, fmtScore } from "@/lib/util";` (check body for other util calls).
  - `import type { Model } from "@/lib/types";`
  - `export function buildInfographicSVG(m: Model): { svg: string; width: number; height: number } { ... }`.

- [ ] **Step 2: Move `svgToPng`** into `lib/svg-to-png.client.ts` with `"use client";` at the top (it uses `Image`/`canvas`):

```ts
"use client";
export function svgToPng(svg: string, W: number, H: number): Promise<{ blob: Blob | null; dataUrl: string }> {
  // ...moved body...
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add lib/infographic.ts lib/svg-to-png.client.ts
git commit -m "feat: extract infographic builder + client rasterizer"
```

### Task B8: Port the remaining `run-tests.js` assertions

**Files:**
- Modify: `test/parser.test.ts`

- [ ] **Step 1: Convert the rest of `tools/run-tests.js`** (the SOCCER block, misses, set-piece `'65`/`'45`, own goals, cards/corners, subs, added-time, written-score reconciliation — every remaining `t(...)`) into `it(...)`/`expect(...)` cases under new `describe` blocks in `test/parser.test.ts`. One `it` per `t` call, body `expect(got).toEqual(want)`.

- [ ] **Step 2: Run the full parser suite**

Run: `npx vitest run test/parser.test.ts`
Expected: PASS (all cases — parity with `node tools/run-tests.js`).

- [ ] **Step 3: Cross-check against the legacy runner** (sanity, while `index.html` still exists)

Run: `node tools/run-tests.js`
Expected: all `ok`, `0` fails — confirms the extracted module matches the in-file source.

- [ ] **Step 4: Commit**

```bash
git add test/parser.test.ts
git commit -m "test: port full parser regression suite to Vitest"
```

---

## Task Group C — Supabase clients + store

### Task C1: Browser + server Supabase clients

**Files:**
- Create: `lib/supabase/client.ts`, `lib/supabase/server.ts`

- [ ] **Step 1: `lib/supabase/client.ts`**

```ts
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
```

- [ ] **Step 2: `lib/supabase/server.ts`**

```ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = cookies(); // Next 14: cookies() is synchronous
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch { /* called from a Server Component; middleware refreshes instead */ }
        },
      },
    },
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add lib/supabase/client.ts lib/supabase/server.ts
git commit -m "feat: add @supabase/ssr browser and server clients"
```

### Task C2: `lib/store.ts` — same surface, browser-backed

**Files:**
- Create: `lib/store.ts`
- Source: `cache`/`loadAll`/`matchCols`/`store` (`index.html:47-87`).

- [ ] **Step 1: Move the store block** into `lib/store.ts`. Transforms:
  - `import { createClient } from "@/lib/supabase/client";` and `const sb = createClient();` (replaces the global `sb`).
  - `import { parseMatch } from "@/lib/parser";`
  - `import type { MatchRecord } from "@/lib/types";`
  - `matchCols` adds the `name_display` column: `name_display: data.nameDisplay || "full",`.
  - Export `cache`, `loadAll`, `store`. Keep method shapes identical: `list()`/`get(id)`/`set(id, data)`/`del(id)`.
  - Add `"use client";` at the top (browser client; imported only by client components).

Resulting `matchCols`:

```ts
function matchCols(data: MatchRecord) {
  let opp: string | null = null;
  try { opp = (parseMatch(data.raw, { myTeam: data.myTeam }).opp) || null; } catch {}
  return {
    match_date: data.matchDate || data.date || null,
    my_team: data.myTeam || null,
    opponent: opp,
    sport: data.sport || null,
    name_display: data.nameDisplay || "full",
  };
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add lib/store.ts
git commit -m "feat: port store to a browser-client module, derive name_display"
```

---

## Task Group D — Model assembly + name redaction (pure, tested)

### Task D1: `lib/model.ts` — `buildModel(record)`

This rebuilds the infographic/page model from a stored record, server-side. It mirrors the model assembled in `MatchTracker.doExport` (`index.html:1628-1638`) plus the light derivations upstream: `parsed` (`:1175`), `sportLabel` (`:1178`), `usName`/`themName` (`:1180-1181`), `timeline` (`:1477-1485`), `usScorers` (`:1486`), `starters`/`subs`/`missing` (`:1488-1490`), `formationRows` (`:1610`), and `ht` (`:1628-1629`).

**Files:**
- Create: `lib/model.ts`

- [ ] **Step 1: Read the source derivations** — open `index.html` and read lines 1175–1181, 1477–1490, 1610, and 1626–1638 so the extracted logic matches exactly.

- [ ] **Step 2: Write `lib/model.ts`**

```ts
import { parseMatch } from "@/lib/parser";
import { fmtScore, fmtDate, gpTotal } from "@/lib/util";
import type { MatchRecord, Model } from "@/lib/types";

const SPORT_LABELS: Record<string, string> = {
  hurling: "Hurling", camogie: "Camogie", gaelic: "Gaelic Football", soccer: "Soccer",
};

export function buildModel(record: MatchRecord): Model {
  const r = record;
  const effMode = r.scoringMode === "goals" ? "goals" : "gaa";
  const parsed = parseMatch(r.raw, {
    myTeam: r.myTeam,
    scoringMode: r.autoMode ? undefined : r.scoringMode,
    sport: r.sport,
  });
  const usName = r.myTeam || "My Team";
  const themName = parsed.opp || "Opposition";
  const sportLabel = (r.sport && SPORT_LABELS[r.sport]) || parsed.sport || "";

  const usScorers = parsed.scorers
    .filter((s: any) => s.side === "us")
    .sort((a: any, b: any) => gpTotal(b.g, b.p, effMode) - gpTotal(a.g, a.p, effMode));
  const starters = parsed.roster.filter((p: any) => p.role === "starting");
  const subs = parsed.roster.filter((p: any) => p.role === "sub");
  const missing = parsed.roster.filter((p: any) => p.role === "missing");
  const formationRows = parsed.formationRows && parsed.formationRows.length ? parsed.formationRows : [];

  const h1 = parsed.series.filter((p: any) => p.half === 1 && p.usScore);
  const ht = h1.length
    ? `${h1[h1.length - 1].usScore} – ${h1[h1.length - 1].themScore}`
    : `${fmtScore(0, 0, effMode)} – ${fmtScore(0, 0, effMode)}`;

  return {
    grade: parsed.label || "", sport: sportLabel, homeAway: parsed.homeAway,
    usName, themName, dateStr: r.matchDate ? fmtDate(r.matchDate) : "",
    totals: parsed.totals, result: parsed.result, effMode, ht,
    leadChanges: parsed.leadChanges, timesLevel: parsed.timesLevel,
    maxLead: parsed.maxLead, maxLeadSide: parsed.maxLeadSide,
    series: parsed.series, goalDots: parsed.goalDots, htLine: parsed.htLine,
    halfMarks: parsed.halfMarks,
    usScorers, formationRows, starters, subs, missing,
    timeline: parsed.timeline || [],
    colorUs: r.colorUs || "#f5c518", colorUs2: r.colorUs2 || "#1f7a4d",
    colorThem: r.colorThem || "#c0392b", colorThem2: r.colorThem2 || "#2c5fa8",
    nameDisplay: r.nameDisplay || "full",
    parsed,
  };
}
```

- [ ] **Step 3: Verify against the editor's model** — confirm `parsed` exposes `label`, `homeAway`, `timeline`. Run `grep -nE "label:|homeAway|timeline" index.html | head`. If `timeline` is computed in `MatchTracker` (line ~1477) rather than returned by `parseMatch`, copy that derivation into `buildModel` verbatim (it maps `parsed.scoring`/`parsed.notes` into timeline entries). Read `:1477-1485` and inline it, replacing `parsed.timeline || []`.

- [ ] **Step 4: Write `test/model.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { buildModel } from "@/lib/model";
import { SAMPLE } from "@/lib/sample";

describe("buildModel", () => {
  const m = buildModel({ raw: SAMPLE, myTeam: "Racoons", scoringMode: "gaa" });
  it("carries totals + result", () => {
    expect(m.totals.us.str).toBe("2-6");
    expect(m.totals.them.str).toBe("2-7");
    expect(m.result).toBe("Loss");
  });
  it("names from record + parser", () => {
    expect(m.usName).toBe("Racoons");
    expect(m.themName).toBe("Wildebeests");
  });
  it("defaults nameDisplay to full", () => expect(m.nameDisplay).toBe("full"));
});
```

- [ ] **Step 5: Run test**

Run: `npx vitest run test/model.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/model.ts test/model.test.ts
git commit -m "feat: add pure buildModel for server-side rendering"
```

### Task D2: `lib/name-display.ts` — redaction

**Files:**
- Create: `lib/name-display.ts`

- [ ] **Step 1: Write the failing test** `test/name-display.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { redactName, applyNameDisplay } from "@/lib/name-display";

describe("redactName", () => {
  it("full keeps the name", () => expect(redactName("Rick Sanchez", undefined, "full")).toBe("Rick Sanchez"));
  it("initials reduces multi-word to dotted initials", () => expect(redactName("Rick Sanchez", undefined, "initials")).toBe("R.S."));
  it("initials of a single word is first letter", () => expect(redactName("Morty", undefined, "initials")).toBe("M."));
  it("none uses shirt number when known", () => expect(redactName("Rick Sanchez", 10, "none")).toBe("#10"));
  it("none falls back to a neutral label", () => expect(redactName("Rick Sanchez", undefined, "none")).toBe("Player"));
});

describe("applyNameDisplay", () => {
  it("redacts scorer + roster names but keeps team names", () => {
    const model: any = {
      usName: "Racoons", themName: "Wildebeests",
      usScorers: [{ name: "Rick Sanchez", num: 10 }],
      starters: [{ name: "Morty Smith", num: 11 }],
      subs: [], missing: [], timeline: [{ scorer: "Rick Sanchez", num: 10 }],
    };
    const out = applyNameDisplay(model, "initials");
    expect(out.usName).toBe("Racoons");
    expect(out.usScorers[0].name).toBe("R.S.");
    expect(out.starters[0].name).toBe("M.S.");
    expect(out.timeline[0].scorer).toBe("R.S.");
  });
  it("full mode returns the model unchanged", () => {
    const model: any = { usScorers: [{ name: "Rick Sanchez" }] };
    expect(applyNameDisplay(model, "full").usScorers[0].name).toBe("Rick Sanchez");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run test/name-display.test.ts`
Expected: FAIL ("Failed to resolve import @/lib/name-display").

- [ ] **Step 3: Implement `lib/name-display.ts`**

```ts
import type { Model, NameDisplay } from "@/lib/types";

export function redactName(name: string, num: number | undefined, mode: NameDisplay): string {
  if (mode === "full" || !name) return name;
  if (mode === "initials") {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    return parts.map((w) => w[0].toUpperCase() + ".").join("");
  }
  // mode === "none"
  return num != null ? `#${num}` : "Player";
}

// Returns a new model with all player-name fields redacted. Team names untouched.
export function applyNameDisplay(model: Model, mode: NameDisplay): Model {
  if (mode === "full") return model;
  const fixPlayer = (p: any) => (p ? { ...p, name: redactName(p.name, p.num, mode) } : p);
  const fixScorer = (s: any) =>
    s ? { ...s, name: redactName(s.name, s.num, mode), scorer: s.scorer ? redactName(s.scorer, s.num, mode) : s.scorer } : s;
  return {
    ...model,
    usScorers: (model.usScorers || []).map(fixScorer),
    starters: (model.starters || []).map(fixPlayer),
    subs: (model.subs || []).map(fixPlayer),
    missing: (model.missing || []).map(fixPlayer),
    formationRows: (model.formationRows || []).map((row: any[]) => (row || []).map(fixPlayer)),
    timeline: (model.timeline || []).map((t: any) =>
      t && t.scorer ? { ...t, scorer: redactName(t.scorer, t.num, mode) } : t,
    ),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/name-display.test.ts`
Expected: PASS.

- [ ] **Step 5: Reconcile field shapes** — confirm `formationRows` is an array-of-arrays of player objects with `name`/`num` (read `index.html` lineup render, ~`:240-250`). If a formation row stores names as strings rather than `{name,num}` objects, adjust `fixPlayer` mapping for that shape and re-run the test.

- [ ] **Step 6: Commit**

```bash
git add lib/name-display.ts test/name-display.test.ts
git commit -m "feat: add name-display redaction (full/initials/none)"
```

### Task D3: `buildScoreCardSVG` — compact OG card

**Files:**
- Modify: `lib/infographic.ts`
- Create: `test/score-card.test.ts`

- [ ] **Step 1: Write the failing test** `test/score-card.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { buildScoreCardSVG } from "@/lib/infographic";
import { buildModel } from "@/lib/model";
import { SAMPLE } from "@/lib/sample";

describe("buildScoreCardSVG", () => {
  const model = buildModel({ raw: SAMPLE, myTeam: "Racoons", scoringMode: "gaa" });
  const { svg, width, height } = buildScoreCardSVG(model);
  it("is a 1200x630 landscape SVG", () => {
    expect(width).toBe(1200);
    expect(height).toBe(630);
    expect(svg.startsWith("<svg")).toBe(true);
  });
  it("shows both team names and the score", () => {
    expect(svg).toContain("Racoons");
    expect(svg).toContain("Wildebeests");
    expect(svg).toContain("2-6");
    expect(svg).toContain("2-7");
  });
  it("shows no individual player names", () => {
    expect(svg).not.toContain("Rick");
    expect(svg).not.toContain("Morty");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run test/score-card.test.ts`
Expected: FAIL ("buildScoreCardSVG is not a function").

- [ ] **Step 3: Implement `buildScoreCardSVG`** in `lib/infographic.ts` (append). Self-contained string builder — no external font assumptions beyond family name `"Liberation Sans, Arial, sans-serif"` (resvg maps it to the bundled TTF in Task F2).

```ts
export function buildScoreCardSVG(m: Model): { svg: string; width: number; height: number } {
  const W = 1200, H = 630;
  const esc = (s: string) => String(s ?? "").replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c] as string));
  const usS = m.totals?.us?.str ?? "0";
  const themS = m.totals?.them?.str ?? "0";
  const grade = (m.grade || m.sport || "Match").toUpperCase();
  const result = m.result || "";
  const ht = m.ht || "";
  const flag = (x: number, y: number, w: number, h: number, c1: string, c2: string) =>
    `<g><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c1}"/>` +
    `<rect x="${x}" y="${y + h / 2}" width="${w}" height="${h / 2}" fill="${c2}"/></g>`;
  const t = (x: number, y: number, s: string, size: number, fill: string, opts: { w?: number; a?: string } = {}) =>
    `<text x="${x}" y="${y}" font-family="Liberation Sans, Arial, sans-serif" font-size="${size}" fill="${fill}" ` +
    `font-weight="${opts.w || 400}" text-anchor="${opts.a || "start"}">${esc(s)}</text>`;

  const PAPER = "#f4efe1", INK = "#0c3b2a", MUTE = "#5c6b60";
  const parts: string[] = [];
  parts.push(`<rect width="${W}" height="${H}" fill="${PAPER}"/>`);
  parts.push(`<rect x="0" y="0" width="${W / 2}" height="10" fill="${m.colorUs}"/>`);
  parts.push(`<rect x="${W / 2}" y="0" width="${W / 2}" height="10" fill="${m.colorThem}"/>`);
  parts.push(t(W / 2, 90, grade, 34, MUTE, { w: 700, a: "middle" }));
  // teams
  parts.push(flag(W * 0.25 - 40, 150, 80, 50, m.colorUs, m.colorUs2));
  parts.push(flag(W * 0.75 - 40, 150, 80, 50, m.colorThem, m.colorThem2));
  parts.push(t(W * 0.25, 250, m.usName || "Us", 44, INK, { w: 700, a: "middle" }));
  parts.push(t(W * 0.75, 250, m.themName || "Them", 44, INK, { w: 700, a: "middle" }));
  // score
  parts.push(t(W * 0.25, 410, usS, 120, INK, { w: 700, a: "middle" }));
  parts.push(t(W / 2, 400, "–", 90, MUTE, { w: 400, a: "middle" }));
  parts.push(t(W * 0.75, 410, themS, 120, INK, { w: 700, a: "middle" }));
  // result + HT
  if (result) parts.push(t(W / 2, 500, result, 40, INK, { w: 700, a: "middle" }));
  if (ht) parts.push(t(W / 2, 545, `HT ${ht}`, 26, MUTE, { a: "middle" }));
  parts.push(t(W / 2, 605, "SIDELINE", 24, MUTE, { w: 700, a: "middle" }));

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${parts.join("")}</svg>`;
  return { svg, width: W, height: H };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/score-card.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/infographic.ts test/score-card.test.ts
git commit -m "feat: add compact OG score-card SVG builder"
```

---

## Task Group E — Editor app: layout, CSS, components, auth gate

### Task E1: Global CSS + root layout + fonts

**Files:**
- Create: `app/globals.css`, `app/layout.tsx`
- Source: head `<style>` (`index.html:12-27`) and the `CSS` string (`:879-1078`).

- [ ] **Step 1: Build `app/globals.css`** — paste the head `<style>` rules (`:13-26`) followed by the entire `CSS` string body (`:880-1077`, i.e. between the backticks). Then remove the two `@import`/font-face lines for Bebas Neue / Oswald if present (fonts now come from `next/font`). Search the pasted text for `Bebas` and `Oswald` and any `@import url(...fonts.googleapis...)` and delete those `@import` lines.

- [ ] **Step 2: Write `app/layout.tsx`**

```tsx
import type { Metadata } from "next";
import { Oswald, Bebas_Neue } from "next/font/google";
import "./globals.css";

const oswald = Oswald({ subsets: ["latin"], weight: ["300", "400", "500", "600", "700"], variable: "--font-oswald" });
const bebas = Bebas_Neue({ subsets: ["latin"], weight: "400", variable: "--font-bebas" });

export const metadata: Metadata = {
  title: "Sideline",
  icons: { icon: "/icon-180.png", apple: "/icon-touch-180.png" },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover" as const,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${oswald.variable} ${bebas.variable}`}>
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 3: Wire the font variables** — in `app/globals.css`, change the `.mt-root` base `font-family` to `var(--font-oswald), sans-serif` and any Bebas Neue usage to `var(--font-bebas), sans-serif`. Search globals.css for `Oswald` and `Bebas` and replace the family references accordingly.

- [ ] **Step 4: Copy icons**

Run: `mkdir -p public && cp icon-180.png icon-touch-180.png public/`
Expected: two files in `public/`.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add app/globals.css app/layout.tsx public/icon-180.png public/icon-touch-180.png
git commit -m "feat: root layout, global CSS, next/font wiring"
```

### Task E2: Port `MinuteStep`, `ScoreChart`, `SignIn`

**Files:**
- Create: `components/MinuteStep.tsx`, `components/ScoreChart.tsx`, `components/SignIn.tsx`
- Source: `MinuteStep` (`:1114-1125`), `ScoreChart` (`:2367-2407`), `SignIn` (`:2408-2419`).

- [ ] **Step 1: `components/MinuteStep.tsx`** — `"use client";` + `import React from "react";`. Move the function, type props:

```tsx
"use client";
import React from "react";
export default function MinuteStep({ val, onChange }: { val: number; onChange: (n: number) => void }) {
  // ...moved body...
}
```

- [ ] **Step 2: `components/ScoreChart.tsx`** — `"use client";`, move the body, type props from its usage at `:2367`:

```tsx
"use client";
import React from "react";
export default function ScoreChart({ series, goalDots, htLine, colorUs, colorThem }: {
  series: any[]; goalDots: any[]; htLine: any; colorUs: string; colorThem: string;
}) {
  // ...moved body...
}
```

- [ ] **Step 3: `components/SignIn.tsx`** — `"use client";`, move the body, type props from `:2408`:

```tsx
"use client";
import React from "react";
export default function SignIn({ phase, err, onSignIn }: {
  phase: string; err: string; onSignIn: () => void;
}) {
  // ...moved body...
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add components/MinuteStep.tsx components/ScoreChart.tsx components/SignIn.tsx
git commit -m "feat: port MinuteStep, ScoreChart, SignIn components"
```

### Task E3: Port `MatchTracker` whole

**Files:**
- Create: `components/MatchTracker.tsx`
- Source: `MatchTracker` (`index.html:1126-2366`) and the inner `buildEventLine` (`:1384`).

- [ ] **Step 1: Create the file shell**

```tsx
// @ts-nocheck
"use client";
import React, { useState, useMemo, useEffect, useRef } from "react";
import MinuteStep from "@/components/MinuteStep";
import ScoreChart from "@/components/ScoreChart";
import ShareWizard from "@/components/ShareWizard";
import { store, cache, loadAll } from "@/lib/store";
import { createClient } from "@/lib/supabase/client";
import { parseMatch } from "@/lib/parser";
import { buildInfographicSVG } from "@/lib/infographic";
import { svgToPng } from "@/lib/svg-to-png.client";
import { buildModel } from "@/lib/model";
import {
  deleteEventLine, insertEventLine, replaceEventLine, placeEventLineByMinute,
  eventLineMinute, swapRosterNums, renumRoster,
} from "@/lib/raw-edit";
import { SAMPLE } from "@/lib/sample";
import {
  gpTotal, fmtScore, squash, titleCase, contrastOn, mkId, remapImport,
  fmtDate, fmtDateShort, toLocalInput, dateKey, MONTHS, pad2,
} from "@/lib/util";
import { APP_VERSION, PALETTE, LIVE_EVENTS, LIVE_PLAYER_EVENTS, SPORTS } from "@/lib/constants";

const sb = createClient();

// <MatchTracker body moved here>
```

- [ ] **Step 2: Move the `MatchTracker` body** (`:1126-2366`) into the file, replacing the original `function MatchTracker() {` line — keep the body, change to `export default function MatchTracker() {`. Delete the now-duplicated inner declarations that are imported instead (the file used globals `sb`, `store`, `cache`, `loadAll`, `parseMatch`, helpers, constants, `SAMPLE`, `MinuteStep`, `ScoreChart` — all now imported).

- [ ] **Step 3: Remove the inline `<style>{CSS}</style>`** (`:1692`) — CSS is global now. Delete that JSX line.

- [ ] **Step 4: Wire the Share wizard** — find where the Share/Backup panel toggles render (search the moved body for the Share button) and the share-export logic (`doExport`, `:1626`). Add `const [shareOpen, setShareOpen] = useState(false);`. Replace the existing Share entry point so it opens `ShareWizard` (Task G1) as a takeover when the match is saved; keep `doExport` for the in-app poster/PNG. Concretely: the ⋯-menu (or Share button) "Share" action sets `setShareOpen(true)`. Render `{shareOpen && <ShareWizard record={{ ...recordPayload(), savedAt: Date.now() }} curId={curId} onClose={() => setShareOpen(false)} onApplied={({ nameDisplay }) => setNameDisplay(nameDisplay)} />}` inside the `!gm && !nw` chrome wrap (mirror how `nw`/`gm` takeovers gate chrome). The wizard itself persists "make public" + "name display" via `store.set` and a row update (see Task G1); `onApplied` syncs the editor's local `nameDisplay` state.
  - Also add `nameDisplay` to `recordPayload()`: locate `:1249` and add `nameDisplay,` to the returned object, with `const [nameDisplay, setNameDisplay] = useState("full");` near the other `useState` colour declarations (`:1132`), and load it in the match-load effect (`:1298-1301` area): `setNameDisplay(d.nameDisplay || "full");`. Add `nameDisplay` to the `dirty` deps (`:1258`) and the autosave deps (`:1280`).

- [ ] **Step 5: Replace `sb.auth` usages** — the moved body calls `sb.auth.getUser()` (`:1153`) and `sb.auth.signOut()` (`:1720`). These work against the imported browser client `sb`. Leave as-is. (Sign-in itself lives in `app/page.tsx` / `SignIn`.)

- [ ] **Step 6: Typecheck (lib only — MatchTracker is `@ts-nocheck`)**

Run: `npx tsc --noEmit`
Expected: exits 0 (errors here mean a lib import name is wrong — fix the import, not by widening `@ts-nocheck`).

- [ ] **Step 7: Commit**

```bash
git add components/MatchTracker.tsx
git commit -m "feat: port MatchTracker editor whole (@ts-nocheck, typed later)"
```

### Task E4: Auth callback, middleware, and the `/` page

**Files:**
- Create: `app/auth/callback/route.ts`, `middleware.ts`, `app/page.tsx`, `components/SignInGate.tsx`

- [ ] **Step 1: `app/auth/callback/route.ts`**

```ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }
  return NextResponse.redirect(`${origin}/?auth_error=1`);
}
```

- [ ] **Step 2: `middleware.ts`** (refreshes the session cookie on each request)

```ts
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );
  await supabase.auth.getUser();
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.png$).*)"],
};
```

- [ ] **Step 3: `components/SignInGate.tsx`** — a tiny client wrapper so the OAuth call runs in the browser with the correct `redirectTo`:

```tsx
"use client";
import React, { useState } from "react";
import SignIn from "@/components/SignIn";
import { createClient } from "@/lib/supabase/client";

export default function SignInGate({ initialError }: { initialError?: string }) {
  const [err, setErr] = useState(initialError || "");
  const [phase, setPhase] = useState<"idle" | "redirecting">("idle");
  const onSignIn = async () => {
    setPhase("redirecting");
    const sb = createClient();
    const { error } = await sb.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${location.origin}/auth/callback` },
    });
    if (error) { setErr(error.message); setPhase("idle"); }
  };
  return <SignIn phase={phase} err={err} onSignIn={onSignIn} />;
}
```

- [ ] **Step 4: `app/page.tsx`** — server component, chooses gate vs editor:

```tsx
import { createClient } from "@/lib/supabase/server";
import SignInGate from "@/components/SignInGate";
import MatchTracker from "@/components/MatchTracker";

export default async function Home({ searchParams }: { searchParams: { auth_error?: string } }) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    return <SignInGate initialError={searchParams.auth_error ? "Sign-in failed — please try again." : ""} />;
  }
  return <MatchTracker />;
}
```

- [ ] **Step 5: Verify the build compiles**

Run: `npm run build`
Expected: build succeeds (warnings about `@ts-nocheck` are fine). If it fails, fix the reported import/type errors in the **lib/components** (not MatchTracker internals).

- [ ] **Step 6: Commit**

```bash
git add app/auth/callback/route.ts middleware.ts app/page.tsx components/SignInGate.tsx
git commit -m "feat: cookie-based auth (callback, middleware) + / page gate"
```

### Task E5: Manual smoke — editor at parity

**Files:** none (manual verification).

- [ ] **Step 1: Add the dev redirect URL to Supabase** — in the Supabase dashboard → Authentication → URL Configuration, add `http://localhost:3000/auth/callback` to the redirect allowlist. (Document this; it's a one-time external change.)

- [ ] **Step 2: Run the dev server**

Run: `npm run dev`
Then open `http://localhost:3000`.

- [ ] **Step 3: Smoke checklist** — verify each against the live `index.html` behavior:
  - Sign in with Google → lands back signed in.
  - Existing matches load in the dropdown; opening one renders scoreboard, chart, scorers, timeline, lineup.
  - Edit notation (block edit + "Edit as text"); auto-save `*` indicator behaves; Save persists.
  - New-match wizard creates a match.
  - Game mode enters/exits; live entry appends events.
  - Share → in-app poster PNG still generates (`doExport`).
  - Resync, undo, sign out (shows email) all work.

- [ ] **Step 4: Note any parity gaps** as follow-up checklist items; fix before proceeding. Do **not** commit (no code change) unless a fix was needed.

---

## Task Group F — Public match page + OG image

### Task F1: Public read-only match page

**Files:**
- Create: `components/PublicMatch.tsx`, `app/m/[id]/page.tsx`

- [ ] **Step 1: `components/PublicMatch.tsx`** — a read-only render of the model. Reuse `ScoreChart`; render scoreboard, scorers, lineup, timeline as plain markup (no editing controls). Keep it a client component only if it uses `ScoreChart` (which is `"use client"`); wrap accordingly:

```tsx
"use client";
import React from "react";
import ScoreChart from "@/components/ScoreChart";
import type { Model } from "@/lib/types";

export default function PublicMatch({ model }: { model: Model }) {
  const m = model;
  return (
    <div className="mt-root" style={{ maxWidth: 760, margin: "0 auto", padding: 16 }}>
      <h1 style={{ textAlign: "center" }}>{m.usName} {m.totals.us.str} – {m.totals.them.str} {m.themName}</h1>
      <p style={{ textAlign: "center" }}>{m.grade} · {m.dateStr} · {m.result}</p>
      <ScoreChart series={m.series} goalDots={m.goalDots} htLine={m.htLine} colorUs={m.colorUs} colorThem={m.colorThem} />
      <h3>Scorers</h3>
      <ul>{m.usScorers.map((s: any, i: number) => <li key={i}>{s.name} — {s.g}-{s.p}</li>)}</ul>
      <h3>Lineup</h3>
      <ul>{m.starters.map((p: any, i: number) => <li key={i}>{p.num ? `#${p.num} ` : ""}{p.name}</li>)}</ul>
    </div>
  );
}
```

(This is a minimal faithful read-only view; richer styling can reuse classes from `globals.css`. Match the existing `.mt-*` class names where practical by reading the editor's render.)

- [ ] **Step 2: `app/m/[id]/page.tsx`** — server component:

```tsx
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { buildModel } from "@/lib/model";
import { applyNameDisplay } from "@/lib/name-display";
import PublicMatch from "@/components/PublicMatch";
import type { MatchRow } from "@/lib/types";

async function fetchPublic(id: string): Promise<MatchRow | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("matches")
    .select("id,data,is_public,name_display")
    .eq("id", id)
    .eq("is_public", true)
    .maybeSingle();
  return (data as MatchRow) || null;
}

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const row = await fetchPublic(params.id);
  if (!row) return { title: "Sideline" };
  const m = buildModel(row.data);
  const title = `${m.usName} ${m.totals.us.str} – ${m.totals.them.str} ${m.themName}`;
  return { title: `${title} · Sideline`, openGraph: { title, type: "website" } };
}

export default async function PublicMatchPage({ params }: { params: { id: string } }) {
  const row = await fetchPublic(params.id);
  if (!row) notFound();
  const model = applyNameDisplay(buildModel(row.data), row.name_display || row.data.nameDisplay || "full");
  return <PublicMatch model={model} />;
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: succeeds; `/m/[id]` listed as a dynamic route.

- [ ] **Step 4: Commit**

```bash
git add components/PublicMatch.tsx app/m/[id]/page.tsx
git commit -m "feat: public read-only match page (SSR, respects name_display)"
```

### Task F2: OG score-card image route

**Files:**
- Create: `app/m/[id]/opengraph-image.tsx`, `assets/LiberationSans-Regular.ttf`, `assets/LiberationSans-Bold.ttf`

- [ ] **Step 1: Add the fonts** — download Liberation Sans (Arial-metric, OFL-licensed) Regular + Bold TTFs into `assets/`. Source: the `liberation-fonts` release (e.g. `https://github.com/liberationfonts/liberation-fonts/releases`). Verify:

Run: `ls -la assets/LiberationSans-*.ttf`
Expected: two `.ttf` files present.

- [ ] **Step 2: `app/m/[id]/opengraph-image.tsx`** — Node runtime, resvg rasterization:

```tsx
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Resvg } from "@resvg/resvg-js";
import { createClient } from "@/lib/supabase/server";
import { buildModel } from "@/lib/model";
import { buildScoreCardSVG } from "@/lib/infographic";
import type { MatchRow } from "@/lib/types";

export const runtime = "nodejs";
export const contentType = "image/png";
export const size = { width: 1200, height: 630 };
export const alt = "Match score card";

const fontReg = readFileSync(join(process.cwd(), "assets/LiberationSans-Regular.ttf"));
const fontBold = readFileSync(join(process.cwd(), "assets/LiberationSans-Bold.ttf"));

export default async function Image({ params }: { params: { id: string } }) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("matches")
    .select("data,is_public")
    .eq("id", params.id)
    .eq("is_public", true)
    .maybeSingle();

  const row = data as Pick<MatchRow, "data" | "is_public"> | null;
  const model = row ? buildModel(row.data) : { usName: "Sideline", themName: "", totals: { us: { str: "" }, them: { str: "" } } };
  const { svg } = buildScoreCardSVG(model as any);

  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: 1200 },
    font: { fontBuffers: [fontReg, fontBold], defaultFontFamily: "Liberation Sans", loadSystemFonts: false },
  });
  const png = resvg.render().asPng();
  return new Response(png, { headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=3600" } });
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: succeeds. (If `@resvg/resvg-js` native binding errors on build, ensure it's a dependency, not devDependency — it is in A1.)

- [ ] **Step 4: Manual check** — with a public match id (flip one row's `is_public=true` in the Supabase dashboard, or use the share wizard from Task G):
  - `npm run dev`, open `http://localhost:3000/m/<id>/opengraph-image` → a 1200×630 PNG score card renders with team names + score, no player names.
  - Open `http://localhost:3000/m/<id>` → public page renders; view source shows `<meta property="og:image" ...>` pointing at the opengraph-image route.

- [ ] **Step 5: Commit**

```bash
git add app/m/[id]/opengraph-image.tsx assets/LiberationSans-Regular.ttf assets/LiberationSans-Bold.ttf
git commit -m "feat: OG score-card image route (resvg, bundled fonts)"
```

---

## Task Group G — Share wizard + name_display end to end

### Task G1: Share wizard takeover

**Files:**
- Create: `components/ShareWizard.tsx`
- Modify: `components/MatchTracker.tsx` (wiring done in E3 Step 4; this task builds the component it calls)

- [ ] **Step 1: Write `components/ShareWizard.tsx`** — a full-screen takeover, 3 steps, following the new-match wizard pattern:

```tsx
"use client";
import React, { useState } from "react";
import { store } from "@/lib/store";
import type { MatchRecord, NameDisplay } from "@/lib/types";

const NAME_OPTS: { v: NameDisplay; label: string; hint: string }[] = [
  { v: "full", label: "Full names", hint: "Show players as written" },
  { v: "initials", label: "Initials", hint: "e.g. R.S." },
  { v: "none", label: "No names", hint: "Shirt numbers only" },
];

export default function ShareWizard({ record, curId, onClose, onApplied }: {
  record: MatchRecord; curId: string; onClose: () => void;
  onApplied: (patch: { nameDisplay: NameDisplay; isPublic: boolean }) => void;
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [nameDisplay, setNameDisplay] = useState<NameDisplay>(record.nameDisplay || "full");
  const [busy, setBusy] = useState(false);
  const shareUrl = typeof location !== "undefined" ? `${location.origin}/m/${curId}` : "";

  const publish = async () => {
    setBusy(true);
    // persist nameDisplay into the record (jsonb) and flip is_public on the row
    await store.set(curId, { ...record, nameDisplay });
    const sb = (await import("@/lib/supabase/client")).createClient();
    await sb.from("matches").update({ is_public: true, name_display: nameDisplay }).eq("id", curId);
    onApplied({ nameDisplay, isPublic: true });
    setBusy(false);
    setStep(3);
  };

  return (
    <div className="mt-takeover">
      {step === 1 && (
        <div>
          <h2>How should player names show?</h2>
          <p>For youth matches you can hide or shorten names on the public page.</p>
          {NAME_OPTS.map((o) => (
            <button key={o.v} className={`mt-big-btn${nameDisplay === o.v ? " sel" : ""}`} onClick={() => setNameDisplay(o.v)}>
              <strong>{o.label}</strong><span>{o.hint}</span>
            </button>
          ))}
          <div className="mt-wiz-nav">
            <button onClick={onClose}>Cancel</button>
            <button onClick={() => setStep(2)}>Next</button>
          </div>
        </div>
      )}
      {step === 2 && (
        <div>
          <h2>Make this match public?</h2>
          <p>Anyone with the link can view it (names shown as: {nameDisplay}).</p>
          <div className="mt-wiz-nav">
            <button onClick={() => setStep(1)}>Back</button>
            <button disabled={busy} onClick={publish}>{busy ? "Publishing…" : "Make public"}</button>
          </div>
        </div>
      )}
      {step === 3 && (
        <div>
          <h2>Share link ready</h2>
          <input readOnly value={shareUrl} onFocus={(e) => e.currentTarget.select()} />
          <button onClick={() => navigator.clipboard?.writeText(shareUrl)}>Copy link</button>
          <img src={`/m/${curId}/opengraph-image`} alt="Score card preview" style={{ maxWidth: "100%", marginTop: 12 }} />
          <div className="mt-wiz-nav"><button onClick={onClose}>Done</button></div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add minimal styles** — append `.mt-takeover`, `.mt-big-btn`, `.mt-wiz-nav` rules to `app/globals.css` if not already covered by the new-match wizard classes. Reuse existing wizard classes where present (grep `globals.css` for the new-match wizard class names and prefer those).

- [ ] **Step 3: Finalize MatchTracker wiring** (from E3 Step 4) — pass `onApplied={({nameDisplay, isPublic}) => { setNameDisplay(nameDisplay); }}` and `curId`/`record={ {...recordPayload(), savedAt: Date.now()} }`. Guard: the wizard requires a saved match (a real `curId` row). If the current match was never saved, the Share action should Save first (call the existing save path) before opening the wizard.

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 5: Manual check** (`npm run dev`):
  - Open a saved match → Share → pick "Initials" → Next → Make public → link + score-card preview shown.
  - Open the link in a private window (not signed in) → public page renders with **initials**, not full names.
  - Change to "No names", re-publish → public page shows `#10`/`Player`.

- [ ] **Step 6: Commit**

```bash
git add components/ShareWizard.tsx app/globals.css components/MatchTracker.tsx
git commit -m "feat: share wizard (name display -> make public -> share link)"
```

---

## Task Group H — Cutover

### Task H1: Supabase schema change

**Files:** none (external — Supabase SQL editor).

- [ ] **Step 1: Run the migration** in the Supabase SQL editor:

```sql
alter table matches add column if not exists name_display text not null default 'full';
-- hide_names was dormant; drop it now that name_display replaces it:
alter table matches drop column if exists hide_names;
```

- [ ] **Step 2: Verify** — confirm `name_display` exists and existing rows show `'full'`. (RLS `public_read` already keys on `is_public`; no policy change needed.)

- [ ] **Step 3: Document** — add a line to `CLAUDE.md` storage section (done in H3) noting the column swap.

### Task H2: Vercel project + production redirect URL

**Files:** none (external — Vercel dashboard).

- [ ] **Step 1: Create the Vercel project** — import the GitHub repo; framework auto-detected as Next.js.
- [ ] **Step 2: Set env vars** in Vercel: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (values from `.env.local`).
- [ ] **Step 3: Deploy** — trigger the first deploy; note the production URL.
- [ ] **Step 4: Add redirect URLs to Supabase** — add `https://<vercel-domain>/auth/callback` (and the production root) to the Supabase Auth redirect allowlist.
- [ ] **Step 5: Smoke the production deploy** — sign in, open a match, publish + open a share link in a private window, confirm the OG image loads at `/m/<id>/opengraph-image`.

### Task H3: Remove the old app + docs

**Files:**
- Delete: `index.html`, `tools/parser-harness.js`, `tools/run-tests.js`
- Modify: `CLAUDE.md`, `README.md`, `SETUP.md`

- [ ] **Step 1: Confirm parity is signed off** — Task E5 smoke + Task G1 Step 5 + Task H2 Step 5 all passed. Do not delete until then.

- [ ] **Step 2: Delete the legacy files**

```bash
git rm index.html tools/parser-harness.js tools/run-tests.js
```

(Keep `tools/make-icon.py`.)

- [ ] **Step 3: Update `CLAUDE.md`** — rewrite "Repository layout", "Commands", and "Architecture" to describe the Next.js structure: app/lib/components layout; `npm run dev/build/test`; Vitest replaces the parser harness; `parseMatch`/raw-edit/infographic now live in `lib/`; deploy is push-to-`main` → Vercel; the `matches` table now has `name_display text` (not `hide_names`); add the new public page + OG + share wizard sections. Bump `APP_VERSION` note. Preserve all parser decision docs (they still describe `lib/parser.ts`).

- [ ] **Step 4: Update `README.md` / `SETUP.md`** — replace GitHub Pages instructions with Vercel; replace "single index.html" with the Next.js project; update local-run to `npm run dev` (`http://localhost:3000`); update the Supabase redirect URLs to the `/auth/callback` form.

- [ ] **Step 5: Full verification**

Run: `npm test && npm run build`
Expected: all tests PASS; build succeeds.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: cut over to Next.js — remove index.html + legacy harness, update docs"
```

- [ ] **Step 7: Merge to main + deploy** — open a PR from `supabase-migration` (or the working branch) to `main`; on merge, Vercel deploys production. Confirm the live site once more.

---

## Notes for the implementer

- **`@ts-nocheck` on `MatchTracker.tsx` is intentional and temporary.** Full typing happens in the later decomposition phase (out of scope here). Do not spend time typing its internals; do keep all `lib/` modules strictly typed.
- **Parity is the bar for Phase 1** — when in doubt about behavior, diff against the live `index.html` (kept until Task H3).
- **The parser is the crown jewel.** Never edit `parseMatch` logic during the move; only add `export`/types/imports. The full ported suite (Task B8) + `node tools/run-tests.js` cross-check (run before H3) is the guard.
- **External one-time steps** (Supabase redirect URLs, schema ALTER, Vercel env vars) are called out in Tasks E5, H1, H2 — these need the repo owner.
