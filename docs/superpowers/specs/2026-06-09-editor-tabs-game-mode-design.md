# Editor Tabs & Game-Mode-First — Design

**Date:** 2026-06-09
**Status:** Approved (design)
**Sub-project:** ② of a 5-part restructure (see ①'s spec for the full set)

## Context

Builds on ① (app shell & navigation), which is merged to `main`. This sub-project reshapes the **inside of the editor**: the tab set, making Game mode a tab instead of a full-screen takeover, and a restyled score header shared with the public page. All changes are within `components/MatchTracker.tsx` (the `// @ts-nocheck` monolith), `components/PublicMatch.tsx`, `app/globals.css`, and one new shared component.

## Goal

Make live entry **game-mode-first** and the editor **consistent with the public page**: a finished or in-progress match opens on the right tab, Game mode is an always-navigable tab showing only valid actions, and the score header looks identical in the editor and on the shared page.

## Non-goals (this sub-project)

- No change to the parser, the match data model, or the "us/them" internals (→ ③). The score header uses a neutral *home/away* presentation that's already derivable today (`header.homeAway`), but the underlying model is unchanged.
- No change to the new-match wizard beyond what ① already did (→ ④).
- No change to the **rasterised infographic poster or OG card** result wording — they keep "Win/Defeat/Draw" for now and are revisited in ③.
- No change to Lineup.

---

## 1. Tabs & default tab

The tab bar becomes, in order: **Details · Lineup · Game mode · Advanced**.

- **Renames:** "Overview" → **Details**; "Notation / Live" → **Advanced**. The standalone **"Timeline"** tab is **removed** (its content moves into Details and Game mode).
- **Default tab** is chosen when a match is opened (in the boot/`doLoad` path), from match phase:
  - phase `over` (a FT marker exists) → **Details**
  - otherwise (`pre` / `ht` / `play`) → **Game mode**
- The default is applied **only on open**, not on every phase change. Tapping FT during a session does **not** force a tab switch — the user stays in Game mode (which then shows its completed state) and navigates to Details themselves.
- ①'s create paths (`finishNew`/`doNew`) currently set `setTab("notation")`; they change to set the phase-appropriate default (a new match is `pre` → **Game mode**).

## 2. Tab content

### Details (was Overview)
Unchanged Overview content — warnings banner, stats grid, score chart, "Top scorers" + opposition scorers tables — **plus the timeline appended at the bottom** (the exact rendering currently in the standalone Timeline tab). The timeline rendering is factored so it can appear in both Details and Game mode without duplication.

### Lineup
Unchanged.

### Game mode (now a tab, not a takeover)
- The `gm` full-screen takeover is dismantled. Game mode renders as a **normal tab body** inside the persistent chrome (AppHeader + score header + tab bar all remain visible). It is reached/left like any tab, so navigation to Details/Lineup/Advanced is always available (this is the "be able to navigate to lineup, details etc." requirement).
- Keeps the **staged big-button flow** (model A): `team → event → who`; the sub flow (`subOff → subOn`); phase-gated controls. Big tap targets, one decision per screen.
- **Only valid options per phase:**
  - `pre` / `ht` → only **Start half**.
  - `play` → the two team buttons + **Sub / HT / FT**, then the staged event/who screens.
  - `over` (full time) → **only** `↩ Undo last entry` plus a message: "Full time — match closed. Edit it in the Advanced tab." (Undoing the FT line reopens play, as today.)
- The **running timeline shows beneath the controls** (same factored timeline rendering as Details).
- The game-mode-only **"Not saved yet" Save button** is removed — in the routed editor every match is already saved (① invariant), so `curId` is always set.

### Advanced (was Notation / Live)
- The **raw notation editor** only: the block list + "Edit as text" textarea + insert/edit/lineup block flows (all unchanged).
- The **"Add as it happens" manual live-entry panel is removed** (team toggle + event grid + inline who-grid). Game mode is the single live-entry surface. The `lvTeam`/`lvEvent` state and that panel's JSX are deleted; the shared helpers it used (`addLive`, `whoGrid`, `liveEvents`, `evEnabled`, `buildEventLine`) stay — Game mode and the block-insert forms still use them.

## 3. Shared, restyled ScoreHeader

A new presentational component **`components/ScoreHeader.tsx`** renders the score header for **both** the editor (persistent, above the tab bar) and the public page (replacing `PublicMatch`'s inline `pm-head`). One source → guaranteed consistency.

**Props (all explicit, no data fetching):** `homeName, awayName: string`; `homeStr, awayStr: string` (display scores, e.g. "1-08" / "3"); `homeColors, awayColors: [string,string]`; `grade, dateStr: string`; `homeAway: "home"|"away"|""`; `homeTotal, awayTotal: number` (in the scoring unit, for the margin); `phase: "pre"|"ht"|"play"|"over"`.

**Layout** (mirrors the public `pm-head`): meta line (grade · Home/Away · date) → a row of two team columns (kit-colour flag, name, big score) with the result indicator between/under them.

**Result indicator (replaces the Win/Defeat/Draw pill on both HTML surfaces):**
- `homeTotal === awayTotal` → **"Tie"**, centred between the scores.
- otherwise a pill **under the leading team's score**: **"Leading by N"** when `phase !== "over"`, **"Won by N"** when `phase === "over"`, where `N = |homeTotal − awayTotal|`.
- Margin unit is whatever the scores are in — points for GAA, goals for soccer (the caller passes totals already in that unit, e.g. `gpTotal`).

**Callers:**
- *Editor:* computes props from live `parsed`/state (`usName`/`themName` → home/away via `header.homeAway`, `totals.*.str`, `gpTotal` totals, colours, `phase`) and renders `<ScoreHeader>` where `mt-board` is today.
- *PublicMatch:* computes props from `model` and renders `<ScoreHeader>` in place of `pm-head` (the topline/flags/score/result block). The rest of PublicMatch (stats, chart, scorers, lineup, timeline, footer) is unchanged.

The old `mt-board` markup in the editor and the `pm-head` markup in PublicMatch are removed in favour of `ScoreHeader`. New CSS for `ScoreHeader` is added to `globals.css` (reusing the public page's visual language).

## 4. State / architecture changes in MatchTracker

- Remove the `gm` takeover concept: Game mode is `tab === "game"`. The staged-stage object that was `gm` becomes a `gmStage` state (e.g. `{stage, team?, ev?, off?}` or `null`), reset when leaving the tab / on match switch. The chrome no longer hides for game mode — only the new-match wizard (`nw`) remains a takeover, so chrome guards become `!nw` (from `!(gm || nw)`), and `view = nw ? "new" : tab`.
- `enterGame`/`exitGame` collapse into "switch to/away from the game tab" + resetting `gmStage`.
- Default-tab-on-open logic added to the boot/`doLoad` path and the create paths.
- Timeline rendering extracted to a small local render (or sub-component) reused by Details and Game mode.

## 5. Testing

- No parser/model change → the canonical `SAMPLE` invariants and all existing lib tests stand unchanged.
- New testable seam: a pure **`scoreHeaderResult({homeTotal, awayTotal, phase})`** helper returning `{ kind: "lead"|"won"|"tie", side?: "home"|"away", margin: number }` (or the leader/margin/wording inputs) — unit-tested in `lib/` (e.g. extend `lib/match-list.ts` or a small `lib/score-header.ts`). `ScoreHeader` itself (presentational) is build-verified, consistent with the repo's "logic tested, UI build-verified" pattern.
- `APP_VERSION` bump (→ v47) on deploy.

## 6. Risks / watch-items

- **Dismantling the `gm` takeover** is the largest edit in the `@ts-nocheck` monolith — the chrome guards, `view` computation, and every `gm.stage`/`enterGame`/`exitGame` reference must be reworked surgically. Done carefully, snippet-by-snippet.
- **Shared ScoreHeader touches PublicMatch** — verify the public page still renders identically apart from the new neutral result indicator.
- **Default-tab logic must not fight the user** — apply only on open, never mid-session, to avoid yanking them off a tab they chose.
- **Removing the Advanced live panel** must not break the block-insert forms that share `whoGrid`/`buildEventLine`/`liveEvents` — keep those helpers.
