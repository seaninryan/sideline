# Here We Go

A personal match tracker for GAA (hurling/football) and soccer. Type match notes in a simple handwritten-style notation and get a scoreboard, running-score chart, scorers table, timeline, lineup pitch, and a shareable infographic image.

**Live app:** https://sideline-theta.vercel.app/

## How it works

- **Next.js 14 App Router + TypeScript**, deployed on Vercel.
- **Your data lives in your own Supabase project** — a Postgres table (`matches`) protected by Row-Level Security. Only your account can read or write your rows. The public anon key in the app is the intended security boundary; RLS enforces it.
- **Sign-in** uses Google OAuth via Supabase Auth. Any Google account can sign in; there is no allow-list.

See [SETUP.md](SETUP.md) for the Supabase + Google OAuth + Vercel setup (~25 minutes).

## Notation format

The first line is a header: `<grade/label> @ <Opp>` (`@` = away, `v`/`vs` = home). Then a roster block (one formation row per line, players split on `|`; `Subs` / `Missing:` headers switch section). A clock time (`HH:MM`) starts a half; scoring lines use just the wall-clock minute.

```
U13A Hurling @ Wildebeests
            1 Birdperson
2.Jerry S | 3. Beth S | 4. Summer
10.Morty | 11. Rick | 12. Noob Noob

Subs
17. Pencilvester

18:21
23 Rick free 0 0-2
25 T11 0-1 0-3
30 Rick goal 0-1 - 1-3
43 HT

18:50
03 rick goal 1-5 - 2-5
Sleepy Gary for zeep
```

- **Scoring line:** `min scorer [free|goal] [written running score]`. `T`/`T11` = opposition scorer; roster names = your players; team name (e.g. `Racoons`) = your team, unattributed.
- **Subs:** `X for Y`. Anything else non-numeric is a note.
- Also understood: cards (`23 Morty yellow card`, `70 T red`), corners (`31 corner`, `44 T corner`), own goals (`30 Rick own goal`), set-piece points (`'65` hurling / `'45` football), misses & stoppages as notes (`10 Jack miss pen`, `46 Water Break`), and added time (`32 HT +6`, or a standalone `+6` after the marker).
- If most scoring lines carry a written running score, it's treated as the source of truth (goal vs point inferred from the score jump). Without written scores (live entry) it counts goal/point keywords.

## Features

- Tabs: **Overview** (scoreboard, stat cards, score-progression chart, top scorers), **Timeline**, **Lineup** (formation pitch), **Notation / Live** (quick-add buttons for live entry, plus the notation as tappable blocks — edit a line with a minute stepper and it re-sorts into place, delete with a confirming second tap, insert a score/sub/card/corner/note after any line via guided forms; the raw text stays one tap away behind "Edit as text").
- Per-match settings: date, team names, club colours, home/away, scoring mode (Auto/GAA/Goals-only).
- Saved matches (Supabase-backed), with New / Save / Duplicate / Delete.
- **Backup / Import** as JSON.
- **Share match**: publish a read-only public link (`/m/<id>`) with an OG score-card preview image. Choose full names, initials, or no names (for youth matches).
- **Game mode**: full-screen live entry wizard — tap to record scores, subs, and cards without typing.

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
npm test       # Vitest (143 tests)
npm run build  # production build check
```

Add `http://localhost:3000/auth/callback` to your Supabase project's redirect URL allowlist so the Google OAuth flow works locally (see SETUP.md step 5).

## Repo structure

```
app/          Next.js routes and layouts
lib/          Pure typed logic: parser, raw-edit, infographic, store, …
components/   React components (MatchTracker, ScoreChart, ShareWizard, …)
test/         Vitest suites
assets/       LiberationSans fonts (for server-side OG image rendering)
tools/        make-icon.py (icon regeneration only)
```
