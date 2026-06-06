# Game mode (live-entry takeover) — design

**Date:** 2026-06-07
**Status:** Approved

## What

A "game mode" for as-it-happens entry, aimed at mobile use during a match: the
screen shows only the scoreboard and large buttons for the next entry. A staged
wizard (Team → Event → Player) replaces the current all-at-once live-entry
panel while game mode is on; everything else (top bar, tabs, notation list) is
hidden until you exit.

## Why

The current "Add as it happens" panel shares the Notation tab with the full
block list, so on a phone the buttons are small and the next action competes
with everything else on screen. During a live game the user wants exactly two
things: the score, and the buttons for the next entry.

## Implementation approach

**Conditional render inside `MatchTracker`** — a new `gameMode` boolean. When
on, `MatchTracker` renders the stripped game-mode layout *instead of* the
normal top bar / tabs / body, in normal document flow.

Not a fixed overlay: this codebase already learned that fixed overlays don't
receive taps in mobile webviews (the reason Share/Backup are inline panels).

No parser changes. Game mode reuses the existing live-entry machinery:
`buildEventLine`, `addLive`, `liveLine`, `whoGrid` (or a large-size variant),
`liveEvents` filtering, `evEnabled`/`phase` gating, `undoTarget`/`doUndo`, and
the wall-clock minute convention. Auto-save, dirty tracking, and token
keep-alive all keep working because the underlying state is unchanged.

Turning game mode on closes any open block/insert/lineup editors — the same
rule as every other raw-mutation path.

## Screen layout (top to bottom)

1. **Slim header** — ✕ exit button + the `savedMsg` toast ("Added …",
   "Auto-saved ✓"), plus the existing auth banners (amber "Stay signed in",
   red "Reconnect & save"). Matches outlast the ~1h token, so these must stay
   reachable in game mode.
2. **Scoreboard** — the existing `mt-board` (score, totals, kit colours).
3. **Wizard** — fills the remaining screen, large buttons.
4. **Pinned bottom row** — last entry + ↩ Undo (e.g. `Last: 23 Rick free ↩`).

## Wizard stages

### Stage 1 — Who?

- Two huge kit-coloured team buttons (us / them), enabled only while a half is
  in play (`phase === "play"`).
- Phase-gated match controls below:
  - `pre` / `ht`: a big **Start half** button and nothing else.
  - `play`: smaller **HT** / **FT** buttons, plus a **Sub** button.
  - `over`: "match over" note + Undo + exit.

### Stage 2 — What?

Large grid of all sport-relevant events — the same `liveEvents` list/filtering
as today (Goal, Point, Goal·free, Point·free, '65/'45, Own goal, Yellow, Red,
Corner; GAA-only events hidden in goals mode, '65/'45 by sport).

- **Them** + any event → appended immediately (`23 T corner`, `70 T red
  card`), back to stage 1.
- **Us** + corner → appended immediately.
- **Us** + player event → stage 3.
- ← Back returns to stage 1.

### Stage 3 — Which player?

The who-grid (formation rows + subs + Unknown) at large size. Tap → line
appended with the wall-clock minute, back to stage 1. ← Back returns to
stage 2.

### Sub flow (from stage 1's Sub button)

"Who goes off?" grid → "Who comes on?" grid → appends `min On for Off`
(wall-clock minute), back to stage 1. Mirrors the Lineup tab's
tap-off/tap-on flow.

## Out of scope (deliberate)

Free-text notes (water breaks etc.), minute editing, and notation viewing —
exit game mode for those. Everything game mode adds is a normal notation line,
fixable afterwards; same philosophy as live entry today.

## Testing

- `node tools/run-tests.js` must stay green (no parser changes expected).
- JSX syntax check via the esbuild command in CLAUDE.md.
- Bump `APP_VERSION`; tell the user which version to look for on the deployed
  page.
- Manual: wizard flow on mobile (phase gating, them/us paths, sub flow, undo,
  exit restores the Notation tab as it was).
