# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Sideline — a personal match tracker for GAA (hurling/football) and soccer that parses handwritten-style match notation into a scoreboard, running-score chart, scorers table, timeline, lineup, and a shareable infographic image. The sample data uses fictional teams/players (Racoons v Wildebeests, Rick & Morty names) — keep it that way; no real player or club names in the repo.

## Repository layout

- **`index.html`** — the entire app, one file. React 18 + ReactDOM + Babel standalone + supabase-js v2 loaded from CDN; all app code in a single `<script type="text/babel">` block. No build step, no package.json.
- **`SETUP.md`** — end-user setup guide (Supabase + Google OAuth + GitHub Pages).
- **`icon-180.png`** / **`icon-touch-180.png`** — app icons: a green-pattern soccer ball, transparent for the favicon and on a pitch-green tile for `apple-touch-icon` (iOS blackens transparency). Don't edit by hand — regenerate both with `python3 tools/make-icon.py` (needs PIL). The top-bar logo SVG uses the same geometry/colours.
- **`tools/`** — dev-only helpers, not served: `make-icon.py`, `parser-harness.js` (extracts the pure parser + raw-edit helpers from `index.html` for node), `run-tests.js` (regression tests for both).

The app was originally a Claude artifact (`match-tracker.jsx`, persisted via the chat's `window.storage`, charted with recharts) converted by a script into this standalone. Neither the jsx nor the script is in the repo — **`index.html` is the source of truth; edit it directly.**

## Commands

There is no build/test toolchain. After editing, syntax-check the JSX (needs Node 18+, `nvm use 18`):

```bash
sed -n '/<script type="text\/babel"/,/<\/script>/p' index.html | sed '1d;$d' > /tmp/sideline-app.jsx
npx esbuild /tmp/sideline-app.jsx --loader:.jsx=jsx --outfile=/dev/null
```

Parser tests: `node tools/run-tests.js` (extracts the pure functions from `index.html` via `tools/parser-harness.js`). Run after any parser change. The canonical sample (`SAMPLE` with `{myTeam: "Racoons"}`) must give: final Racoons 2-6, Wildebeests 2-7 (Loss), Rick 2-4 (4 frees), Morty 0-1, leadChanges 1, timesLevel 3, maxLead 6 (us), 0 warnings.

**Deploy:** push to `main`; GitHub Pages serves `index.html` at https://seaninryan.github.io/sideline/. Supabase OAuth works from any allowlisted redirect URL — the deployed URL and `http://localhost:8000/` are both in Supabase's redirect allowlist, so local testing now works too.

**Versioning:** `APP_VERSION` (top of the babel script) is shown beside the SIDELINE logo so the user can spot a stale cached page — Pages serves with `max-age=600`, so a deploy can take ~10 min + a hard refresh to appear. Bump it (v2 → v3 → …) in every change that will be deployed, and tell the user which version to look for. Current: **v37**.

## Architecture

Order of code inside the babel script: Supabase store + auth preamble → `buildInfographicSVG` / `svgToPng` (share image) → `parseMatch` (parser) → pure raw-edit helpers (roster + event-line) → `SAMPLE` → CSS → `MinuteStep` → `MatchTracker` (main UI) → `ScoreChart` → `SignIn` / `App` → render.

### Auth + storage (no server)

- GitHub Pages serves the static page; the backend is a **Supabase** project (Postgres + Auth). The page holds only the public anon key (`SUPABASE_ANON_KEY`) — safe behind RLS; no secrets.
- **Auth:** Supabase Google OAuth via `sb.auth.signInWithOAuth({provider:"google", options:{redirectTo: location.href}})` — a full-page redirect. The session is persisted in `localStorage` by supabase-js and **auto-refreshed**, so there is no token-lifecycle/keep-alive/banner code. `App` calls `sb.auth.getSession()` on load and listens via `onAuthStateChange`; `<MatchTracker/>` renders only after a valid session + `loadAll()`.
- **Sign-up policy:** open — any Google account can sign in. RLS isolates each user's rows. A "Signed in as \<email\> · Sign out" item lives in the ⋯ overflow menu.
- **Storage:** a `matches` table, row per match. Columns: `id uuid pk`, `owner uuid (default auth.uid())`, `is_public bool default false`, `hide_names bool default false`, `match_date timestamptz`, `my_team text`, `opponent text`, `sport text`, `data jsonb`, `updated_at timestamptz`. `data jsonb` holds the full match record and is the source of truth; the promoted columns (`match_date`, `my_team`, `opponent`, `sport`) are derived on every `store.set` — `opponent` via `parseMatch`. RLS: `own_all` policy (`owner = auth.uid()`) + dormant `public_read` policy (`is_public = true`). `is_public`/`hide_names` are wired but dormant (future public sharing + youth name redaction).
- **Auto-save & sync:** matches auto-save 2.5s after the last change (`dirty` compares editor state to `cache[curId]`); a new match needs its first explicit Save. The dropdown and Save button show `*` when dirty. The ⋯ **Resync** button re-pulls via `loadAll()` (for edits made on another device) and reloads the open match, confirming first if local changes would be lost. Last-write-wins — there is no merge.
- **`store` API** (same method shapes the original artifact's `window.storage` wrapper had): `store.list()` → `["match:<id>", ...]`; `store.get(id)`; `store.set(id, data)` → bool; `store.del(id)` → bool. `store.set` does a single-row upsert; `store.del` a single-row delete; `loadAll()` replaces the old `driveLoad`. `MatchTracker` is untouched — the `store` surface is identical.
- `SUPABASE_URL` and `SUPABASE_ANON_KEY` are public constants near the top of the babel script. supabase-js v2 is loaded via `<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2">` (UMD), preserving the no-build single-file constraint.

### Parser (`parseMatch`) — pure JS

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
- Edits go through pure helpers beside the roster-edit helpers: `replaceEventLine` / `deleteEventLine` / `insertEventLine` (+ shared `placeEventLineByMinute`). A line whose leading minute changes is re-placed within its own half ordered by elapsed minute (wall-clock wrap, ties land last, never crossing the half's HT/FT marker). Structure lines (clock, bare minute, HT/FT, `+N`) never move. `parseMatch` stamps `srcLine` (index into `raw.split("\n")`) on scoring/notes/halfMarks to classify blocks.
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

- `buildInfographicSVG(model)` builds a portrait (~420px wide) SVG poster: header with two-colour club flags, 2×2 stats, step chart, scorers, lineup pitch, timeline, footer.
- `svgToPng` rasterizes via a **data-URL** image → canvas → `toDataURL`/`toBlob`. Keep the data-URL approach — blob URLs hit CSP/canvas-taint issues. The panel displays the PNG so long-press-to-save works on iOS; "Save / Share" uses Web Share when available, else downloads; SVG download is the fallback.
- The infographic uses **Arial** (reliable rasterization); the app uses Bebas Neue (display numbers) and Oswald (everything else) via injected CSS. **Oswald is the `.mt-root` base font** — don't add per-element serif fonts; bare elements inheriting the base is the intended behaviour.

### UI decisions worth keeping

- Share/Backup are **inline panels** under the top bar, with the top-bar buttons acting as toggles — a fixed overlay didn't receive taps in mobile webviews.
- `ScoreChart` is a dependency-free inline-SVG component (step lines, gridlines, HT marker, goal dots); don't reintroduce a chart library.

## Known limitations / next steps

- Sign-in + Supabase save/load is in regular real-game use and works; the rarer recovery paths (network errors on save, session expiry edge cases) remain only opportunistically tested.
- Supabase's auth-code refresh gives multi-day session persistence; a tab close and reopen resumes from `localStorage` without a re-sign-in prompt.
- Possible additions: PWA manifest + icon; service-worker offline cache.
