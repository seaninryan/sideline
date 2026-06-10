# Here We Go

A personal match tracker for GAA (hurling/football) and soccer. Record a match as a simple event timeline and get a scoreboard, running-score chart, scorers tables (both teams), timeline, lineup pitch, and a shareable infographic image.

**Live app:** https://herewego.ie

## How it works

- **Next.js 14 App Router + TypeScript**, deployed on Vercel.
- **Your data lives in your own Supabase project** — Postgres tables (`matches`, `teams`) protected by Row-Level Security. Only your account can write your rows; public matches are readable by anyone. The public anon key in the app is the intended boundary; RLS enforces it.
- **Sign-in** uses Google OAuth via Supabase Auth. Any Google account can sign in; there is no allow-list.

See [SETUP.md](SETUP.md) for the Supabase + Google OAuth + Vercel setup.

## Model

- **Teams are first-class records** (the `teams` table), identified by **(sport, name)** — so `hurling/Spuds` and `football/Spuds` are distinct teams. Each team has kit colours and a structured roster (formation + players).
- **A match links two teams** (home/away) and holds a per-match **roster snapshot** for each side (seeded from the team, editable per game — numbers/positions/names can change match to match).
- **The notation is an event-only timeline** — no header or roster lives in the text any more; those are fields on the match/teams.

## Notation format

A clock time (`HH:MM`) starts a half; scoring/event lines then use just the wall-clock minute. Each event's "who" resolves in order: **a player name** (matched across either team's roster) → **`<Team> <number>`** → **`<Team>`** (a team-level/unattributed event).

```
18:21
23 Rick free
25 Wildebeests 11
30 Rick goal
33 Morty
43 HT
18:50
53 Rick goal
55 Wildebeests goal
64 Racoons
66 FT
```

- **Scoring line:** `min <who> [goal|free|'65|'45]`. A bare line is a point; `goal` (or a 3-point jump) is a goal; `free` flags a free; `'65`/`'45` is a set-piece point.
- **Subs:** `X for Y` (optionally minuted, e.g. `43 Rick for Morty`). Anything else non-numeric is a note.
- Also understood: cards (`23 Morty yellow card`, `61 Wildebeests 7 red`), corners (team-qualified: `31 Racoons corner` / `44 Wildebeests corner`), own goals (`30 Rick own goal`), misses & stoppages as notes (`10 Jack miss pen`, `46 Water Break`), and added time (`32 HT +6`, or a standalone `+6` after the marker).
- **Totals are counted from the tagged events** for each team — there is no written-running-score machinery.

## Features

- **List-first home:** your matches (Both / Personal / Public filter) above a global "Recent public matches" feed. Each match has one canonical URL `/m/<code>` (owner sees the editor, everyone else a read-only public page).
- **Editor tabs:** **Details** (scoreboard, stat cards, score-progression chart, both teams' scorers, timeline), **Lineup** (formation pitch; swap / renumber / rename players per match), **Game mode** (full-screen live entry — tap to record scores/subs/cards for either team), **Advanced** (the notation as tappable blocks, or raw text).
- **Teams** (`/teams`): create and edit teams with tap-to-name rosters; click a team for its fixtures. A public team page lives at `/t/<code>`.
- **New-match wizard:** pick or create both teams (type-ahead, scoped by sport), set date and home/away; the match is created already linked with both rosters seeded.
- **Share:** publish a read-only public link with an OG score-card preview image; choose full names, initials, or no names (for youth matches). A portrait infographic poster can be saved/shared as an image.
- Per-match colours; auto-save (with a Resync) — no manual Save button.

## Local development

```bash
nvm use 20
npm install
```

Copy `.env.local.example` to `.env.local` (or create it) and fill in your Supabase credentials:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

Then:

```bash
npm run dev    # → http://localhost:3000
npm test       # Vitest (197 tests)
npm run build  # production build check
```

Add `http://localhost:3000/auth/callback` to your Supabase project's redirect URL allowlist so the Google OAuth flow works locally (see SETUP.md).

## Repo structure

```
app/          Next.js routes and layouts (/, /m/[id], /teams, /t/[id], OG image route)
lib/          Pure typed logic: parse-events (engine) + parser (adapter), model,
              match-list, name-display, team-store, team-link, infographic, store, …
components/   React components (MatchTracker, Landing, TeamPicker, PublicMatch, …)
test/         Vitest suites
assets/       LiberationSans fonts (for server-side OG image rendering)
tools/        make-icon.py (icon regeneration only)
```

See [CLAUDE.md](CLAUDE.md) for the detailed architecture notes.
