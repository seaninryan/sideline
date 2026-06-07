# New-match wizard — design

**Date:** 2026-06-07
**Status:** Approved

## What

A full-screen, big-button wizard for creating a match, replacing the bare
template that "New" seeds today: Date (default now) → Your team → Opponent.
Both team steps look up previously used teams from saved matches and carry
their colours and sport across. Finishing saves the match to Drive immediately
and lands on the Notation tab.

## Why

Creating a match on a phone today means tapping "New" and then fiddling with
the small settings-strip inputs (team, opponent, sport, four colour swatches).
All of that information already exists in previously saved matches. The wizard
turns it into three taps, in the same big-button style as game mode.

## Implementation approach

Same pattern as game mode: a `nw` state object in `MatchTracker`
(null = off; `{stage, date, team?, label?, opp?, homeAway?, ...}` = on),
rendered as a **conditional render in normal flow, not a fixed overlay**
(fixed overlays don't receive taps in mobile webviews — CLAUDE.md).

- The six chrome wraps added for game mode change from `!gm` to
  `!(gm || nw)`.
- The scoreboard (`mt-board`) additionally hides during the wizard
  (`{!nw && …}`) — it would show the *previous* match's score. It stays
  visible in game mode as before.
- The body renders the wizard when `nw` is set (extend the `view` switch:
  `gm ? "game" : nw ? "new" : tab`).
- The wizard content sits inside `<div className="mt-game">` to inherit the
  game-mode big-button CSS; a few wizard-specific rules are added.
- Toast and auth banners stay visible (consistent with game mode).

Nothing mutates app state until the final step — Cancel is just
`setNw(null)`.

## Previous-team lookup

Mined from `cache` when the wizard opens (or via `useMemo` keyed on `saved`,
like `usedColors`). For each record, parse just the header line —
`parseMatch((d.raw || "").split("\n")[0], {})` — which is cheap and reuses
the canonical header logic.

- **Your team** entries: distinct (squashed-lowercase) `myTeam` + header
  label combos; each carries `{myTeam, label, colorUs, colorUs2, sport}`.
  Most recent record wins per combo; list ordered most recent first.
- **Opponent** entries: distinct opposition names; each carries
  `{name, colorThem, colorThem2, sport}`. Most recent first.
- Recency = the same `dateKey(date, savedAt)` ordering the match list uses.

## Stages

### Stage 1 — When?

Date + time inputs (native pickers, enlarged via CSS), defaulted to now.
Big **Next →** button. Also: **Skip — blank match** (runs the old `doNew`
path) and ✕ Cancel in the header row.

### Stage 2 — Your team?

One big button per previous team combo: sport emoji + team name + grade
label, kit-coloured (primary background, 3px secondary border,
`contrastOn` text). Tap applies name, label, both us-colours, and sport,
then advances. Below the list, a **New team** path: two text inputs (team
name, grade/label — label optional, falls back to team name) + Next.
Colours/sport for a brand-new team stay at current values, editable in the
settings strip afterwards.

### Stage 3 — Against?

- **Home v / Away @** toggle as two big buttons (away preselected,
  matching today's default).
- One big button per previous opponent, in their colours. Tap applies their
  colours — and sport **only if stage 2 didn't supply one** (your team's
  code wins) — then finishes.
- Below: a text input + Create button for a new opponent (no colours
  applied; defaults remain).
- ← Back returns to stage 2.

## Finish

`finishNew` builds the record **locally** — not via `recordPayload()`, which
would read stale state mid-update:

- `raw` = `<label> <@|v> <opponent>` header + `1 ` roster-stub line.
  **No clock line** — the match starts at phase "pre"; Start half (game mode
  or live panel) opens the half at throw-in.
- Saves immediately: `store.set("m" + Date.now(), record)`, then applies all
  editor state (`setRaw`, `setMyTeam`, colours, `setSport`, `setMatchDate`),
  `setCurId(id)`, `refreshList()`, closes the wizard, `setTab("notation")`.
  Auto-save is live from the first second; game mode's "not saved" warning
  never appears for wizard-created matches.
- Save failure (`store.set` returns false / throws): keep the editor state
  applied but `setCurId(null)` and show the existing "NOT saved to Drive!"
  toast — the user is exactly where a manual New + edits would leave them.

## Behaviour change (deliberate)

The **blank/skip path drops the auto clock line too**: `doNew` seeds only the
header + roster stub, so every new match starts at phase "pre" with Start
half waiting. The old behaviour pre-started a half at creation time, which
was wrong whenever the match was set up more than a minute before throw-in.

## Out of scope

- Colour/sport editing inside the wizard (settings strip already does it).
- Editing the roster inside the wizard (Lineup block on the Notation tab).
- Any merge/dedupe UI for near-duplicate team names — exact squashed-name
  matching only.

## Testing

- `node tools/run-tests.js` stays green (no parser changes).
- esbuild JSX syntax check.
- Bump `APP_VERSION` to v36; tell the user which version to look for.
- Manual (deployed): New → wizard (date defaults to now, previous teams
  appear with colours/sport, opponent lookup, home/away), finish creates a
  saved match on the Notation tab at phase "pre"; Skip gives the blank
  template; Cancel leaves the open match untouched.
