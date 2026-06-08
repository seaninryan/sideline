# Next.js migration — Phase 1 design

**Date:** 2026-06-08
**Status:** Approved (design); implementation plan to follow.

## Goal

Migrate Sideline from a single-file CDN/Babel-in-browser React app to a proper
Next.js (App Router) + TypeScript codebase with a build step, deployed to Vercel.
This unblocks four things the user explicitly wants: code maintainability,
public sharing pages, new app sections, and modern tooling/DX.

Phase 1 delivers a **faithful port at feature parity PLUS the public read-only
match page and its OG (social-preview) poster image** — validating the whole
architecture (SSR + Supabase + OG generation) end-to-end in one chunk. New
authenticated app sections (season dashboard, match list, etc.) are deliberately
out of scope for Phase 1 and get their own later spec/plan cycles.

## Stack

- **Next.js (App Router) + TypeScript**, deployed to **Vercel** (git-push to `main` → auto-build).
- **Supabase** unchanged as the backend (Postgres + Auth + RLS), now accessed via **`@supabase/ssr`** for cookie-based sessions readable on the server.
- **Fonts** via `next/font`: Oswald (base), Bebas Neue (display numbers). Infographic continues to use Arial-metric fonts (see OG section).
- **Plain CSS** ported from the existing injected `CSS` string into `globals.css` — no Tailwind, no chart library (keep the dependency-free inline-SVG `ScoreChart`).
- **Vitest** for unit tests.

### Why Next.js on Vercel (recorded rationale)

The headline reason is OG images: a shared match link unfurls as the actual
match infographic poster, server-rendered. This is on-mission for an app built
around shareable match summaries and is impossible on a client-only SPA (crawlers
don't run JS). Secondary benefits: instant server-rendered public pages, a server
runtime for future secret-backed features (RLS can't express everything), and
file-based routing with automatic code splitting. Accepted costs: cookie-based
`@supabase/ssr` auth (more involved than the current client-only flow), a heavier
framework, and a Node runtime dependency (Vercel Hobby tier, fine for personal use).

## Repo structure

```
app/
  layout.tsx                      # root: fonts, global CSS, <html>
  page.tsx                        # "/" — editor app (auth-gated, server reads session)
  m/[id]/
    page.tsx                      # public read-only match (server-rendered)
    opengraph-image.tsx           # OG poster from buildInfographicSVG (runtime: nodejs)
  auth/callback/route.ts          # Supabase OAuth code exchange
  globals.css                     # ported CSS
lib/
  parser.ts                       # parseMatch (pure, typed) + parser types
  raw-edit.ts                     # replace/delete/insert/placeEventLineByMinute helpers
  infographic.ts                  # buildInfographicSVG (pure, returns SVG string)
  svg-to-png.client.ts            # existing browser-canvas svgToPng (in-app share panel)
  sample.ts                       # SAMPLE fixture (fictional teams — keep no-real-names rule)
  supabase/
    client.ts                     # browser client (editor)
    server.ts                     # server client (public page, OG route)
    store.ts                      # store.list/get/set/del + loadAll — SAME surface as today
  types.ts                        # MatchRecord, ParsedMatch, Settings, Supabase row types
components/
  MatchTracker.tsx                # "use client" — the editor, ported whole (typed)
  ScoreChart.tsx                  # moved as-is, typed
  MinuteStep.tsx                  # moved as-is, typed
  SignIn.tsx                      # moved as-is, typed
  ShareWizard.tsx                 # NEW — full-screen takeover (see below)
middleware.ts                     # @supabase/ssr session refresh
test/
  parser.test.ts                  # ports tools/run-tests.js assertions, imports lib/parser directly
  raw-edit.test.ts                # raw-edit helper assertions
```

## Component decomposition policy

Port `MatchTracker` **as a single `"use client"` component**, typed but
structurally unchanged. Doing a framework move and a 1,200-line decomposition
simultaneously would make parity failures impossible to attribute. The internal
sub-features (game mode, new-match wizard, notation blocks, tabs) stay inside
`MatchTracker` for now.

Extract during the port (cheap, safe, high value):

- `parseMatch`, the raw-edit helpers, `buildInfographicSVG` → pure `lib/` modules with **no React** (fully unit-testable).
- `ScoreChart`, `MinuteStep`, `SignIn` → standalone components, moved as-is.
- `SAMPLE`, the `CSS` string, constants → their own files.

Decomposing `MatchTracker` into sub-components is a **dedicated later phase**
against the now-stable, tested baseline.

## Auth (`@supabase/ssr`)

- Google OAuth via `signInWithOAuth` (same provider as today), but cookie-based so the server can read the session.
- `app/auth/callback/route.ts` exchanges the OAuth code → sets cookies.
- `middleware.ts` refreshes the session on each request.
- `/` (editor) reads the session server-side: renders `<SignIn/>` when signed out, `<MatchTracker/>` when signed in.
- `/m/[id]` (public) requires **no auth**.

## Storage

Keep the exact `store` surface (`store.list()`, `store.get(id)`, `store.set(id, data)`,
`store.del(id)`, `loadAll()`) so the ported `MatchTracker` is untouched — it just
imports the browser-client-backed `store`. The promoted columns
(`match_date`, `my_team`, `opponent`, `sport`) are still derived on every `store.set`
(opponent via `parseMatch`). The public page and OG route use the **server** client,
reading only `is_public = true` rows (RLS `public_read`).

## Public match page + OG image

**Public page** `app/m/[id]/page.tsx` — server component. Fetches the match via
the server Supabase client (anon key + `public_read` RLS, `is_public = true` only).
Renders a read-only match view (scoreboard, chart, scorers, timeline, lineup).
Respects `hide_names` (see redaction). 404 if the row isn't public.

**OG image** `app/m/[id]/opengraph-image.tsx` — Node.js runtime. The technical
catch: Next's `next/og`/Satori renders only a subset of JSX+flexbox and does NOT
robustly rasterize an arbitrary SVG string (our step-chart `<path>`s, custom
layout). So we reuse `buildInfographicSVG` **verbatim** and rasterize the SVG
string server-side with **`@resvg/resvg-js`**:

```
fetch match (server client, public_read)
  → buildInfographicSVG(model)        // the SAME pure module the in-app share uses
  → @resvg/resvg-js renders SVG → PNG
  → ImageResponse
```

This keeps a single infographic implementation shared by both the in-app share
panel (browser canvas via `svg-to-png.client.ts`) and the OG route (resvg
server-side). resvg has no system fonts on Vercel, so bundle a Liberation
Sans / Arial-metric-compatible TTF so the OG poster matches the in-app render.

## Share wizard (NEW)

Wires the two dormant flags (`is_public`, `hide_names`) into a guided flow,
following the existing full-screen takeover pattern (game mode, new-match wizard):

1. **Share** (entry from the existing Share control / ⋯ menu).
2. **"Hide player names?"** — explains youth name redaction; sets `hide_names`.
3. **"Make this match public?"** — sets `is_public = true` and saves to Supabase.
4. **Presents the share link** `/m/[id]` with a copy button and a live preview of the OG poster.

`ShareWizard.tsx` is a conditional render inside `MatchTracker` (same approach as
`gm`/`nw` state), with chrome wrapped behind its active state. Entering closes any
open editors (the raw-mutation rule).

**Name redaction (`hide_names`):** when on, the public page and OG poster replace
individual player names with their shirt number (`#10`) where known, else a neutral
label (e.g. `Player`); team names are kept. Exact rules pinned down in the plan.

## Testing

- Vitest. `lib/parser.ts` and `lib/raw-edit.ts` are imported directly — the text-extraction harness (`tools/parser-harness.js`) is retired.
- Port `tools/run-tests.js` assertions into `test/parser.test.ts`, including the canonical `SAMPLE` regression: final Racoons 2-6, Wildebeests 2-7 (Loss), Rick 2-4 (4 frees), Morty 0-1, leadChanges 1, timesLevel 3, maxLead 6 (us), 0 warnings.
- **Parity definition:** tests green + manual smoke of editor, game mode, new-match wizard, share wizard, public page, and OG image.

## Migration / cutover

No flag day — the old app stays live until the new one is proven:

1. Build the Next app on the current branch; `index.html` stays live on GitHub Pages throughout.
2. Reach parity (tests + manual smoke).
3. Stand up the Vercel project; add its URL + `http://localhost:3000` to Supabase's redirect allowlist; set `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` env vars.
4. Cut over: remove `index.html` and `tools/parser-harness.js`, stop GitHub Pages serving, point the canonical URL at Vercel. The `APP_VERSION` convention (shown beside the SIDELINE logo) carries over.

## Deployment

Git-push to `main` → Vercel auto-builds (`next build`) and serves — same
push-to-deploy reflex as the current GitHub Pages flow.

## Constraints preserved

- No real player or club names anywhere in the repo — `SAMPLE` stays fictional.
- One infographic implementation, shared by app + OG.
- Dependency-free inline-SVG `ScoreChart` — no chart library reintroduced.
- The `store` surface is identical so `MatchTracker` is untouched by the storage move.

## Out of scope (Phase 1)

- Decomposing `MatchTracker` into sub-components (dedicated later phase).
- New authenticated app sections (season dashboard, team management, match-list view, settings page).
- PWA manifest / service-worker offline cache.
