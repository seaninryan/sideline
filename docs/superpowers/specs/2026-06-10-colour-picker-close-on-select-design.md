# Colour Picker — Close on Selection — Design

**Date:** 2026-06-10
**Status:** Approved (design)
**Sub-project:** ⑤ (final, smallest) of the 2026-06 restructure.

## Context

The editor's colour picker (`MatchTracker.tsx`, the `colorPick` inline panel) lets you set each team's primary/secondary kit colour from a "Used before" row, a "Palette" row, and an "Advanced — exact colour" native `<input type="color">`. Tapping a preset swatch applies the colour but leaves the panel open; you must tap **Done** to dismiss. The ask: a preset swatch should apply **and close** in one tap.

## Design

- Tapping a **preset swatch** (Used-before or Palette — both rendered by the `sw(c)` helper) applies the colour **and closes the panel** (`setVal(c); setColorPick(null);`).
- The **Advanced exact-colour** `<input type="color">` is unchanged — it keeps `onChange={setVal}` (no close), because the native picker fires continuously while dragging and snapping the panel shut mid-drag would be unusable.
- The **Done** button stays as the dismiss for the Advanced path and as a general close.

That's the whole change — one handler in the `sw` helper. No data, model, or test surface is affected (the picker is presentational state in the `@ts-nocheck` `MatchTracker`).

## Non-goals

- No change to the palette, the Advanced input, the swatch styling, or where colours are stored.
- No change to the new-match wizard's colour handling (that's ④).

## Testing

No unit-testable pure logic is added. Verification is `npx tsc --noEmit` + `npm run build` + a manual tap check (tap a palette swatch → colour applies and the panel closes; the Advanced input still lets you drag with Done to dismiss). `APP_VERSION` → v52.
