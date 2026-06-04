# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Sideline — a personal match tracker for GAA (hurling/football) and soccer that parses handwritten-style match notation into a scoreboard, running-score chart, scorers table, timeline, lineup, and a shareable infographic image. The sample data uses fictional teams/players (Racoons v Wildebeests, Rick & Morty names) — keep it that way; no real player or club names in the repo.

## Repository layout

- **`index.html`** — the entire app, one file. React 18 + ReactDOM + Babel standalone + Google Identity Services loaded from CDN; all app code in a single `<script type="text/babel">` block. No build step, no package.json.
- **`SETUP.md`** — end-user setup guide (Google Cloud OAuth + GitHub Pages).
- **`icon-180.png`** — app icon (favicon + `apple-touch-icon`): flat soccer ball on pitch green. Don't edit by hand — regenerate with `python3 tools/make-icon.py` (needs PIL).
- **`tools/`** — dev-only helpers, not served: `make-icon.py`, `parser-harness.js` (extracts the pure parser from `index.html` for node), `run-tests.js` (parser regression tests).

The app was originally a Claude artifact (`match-tracker.jsx`, persisted via the chat's `window.storage`, charted with recharts) converted by a script into this standalone. Neither the jsx nor the script is in the repo — **`index.html` is the source of truth; edit it directly.**

## Commands

There is no build/test toolchain. After editing, syntax-check the JSX (needs Node 18+, `nvm use 18`):

```bash
sed -n '/<script type="text\/babel"/,/<\/script>/p' index.html | sed '1d;$d' > /tmp/sideline-app.jsx
npx esbuild /tmp/sideline-app.jsx --loader:.jsx=jsx --outfile=/dev/null
```

Parser tests: `node tools/run-tests.js` (extracts the pure functions from `index.html` via `tools/parser-harness.js`). Run after any parser change. The canonical sample (`SAMPLE` with `{myTeam: "Racoons"}`) must give: final Racoons 2-6, Wildebeests 2-7 (Loss), Rick 2-4 (4 frees), Morty 0-1, leadChanges 1, timesLevel 3, maxLead 6 (us), 0 warnings.

**Deploy:** push to `main`; GitHub Pages serves `index.html` at https://seaninryan.github.io/sideline/. Google sign-in only works from the authorized JS origin (`https://seaninryan.github.io`), so the Drive flow can only be exercised on the deployed page, not from a local server.

**Versioning:** `APP_VERSION` (top of the babel script) is shown beside the SIDELINE logo so the user can spot a stale cached page — Pages serves with `max-age=600`, so a deploy can take ~10 min + a hard refresh to appear. Bump it (v2 → v3 → …) in every change that will be deployed, and tell the user which version to look for.

## Architecture

Order of code inside the babel script: Drive store + auth preamble → `buildInfographicSVG` / `svgToPng` (share image) → `parseMatch` (parser) → `SAMPLE` → `MatchTracker` (main UI) → `ScoreChart` → `SignIn` / `App` → render.

### Auth + storage (no server)

- GitHub Pages serves the static page; the "backend" is the user's own Google Drive. The page holds no data and no secrets.
- **Auth:** GIS token client (`google.accounts.oauth2.initTokenClient`), scope `https://www.googleapis.com/auth/drive.appdata`. Token flow uses authorized JS origins — no redirect URIs. Access tokens last ~1 hour.
- **Token lifecycle:** the GIS `callback`/`error_callback` just resolve the pending `requestToken()` promise — all flows (`signIn`, `reauth`) await that. The token + expiry (60s safety margin) is kept in `sessionStorage` (`sideline_tok`), so a refresh within the hour resumes without a sign-in click; tab close clears it. On a 401 during save, `saveWithRetry` calls `reauth()` (`prompt: ""`) and retries once; if that fails (e.g. popup blocked outside a user gesture) it fires `onAuthExpired`, which `MatchTracker` surfaces as a red "session expired — Reconnect & save" banner whose button (a real click, so the popup is allowed) re-auths and re-pushes `cache` via `driveSave`.
- `CLIENT_ID` is public, not secret. Gotcha: it must end in a **single** `.apps.googleusercontent.com` — a doubled suffix (placeholder + pasted ID) once caused `Error 401: invalid_client`.
- **"Only me" lock:** the OAuth consent screen ("Google Auth Platform" in the new console) stays in **External / Testing** with only the owner's account as a test user, so only that account can sign in. Expect the "Google hasn't verified this app" → Advanced → proceed screen.
- **Storage:** one hidden file `sideline.json` in the Drive `appDataFolder`, holding `{ "<id>": <matchRecord>, ... }`. Kept in an in-memory `cache`; the whole object is rewritten to Drive on every change.
- **`store` API** (same method shapes the original artifact's `window.storage` wrapper had): `store.list()` → `["match:<id>", ...]`; `store.get(id)`; `store.set(id, data)` → bool; `store.del(id)` → bool.
- Drive REST via `dfetch` (fetch + `Authorization: Bearer`); a 401 throws an error with `.code = 401`. `driveSave` also throws on any non-ok response (with `.code = status`) so `store.set`/`store.del` never report success for a failed write.
- `App`/`SignIn` poll until GIS loads, init the token client, and only render `<MatchTracker/>` after a successful token + `driveLoad()`.

### Parser (`parseMatch`) — pure JS

Input is plain text:

- **Header (first line):** `<grade/label> @ <Opp>`; `@` = away, `v`/`vs` = home.
- **Roster block** (before the first clock line): each line is a formation row, players split on `|` (e.g. `10. Morty | 11. Rick`). `Subs` / `Missing:` headers switch role. Formation rows are preserved exactly as written (supports 13-a-side etc.).
- **Halves:** an `HH:MM` line starts a half; scoring lines then use just the wall-clock minute (wraps past the hour). A bare minute-only line also starts a new half when HT is omitted; a bare `HT`/`FT` line is a half marker.
- **Scoring line:** `min scorer [free|goal] [written-score]`. Opposition scorer = `T`/`T11`; roster names = us; an unrostered name → opposition; team name (matched against settings `myTeam`) → us, unattributed.
- **Subs:** `X for Y`. Any other non-numeric line is a note.

Key decisions (preserve these when modifying):

- **Sport detection:** explicit sport in the header wins (`soccer` → goals; `hurl/camog/gaelic/gaa/football` → GAA); then score shape — any line with **two** score tokens (`0-2 1-3`) is GAA, while hyphen scores that only appear **one per line** (`2-1` = whole scoreboard) are a soccer running score (unless `point`/`pt` appears); else any internal hyphen → GAA; else goals-only.
- **Misses are notes:** a minute line with no written score and a miss keyword (`miss/missed/wide/saved/blocked/short`) is a note, not a score (`10 Jack miss pen`). With a written score attached, the written score still rules.
- **Subs can carry a minute:** `43 Rick for Morty` (or `43 12 Rick for 6 Morty`) parses as a sub at 43', not a score. The lineup tab generates these (tap player → pick replacement). Sub notes resolve `onNum`/`offNum` against the roster for lineup styling.
- **Added time:** halves run in multiples of 5, so an HT/FT line with a minute deduces added time (`elapsed % 5`) shown as a ⏱ `+N added` timeline entry. Override in notation with `32 HT +6` or a standalone `+6` line after the marker (`+0` suppresses it).
- **Written score is source of truth:** if ≥ half the scoring lines carry a written running score, totals/chart come from the written cumulative score. Two tokens = GAA (one per team); in goals mode a **single** `a-b` token is the whole home-away scoreboard (`writtenCols`). Goal vs point is inferred from the score jump (a 3-point jump with no "goal" word = a goal). A column-vote on "sure" rows (rostered name or `T`) decides which written column is "us" — this handles home/away order automatically. Without written scores (live entry) it falls back to keyword goal/point counting. A reconciliation warning fires only when a written score *drops* (likely typo).
- **Stats computed:** leadChanges, timesLevel, maxLead/maxLeadSide, half-time score, chart series, goalDots, htLine.

### Share image

- `buildInfographicSVG(model)` builds a portrait (~420px wide) SVG poster: header with two-colour club flags, 2×2 stats, step chart, scorers, lineup pitch, timeline, footer.
- `svgToPng` rasterizes via a **data-URL** image → canvas → `toDataURL`/`toBlob`. Keep the data-URL approach — blob URLs hit CSP/canvas-taint issues. The panel displays the PNG so long-press-to-save works on iOS; "Save / Share" uses Web Share when available, else downloads; SVG download is the fallback.
- The infographic uses **Arial** (reliable rasterization); the app chrome uses Bebas Neue / Oswald / Newsreader via injected CSS.

### UI decisions worth keeping

- Share/Backup are **inline panels** under the top bar, with the top-bar buttons acting as toggles — a fixed overlay didn't receive taps in mobile webviews.
- `ScoreChart` is a dependency-free inline-SVG component (step lines, gridlines, HT marker, goal dots); don't reintroduce a chart library.

## Known limitations / next steps

- Sign-in is still needed after the token expires (~1h) or when the tab is closed — full multi-day persistence would need the authorization-code flow + a backend, which this app deliberately doesn't have.
- The live sign-in + Drive read/write flow has not yet been verified end-to-end on the deployed page — including the new 401-retry/reconnect-banner and sessionStorage-resume paths.
- Possible additions: visible "Signed in as / Sign out" affordance; PWA manifest + icon; service-worker offline cache.
