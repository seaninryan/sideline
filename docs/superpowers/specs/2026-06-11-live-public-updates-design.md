# Live public-page updates (Supabase Realtime)

**Date:** 2026-06-11
**Status:** Design approved, ready for implementation plan

## Goal

When the owner edits a match, anyone currently viewing that match's public share
link (`/m/<short_code>`) should see the page update **live**, without reloading —
score, chart, timeline, scorers, lineup, and name-privacy all reflecting the
current state within a few seconds of the owner's change.

Framing: **"just reflect the current state"** — not a live-match broadcast
product. No "LIVE" badge, no presence/viewer counts. It simply means a public
viewer never sees stale data, whether the owner is tapping events live at a game
(auto-save fires 2.5s after each change) or fixing a typo a week later.

## Why this is small

The whole public page is already derived from a single source:
`buildModel(row.data)` → `applyNameDisplay(model, row.name_display)`. Both are
pure functions in `lib/`. `PublicMatch` is already a client component that
already holds a Supabase browser client. So one Realtime `UPDATE` event hands us
the full new record and we rebuild the entire model client-side from it — no
per-field wiring.

This is a **Supabase** feature (Realtime over a websocket, browser ↔ Supabase),
**not** a Vercel one. Vercel only serves the page; it is intentionally not in the
live-update path (consistent with the project's no-middleware / no-Edge constraint,
which exists precisely because of the realtime/`ws` dependency).

## Approach (chosen: A — payload-driven)

`PublicMatch` keeps the model in React state, seeded from the server-rendered
`model` prop (first paint, SEO, and OG image are unchanged). A `useEffect`
subscribes to `UPDATE` events on its own row and rebuilds the model from the
pushed payload:

```ts
const ch = sb
  .channel(`match:${id}`)
  .on(
    "postgres_changes",
    { event: "UPDATE", schema: "public", table: "matches", filter: `id=eq.${id}` },
    (payload) => {
      const row = payload.new as any;
      if (row.is_public === false) { setGone(true); return; }       // unpublished
      setModel(applyNameDisplay(buildModel(row.data), row.name_display || "full"));
    }
  )
  .on(
    "postgres_changes",
    { event: "DELETE", schema: "public", table: "matches", filter: `id=eq.${id}` },
    () => setGone(true)
  )
  .subscribe((status) => handleStatus(status));

return () => { sb.removeChannel(ch); };
```

Rejected alternatives:
- **B — Realtime as a ping, then re-fetch / `router.refresh()`.** Extra round-trip
  per update; `router.refresh()` re-runs the whole server component. No benefit
  here since the payload already carries `data`.
- **C — Polling.** Laggy and wasteful; only a fallback if Realtime were unavailable.

## Plumbing detail: passing the row id to the client

`PublicMatch` currently receives only `model`. The subscription needs the row
`id` (the canonical UUID, for the `filter`). Add an `id` prop passed from
`app/m/[id]/page.tsx` (`row!.id`). The model itself is unchanged.

## Update cue — "gentle highlight only", score-only

On each update, diff the new score strings (`m.totals.us.str` / `m.totals.them.str`)
against the previous render. **Only when the score actually changes**, apply a
brief (~1s) ease-out highlight to the `ScoreHeader` (a single `@keyframes` glow in
`globals.css`, toggled via a transient class or a `key`/counter bump), then it
settles. No text, no badge.

Rationale (confirmed with owner): a new/removed **timeline** entry is self-evident
on its own; only the score number benefits from a "this just changed" cue.
Unrelated edits (lineup tweak, corner) swap silently — pulsing the score for them
would be misleading. All other sections always swap silently.

## Edge cases

- **Owner unpublishes (`is_public` → false) or deletes the row mid-view.** A
  non-owner's subscription stops matching RLS; a manual reload would 404. We
  detect this via an `UPDATE` payload carrying `is_public === false`, or a
  `DELETE` event, and show a quiet inline notice ("This match is no longer
  shared") in place of live content. (The owner themselves sees the editor, not
  this page, so they never hit it.)
- **`name_display` change.** Handled for free — the payload carries the new value
  and we re-run `applyNameDisplay`. Live name-privacy changes Just Work.
- **Reconnect (must be visible + correct).** `postgres_changes` only delivers
  events that occur *while* subscribed, so a dropped socket during a live match
  can mean missed updates. Track connection via the `.subscribe((status) => …)`
  callback:
  - On a drop after having been connected (`CHANNEL_ERROR` / `TIMED_OUT` /
    `CLOSED`) → show a quiet **"Reconnecting…"** pill.
  - On return to `SUBSCRIBED` *after* a drop → **re-fetch the row once** (same
    anon `select` the server uses) to catch up on anything missed, rebuild the
    model, then flash a brief **"Reconnected"** pill that fades (~2s).
  - The *initial* connect shows nothing.

## Supabase setup (DONE)

Realtime must include the table in the publication. **Already run by the owner:**

```sql
alter publication supabase_realtime add table matches;
```

Realtime authorizes `postgres_changes` against RLS as the subscriber's role. The
existing `public_read` policy (`is_public = true`) already lets anon read public
rows, so public viewers receive events and private rows stay dark. **No new
policy needed.** Record this in CLAUDE.md's storage section as a completed,
run-once step (like `listed` / `short_code`).

## Components / files touched

- `components/PublicMatch.tsx` — new `id` prop; `model` becomes state seeded from
  prop; subscription `useEffect`; score-diff highlight; `gone` notice; connection
  pill.
- `app/m/[id]/page.tsx` — pass `id={row!.id}` to `<PublicMatch>`.
- `app/globals.css` — one `@keyframes` highlight + the connection-pill styles.
- `CLAUDE.md` — note the realtime publication step (done) and the live-update
  behaviour in the public-page section. Bump `APP_VERSION` (lib/constants.ts).

## Testing

The live behaviour is integration-shaped (websocket + Supabase) and not unit-
testable in Vitest without heavy mocking. Keep logic in small pure seams that
*are* testable:
- A pure `scoreChanged(prevModel, nextModel)` helper (drives the highlight) — unit
  test it. Everything else (`buildModel`, `applyNameDisplay`) is already covered.
- Manual verification: open the public link in a second browser/profile, edit the
  match as the owner, confirm the score pulses and updates within a few seconds;
  test unpublish → notice; test offline/online → reconnect pill + catch-up.

## Out of scope (YAGNI)

- LIVE badge, viewer counts, presence.
- Per-section change highlights beyond the score.
- Live updates on the owner's *own* editor across devices (the existing Resync
  button covers that; a separate concern).
