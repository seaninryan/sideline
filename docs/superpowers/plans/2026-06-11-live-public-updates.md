# Live Public-Page Updates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the owner edits a match, anyone viewing its public share link sees the page update live (score, chart, timeline, scorers, lineup, name-privacy) within a few seconds, with a gentle score pulse and a reconnect indicator.

**Architecture:** `PublicMatch` (already a client component holding a Supabase browser client) subscribes to Supabase Realtime `postgres_changes` UPDATE/DELETE events on its own row. Each UPDATE payload carries the full row, so we rebuild the entire model client-side via the existing pure `buildModel` → `applyNameDisplay` functions and swap it into state. A pure `scoreChanged` helper drives a one-shot CSS pulse on the score header; subscription-status transitions drive a connection pill plus a catch-up re-fetch on reconnect.

**Tech Stack:** Next.js 14 (App Router), React client component, `@supabase/ssr` browser client, Supabase Realtime, Vitest. No new dependencies.

---

## File Structure

- **Create:** `lib/live-update.ts` — pure `scoreChanged(prev, next)` helper (the only unit-testable seam). One responsibility: decide whether the displayed score differs between two models.
- **Create:** `test/live-update.test.ts` — unit tests for `scoreChanged`.
- **Modify:** `components/PublicMatch.tsx` — accept an `id` prop; hold `model` in state seeded from the prop; add the Realtime subscription effect, the score pulse, the "no longer shared" notice, and the connection pill.
- **Modify:** `app/m/[id]/page.tsx:63` — pass `id={row!.id}` to `<PublicMatch>`.
- **Modify:** `app/globals.css` — one `@keyframes` score-flash + score-wrap class + connection-pill styles.
- **Modify:** `lib/constants.ts:2` — bump `APP_VERSION` to `v69`.
- **Modify:** `CLAUDE.md` — record the realtime publication step (done) + the live-update behaviour; bump the version note.

The realtime subscription, pulse, gone-notice, and pill all live together in `PublicMatch` because they share its model state and lifecycle — splitting them across files would mean threading that state through props for no benefit. The one piece that *can* stand alone (the score-diff decision) is extracted to `lib/live-update.ts` so it's testable in isolation.

---

## Task 1: Pure `scoreChanged` helper (TDD)

**Files:**
- Create: `lib/live-update.ts`
- Test: `test/live-update.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/live-update.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { scoreChanged } from "@/lib/live-update";

// Minimal Model-shaped fixture: scoreChanged only reads totals.us.str / totals.them.str.
const mk = (usStr: string, themStr: string): any => ({
  totals: { us: { str: usStr }, them: { str: themStr } },
});

describe("scoreChanged", () => {
  it("is false when both score strings are identical", () => {
    expect(scoreChanged(mk("1-05", "0-07"), mk("1-05", "0-07"))).toBe(false);
  });

  it("is true when our score string changes", () => {
    expect(scoreChanged(mk("1-05", "0-07"), mk("1-06", "0-07"))).toBe(true);
  });

  it("is true when their score string changes", () => {
    expect(scoreChanged(mk("1-05", "0-07"), mk("1-05", "1-07"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/live-update.test.ts`
Expected: FAIL — cannot resolve `@/lib/live-update` (module does not exist).

- [ ] **Step 3: Write the minimal implementation**

Create `lib/live-update.ts`:

```ts
import type { Model } from "./types";

// True when the displayed score (either side's "G-PP" string) differs between
// two models. Drives the one-shot score-header pulse on a live update; an edit
// that doesn't move the score (lineup tweak, corner, name-privacy) returns false.
export function scoreChanged(prev: Model, next: Model): boolean {
  return (
    prev.totals.us.str !== next.totals.us.str ||
    prev.totals.them.str !== next.totals.them.str
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run test/live-update.test.ts`
Expected: PASS (3 passed).

- [ ] **Step 5: Commit**

```bash
git add lib/live-update.ts test/live-update.test.ts
git commit -m "feat(live): add pure scoreChanged helper for live-update pulse"
```

---

## Task 2: Thread the row `id` to `PublicMatch` and hold the model in state

This task makes `PublicMatch` ready for live updates without changing any visible behaviour yet: it receives the row id and holds the model in state (seeded from the prop, so first paint is byte-for-byte identical).

**Files:**
- Modify: `components/PublicMatch.tsx:17` (signature + state)
- Modify: `app/m/[id]/page.tsx:63` (pass `id`)

- [ ] **Step 1: Pass the id from the page**

In `app/m/[id]/page.tsx`, change line 63 from:

```tsx
  return <PublicMatch model={model} />;
```

to:

```tsx
  return <PublicMatch model={model} id={row!.id} />;
```

(`row!.id` is the canonical UUID — used as the Realtime filter key. `fetchRow` already selects `id`.)

- [ ] **Step 2: Update the component signature and seed state**

In `components/PublicMatch.tsx`, change line 17 from:

```tsx
export default function PublicMatch({ model }: { model: Model }) {
  const m = model;
```

to:

```tsx
export default function PublicMatch({ model: initialModel, id }: { model: Model; id: string }) {
  const [model, setModel] = useState<Model>(initialModel);
  const m = model;
```

The existing `import React, { useMemo, useState } from "react";` on line 2 already provides `useState`. Everything downstream already reads `m`, so no other render code changes.

- [ ] **Step 3: Verify build/typecheck and the suite still pass**

Run: `npm run build`
Expected: builds with no type errors.

Run: `npm test`
Expected: all tests pass (previous total + the 3 new from Task 1).

- [ ] **Step 4: Commit**

```bash
git add components/PublicMatch.tsx app/m/[id]/page.tsx
git commit -m "refactor(public): hold model in state and accept row id (prep for live)"
```

---

## Task 3: Subscribe to Realtime UPDATEs and swap the model live

Adds the core behaviour: an UPDATE pushes the full row; we rebuild the model and swap it in. (Pulse, gone-notice, and pill come in later tasks; this task does a silent live swap.)

**Files:**
- Modify: `components/PublicMatch.tsx` (imports + a new effect)

- [ ] **Step 1: Add the lib imports**

In `components/PublicMatch.tsx`, the file already imports `buildModel`? No — add it. Below the existing `import { createClient } from "@/lib/supabase/client";` line, add:

```tsx
import { buildModel } from "@/lib/model";
import { applyNameDisplay } from "@/lib/name-display";
import { scoreChanged } from "@/lib/live-update";
```

Also ensure `useRef` and `useEffect` are imported. Change line 2 to:

```tsx
import React, { useMemo, useState, useRef, useEffect } from "react";
```

- [ ] **Step 2: Add a ref tracking the current model (for diffing) and the subscription effect**

In `components/PublicMatch.tsx`, immediately after `const [model, setModel] = useState<Model>(initialModel);` add:

```tsx
  const prevModel = useRef<Model>(initialModel);
```

Then, after the existing `React.useEffect(() => { sb.auth.getUser()... }, []);` line, add a new effect:

```tsx
  // Live updates: rebuild the whole model from each Realtime UPDATE payload.
  useEffect(() => {
    const apply = (row: any) => {
      const next = applyNameDisplay(buildModel(row.data), row.name_display || row.data?.nameDisplay || "full");
      prevModel.current = next;
      setModel(next);
    };
    const ch = sb
      .channel(`match:${id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "matches", filter: `id=eq.${id}` },
        (payload) => apply(payload.new)
      )
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, [id, sb]);
```

- [ ] **Step 3: Manually verify the live swap**

Run: `npm run dev`
1. Sign in, open a match, publish it (ShareSheet), and copy its link.
2. Open the link in a second browser profile (or incognito) where you are NOT signed in.
3. In the owner tab, add a score event and wait ~3s for auto-save.
4. Confirm the public tab's score, chart, timeline, and scorers update without a reload.

Expected: the public page reflects the change within a few seconds, no reload.

- [ ] **Step 4: Commit**

```bash
git add components/PublicMatch.tsx
git commit -m "feat(live): subscribe public page to Realtime row UPDATEs"
```

---

## Task 4: Gentle score-only pulse on the score header

**Files:**
- Modify: `components/PublicMatch.tsx` (pulse state + wrap the ScoreHeader)
- Modify: `app/globals.css` (keyframes + wrap class)

- [ ] **Step 1: Add the keyframes and wrap style**

Append to `app/globals.css`:

```css
/* Live-update: one-shot score-header flash (brand tint fading out). */
@keyframes pmScoreFlash {
  0%   { background-color: rgba(245, 197, 24, 0.55); }
  100% { background-color: transparent; }
}
.pm-score-wrap { border-radius: 12px; }
.pm-score-wrap.pm-pulse { animation: pmScoreFlash 1s ease-out; }
```

- [ ] **Step 2: Add pulse state and fire it on a score change**

In `components/PublicMatch.tsx`, after `const prevModel = useRef<Model>(initialModel);` add:

```tsx
  const [pulse, setPulse] = useState(0);
```

Then in the `apply` function from Task 3, fire the pulse when the score moved — change `apply` to:

```tsx
    const apply = (row: any) => {
      const next = applyNameDisplay(buildModel(row.data), row.name_display || row.data?.nameDisplay || "full");
      if (scoreChanged(prevModel.current, next)) setPulse((p) => p + 1);
      prevModel.current = next;
      setModel(next);
    };
```

- [ ] **Step 3: Wrap the ScoreHeader block so the wrapper replays the animation**

In `components/PublicMatch.tsx`, the score header is rendered by the IIFE that returns `<ScoreHeader ... />` (currently around lines 84–106). Wrap that returned element. Change the `return (` inside that IIFE so the `<ScoreHeader .../>` is wrapped:

```tsx
        return (
          <div key={pulse} className={pulse > 0 ? "pm-score-wrap pm-pulse" : "pm-score-wrap"}>
            <ScoreHeader
              homeName={usIsHome ? m.usName : m.themName}
              awayName={usIsHome ? m.themName : m.usName}
              homeStr={usIsHome ? m.totals.us.str : m.totals.them.str}
              awayStr={usIsHome ? m.totals.them.str : m.totals.us.str}
              homeColors={usIsHome ? [m.colorUs, m.colorUs2] : [m.colorThem, m.colorThem2]}
              awayColors={usIsHome ? [m.colorThem, m.colorThem2] : [m.colorUs, m.colorUs2]}
              grade={m.grade || m.sport || ""}
              dateStr={m.dateStr}
              homeTotal={usIsHome ? usTotal : themTotal}
              awayTotal={usIsHome ? themTotal : usTotal}
              phase={phase}
              homeSquad={usIsHome ? m.usSquad : m.oppSquad}
              awaySquad={usIsHome ? m.oppSquad : m.usSquad}
            />
          </div>
        );
```

The `key={pulse}` makes React replace the wrapper node each time `pulse` increments, restarting the one-shot CSS animation. `pulse > 0` keeps the initial server render unanimated (no flash on first paint).

- [ ] **Step 4: Manually verify the pulse**

Run: `npm run dev` and repeat the Task 3 two-tab setup.
1. Add a **scoring** event in the owner tab → public tab's score header briefly flashes amber, then settles.
2. Add a **non-scoring** edit (e.g. a corner, or a lineup tweak) → score header does NOT flash, but the relevant section still updates.

Expected: flash only on score change.

- [ ] **Step 5: Commit**

```bash
git add components/PublicMatch.tsx app/globals.css
git commit -m "feat(live): pulse the score header only when the score changes"
```

---

## Task 5: "No longer shared" notice on unpublish/delete

**Files:**
- Modify: `components/PublicMatch.tsx` (gone state, DELETE handler, is_public guard, notice render)

- [ ] **Step 1: Add gone state**

In `components/PublicMatch.tsx`, after the `const [pulse, setPulse] = useState(0);` line add:

```tsx
  const [gone, setGone] = useState(false);
```

- [ ] **Step 2: Guard the UPDATE handler and add a DELETE handler**

Change the `apply` function so an unpublish flips `gone`:

```tsx
    const apply = (row: any) => {
      if (row.is_public === false) { setGone(true); return; }
      const next = applyNameDisplay(buildModel(row.data), row.name_display || row.data?.nameDisplay || "full");
      if (scoreChanged(prevModel.current, next)) setPulse((p) => p + 1);
      prevModel.current = next;
      setModel(next);
    };
```

And add a DELETE listener to the channel chain (between the UPDATE `.on(...)` and `.subscribe()`):

```tsx
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "matches", filter: `id=eq.${id}` },
        () => setGone(true)
      )
```

- [ ] **Step 3: Render the notice when gone**

In `components/PublicMatch.tsx`, immediately after the `return (` of the component's main JSX and inside `<div className="pm-root mt-root">` — right after the `{imgOpen && ...}` line and before the `{/* score header ... */}` block — add:

```tsx
      {gone ? (
        <section className="pm-sec" style={{ textAlign: "center", padding: "48px 16px" }}>
          <p className="pm-label">This match is no longer shared.</p>
        </section>
      ) : (
       <>
```

Then close that fragment just before `<BrandFooter />` near the end:

```tsx
       </>
      )}
      <BrandFooter />
```

(The `AppHeader` and `BrandFooter` stay visible; only the match body is replaced by the notice.)

- [ ] **Step 4: Manually verify**

Run: `npm run dev`, two-tab setup.
1. In the owner tab, unpublish the match (ShareSheet → unshare).
2. Public tab body is replaced by "This match is no longer shared." (header/footer remain).

Expected: graceful notice, no frozen stale page, no crash.

- [ ] **Step 5: Commit**

```bash
git add components/PublicMatch.tsx
git commit -m "feat(live): show 'no longer shared' notice on unpublish/delete"
```

---

## Task 6: Connection pill + catch-up re-fetch on reconnect

**Files:**
- Modify: `components/PublicMatch.tsx` (status handling, re-fetch, pill render)
- Modify: `app/globals.css` (pill styles)

- [ ] **Step 1: Add the pill styles**

Append to `app/globals.css`:

```css
/* Live-update: connection pill (reconnecting / reconnected). */
.pm-conn {
  position: fixed; bottom: 14px; left: 50%; transform: translateX(-50%);
  padding: 6px 14px; border-radius: 999px; font-size: 13px; z-index: 60;
  background: #11241b; color: #fff; box-shadow: 0 2px 10px rgba(0,0,0,.25);
}
.pm-conn.ok { background: #1a7f44; }
```

- [ ] **Step 2: Add pill state, a re-fetch fn, and status handling**

In `components/PublicMatch.tsx`, after `const [gone, setGone] = useState(false);` add:

```tsx
  const [conn, setConn] = useState<null | "reconnecting" | "reconnected">(null);
  const wasConnected = useRef(false);
```

Inside the live-updates effect (Task 3), define a re-fetch helper before the channel is created, reusing `apply`:

```tsx
    const refetch = async () => {
      const { data } = await sb
        .from("matches")
        .select("data,name_display,is_public")
        .eq("id", id)
        .maybeSingle();
      if (data) apply(data);
    };
```

Then replace the bare `.subscribe()` with a status-aware one:

```tsx
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          if (wasConnected.current) {
            refetch();                 // catch up on anything missed while down
            setConn("reconnected");
            setTimeout(() => setConn(null), 2000);
          }
          wasConnected.current = true;
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          if (wasConnected.current) setConn("reconnecting");
        }
      });
```

Note: `apply` already guards `is_public === false`, so the re-fetch path inherits the unpublish handling for free. The initial `SUBSCRIBED` (when `wasConnected` is still false) shows nothing.

- [ ] **Step 3: Render the pill**

In `components/PublicMatch.tsx`, just inside `<div className="pm-root mt-root">` (e.g. right after the `<AppHeader ... />` block), add:

```tsx
      {conn === "reconnecting" && <div className="pm-conn">Reconnecting…</div>}
      {conn === "reconnected" && <div className="pm-conn ok">Reconnected</div>}
```

- [ ] **Step 4: Manually verify reconnect**

Run: `npm run dev`, open the public link in a second profile.
1. Open browser devtools → Network → set to **Offline**. Within a few seconds the "Reconnecting…" pill appears.
2. Meanwhile, in the owner tab, add a score event (saves while the viewer is offline).
3. Set the viewer back to **Online**. The pill flips to a green "Reconnected" for ~2s and disappears, AND the score that changed while offline is now shown (catch-up re-fetch).

Expected: visible reconnect + no silently-missed update.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add components/PublicMatch.tsx app/globals.css
git commit -m "feat(live): reconnect pill + catch-up re-fetch on resubscribe"
```

---

## Task 7: Docs + version bump

**Files:**
- Modify: `lib/constants.ts:2`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Bump the version**

In `lib/constants.ts`, change line 2:

```ts
export const APP_VERSION = "v69";
```

- [ ] **Step 2: Update CLAUDE.md**

In `CLAUDE.md`:
1. Under the Versioning line, change `Current: **v68**.` to `Current: **v69**.`
2. In the "Public match page + OG image" section, add a bullet after the `/m/[id]` description:

```markdown
- **Live updates.** `PublicMatch` subscribes to Supabase Realtime `postgres_changes` (UPDATE/DELETE) on its own row; each UPDATE payload carries the full record, so it rebuilds the model client-side (`buildModel` → `applyNameDisplay`) and swaps it into state — score, chart, timeline, scorers, lineup, and `name_display` all reflect the owner's edits within a few seconds (owner auto-save is 2.5s-debounced). A score change pulses the score header (pure `scoreChanged` in `lib/live-update.ts`); unpublish/delete shows a "no longer shared" notice; socket drops show a "Reconnecting…" pill and a "Reconnected" pill + catch-up re-fetch on resubscribe. Realtime respects RLS via the existing `public_read` policy. **Schema step (run once, DONE):** `alter publication supabase_realtime add table matches;`
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: builds clean.

- [ ] **Step 4: Commit**

```bash
git add lib/constants.ts CLAUDE.md
git commit -m "docs(live): document live public updates; bump APP_VERSION to v69"
```

---

## Final verification

- [ ] Run `npm test` — all tests pass (previous total + 3 new).
- [ ] Run `npm run build` — clean.
- [ ] Manual end-to-end (two profiles): live score swap + pulse, non-score edit (no pulse), unpublish notice, offline→online reconnect pill + catch-up.
- [ ] Tell the user to look for **v69** in the footer after deploy.

---

## Notes for the implementer

- **Do NOT** convert the page to client-only fetching — the server render (`app/m/[id]/page.tsx`) must stay, because it powers SEO metadata and the OG image, and gives the correct first paint. State is merely *seeded* from the server prop.
- `buildModel` and `applyNameDisplay` are pure and already used server-side; importing them into the client component is fine (no server-only deps).
- The Supabase browser client (`sb`) is already created once via `useMemo` in `PublicMatch`; reuse it — do not create a second client.
- Realtime is enabled at the table level (publication step already run). If events don't arrive in dev, confirm the row is actually `is_public = true` (RLS gates Realtime exactly like SELECT).
