# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Sideline — a personal match tracker for GAA (hurling/football) and soccer that parses handwritten-style match notation into a scoreboard, running-score chart, scorers table, timeline, lineup, and a shareable infographic image. The sample data uses fictional teams/players (Racoons v Wildebeests, Rick & Morty names) — keep it that way; no real player or club names in the repo.

## Repository layout

- **`app/`** — Next.js 14 App Router pages and route handlers:
  - `layout.tsx` — root layout; loads Oswald + Bebas Neue via `next/font`, applies CSS variables `--font-oswald` / `--font-bebas`.
  - `page.tsx` — `/` server component: reads Supabase session via `getUser()`, renders `<SignInGate>` or `<EditorApp>`.
  - `globals.css` — all app styles (ported from the old single-file `<style>` block; fonts use `var(--font-oswald)` / `var(--font-bebas)`).
  - `auth/callback/route.ts` — OAuth code-exchange handler; exchanges the code for a session cookie and redirects to `/`.
  - `m/[id]/page.tsx` — public read-only match page (SSR); fetches only `is_public=true` rows, applies `applyNameDisplay`.
  - `m/[id]/opengraph-image.tsx` — OG score-card PNG (1200×630) rendered server-side via `@resvg/resvg-js` + `buildScoreCardSVG`.
- **`lib/`** — pure, typed, unit-tested logic:
  - `parser.ts` — `parseMatch` (the full parser).
  - `raw-edit.ts` — roster + event-line helpers (`replaceEventLine`, `deleteEventLine`, `insertEventLine`, `placeEventLineByMinute`).
  - `infographic.ts` — `buildInfographicSVG` (full portrait poster) + `buildScoreCardSVG` (compact OG card).
  - `model.ts` — `buildModel`: rebuilds the infographic/page model from a stored record; used server-side by `/m/[id]`.
  - `name-display.ts` — `applyNameDisplay` / `redactName`: full / initials / none player-name redaction for public pages.
  - `store.ts` — `store` / `loadAll` / `cache` (browser-backed; same `list/get/set/del` surface as always); derives the promoted columns including `name_display` on every `store.set`.
  - `supabase/client.ts` — `@supabase/ssr` browser client.
  - `supabase/server.ts` — `@supabase/ssr` server client (reads cookies; used in Server Components and route handlers).
  - `constants.ts` — `APP_VERSION`, `PALETTE`, `LIVE_EVENTS`, `SPORTS`.
  - `types.ts`, `util.ts`, `sample.ts` (the fictional `SAMPLE`), `svg-to-png.client.ts` (browser canvas rasterizer).
- **`components/`**:
  - `MatchTracker.tsx` — the main editor (ported whole, carries `// @ts-nocheck` — to be decomposed/typed in a later phase).
  - `ScoreChart.tsx`, `MinuteStep.tsx` — chart and minute-stepper sub-components.
  - `SignIn.tsx` — presentational sign-in screen.
  - `SignInGate.tsx` — client component: calls `signInWithOAuth` and passes state to `<SignIn>`.
  - `EditorApp.tsx` — client bootstrap: runs `loadAll()` then renders `<MatchTracker>`.
  - `PublicMatch.tsx` — read-only public match render.
  - `ShareWizard.tsx` — publish + share-link wizard (name-display choice → make public → copy link + OG preview).
- **`test/`** — Vitest suites: `parser.test.ts` (full regression suite, 143 tests total across all files), `util.test.ts`, `raw-edit.test.ts`, `model.test.ts`, `name-display.test.ts`, `score-card.test.ts`, `smoke.test.ts`.
- **`assets/`** — `LiberationSans-Regular.ttf` + `LiberationSans-Bold.ttf` (bundled for resvg OG rendering; these are the fonts used in the score card, not the app UI).
- **`tools/make-icon.py`** — regenerates `icon-180.png` and `icon-touch-180.png` (needs PIL). The top-bar logo SVG uses the same geometry/colours. Don't edit the icons by hand.
- **`SETUP.md`** — end-user setup guide (Supabase + Google OAuth + Vercel deploy).
- **`vercel.json`** — `{"framework":"nextjs"}` (pins the framework; Vercel's auto-detect was wrong without it).
- **`next.config.mjs`**, **`tsconfig.json`**, **`package.json`**.

## Commands

Node 20 is required (`nvm use 20`).

```bash
npm install
npm run dev      # → http://localhost:3000
npm run build    # production build
npm test         # Vitest (143 tests)
```

After any parser change, run `npm test` and confirm the canonical `SAMPLE` with `{myTeam:"Racoons"}` produces: final Racoons 2-6, Wildebeests 2-7 (Loss), Rick 2-4 (4 frees), Morty 0-1, leadChanges 1, timesLevel 3, maxLead 6 (us), 0 warnings. This is asserted in `test/parser.test.ts`.

**Deploy:** push to the production branch (currently `supabase-migration`; will be `main` after merge); Vercel auto-builds with `@vercel/next`.

**Versioning:** `APP_VERSION` (in `lib/constants.ts`) is shown beside the SIDELINE logo. Bump it on every change that will be deployed, and tell the user which version to look for. Current: **v40**.

## Architecture

### Module layout

`lib/` — pure logic, all typed, all tested. `components/` — React components. `app/` — Next.js routing + server-side data fetching. The main editor (`MatchTracker`) is the largest component and still carries `// @ts-nocheck`; the surrounding modules are fully typed.

### Auth + storage

- The backend is a **Supabase** project (Postgres + Auth). Env vars `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are the only secrets needed — both are public (safe behind RLS).
- **Auth:** Supabase Google OAuth via `@supabase/ssr`. Flow: `SignInGate` (browser) calls `signInWithOAuth({provider:"google", options:{redirectTo: location.origin+"/auth/callback"}})` → `/auth/callback` route handler exchanges the code and sets session cookies → `app/page.tsx` (server component) reads the session via `getUser()`. **There is intentionally NO middleware.** The `@supabase/supabase-js` realtime/`ws` dependency references Node's `__dirname`, which crashes Vercel's Edge runtime; middleware would run there. Server-side token refresh is therefore omitted — the browser client's auto-refresh keeps the session cookie fresh instead.
- **Sign-up policy:** open — any Google account can sign in. RLS isolates each user's rows. A "Sign out (\<email\>)" item lives in the ⋯ overflow menu.
- **Storage:** a `matches` table, row per match. Columns: `id uuid pk`, `owner uuid (default auth.uid())`, `is_public bool default false`, `name_display text default 'full'`, `match_date timestamptz`, `my_team text`, `opponent text`, `sport text`, `data jsonb`, `updated_at timestamptz`. `data jsonb` holds the full match record and is the source of truth; the promoted columns (`match_date`, `my_team`, `opponent`, `sport`, `name_display`) are derived on every `store.set`. RLS: `own_all` policy (`owner = auth.uid()`) + `public_read` policy (`is_public = true`). The public page and OG route read only `is_public=true` rows and apply `name_display` redaction.
- **Auto-save & sync:** matches auto-save 2.5s after the last change (`dirty` compares editor state to `cache[curId]`); a new match needs its first explicit Save. The dropdown and Save button show `*` when dirty. The ⋯ **Resync** button re-pulls via `loadAll()` (for edits made on another device) and reloads the open match, confirming first if local changes would be lost. Last-write-wins — there is no merge.
- **`store` API** (`lib/store.ts`): `store.list()` → `["match:<id>", ...]`; `store.get(id)`; `store.set(id, data)` → bool; `store.del(id)` → bool. `store.set` does a single-row upsert; `store.del` a single-row delete. `MatchTracker` uses this surface unchanged.

### Public match page + OG image

- `/m/[id]` (`app/m/[id]/page.tsx`) — server-rendered read-only view. Fetches only rows where `is_public=true`, runs `buildModel` then `applyNameDisplay`, renders `<PublicMatch>`.
- `/m/[id]/opengraph-image` (`app/m/[id]/opengraph-image.tsx`) — Next.js OG image route. Renders `buildScoreCardSVG` (compact score card, no player names) via `@resvg/resvg-js` using the bundled LiberationSans fonts. Returns a 1200×630 PNG with `Cache-Control: public, max-age=3600`. Note in the source: if `buildScoreCardSVG` ever adds player names, run `applyNameDisplay` before calling it.
- **Share wizard** (`components/ShareWizard.tsx`): name-display choice (full / initials / none) → confirm → sets `is_public=true` + `name_display` on the row → shows the `/m/<id>` URL + OG preview.
- **`name_display`** (`'full' | 'initials' | 'none'`, default `'full'`) replaces the old `hide_names bool`. `initials` renders first initials of each name part; `none` falls back to shirt number or "Player".

### Parser (`parseMatch`) — `lib/parser.ts`

Input is plain text:

- **Header (first line):** `<grade/label> @ <Opp>`; `@` = away, `v`/`vs` = home.
- **Roster block** (before the first clock line): each line is a formation row, players split on `|` (e.g. `10. Morty | 11. Rick`). `Subs` / `Missing:` headers switch role. Formation rows are preserved exactly as written (supports 13-a-side etc.).
- **Halves:** an `HH:MM` line starts a half; scoring lines then use just the wall-clock minute (wraps past the hour). A bare minute-only line also starts a new half when HT is omitted; a bare `HT`/`FT` line is a half marker.
- **Scoring line:** `min scorer [free|goal] [written-score]`. Opposition scorer = `T`/`T11`; roster names = us; an unrostered name → opposition; team name (matched against settings `myTeam`) → us, unattributed.
- **Subs:** `X for Y`. Any other non-numeric line is a note.

Key decisions (preserve these when modifying):

- **Sport detection:** explicit sport in the header wins (`soccer` → goals; `hurl/camog/gaelic/gaa/football` → GAA); then score shape — any line with **two** score tokens (`0-2 1-3`) is GAA, while hyphen scores that only appear **one per line** (`2-1` = whole scoreboard) are a soccer running score (unless `point`/`pt` appears); else any internal hyphen → GAA; else goals-only.
- **Name matching — exact beats fuzzy:** `matchPlayer` scans the whole roster for an exact (squashed) full-name match before trying first-name shorthand or first-word matching — with "Cathal" and "Cathal N" both rostered, each reference resolves to its own entry regardless of roster order (affects subs, scorer credit, cards, own goals). First-name shorthand still works when unambiguous; two players sharing a first name need the initial or shirt number to disambiguate.
- **Misses & stoppages are notes:** a minute line with no written score and a miss/stoppage keyword (`miss/missed/wide/saved/blocked/short/water`) is a note, not a score (`10 Jack miss pen`, `46 Water Break`). With a written score attached, the written score still rules.
- **Set-piece points:** `'65` (hurling) / `'45` (football) on a scoring line sets `setPiece` — a pill in the timeline, `('65)` in chart/infographic labels, not counted as a free. The apostrophe form is canonical (a bare trailing `65` peels as a written-score token); bare `45`/`65` still flags mid-line.
- **Subs can carry a minute:** `43 Rick for Morty` (or `43 12 Rick for 6 Morty`) parses as a sub at 43', not a score. The lineup tab generates these (tap player → pick replacement). Sub notes resolve `onNum`/`offNum` against the roster for lineup styling.
- **Added time:** halves run in multiples of 5, so an HT/FT line with a minute deduces added time (`elapsed % 5`) shown as a ⏱ `+N added` timeline entry. Override in notation with `32 HT +6` or a standalone `+6` line after the marker (`+0` suppresses it).
- **Cards & corners:** `23 Morty yellow card` / `70 T red` are sided notes (type `card`, with roster `num` when matched); `31 corner` (us) / `44 T corner` (them) are type `corner`. The timeline shows card glyphs and per-team corner ordinals; the lineup marks cards and own goals on players.
- **Own goals:** `min who own goal` (or `og`) scores for the *other* side; the scorer entry reads "Own goal (name)" and the scoring item carries `og`/`ogNum` for the lineup marker.
- **Written score is source of truth:** if ≥ half the scoring lines carry a written running score, totals/chart come from the written cumulative score. Two tokens = GAA (one per team); in goals mode a **single** `a-b` token is the whole home-away scoreboard (`writtenCols`). Goal vs point is inferred from the score jump (a 3-point jump with no "goal" word = a goal). A column-vote on "sure" rows (rostered name or `T`) decides which written column is "us" — this handles home/away order automatically. Without written scores (live entry) it falls back to keyword goal/point counting. A reconciliation warning fires only when a written score *drops* (likely typo).
- **Stats computed:** leadChanges, timesLevel, maxLead/maxLeadSide, half-time score, chart series, goalDots, htLine.

### Notation blocks (Notation tab)

- The Notation tab renders the raw text as tappable blocks (one per event line; the preamble — header + roster — is a single Lineup block that expands to a mini textarea). Blocks are a **view over `raw`** — no block model is stored; the old textarea lives behind the "Edit as text" toggle.
- Edits go through pure helpers in `lib/raw-edit.ts`: `replaceEventLine` / `deleteEventLine` / `insertEventLine` (+ shared `placeEventLineByMinute`). A line whose leading minute changes is re-placed within its own half ordered by elapsed minute (wall-clock wrap, ties land last, never crossing the half's HT/FT marker). Structure lines (clock, bare minute, HT/FT, `+N`) never move. `parseMatch` stamps `srcLine` (index into `raw.split("\n")`) on scoring/notes/halfMarks to classify blocks.
- "+ Insert after" opens a type chooser (Score/Sub/Card/Corner/Note) → guided forms reusing the live-entry buttons (`buildEventLine`, `whoGrid`), with a live preview of the exact notation line. The anchor block picks the half and default minute; placement is by minute. The Note form warns when a minuted keyword-less note would parse as a score.
- One editor open at a time: any raw mutation path (live append, undo, resync, match switch, view toggle) closes open block/insert/lineup editors to avoid stale line indices. Block delete needs a confirming second tap (auto-disarms after 3.5s).

### Game mode (full-screen live entry, v34)

- "▶ Game mode" in the Notation tab's live panel swaps the whole UI for scoreboard + a staged big-button wizard, one stage at a time: **Team → Event → Player** (subs: off → on; `completeSub`). `gm` state (`null` off, else `{stage, team?, ev?, off?}`); `view = gm ? "game" : tab` drives the body, and all chrome (top bar, menu, panels, settings, colour picker, tabs) is wrapped in `!gm`. It's a **conditional render inside `MatchTracker`, not a fixed overlay** (see UI decisions). Entering closes any open editors (the raw-mutation rule).
- Everything reuses the live-entry machinery — `addLive`/`liveLine` took an optional `team` param (defaults to `lvTeam`, old panel unaffected); wall-clock minutes as ever. Phase gating: pre/HT show only Start half; in play, team buttons + Sub/HT/FT; after FT, an undo hint. Opposition events and our corners append straight from the event stage; our player events go to the who-grid.
- The toast banner stays rendered in game mode. A never-saved match shows an `mt-warn` row with its own Save button, because auto-save needs the first explicit Save and the top bar is hidden.
- Bottom "last entry + ↩ Undo" row is `position:sticky; bottom:0` (`.gm-undo`) — the sticky pattern the scoreboard already proves out; `margin-top:auto` in the `.mt-game` flex column pins it when stage content is short.

### New-match wizard (v36)

- "New" (⋯ menu) opens a full-screen wizard in the same takeover slot as game mode (`nw` state; chrome wraps are `!(gm || nw)`; the scoreboard also hides — it would show the previous match): **Date (default now) → Your team → Opponent**. Both team steps offer big kit-coloured buttons mined from `cache` (`prevTeams`: distinct myTeam+label combos / opposition names, header line parsed via `parseMatch`, most recent first); picking applies name, colours, and sport (your team's sport wins; an opponent's only fills a gap). Skip gives the blank template; Cancel touches nothing (state only mutates in `finishNew`, which is guarded by `creatingRef` against a double-tap minting two matches).
- `finishNew` builds the record locally (not `recordPayload()` — stale state) and saves to Supabase immediately, so auto-save is live from creation.
- New matches (wizard and blank) no longer seed a clock line — every match starts at phase "pre" and Start half opens H1 at throw-in.

### Share image

- `buildInfographicSVG(model)` (`lib/infographic.ts`) builds a portrait (~420px wide) SVG poster: header with two-colour club flags, 2×2 stats, step chart, scorers, lineup pitch, timeline, footer.
- `buildScoreCardSVG(model)` (`lib/infographic.ts`) builds a compact landscape (1200×630) SVG score card for OG images — team names, score, grade, result only, no player names.
- **Browser rasterization** (`lib/svg-to-png.client.ts`): data-URL image → canvas → `toDataURL`/`toBlob`. Keep the data-URL approach — blob URLs hit CSP/canvas-taint issues. The panel displays the PNG so long-press-to-save works on iOS; "Save / Share" uses Web Share when available, else downloads; SVG download is the fallback.
- **Server rasterization** (OG route, `app/m/[id]/opengraph-image.tsx`): `@resvg/resvg-js` with bundled LiberationSans fonts. `next.config.mjs` marks `@resvg/resvg-js` as an external server package and traces the `assets/` directory for the OG route.
- The infographic uses **Arial** (reliable browser rasterization); the app uses Bebas Neue (display numbers) and Oswald (everything else) via CSS variables. **Oswald is the `.mt-root` base font** — don't add per-element serif fonts; bare elements inheriting the base is the intended behaviour.

### UI decisions worth keeping

- Share/Backup are **inline panels** under the top bar, with the top-bar buttons acting as toggles — a fixed overlay didn't receive taps in mobile webviews.
- `ScoreChart` is a dependency-free inline-SVG component (step lines, gridlines, HT marker, goal dots); don't reintroduce a chart library.

## Known limitations / next steps

- `MatchTracker.tsx` carries `// @ts-nocheck` and has not been decomposed into smaller typed components; that's a future phase.
- **No server-side auth middleware.** `@supabase/supabase-js`'s `ws` dependency references `__dirname`, which crashes Vercel's Edge runtime. The browser client's auto-refresh keeps the session cookie current; server-side proactive token refresh is intentionally absent.
- Sign-in + Supabase save/load works in regular real-game use; the rarer recovery paths (network errors on save, session expiry edge cases) remain only opportunistically tested.
- Possible additions: PWA manifest + service-worker offline cache.
