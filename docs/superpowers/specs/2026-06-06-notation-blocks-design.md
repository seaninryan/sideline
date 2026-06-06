# Notation blocks — design

2026-06-06. Approved via brainstorming session (visual companion mockups in `.superpowers/brainstorm/`, not committed).

## Goal

Replace the raw-notation textarea in the Notation tab with a list of tappable **blocks** — one per event line — so a line can be edited, deleted, or have a new line inserted after it without thumb-editing a wall of text on a phone. The raw notation text stays the storage format and the single source of truth; blocks are a view that rewrites it. Motivated by a real match: undo worked well for a disallowed score, but editing/inserting mid-match still means caret-surgery in the textarea.

## Decisions (user-approved)

1. **Blocks are a view over `raw`** (approach A). No block model is persisted; every render derives blocks from `raw.split("\n")` plus the existing parse. Undo, dirty-tracking, auto-save, Drive sync are untouched — they only see `raw`.
2. **Blocks default, text behind a toggle.** An "Edit as text" button swaps the block list for today's textarea (with the format reminder) and back. Live-entry panel stays above, unchanged.
3. **Editor style B:** tap a block → it expands in place to a **−/+ minute stepper** (big touch targets, wraps 0–59) + a free-text input for the rest of the line, with OK / Cancel / + Insert after / Delete.
4. **Insert = type chooser first**, then a small guided form per type (Score / Sub / Card / Corner / Note) built from the live-entry buttons (team toggle, event buttons, player grid), a minute stepper pre-filled from the anchor block, and a **live preview of the exact notation line** before OK.
5. **Lineup block expands to a mini textarea** holding the preamble (header + formation rows + Subs + Missing) with OK/Cancel. Structured lineup edits stay in the Lineup tab.

## Block list

- **Lineup block** — one collapsed block for all lines before the first clock line (`rosterEnd` boundary), captioned with counts ("15 starting · 2 subs · 1 missing").
- **One block per non-empty event line, in file order.** Type pill and side colour come from the parse (see `srcLine` below): half-start (`18:21` / bare minute), score (us/them, shows the running score), note, sub, card, corner, HT/FT marker, `+N` added time. A line with no parse entry is a plain note block — every line gets a block, nothing is hidden.
- Blank lines render nothing and are preserved verbatim.

## Edit semantics

- One editor open at a time; opening another block, starting an insert, a live-entry append, or Resync cancels/closes it (the line index would go stale).
- **OK** rewrites the line. If the leading minute changed, the line is spliced out and re-inserted **within its own half segment**, ordered by elapsed time (minute − half start, +60 wrap, exactly as the parser computes it). Equal elapsed → lands after the existing ones. Moving to a different half is out of scope: delete + re-insert, or Edit as text.
- **Minute-less lines** (legacy notes, `Rick for Morty`, standalone `+6`): no stepper, text box only, position held. Typing a leading minute into the text is allowed; the line stays put on that OK (it becomes a minuted line where it sits, and re-sorts on a later minute edit).
- **Half-start, HT/FT, `+N` blocks**: text-box-only editor, never re-sorted — they are the boundaries re-sorting works within.
- **Delete** requires a confirming second tap (same pattern as the match Delete button, v31), then removes the line.
- A block edit can't corrupt anything the textarea couldn't: unparseable text becomes a note; suspicious written-score order still trips the existing "score drops" reconciliation warning.

## Insert semantics

- "+ Insert after" on a block → chooser (Score / Sub / Card / Corner / Note) → guided form:
  - **Score** — minute + team toggle + event buttons + player grid (us) or straight to line (them). The event set is filtered exactly as live entry filters `LIVE_EVENTS`: soccer shows Goal / Own goal; GAA adds Point / Free / Goal (free) and '65 or '45 per sport.
  - **Sub** — minute + tap on/off from subs row and pitch grid, either order (Lineup-tab flow) → `43 Pencilvester for Morty`.
  - **Card** — minute + yellow/red + player grid or opposition → `23 Morty yellow card`.
  - **Corner** — minute + us/them → `31 corner` / `44 T corner`.
  - **Note** — optional minute + free text.
- Every form previews the exact notation line before OK.
- **Placement:** the anchor block picks the half and the default minute; the chosen minute then places the line within that half by the same elapsed-order rule as editing.

## Implementation

### Parser (pure, harness-testable)

- `parseMatch` records **`srcLine`** — the index into `raw.split("\n")` — on every scoring entry, note, and halfMark. This is the only parser change; existing outputs must be byte-identical (canonical SAMPLE expectations in CLAUDE.md unchanged).
- Three new pure helpers beside `swapRosterNums` / `renumRoster`, exported via `tools/parser-harness.js`:
  - `replaceEventLine(raw, idx, newLine)` — rewrite + conditional re-sort as above; marker lines never move.
  - `deleteEventLine(raw, idx)`.
  - `insertEventLine(raw, afterIdx, newLine)` — placement by minute within the anchor's half.

### UI (in `MatchTracker`, single-file app as ever)

- `NotationBlocks` rendering section behind a `notaView: "blocks" | "text"` state (blocks default). Editor state `{lineIdx, minute, rest}`; insert state `{afterIdx, type, …form fields}`.
- `liveLine` refactored to take an explicit minute (live entry passes the wall clock as today) so the insert forms reuse the same line builders, player grid (`liveRows`), and team toggle.
- Undo button stays as-is.

### Testing & deploy

- Harness tests: `srcLine` mapping (incl. blank lines and the preamble offset); `replaceEventLine` minute change, hour wrap, ties, minute-less line, marker immovable; `deleteEventLine`; `insertEventLine` placement incl. anchor = half-start block. SAMPLE regression must pass untouched.
- esbuild JSX syntax check; `APP_VERSION` → v33; push and verify on the phone ("look for v33").

## Out of scope

- Drag-to-reorder blocks; moving a block across halves with the stepper; editing the header line in blocks (Setup panel owns it); any change to the stored notation format; chart library or build tooling.
