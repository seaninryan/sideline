# Neutral home/away model seam (sub-project ① of the us/them → home/away conversion)

**Date:** 2026-06-12
**Status:** Approved (brainstorm) — pending implementation plan
**Branch:** `neutral-home-away` (off `main`, v76).

## Context

The app presents matches from an **us/them** (your-team) perspective: `model.ts`
exposes `usName`/`themName`, `colorUs`/`colorThem`, `totals.us`/`them`,
`usScorers`/`themScorers`, and a `result` of `Win`/`Loss`/`Draw` computed from
"us". Sean wants matches presented **neutrally as home vs away** (no built-in
your-team bias, no Win/Loss framing). The full conversion touches ~25 files; this
spec is **sub-project ①**, the foundation: a neutral home/away **view at the model
layer**, purely additive. Sub-project ② will flip the viewer-facing surfaces onto
it; ③ (optional) renames internal `us*`/`them*`.

**Key fact:** the record keeps `myTeam`/`opponent` + a `homeAway` flag, so
home/away is derivable with **no data migration**. The parser's sides are already
venue-neutral (A/B); us/them is only an adapter/model/display concern.

## Goal

Add a home/away view + neutral outcome to the model, derived from the existing
us/them fields + `homeAway`, leaving all existing fields intact (no consumer
changes, no behaviour change yet).

## Decisions (from brainstorm)

- **Additive only** — keep every existing `us*`/`them*`/`result` field; add
  `home*`/`away*` + `outcome`. ② migrates consumers; ③ may later remove us/them.
- **Neutral outcome** = `{ winner: "home" | "away" | null; margin: number }`
  (`null` winner = level; `margin` = absolute point difference). No "Win/Loss".
- A reusable `sideToVenue` primitive so ② can map per-event sides
  (scoring/goalDots/timeline/`maxLeadSide`) to home/away.

## 1. Pure module — `lib/home-away.ts` (unit-tested)

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

// Neutral result from the two sides' point totals (gpTotal-style integers).
// winner = the higher total; null when level. margin = absolute difference.
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

Tested in `test/home-away.test.ts`:
- `sideToVenue`: `us`+home→`home`; `us`+away→`away`; `them`+home→`away`;
  `them`+away→`home`; `null`/unknown→`null`.
- `matchOutcome`: home higher→`{winner:"home",margin}`; away higher→`{winner:"away"}`;
  equal→`{winner:null,margin:0}`.

## 2. `Model` type additions (`lib/types.ts`)

Add to `interface Model` (all existing fields unchanged):

```ts
  homeName: string;
  awayName: string;
  homeColors: [string, string];   // [primary, secondary]
  awayColors: [string, string];
  homeTotals: TeamTotals;         // same shape as totals.us
  awayTotals: TeamTotals;
  homeScorers: typeof /* usScorers */ any[];   // same element shape as usScorers
  awayScorers: any[];
  homeSquad: string;
  awaySquad: string;
  outcome: { winner: "home" | "away" | null; margin: number };
```

(Use the existing scorer/`TeamTotals` types as they appear on `usScorers`/`totals`
in the current `Model` definition — match them exactly rather than introducing new
shapes. The implementation plan will pin the precise types from `types.ts`.)

## 3. `buildModel` wiring (`lib/model.ts`)

After the existing `usScorers`/`themScorers`/`totals` are computed, derive the
home/away view and outcome and include them in the returned object:

```ts
import { sideToVenue, matchOutcome } from "@/lib/home-away";
// …
const usIsHome = header.homeAway === "home";
const homeTotals = usIsHome ? totals.us : totals.them;
const awayTotals = usIsHome ? totals.them : totals.us;
const outcome = matchOutcome(
  gpTotal(homeTotals.g, homeTotals.p, effMode),
  gpTotal(awayTotals.g, awayTotals.p, effMode),
);
// in the returned object, additionally:
//   homeName: usIsHome ? usName : themName,
//   awayName: usIsHome ? themName : usName,
//   homeColors: usIsHome ? [colorUs, colorUs2] : [colorThem, colorThem2],
//   awayColors: usIsHome ? [colorThem, colorThem2] : [colorUs, colorUs2],
//   homeTotals, awayTotals,
//   homeScorers: usIsHome ? usScorers : themScorers,
//   awayScorers: usIsHome ? themScorers : usScorers,
//   homeSquad: usIsHome ? usSquad : oppSquad,
//   awaySquad: usIsHome ? oppSquad : usSquad,
//   outcome,
```
(`colorUs`/`colorUs2`/`colorThem`/`colorThem2` and `usSquad`/`oppSquad` are the same
values already placed on the returned Model — reuse them, don't re-read the record.
`sideToVenue` isn't needed inside `buildModel` itself; it's exported for ② to map
per-event sides.)

## Testing

- `test/home-away.test.ts` — `sideToVenue` + `matchOutcome` as above.
- `test/model.test.ts` — extend the `SAMPLE_RECORD` assertions. `SAMPLE` is
  `homeAway: "away"` (Racoons are the away side), final Racoons 2-6 / Wildebeests
  2-7. So assert:
  - `m.homeName === "Wildebeests"`, `m.awayName === "Racoons"`
  - `m.homeTotals.str === "2-7"`, `m.awayTotals.str === "2-6"`
  - `m.homeColors` equals `[m.colorThem, m.colorThem2]`; `m.awayColors` equals `[m.colorUs, m.colorUs2]`
  - `m.outcome` deep-equals `{ winner: "home", margin: 1 }` (home 2-7 = 13 pts vs away 2-6 = 12 pts)
  - existing `result`/`usName`/`themName`/`totals` assertions remain unchanged (additive).

## Scope / YAGNI

- **No visual/consumer changes** — this PR only adds model fields + the pure
  module. `PublicMatch`, `MatchRow`, the share image, etc. are untouched (that's ②).
- **No** mapping of per-event sides inside the model yet — `sideToVenue` is
  provided for ② to use at the call sites that need it.
- `result` (Win/Loss/Draw) stays; ② decides where to replace it with `outcome`.
- No record/schema change; no data migration.

## Files touched

**New:** `lib/home-away.ts`, `test/home-away.test.ts`.
**Changed:** `lib/types.ts` (Model additions), `lib/model.ts` (derive + return
home/away + outcome), `test/model.test.ts` (assertions), `lib/constants.ts`
(bump `APP_VERSION`).
