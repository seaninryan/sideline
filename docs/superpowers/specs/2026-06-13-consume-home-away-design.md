# Consume home/away across the data + display layer (③.2)

**Date:** 2026-06-13
**Status:** Approved (brainstorm) — pending implementation plan
**Branch:** `consume-home-away` (③.2a) off `record-home-away` (③.1, PR #19). ③.2b branches off ③.2a.

## Context

The us/them → home/away conversion: ① added a neutral home/away **view** to the
model; ② flipped *some* viewer-facing display onto it; ③.1 added home/away
**record fields** (`recordHomeAway`, populated on save + backfill). **③.2** makes
every *reader* consume a complete home/away view and removes the remaining inline
`usIsHome ? us : them` derivations and direct us/them field reads across the data
and display layer.

Investigation found ② left substantial us/them residue in the "flipped" consumers:
- `PublicMatch` still does `usIsHome ? m.usName : m.themName` inline (≈ lines
  161–174, 207–208), reads `m.colorUs`/`m.colorThem` for jerseys (≈ 218–272), and
  builds its filename/title from `m.usName`/`m.themName` + `m.totals.us` (≈ 113–114).
- `infographic.ts` falls back to `m.colorUs`/`m.colorThem` (≈ 40–43, 111–114) and
  labels its two lineup pitches `"us"`/`"them"` (≈ 317–325).
- `matchRowView` (`lib/match-list.ts`) derives home/away entirely inline from
  us/them.
- The editor (`MatchTracker.tsx`) re-derives home/away inline in its render path
  (≈ 644–650, 897–902, 1177, 1198, block pills 672–673) separately from `buildModel`.

After ③.2 the only us/them that remains is: the **record** itself, the
**`recordHomeAway` seam**, the **parser adapter** (`lib/parser.ts`, A/B→us/them),
and the editor's **edit controls/state** — all deferred to ③.3 (symmetric editor)
and ③.4 (delete us/them).

## The seam (no parser change in ③.2)

`buildModel` keeps feeding the parser `myTeam`/`usRoster`/`opponent`/`oppRoster`
(us/them) and receives us/them-keyed **dynamic** data (series/scorers/totals/
timeline). It already re-orients those to home/away via `venueSeries`/`venueItems`
using `usIsHome = r.homeAway === "home"`. What ③.2 changes:

- **Identity** (names, colours, rosters, squads) is sourced from
  **`recordHomeAway(r)`**, called at the **top of `buildModel`** so it is correct
  even on **unsaved in-memory payloads** (the editor calls `buildModel(recordPayload())`
  on a record that has only us/them fields — `store.set` adds the home/away fields,
  so readers must derive, not assume).
- The us/them reads that *remain* inside `buildModel`/`matchRowView` exist **only to
  feed the still-us/them parser**; they are removed in ③.4 when the parser flips.
- `usIsHome` stays as `buildModel`'s **internal** orientation for mapping the
  parser's dynamic data; it is not exposed as a consumer-facing concept.

## Decomposition: two PRs

- **③.2a** — Sections 1–4 + 6 (model + list rows + public page + infographic + the
  lineup-badges helper): the **read-only** surfaces. Independently shippable.
- **③.2b** — Section 5 (editor **display** only): the `@ts-nocheck` `MatchTracker`
  render path. Branches off ③.2a.

Each PR keeps the suite green and is visually parity-checked.

---

## Section 1 — `lib/model.ts`: emit a complete home/away view

At the top of `buildModel`, compute `const ha = recordHomeAway(r)`. Keep
`usIsHome = r.homeAway === "home"` as the internal mapping orientation.

**Add** the home/away outputs needed so consumers never touch us/them:
- `homeRoster` / `awayRoster` — `ha.homeRoster` / `ha.awayRoster` (each `|| null`).
- `homeFormation` / `awayFormation` — the `formation` of the respective roster (the
  parser's `formationRows` is the us-side formation; the away/opponent formation
  comes from `oppRoster.formation`; map by venue).
- `maxLeadVenue` — `sideToVenue(parsed.maxLeadSide, r.homeAway)` (`"home"|"away"|null`).
- `homeTotals` / `awayTotals` — already emitted (keep).

**Re-source** identity from `ha`:
- `homeName` = `ha.homeTeam`, `awayName` = `ha.awayTeam`.
- `homeColors` = `[ha.colorHome || <default home1>, ha.colorHome2 || <default home2>]`,
  `awayColors` similarly. (Defaults mirror today's: home gets the us-side defaults
  when us is home, etc. — but since `ha` already maps by venue, the defaults are
  the existing `#f5c518/#1f7a4d` and `#c0392b/#2c5fa8` applied by venue.)
- `homeSquad` = `ha.homeSquad`, `awaySquad` = `ha.awaySquad`.

**Drop** the us/them output keys once Sections 2–5 no longer read them:
`usName`, `themName`, `colorUs`, `colorUs2`, `colorThem`, `colorThem2`,
`usScorers`, `themScorers`, `usSquad`, `oppSquad`, and the `totals` passthrough
(consumers use `homeTotals`/`awayTotals`). Keep `parsed` (internal),
`goalDots`/`chartMarkers` (already side-tagged + `homeSeries`/`timelineHA` carry
the venue-mapped copies), `oppRoster` only if still needed by a consumer — prefer
`homeRoster`/`awayRoster`.

> NOTE: dropping a model key and flipping its consumer must land in the **same PR**
> (build-gated). `usName`/`colorUs`/`totals.us` are read by `PublicMatch` and
> `infographic` (③.2a) — drop them with Sections 2–4. The editor (③.2b) reads its
> **own** state, not the model us/them keys (it only passes `recordPayload()` to
> `buildModel` for the share image), so no model key is held alive by ③.2b.

## Section 2 — `lib/match-list.ts` (`matchRowView`)

Replace the inline us/them block with `recordHomeAway`-sourced identity:
- `const ha = recordHomeAway(rec)`; `homeName = ha.homeTeam`, `awayName = ha.awayTeam`,
  `homeColors`/`awayColors` from `ha.colorHome*`/`ha.colorAway*` (with the existing
  defaults), `homeSquad`/`awaySquad` from `ha`.
- Totals: keep parsing for `totals.us`/`totals.them` (dynamic), map to
  `homeStr`/`awayStr` by `usIsHome`; **or** compute `homePts`/`awayPts` and use
  `matchOutcome(homePts, awayPts)` for `winner` (`"home"|"away"|"draw"`), dropping
  the `winnerSide`/`usIsHome` ladder. Result must be identical to today for the
  existing `match-list.test` fixtures.
- `matchProgress` (the started/finished probe) keeps parsing us/them — it reads no
  identity, only event presence; leave it.

## Section 3 — `components/PublicMatch.tsx`

Remove every `usIsHome ? …` and direct `m.us*`/`m.colorUs*`/`m.totals.us`:
- Names: use `m.homeName`/`m.awayName` directly (delete lines ~161–162, 207–208).
- Colours / jerseys: use `m.homeColors`/`m.awayColors` (delete `m.colorUs`/`m.colorThem`
  jersey reads ~218–272 — the home pitch uses `homeColors`, the away pitch
  `awayColors`).
- Squads: `m.homeSquad`/`m.awaySquad` (delete ~173–174).
- Lineup pitches: order home-then-away; render from `m.homeRoster`/`m.awayRoster`
  + `m.homeFormation`/`m.awayFormation`; badges via the venue-aware
  `lineupBadges` (Section 6).
- maxLead stat: `m.maxLeadVenue` → `homeShort`/`awayShort` (delete the inline
  `sideToVenue(m.maxLeadSide, m.homeAway)` at ~187).
- Filename/title: `m.homeName`/`m.awayName` + `m.homeTotals.str`/`m.awayTotals.str`
  (replace ~113–114).
- Remove the now-unused local `usIsHome`/`sideToVenue` import if nothing else uses them.

## Section 4 — `lib/infographic.ts`

- Score header + OG card: `m.homeName`/`m.awayName`, `m.homeColors`/`m.awayColors`
  with the existing literal defaults (drop the `?? m.colorUs` fallbacks at ~40–43,
  111–114).
- Lineup pitches: render **home** and **away** pitches from `m.homeRoster`/
  `m.awayRoster` + `m.homeFormation`/`m.awayFormation` + home/away colours; the
  `renderTeamPitch(..., "us"|"them", ...)` side argument becomes `"home"|"away"`,
  and the per-player badges come from the venue-aware `lineupBadges` (Section 6).
  Bench/subs lists map by venue.
- maxLead: `m.maxLeadVenue` (drop the inline `sideToVenue` at ~145–146).

## Section 5 — `components/MatchTracker.tsx` (editor **display** only) — ③.2b

The editor keeps its us/them **edit state** (`colorUs`/`colorThem`/`myTeam`/
`opponent`/`usRoster`/`oppRoster` useState; the team-name inputs; the colour
pickers keyed `us`/`us2`/`them`/`them2`; game-mode `pickGmTeam("us"/"them")`;
`recordPayload()` writing `myTeam`/`colorUs`). Only the **render path** flips:

- Build **one** home/away view from current edit state — `const ha =
  recordHomeAway(recordPayload())` (memoised on the same deps as `recordPayload`).
  Use `ha.homeTeam`/`ha.awayTeam`/`ha.colorHome*`/`ha.colorAway*`/`ha.homeSquad`/
  `ha.awaySquad`/`ha.homeRoster`/`ha.awayRoster` to feed display.
- Replace the inline `usIsHome ? colorUs : colorThem` / `usIsHome ? usName : themName`
  computations in the render path (≈ 644–650, 897–902, 1177, 1198) with `ha`.
- ScoreHeader / ScoreChart (`homeSeries`) / Scorers / Timeline / lineup pitches /
  stat-grid biggest-lead / notation block pills (672–673) all read home/away.
- The share-image path (`buildModel(recordPayload())`) already yields home/away.
- **Out of scope (→ ③.3):** the edit controls themselves and game-mode entry
  buttons. Their *labels* may already follow the Home/Away toggle (done on
  `sport-cleanup`); their *actions* still target the us/them side.

## Section 6 — `lib/lineup-badges.ts`

`lineupBadges(model, side, num)` is currently keyed `side: "us"|"them"` and reads
`model.timeline` + `model.usScorers`/`model.themScorers`. Three callers:
`PublicMatch` + `infographic` (which pass **`buildModel`'s** model) and
`MatchTracker` (which passes its **own** mini-model `mdl = { timeline, usScorers,
themScorers }`, line ~747 — independent of `buildModel`).

Because the editor caller stays us/them until ③.2b, the helper is flipped in **two
steps**:
- **③.2a (transitional, dual-keyed):** accept `side: "home"|"away"` reading
  `model.timelineHA` + `model.homeScorers`/`model.awayScorers`, **and** keep the
  existing `"us"|"them"` branch reading `model.timeline` + `usScorers`/`themScorers`.
  Switch `PublicMatch` + `infographic` to `"home"|"away"`. The editor keeps
  `"us"|"them"` (it still has `usScorers` in its own `mdl`, so dropping the model's
  us/them output keys in Section 1 does **not** affect it).
- **③.2b (collapse to one keying):** migrate the editor's `mdl` to
  `timelineHA`/`homeScorers`/`awayScorers`, switch its call to `"home"|"away"`, and
  **remove** the `"us"|"them"` branch from `lineupBadges`. End state: single
  home/away keying.

## Testing

- `test/home-away.test.ts` — no new helper, but if `recordHomeAway` gains nothing
  new, leave as is.
- `test/model.test.ts` — assert the **complete** home/away outputs exist
  (`homeRoster`/`awayRoster`/`homeFormation`/`awayFormation`/`maxLeadVenue`,
  correctly oriented for `SAMPLE_RECORD` which is `homeAway:"away"`), and assert the
  **dropped** us/them keys are `undefined` (`m.usName === undefined`, etc.) so a
  regression that re-adds them is caught.
- `test/match-list.test.ts` — `matchRowView` output for the existing fixtures is
  **unchanged** (home/away names, colours, winner, squads) after the refactor.
- `test/score-card.test.ts` — OG card still renders home-left/away-right with
  neutral result and no `colorUs` fallback.
- `lineup-badges` test (if one exists) — extend for `"home"|"away"`.
- Build-gated: `npx tsc --noEmit` clean; `npm test` green. Manual visual parity:
  public page, editor, poster, OG card all read home-left/away-right with no
  regression vs. the current screens.

## Scope / YAGNI

- **No parser change** (`parser.ts` stays A/B→us/them → ③.4).
- **No record/schema change** (③.1 already added the fields; ③.4 deletes us/them).
- **Editor edit controls unchanged** (→ ③.3).
- `homeAway` stays (drives `recordHomeAway` + the dynamic-data orientation; → ③.4).
- Do not introduce a parallel "neutral result" concept — reuse `model.outcome` /
  the existing `scoreHeaderResult`.

## Files touched

**③.2a:** `lib/model.ts`, `lib/match-list.ts`, `lib/infographic.ts`,
`components/PublicMatch.tsx`, `lib/lineup-badges.ts`, `lib/constants.ts`
(`APP_VERSION`), tests: `test/model.test.ts`, `test/match-list.test.ts`,
`test/score-card.test.ts` (+ lineup-badges test if present).

**③.2b:** `components/MatchTracker.tsx`, `lib/constants.ts` (`APP_VERSION`),
plus any small follow-up to `lineup-badges` callers. Manual visual verification of
the editor.
