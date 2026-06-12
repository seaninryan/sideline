# Neutral home/away display (sub-project ② of us/them → home/away)

**Date:** 2026-06-12
**Status:** Approved (brainstorm) — pending implementation plan
**Branch:** `neutral-home-away-ui` (off `main`, v77 — which has ①'s model seam).

## Context

Sub-project ① added an additive home/away view + neutral `outcome` to the model
(`homeName`/`awayName`/`homeColors`/`awayColors`/`homeTotals`/`awayTotals`/
`homeScorers`/`awayScorers`/`homeSquad`/`awaySquad`/`outcome`), plus pure
`sideToVenue`/`matchOutcome` in `lib/home-away.ts`. **②** flips the viewer-facing
display onto that view: consistent **home-left / away-right** ordering and a
**neutral result** ("Won by N / Leading by N / Level" — no Win/Loss), across the
public page, the editor's read components, and the share image.

`ScoreHeader` is the proven template: it already takes `homeName`/`awayName`/
`homeColors`/`awayColors` (ordered home-left/away-right) and renders a neutral
chip via `scoreHeaderResult({ homeTotal, awayTotal, phase })`. ② brings
`ScoreChart`, `Scorers`, `Timeline`, `PublicMatch`, the editor, and the share
image into line with it.

## Decisions (from brainstorm)

- **Result:** neutral chip "Won by N" (final) / "Leading by N" (live) / "Level"
  (tied) — no team name, no Win/Loss. Reuse the existing `scoreHeaderResult`
  pattern / `model.outcome`.
- **Ordering:** home-left / away-right on **all** surfaces (public, editor, share).
- **Scope:** PublicMatch, the editor (`MatchTracker`)'s read components, and the
  share image (poster + OG card). Landing/`MatchRow` is already neutral. The
  record (`myTeam`/`opponent`) is untouched — that's ③.

## Constraint: the component flip is atomic with its callers

`ScoreChart`/`Scorers`/`Timeline` are shared by `PublicMatch`, `MatchTracker`, and
`infographic`. Changing their props to home/away breaks every caller until all are
updated, so the prop flip + all three callers land in **one commit** (build-gated).

## 1. Pure home/away display mapping (`lib/home-away.ts`)

The shared components consume side-keyed data: the chart `series` (points
`{ x, us, them, usScore, themScore }`), `goalDots`/`chartMarkers` (each with
`side: "us"|"them"`), and `timeline` events (`side` + `usScore`/`themScore`). Add
pure, tested helpers that re-orient these to home/away using `usIsHome`:

```ts
// A series point re-keyed home/away.
export function venueSeries(
  series: { x: number; us: number; them: number; usScore: string; themScore: string }[],
  usIsHome: boolean,
): { x: number; home: number; away: number; homeScore: string; awayScore: string }[];

// Re-key a list of side-tagged items ("us"/"them" → "home"/"away"); preserves all
// other fields. Used for goalDots, chartMarkers, and timeline events. Each item
// also gains homeScore/awayScore when it carries usScore/themScore.
export function venueItems<T extends { side?: "us" | "them" | null; usScore?: string; themScore?: string }>(
  items: T[],
  usIsHome: boolean,
): (T & { side: "home" | "away" | null; homeScore?: string; awayScore?: string })[];
```

(`usIsHome` = `homeAway === "home"`; `venueItems` uses `sideToVenue`. Exact source
field names — `us`/`them` vs `aScore`/`bScore` etc. — pinned from the real data
shapes in the plan; the test fixtures lock them.)

The model exposes the mapped data so consumers don't each re-map. Extend
`buildModel` (additive) with: `homeSeries` (= `venueSeries(series, usIsHome)`),
`goalDotsHA`, `chartMarkersHA`, `timelineHA` (= `venueItems(...)`). Existing
`series`/`goalDots`/`chartMarkers`/`timeline` stay (additive; the record/editor
internals and ③ may still read them).

Tested in `test/home-away.test.ts` (extend): `venueSeries`/`venueItems` for
`usIsHome` true/false, side mapping, score reorder, field preservation, null side.

## 2. Shared components → home/away props

Mirror `ScoreHeader`. Each keeps its rendering; only prop names + the side it reads
change to home/away:

- **`ScoreChart`**: props `series` (home/away points), `goalDots`/`chartMarkers`
  (home/away side), `colorHome`/`colorAway`, `nameHome`/`nameAway`. Plot
  `p.home`/`p.away` lines; end-labels `homeScore`/`awayScore`; goal markers keyed
  by `side === "home"`.
- **`Scorers`**: props `home`/`away` (scorer arrays) + `colorHome`/`colorHome2`/
  `colorAway`/`colorAway2`.
- **`Timeline`**: props `colorHome`/`colorHome2`/`colorAway`/`colorAway2`,
  `nameHome`/`nameAway`; event dot/ring keyed by `it.side === "home"`; score shown
  `homeScore – awayScore` with the changed-side highlight on home/away.

## 3. Callers pass home/away (atomic with §2)

- **`PublicMatch`**: replace the WIN/DEFEAT pill (`resTxt`/`resBg`/`resFg`,
  `m.result`) with the neutral chip from `m.outcome` ("Won by N" / "Leading by N"
  if the match is in play / "Level"). Pass `m.homeSeries`/`goalDotsHA`/
  `chartMarkersHA`/`timelineHA`, `m.homeScorers`/`awayScorers`,
  `m.homeColors`/`awayColors`, `m.homeName`/`awayName` to the components. Order the
  two **lineup pitches** home-then-away (currently us-then-them, lines ~212/254).
  `maxLeadSide` ("us"/"them") → display via `sideToVenue`.
- **`MatchTracker`** (editor read views): pass the same home/away model data to
  `ScoreChart`/`Scorers`/`Timeline`; order home-then-away; any Win/Loss/result
  text in the editor → neutral `outcome`. (Editor *state* `colorUs`/`usRoster`
  stays — ③; only the display passes home/away.)
- **`infographic.ts`**: the poster already uses a neutral "Won by N / Tie" chip and
  jersey order — switch its sides + chart/scorers/lineup/timeline to home/away
  (`maxLeadSide` via `sideToVenue`). The **OG score card** (`buildScoreCardSVG`):
  replace the `result` (Win/Loss) string with the neutral outcome and order
  home-left/away-right.

## 4. Result chip source

Reuse the existing neutral helper. `ScoreHeader` calls
`scoreHeaderResult({ homeTotal, awayTotal, phase })`; ②'s other surfaces derive the
same text from `model.outcome` (`outcome.winner` → which side leads,
`outcome.margin` → N; `winner === null` → "Level"), with "Leading by N" when the
match is in play and "Won by N" when finished (phase from `halfMarks`, as
`PublicMatch`/`ScoreHeader` already compute). No new result concept — just stop
using the us-perspective `result` string on viewer surfaces.

## Testing

- `test/home-away.test.ts` — extend for `venueSeries`/`venueItems`.
- `test/model.test.ts` — assert the new `homeSeries`/`goalDotsHA`/`chartMarkersHA`/
  `timelineHA` exist and are correctly oriented for `SAMPLE_RECORD` (homeAway
  "away" → home = Wildebeests; a goal dot tagged `"us"` maps to `side:"away"`).
- `test/score-card.test.ts` (exists) — update for the OG card's neutral result +
  home/away order.
- Component/caller changes (`PublicMatch`/`MatchTracker`/`infographic`/the three
  components) are verified by `npm run build` + manual: public page, editor, and
  share image all read home-left/away-right with a neutral "Won by N/Level" result,
  no "WIN/DEFEAT".

## Scope / YAGNI

- No record/schema change (`myTeam`/`opponent` stay → ③).
- `MatchRow`/landing untouched (already neutral).
- Keep the existing us/them model fields (some still read by the editor internals
  and ③); ② only *adds* the home/away display data and switches consumers.
- No new result semantics beyond the existing neutral chip.

## Files touched

**Changed:** `lib/home-away.ts` (+`venueSeries`/`venueItems`), `lib/model.ts`
(+`homeSeries`/`goalDotsHA`/`chartMarkersHA`/`timelineHA`), `components/ScoreChart.tsx`,
`components/Scorers.tsx`, `components/Timeline.tsx` (home/away props),
`components/PublicMatch.tsx`, `components/MatchTracker.tsx`, `lib/infographic.ts`
(home/away + neutral result), `lib/constants.ts` (bump `APP_VERSION`).
**Tests:** `test/home-away.test.ts`, `test/model.test.ts`, `test/score-card.test.ts`.
