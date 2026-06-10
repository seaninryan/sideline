# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Here We Go — a personal match tracker for GAA (hurling/football) and soccer that parses handwritten-style match notation into a scoreboard, running-score chart, scorers table, timeline, lineup, and a shareable infographic image. The sample data uses fictional teams/players (Racoons v Wildebeests, Rick & Morty names) — keep it that way; no real player or club names in the repo.

## Repository layout

- **`app/`** — Next.js 14 App Router pages and route handlers:
  - `layout.tsx` — root layout; loads Oswald + Bebas Neue via `next/font`, applies CSS variables `--font-oswald` / `--font-bebas`.
  - `page.tsx` — `/` server component: reads the session via `getUser()` and renders `<Landing>` (the match list) for everyone, signed in or out.
  - `globals.css` — all app styles (ported from the old single-file `<style>` block; fonts use `var(--font-oswald)` / `var(--font-bebas)`).
  - `auth/callback/route.ts` — OAuth code-exchange handler; exchanges the code for a session cookie and redirects to `/`.
  - `m/[id]/page.tsx` — **dual-mode** match page (SSR): fetches the row through RLS (no `is_public` filter) and branches via `resolveMatchView` — owner → `<EditorApp initialId>` (the editor), public non-owner → `<PublicMatch>` read-only (with `applyNameDisplay`), else 404. The `new` sentinel (`/m/new`) renders `<EditorApp wizard>` (the create flow), redirecting to `/` if signed out.
  - `m/[id]/opengraph-image.tsx` — OG score-card PNG (1200×630) rendered server-side via `@resvg/resvg-js` + `buildScoreCardSVG`.
- **`lib/`** — pure, typed, unit-tested logic:
  - `parse-events.ts` — `parseEvents` (the event-only two-team engine) + `resolveWho`.
  - `parser.ts` — `parseMatch` (thin adapter over `parseEvents`, mapping A/B → us/them).
  - `raw-edit.ts` — roster + event-line helpers (`replaceEventLine`, `deleteEventLine`, `insertEventLine`, `placeEventLineByMinute`).
  - `infographic.ts` — `buildInfographicSVG` (full portrait poster) + `buildScoreCardSVG` (compact OG card).
  - `model.ts` — `buildModel`: rebuilds the infographic/page model from a stored record; used server-side by `/m/[id]`.
  - `name-display.ts` — `applyNameDisplay` / `redactName`: full / initials / none player-name redaction for public pages.
  - `match-list.ts` — `matchRowView` (home/away ordering, score strings, winner side, sport emoji, kit colours) + `relativeDate`; powers the landing list rows.
  - `match-view.ts` — `resolveMatchView`: the editor / public / 404 decision for the dual-mode `/m/[id]` page.
  - `store.ts` — `store` / `loadAll` / `cache` (browser-backed; same `list/get/set/del` surface as always); derives the promoted columns including `name_display` on every `store.set`.
  - `supabase/client.ts` — `@supabase/ssr` browser client.
  - `supabase/server.ts` — `@supabase/ssr` server client (reads cookies; used in Server Components and route handlers).
  - `constants.ts` — `APP_VERSION`, `PALETTE`, `LIVE_EVENTS`, `SPORTS`.
  - `types.ts`, `util.ts`, `sample.ts` (the fictional `SAMPLE`), `svg-to-png.client.ts` (browser canvas rasterizer).
- **`components/`**:
  - `MatchTracker.tsx` — the main editor (ported whole, carries `// @ts-nocheck`). Boots from a route `initialId` (or `wizard` for `/m/new`); the old match dropdown and ⋯ overflow menu were removed. To be decomposed/typed in a later phase.
  - `AppHeader.tsx` — the persistent header used on every screen (brand→`/`, optional back link + New, a context-specific action slot, and an email→Sign out account menu / Sign in). Reuses the editor's `mt-*` classes.
  - `Landing.tsx` — the `/` match list: your matches (Both/Personal/Public privacy filter) + a global "Recent public matches" infinite-scroll feed; rows are `<MatchRow>`.
  - `MatchRow.tsx` — one list row built from `matchRowView`; winner emphasis (loser dimmed, draw neutral), kit-colour flags, date, public/private indicator.
  - `ShareSheet.tsx` — contextual owner Share panel in the editor (private → publish + name-display; public → copy link / change name privacy / unshare) plus a "share as image" entry. Supersedes `ShareWizard.tsx` (kept in the repo, now unused).
  - `ScoreChart.tsx`, `MinuteStep.tsx` — chart and minute-stepper sub-components.
  - `SignIn.tsx` — presentational sign-in screen (still used as a standalone; sign-in is otherwise triggered inline from `AppHeader`).
  - `SignInGate.tsx` — client sign-in wrapper (now unused — sign-in is handled inline by `Landing`/`AppHeader`/`PublicMatch`).
  - `EditorApp.tsx` — client bootstrap: runs `loadAll()` then renders `<MatchTracker initialId wizard>`.
  - `PublicMatch.tsx` — read-only public match render; carries the `<AppHeader>` with a visitor Share (copy link + share-as-image built client-side from the model).
  - `ShareWizard.tsx` — legacy publish wizard, superseded by `ShareSheet` (unused; retained for reference).
- **`test/`** — Vitest suites (189 tests total, across all files): `parse-events.test.ts` (the event-only parser behavioural suite), `migrate-notation.test.ts` (legacy→event-only migration + header/roster lift), `team-roster.test.ts`, `util.test.ts`, `raw-edit.test.ts`, `model.test.ts` (canonical `SAMPLE_RECORD` finals), `name-display.test.ts`, `score-card.test.ts`, `score-header.test.ts`, `brand.test.ts`, `match-list.test.ts`, `match-view.test.ts`, `short-code.test.ts`, `team-link.test.ts`, `team-templates.test.ts`, `smoke.test.ts`.
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
npm test         # Vitest (189 tests)
```

After any parser change, run `npm test` and confirm the canonical `SAMPLE_RECORD` (event-only `raw` + structured Racoons/Wildebeests rosters) produces: final Racoons 2-6, Wildebeests 2-7 (Loss), Rick 2-4 (4 frees), Morty 0-1, leadChanges 1, timesLevel 3, maxLead 5 (us), 0 warnings. The finals are asserted in `test/model.test.ts` (via `SAMPLE_RECORD`); the parser's per-behaviour coverage lives in `test/parse-events.test.ts`. Totals are **counted from the tagged events** — there is no written-score/column-vote machinery any more.

**Deploy:** push to the production branch `main` (Vercel's Production Branch; cutover from `supabase-migration` is complete); Vercel auto-builds with `@vercel/next`.

**Versioning:** `APP_VERSION` (in `lib/constants.ts`) is shown in the footer at the bottom of the app (`Here We Go · vN`). Bump it on every change that will be deployed, and tell the user which version to look for. Current: **v50**.

## Architecture

### Module layout

`lib/` — pure logic, all typed, all tested. `components/` — React components. `app/` — Next.js routing + server-side data fetching. The main editor (`MatchTracker`) is the largest component and still carries `// @ts-nocheck`; the surrounding modules are fully typed.

### App shell & navigation (v46, sub-project ① of a 5-part restructure)

The app is **list-first**. `/` renders `<Landing>`: signed-in users see "Your matches" (a Both/Personal/Public privacy filter over their own rows, queried `.eq("owner", userId)`) above a **global** "Recent public matches" feed (`is_public=true`, `.neq("owner", userId)`, offset-paginated with an IntersectionObserver for infinite scroll); signed-out users see only the feed. Each match has **one canonical URL, `/m/[id]`**, made dual-mode (see the `m/[id]/page.tsx` entry above): the owner gets the editor, everyone else the read-only page, and `/m/new` opens the create wizard. Creating a match (`finishNew`/`doNew`) saves it immediately then `router.replace`s to its URL — because that's a same-route param transition, the editor is **not** remounted, so both paths set `curId` + local state directly. One **`<AppHeader>`** frames every screen (only its action cluster changes); Share is a single standard-share-glyph icon opening `<ShareSheet>` (owner) or a copy-link/share-image panel (`PublicMatch`). Sub-projects ②–⑤ (editor tabs/game-mode-first, home/away model, wizard polish, colour-picker) build on this skeleton — see `docs/superpowers/specs/`. Pure seams `matchRowView` (`lib/match-list.ts`) and `resolveMatchView` (`lib/match-view.ts`) are unit-tested.

### Auth + storage

- The backend is a **Supabase** project (Postgres + Auth). Env vars `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are the only secrets needed — both are public (safe behind RLS).
- **Auth:** Supabase Google OAuth via `@supabase/ssr`. Flow: `SignInGate` (browser) calls `signInWithOAuth({provider:"google", options:{redirectTo: location.origin+"/auth/callback"}})` → `/auth/callback` route handler exchanges the code and sets session cookies → `app/page.tsx` (server component) reads the session via `getUser()`. **There is intentionally NO middleware.** The `@supabase/supabase-js` realtime/`ws` dependency references Node's `__dirname`, which crashes Vercel's Edge runtime; middleware would run there. Server-side token refresh is therefore omitted — the browser client's auto-refresh keeps the session cookie fresh instead.
- **Sign-up policy:** open — any Google account can sign in. RLS isolates each user's rows. Sign out lives in the header account menu (email ▾ → Sign out).
- **Storage:** a `matches` table, row per match. Columns: `id uuid pk`, `owner uuid (default auth.uid())`, `is_public bool default false`, `short_code text unique`, `name_display text default 'full'`, `match_date timestamptz`, `my_team text`, `opponent text`, `sport text`, `data jsonb`, `updated_at timestamptz`. `data jsonb` holds the full match record and is the source of truth; the promoted columns (`match_date`, `my_team`, `opponent`, `sport`, `name_display`) are derived on every `store.set`. RLS: `own_all` policy (`owner = auth.uid()`) + `public_read` policy (`is_public = true`). The public page and OG route read only `is_public=true` rows and apply `name_display` redaction.
- **Short links (`short_code`).** Public matches are shared as `herewego.ie/m/<short_code>` — a 6-char code from an unambiguous alphabet (`lib/short-code.ts`), generated once on publish in `ShareSheet.ensureShortCode` (idempotent: an `is null` guard never clobbers an existing code; retries on the unique-index clash; falls back to the full UUID if the column is absent or after repeated collisions). Routing (`/m/[id]` page + OG route) resolves the `[id]` segment by `short_code` when it isn't a UUID and by `id` when it is, so legacy full-UUID links keep working. `store.set` does **not** touch `short_code`, so auto-save can't clobber it. **Schema migration (run once in Supabase):** `alter table matches add column if not exists short_code text; create unique index if not exists matches_short_code_key on matches (short_code);`
- **Auto-save & sync:** every match is saved on creation (so it always has a `/m/<uuid>` home), then auto-saves 2.5s after each change (`dirty` compares editor state to `cache[curId]`). The header **Resync** icon re-pulls via `loadAll()` (for edits made on another device) and reloads the open match, confirming first if local changes would be lost. Last-write-wins — there is no merge. (The old explicit Save button + match dropdown were removed; the never-saved-match Save button in game mode is now an inert safety net since `curId` is always set in a routed editor.)
- **`store` API** (`lib/store.ts`): `store.list()` → `["match:<id>", ...]`; `store.get(id)`; `store.set(id, data)` → bool; `store.del(id)` → bool. `store.set` does a single-row upsert; `store.del` a single-row delete. `MatchTracker` uses this surface unchanged.

### Public match page + OG image

- `/m/[id]` (`app/m/[id]/page.tsx`) — server-rendered read-only view. Fetches only rows where `is_public=true`, runs `buildModel` then `applyNameDisplay`, renders `<PublicMatch>`. `PublicMatch` is a full **poster-style responsive page** (mirrors `buildInfographicSVG` as real HTML, reusing the `<ScoreChart>` component): brand header → score header (kit flags, result pill) → 2×2 stats → chart → scorers → lineup pitch (flat starters list when a match has no formation rows) → centre-rail timeline → brand footer with a clickable `herewego.ie` link.
- `/m/[id]/opengraph-image` (`app/m/[id]/opengraph-image.tsx`) — Next.js OG image route. Renders `buildScoreCardSVG` (compact score card, no player names) via `@resvg/resvg-js` using the bundled LiberationSans fonts. Returns a 1200×630 PNG with `Cache-Control: public, max-age=3600`. Note in the source: if `buildScoreCardSVG` ever adds player names, run `applyNameDisplay` before calling it.
- **Share wizard** (`components/ShareWizard.tsx`): name-display choice (full / initials / none) → confirm → sets `is_public=true` + `name_display` on the row → shows the `/m/<id>` URL + OG preview.
- **`name_display`** (`'full' | 'initials' | 'none'`, default `'full'`) replaces the old `hide_names bool`. `initials` renders first initials of each name part; `none` falls back to shirt number or "Player".
- **Shared brand lockup.** One source per idiom: `brandPillSVG(x,y,scale)` (`lib/infographic.ts`) draws the HWG pill for the two rasterised images (poster footer + OG card); `<BrandHeader>` (`components/BrandHeader.tsx`) is the HTML brand block (pill + wordmark + chant) used by `PublicMatch` and `SignIn`, linking home via `BRAND_HOME` (`/`). Brand strings (`BRAND_SITE`, `BRAND_SITE_URL`, `BRAND_WORDMARK`, `BRAND_CHANT`) live in `lib/constants.ts`. The brand-as-home link is on public surfaces only — the editor top bar keeps its own inline logo, unchanged.

### Parser — `lib/parse-events.ts` (engine) + `lib/parser.ts` (adapter)

**Event-only, two-team model.** `parseEvents(raw, { teamA, teamB, scoringMode? })` is the core engine; `lib/parser.ts` is a thin adapter mapping the two stable sides **A/B → us/them** for the legacy `ParsedMatch` shape. The notation is a pure event timeline — **no header line and no roster block** (those moved onto the match record + the two linked teams' structured rosters, `usRoster`/`oppRoster`). The header-lift / roster-lift out of legacy notation is handled by `migrateLegacyNotation` and covered by `test/migrate-notation.test.ts`.

Input is plain text (events only):

- **Halves:** an `HH:MM` line starts a half; scoring lines then use just the wall-clock minute (wraps past the hour). A bare minute-only line also starts a new half when HT is omitted; a bare `HT`/`FT` line is a half marker.
- **Scoring line:** `min <who> [goal|free|'65|'45|own goal|...] [optional score-token]`. The `<who>` resolves against **both** rosters (see resolution order below). A trailing score token is display sugar only — totals are **counted from the events**, never read from a written score.
- **Subs:** `min X for Y` (` for ` is the discriminator); a minute-less `X for Y` also works.
- **Notes:** any non-matching line, plus minuted miss/stoppage lines (below).

Key decisions (preserve these when modifying):

- **Who resolution (order):** (1) **player name** matched across **both** rosters (the matched player's team sets the side); (2) **`<Team> <number>`** → that team's player (name from its roster, else just the number); (3) **`<Team>`** alone → that team, **team-level/unattributed** event (counts for the team, credits no named scorer). A player-name match beats a team match. A bare name on **both** teams is **ambiguous** → `side:null`, not counted, emits a warning (add a team qualifier, e.g. `Wildebeests Rick`). An unknown token is **unresolved** → `side:null`, not counted, warns. Sides are **stable A/B**, independent of venue; the caller maps to us/them or home/away for display.
- **Sport / scoring mode is a setting**, not inferred from score shape — `settings.scoringMode` (`gaa`/`goals`) is passed in from the record. (`detectedMode` is still computed from score shape as a fallback when no mode is given, but the editor always passes one.)
- **Goal-vs-point inference:** the `goal` keyword (or goals mode) makes a goal; a bare scoring line is a point.
- **Name matching — exact beats fuzzy:** `findPlayer` scans a roster for an exact (squashed) full-name match before first-name shorthand — with "Cathal" and "Cathal N" both rostered, each reference resolves to its own entry regardless of roster order (affects subs, scorer credit, cards). First-name shorthand still works when unambiguous within a team.
- **Misses & stoppages are notes:** a minute line with no score token and a miss/stoppage keyword (`miss/missed/wide/saved/blocked/short/water`) is a note, not a score (`10 Jack miss pen`, `46 Water Break`).
- **Set-piece points:** `'65` (hurling) / `'45` (football) on a scoring line sets `setPiece` — a pill in the timeline, `('65)` in chart/infographic labels, not counted as a free. The apostrophe form is canonical (a **bare trailing** `65` peels as a score token instead); a bare `45`/`65` **mid-line** still flags.
- **Subs can carry a minute:** `43 Rick for Morty` parses as a sub at 43', not a score (even a bare-number `40 11 for 10`). Sub notes resolve `onNum`/`offNum` against the rosters for lineup styling — a `<number> <name>` ref like `17 Pencilvester` peels the leading shirt number and resolves the name (preferring the roster number).
- **Added time:** halves run in multiples of 5, so an HT/FT line with a minute deduces added time (`elapsed % 5`) shown as a ⏱ `+N added` timeline entry. Override in notation with `28 HT +6` or a standalone `+6` line after the marker (`+0` suppresses it).
- **Cards & corners:** `23 Morty yellow card` / `70 Wildebeests 7 red card` (the bare `red`/`yellow` form without `card` also works) are sided notes (type `card`, with roster `num` when matched). A **team-qualified** corner `31 Racoons corner` / `44 Wildebeests corner` is a sided `corner` note; a **bare** `corner` (no team) is a plain note.
- **Own goals:** `min who own goal` (or `og`) scores for the *other* side; the scorer entry reads "own goal (name)" and the scoring item carries `og`/`ogNum`. With the `goal` word it's an own goal; bare `og` with no `goal` word is an own **point**.
- **Stats computed (counted from the per-team cumulative series):** leadChanges, timesLevel, maxLead/maxLeadSide, chart series, goalDots (each carries its side), htLine.

### Notation blocks (Notation tab)

- The Notation tab renders the raw text as tappable blocks (one per event line). The notation is event-only now — the lineup is edited via the structured `usRoster` on the Lineup tab, not a preamble block. Blocks are a **view over `raw`** — no block model is stored; the old textarea lives behind the "Edit as text" toggle.
- Edits go through pure helpers in `lib/raw-edit.ts`: `replaceEventLine` / `deleteEventLine` / `insertEventLine` (+ shared `placeEventLineByMinute`). A line whose leading minute changes is re-placed within its own half ordered by elapsed minute (wall-clock wrap, ties land last, never crossing the half's HT/FT marker). Structure lines (clock, bare minute, HT/FT, `+N`) never move. `parseEvents` stamps `srcLine` (index into `raw.split("\n")`) on scoring/notes/halfMarks to classify blocks.
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

- `buildInfographicSVG(model)` (`lib/infographic.ts`) builds a portrait (~420px wide) SVG poster: a brand banner (`brandPillSVG` + wordmark + chant) across the top, then the match header with two-colour club flags, 2×2 stats, step chart, scorers, lineup pitch, timeline, and a brand footer (pill + wordmark + `herewego.ie` + chant).
- `buildScoreCardSVG(model)` (`lib/infographic.ts`) builds a compact landscape (1200×630) SVG score card for OG images — a brand banner across the top, then team names, score, grade, result, and `herewego.ie` at the bottom; no player names.
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
