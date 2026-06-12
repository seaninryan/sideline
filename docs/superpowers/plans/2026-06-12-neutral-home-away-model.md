# Neutral home/away model seam (①) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an additive home/away view + neutral outcome to the match model, derived from the existing us/them fields + `homeAway`, with zero consumer/visual changes — the foundation that later lets the UI present matches neutrally.

**Architecture:** A new pure module `lib/home-away.ts` provides `sideToVenue` (map a us/them side to home/away) and `matchOutcome` (neutral winner+margin from two point totals). `buildModel` adds `homeName`/`awayName`/`homeColors`/`awayColors`/`homeTotals`/`awayTotals`/`homeScorers`/`awayScorers`/`homeSquad`/`awaySquad`/`outcome` to its returned object by selecting the existing us/them values via `usIsHome`. `Model` is `Record<string, any>`, so no type change is needed.

**Tech Stack:** TypeScript, Vitest. Node 20 (`nvm use 20` before npm/npx; default shell node is v14).

**Source spec:** `docs/superpowers/specs/2026-06-12-neutral-home-away-model-design.md`
**Branch:** `neutral-home-away` (already checked out; off `main`, v76).

Baseline before this plan: **309 tests passing**. `APP_VERSION`: `v76`. `Model` is `export type Model = Record<string, any>` (`lib/types.ts:85`) — additive object fields need no interface edit.

---

## Task 1: Pure module `lib/home-away.ts`

**Files:**
- Create: `lib/home-away.ts`
- Test: `test/home-away.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/home-away.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { sideToVenue, matchOutcome } from "@/lib/home-away";

describe("sideToVenue", () => {
  it("us is home when homeAway is home", () => {
    expect(sideToVenue("us", "home")).toBe("home");
    expect(sideToVenue("them", "home")).toBe("away");
  });
  it("us is away when homeAway is away", () => {
    expect(sideToVenue("us", "away")).toBe("away");
    expect(sideToVenue("them", "away")).toBe("home");
  });
  it("null/unknown side → null", () => {
    expect(sideToVenue(null, "home")).toBeNull();
    expect(sideToVenue(undefined, "home")).toBeNull();
    expect(sideToVenue("xx" as any, "home")).toBeNull();
  });
});

describe("matchOutcome", () => {
  it("home higher → winner home with margin", () => {
    expect(matchOutcome(13, 12)).toEqual({ winner: "home", margin: 1 });
  });
  it("away higher → winner away with margin", () => {
    expect(matchOutcome(10, 15)).toEqual({ winner: "away", margin: 5 });
  });
  it("level → no winner, zero margin", () => {
    expect(matchOutcome(11, 11)).toEqual({ winner: null, margin: 0 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use 20; npx vitest run test/home-away.test.ts`
Expected: FAIL — cannot resolve `@/lib/home-away`.

- [ ] **Step 3: Implement `lib/home-away.ts`**

```ts
// "us" is the home side iff the match's homeAway is "home".
export function sideToVenue(
  side: "us" | "them" | null | undefined,
  homeAway: "home" | "away" | string | undefined,
): "home" | "away" | null {
  if (side !== "us" && side !== "them") return null;
  const usIsHome = homeAway === "home";
  return side === "us" ? (usIsHome ? "home" : "away") : (usIsHome ? "away" : "home");
}

// Neutral result from the two sides' point totals. winner = the higher total
// (null when level); margin = absolute difference. No "Win/Loss".
export function matchOutcome(
  homePts: number,
  awayPts: number,
): { winner: "home" | "away" | null; margin: number } {
  if (homePts === awayPts) return { winner: null, margin: 0 };
  return homePts > awayPts
    ? { winner: "home", margin: homePts - awayPts }
    : { winner: "away", margin: awayPts - homePts };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/home-away.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/home-away.ts test/home-away.test.ts
git commit -m "feat(home-away): sideToVenue + matchOutcome pure helpers"
```

---

## Task 2: `buildModel` adds the home/away view + outcome

**Files:**
- Modify: `lib/model.ts`
- Test: `test/model.test.ts`

`buildModel` currently computes `usName`, `themName`, `totals` (`{us,them}`), `usScorers`, `themScorers`, and returns an object that also includes `colorUs`/`colorUs2`/`colorThem`/`colorThem2` and `usSquad`/`oppSquad`. `gpTotal` is already imported from `@/lib/util`. `header.homeAway` holds the match's home/away.

- [ ] **Step 1: Add the home/away test assertions first**

In `test/model.test.ts`, inside the existing `SAMPLE_RECORD` model test (where `m = buildModel(SAMPLE_RECORD)` and `m.usName`/`m.result` are asserted), add (SAMPLE is `homeAway:"away"`, Racoons 2-6 us / Wildebeests 2-7 them):

```ts
    // neutral home/away view (additive) — SAMPLE is homeAway:"away", so Racoons are away
    expect(m.homeName).toBe("Wildebeests");
    expect(m.awayName).toBe("Racoons");
    expect(m.homeTotals.str).toBe("2-7");
    expect(m.awayTotals.str).toBe("2-6");
    expect(m.homeColors).toEqual([m.colorThem, m.colorThem2]);
    expect(m.awayColors).toEqual([m.colorUs, m.colorUs2]);
    expect(m.outcome).toEqual({ winner: "home", margin: 1 }); // home 2-7 (13) vs away 2-6 (12)
```
(Add these alongside the existing assertions in that test — keep the existing `result`/`usName`/`totals` assertions; they must still pass.)

- [ ] **Step 2: Run to verify it fails**

Run: `nvm use 20; npx vitest run test/model.test.ts`
Expected: FAIL — `m.homeName` etc. are `undefined`.

- [ ] **Step 3: Implement in `lib/model.ts`**

Add the import at the top:
```ts
import { sideToVenue, matchOutcome } from "@/lib/home-away";
```
(`sideToVenue` is exported for sub-project ② to use at per-event call sites; it's fine to import both here — but if the linter flags `sideToVenue` as unused, import only `matchOutcome`. Prefer importing only what this file uses: `import { matchOutcome } from "@/lib/home-away";`.)

Just before the `return { … }` (after `usScorers`/`themScorers` and the `colorUs`/squad values are known), compute the home/away view. Note the returned object reads `r.colorUs || "#f5c518"` etc. and `r.usSquad || ""` — capture those same resolved values so home/away matches what's returned:

```ts
  const usIsHome = header.homeAway === "home";
  const cUs = r.colorUs || "#f5c518", cUs2 = r.colorUs2 || "#1f7a4d";
  const cThem = r.colorThem || "#c0392b", cThem2 = r.colorThem2 || "#2c5fa8";
  const sqUs = r.usSquad || "", sqOpp = r.oppSquad || "";
  const homeTotals = usIsHome ? totals.us : totals.them;
  const awayTotals = usIsHome ? totals.them : totals.us;
  const outcome = matchOutcome(
    gpTotal(homeTotals.g, homeTotals.p, effMode),
    gpTotal(awayTotals.g, awayTotals.p, effMode),
  );
```

Then in the returned object literal, change the existing `colorUs`/`usSquad` lines to use the captured consts and add the home/away fields. Replace:
```ts
    colorUs: r.colorUs || "#f5c518", colorUs2: r.colorUs2 || "#1f7a4d",
    colorThem: r.colorThem || "#c0392b", colorThem2: r.colorThem2 || "#2c5fa8",
    nameDisplay: r.nameDisplay || "full",
    oppRoster: r.oppRoster || null,
    usSquad: r.usSquad || "", oppSquad: r.oppSquad || "",
    parsed,
```
with:
```ts
    colorUs: cUs, colorUs2: cUs2, colorThem: cThem, colorThem2: cThem2,
    nameDisplay: r.nameDisplay || "full",
    oppRoster: r.oppRoster || null,
    usSquad: sqUs, oppSquad: sqOpp,
    // neutral home/away view (additive — sub-project ①)
    homeName: usIsHome ? usName : themName,
    awayName: usIsHome ? themName : usName,
    homeColors: usIsHome ? [cUs, cUs2] : [cThem, cThem2],
    awayColors: usIsHome ? [cThem, cThem2] : [cUs, cUs2],
    homeTotals, awayTotals,
    homeScorers: usIsHome ? usScorers : themScorers,
    awayScorers: usIsHome ? themScorers : usScorers,
    homeSquad: usIsHome ? sqUs : sqOpp,
    awaySquad: usIsHome ? sqOpp : sqUs,
    outcome,
    parsed,
```
(Everything else in the returned object stays. All existing us/them fields remain.)

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run test/model.test.ts`
Expected: PASS (new home/away + outcome assertions, and all existing ones).

- [ ] **Step 5: Full suite + commit**

Run: `npm test 2>&1 | grep -E "Tests "` → all passing (309 baseline + the Task-1 cases).
```bash
git add lib/model.ts test/model.test.ts
git commit -m "feat(home-away): buildModel exposes home/away view + neutral outcome"
```

---

## Task 3: Version bump + final verification

**Files:**
- Modify: `lib/constants.ts`

- [ ] **Step 1: Bump `APP_VERSION`**

In `lib/constants.ts`, change `APP_VERSION` from `"v76"` to `"v77"`.

- [ ] **Step 2: Full verification**

Run: `nvm use 20; npm test 2>&1 | grep -E "Test Files|Tests "` → all passing.
Run: `npm run build 2>&1 | tail -6` → success.

- [ ] **Step 3: Commit**

```bash
git add lib/constants.ts
git commit -m "chore: bump APP_VERSION to v77 (neutral home/away model seam)"
```

> **Tell the user:** look for **v77**. No visible change yet — this is the additive model foundation; sub-project ② flips the UI onto it. No DB migration.

---

## Self-Review notes (addressed)

- **Spec coverage:** §1 `home-away.ts` (`sideToVenue` + `matchOutcome`) → Task 1; §2 Model additions → handled by adding object fields in Task 2 (Model is `Record<string,any>`, no interface edit needed — noted); §3 `buildModel` wiring → Task 2; testing (`home-away.test`, `model.test` SAMPLE assertions incl. `outcome {winner:"home",margin:1}`) → Tasks 1–2. All mapped.
- **Type consistency:** `sideToVenue(side, homeAway)` and `matchOutcome(homePts, awayPts): {winner, margin}` identical in Task 1 (def/test) and Task 2 (call). `homeColors`/`awayColors` are `[primary, secondary]` arrays matching the test's `[m.colorThem, m.colorThem2]`. `homeTotals.str` is the `TeamTotals.str` field (from the existing `totals.us`/`them`).
- **Placeholder scan:** no TBD/TODO; concrete code throughout. The `sideToVenue` unused-import caveat is resolved by importing only `matchOutcome` in `model.ts`.
- **Additive guarantee:** every existing returned field is preserved; only new fields added + the colour/squad lines refactored to reuse captured consts (same values).
