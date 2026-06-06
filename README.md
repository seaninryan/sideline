# Sideline

A personal match tracker for GAA (hurling/football) and soccer. Type match notes in a simple handwritten-style notation and get a scoreboard, running-score chart, scorers table, timeline, lineup pitch, and a shareable infographic image.

**Live app:** https://seaninryan.github.io/sideline/

## How it works

- **No server.** The whole app is one static file (`index.html`) served by GitHub Pages: React 18 + Babel standalone loaded from CDN, all app code in a single `<script type="text/babel">` block.
- **Your data lives in your own Google Drive**, in a hidden app-data file (`sideline.json` in the Drive `appDataFolder`). The page itself contains no data and no secrets, so it's fine that it's public.
- **Sign-in** uses Google Identity Services with the `drive.appdata` scope — the app can only touch its own hidden folder, never the rest of your Drive. The OAuth consent screen is kept in Testing mode with named test users, so only those accounts can sign in.

See [SETUP.md](SETUP.md) for the full Google Cloud + GitHub Pages setup (~20 minutes).

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
- Saved matches (Drive-backed), with New / Save / Duplicate / Delete.
- **Backup / Import** as JSON.
- **Share image**: a portrait infographic PNG (Web Share on mobile, download elsewhere).
