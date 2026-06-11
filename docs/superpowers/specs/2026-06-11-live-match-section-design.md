# Live section in the match list — design

**Date:** 2026-06-11
**Status:** Approved, ready for planning

## Goal

Add a **Live** section to the main screen match list (`components/Landing.tsx`),
rendered between the existing **Upcoming** and **Past** subheads, so a match that
is currently in progress surfaces on its own instead of being buried in Past.

The section applies to **both** lists that already split into Upcoming/Past:
"Your matches" and the global "Recent public matches" feed. The ordering of the
three groups is always **Upcoming → Live → Past**.

## What counts as "live"

Liveness is **derived**, not stored — no schema change and no manual toggle. A new
pure helper in `lib/match-list.ts`:

```ts
isLive(rec: MatchRecord, now: number, updatedAt?: string): boolean
```

A match is live when **all** of the following hold:

1. **Not a future fixture.** `isUpcoming(matchDate, now)` is `false`. A future
   calendar day is always Upcoming, never Live.
2. **Started.** The parsed timeline has at least one event — i.e. `parseMatch`
   produces a non-empty `scoring`, `notes`, or `halfMarks`. An empty match dated
   today is "scheduled", not live.
3. **Not finished.** No half-marker with `marker === "FT"` in `halfMarks`.
4. **Recent.** Kickoff *or* last edit is within a rolling window
   `LIVE_WINDOW_MS` (**3 hours**):
   - `match_date` is within 3h of `now` (`now - matchDateMs` ∈ `[0, 3h)`), **OR**
   - `updatedAt` is within 3h of `now`.

   The `match_date` anchor catches a normal in-progress game (including one running
   past midnight, since it works off the kickoff timestamp). The `updatedAt` anchor
   catches the case where the user is actively entering events but the stored
   kickoff time is off (e.g. the editor's default `12:00`). An old, half-entered
   match left without an FT marker is **excluded**, because *both* anchors are
   stale — this is the staleness mitigation.

A match drops out of Live the instant FT is recorded, or once 3h pass with no
edits and no recent kickoff.

### Precedence

Evaluated per row in this order, so the groups never overlap:

1. `isUpcoming` → **Upcoming**
2. else `isLive` → **Live**
3. else → **Past**

So "Past" becomes "not upcoming **and** not live".

## Implementation

### `lib/match-list.ts`

- Add `isLive(rec, now, updatedAt?)` as described. It reuses `isUpcoming` for the
  future-fixture guard and `parseMatch` (already imported) for the started /
  not-finished checks. Pure — no `Date.now`, no DOM; `now` and `updatedAt` are
  passed in.
- Add `LIVE_WINDOW_MS = 3 * 60 * 60 * 1000` (module-local const; not exported
  unless a test needs it).

### `lib/constants.ts`

- Bump `APP_VERSION` (v70 → v71).

### `components/MatchRow.tsx`

- Add a `live?: boolean` prop (default `false`).
- When `live`, render a red **🔴 LIVE** pill in the `.ml-meta` area (in place of
  the `📅` prefix used for `upcoming`), and add a `live` modifier class to the
  root `.ml-row`. `upcoming` and `live` are mutually exclusive by construction
  (precedence above), so no combined state to handle.

### `app/globals.css`

- Add `.ml-row.live` / `.ml-live` styles: a red pill with a subtle CSS pulse
  (keyframed opacity/box-shadow). Match the existing `.ml-row.upcoming` /
  `.ml-priv` visual idiom.

### `components/Landing.tsx`

- Alongside `ownUpcoming`/`ownPast` and `feedUpcoming`/`feedPast`, derive
  `ownLive`/`feedLive` via `isLive(r.data, now, r.updated_at)`.
- Redefine the Past split as "not upcoming **and** not live".
- Live rows sort most-recent-start-first (date desc, falling back to
  `updated_at`).
- Render a `Live` subhead + rows for each list, only when the group is non-empty,
  following the same conditional pattern as the existing `Upcoming` block. Pass
  `live` to `row()` / `MatchRow`.

## Out of scope

- **No Realtime on the landing list.** The list is a per-load snapshot today
  (`Landing` does a one-time fetch; only `PublicMatch` subscribes to Realtime). A
  match moves into/out of Live on the next load or navigation. Live auto-refresh
  of the landing list is a possible follow-up, not part of this change.

## Tests (`test/match-list.test.ts`)

Add `isLive` cases:

- started + unfinished + `match_date` within 3h → **true**
- FT marker present → **false**
- no events (empty `raw`) → **false**
- stale `match_date` + stale `updatedAt` → **false**
- future calendar day → **false**
- missing/blank `match_date` but `updatedAt` within 3h → **true**
- started + unfinished + stale `match_date` but recent `updatedAt` → **true**

Confirm the full suite still passes (`npm test`).
