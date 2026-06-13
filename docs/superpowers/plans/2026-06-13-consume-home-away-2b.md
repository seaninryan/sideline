# Consume home/away — editor read-only display (③.2b) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Flip the editor's **read-only display** (score header, the Details tab's stats/chart/scorers/timeline, the game-mode timeline) to read home/away values, while keeping the editor's us/them **edit state** and interactive surfaces unchanged.

**Architecture:** `MatchTracker.tsx` already computes `usIsHome`/`homeSeries`/`timelineHA`/`homeColor`/`awayColor` (from ②). This adds the remaining home/away **display** vars (`homeName`/`awayName`/`homeColor2`/`awayColor2`/`homeScorers`/`awayScorers`/`homeSquadV`/`awaySquadV`/`maxLeadVenue`), each defined as *exactly* the inline `usIsHome ? … : …` expression it replaces (so substitution is provably behaviour-preserving), then swaps those inline expressions in the read-only render for the vars. The us/them edit state, the colour picker, the game-mode entry buttons, the interactive lineup tab, and the notation block pills are deliberately untouched.

**Tech Stack:** TypeScript/React. `MatchTracker.tsx` carries `// @ts-nocheck` (so `tsc` won't type-check this file — the safety argument is provable-equivalence substitution + the full suite staying green + manual verification). Node 20 — prefix commands with `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH`. Dev server is live; **never `npm run build`** — use `npx tsc --noEmit`.

**Spec:** `docs/superpowers/specs/2026-06-13-consume-home-away-design.md` (Section 5).

**Branch:** `consume-home-away-2b` (off `consume-home-away` / PR #20).

---

## Deviation from spec §5 (intentional, flagged at plan time)

Spec §5 listed the editor's lineup pitches and the `lineupBadges` collapse (to home/away only) as part of ③.2b. **Investigation shows the editor lineup tab is an interactive EDIT surface** — per-team `editLineup` buttons, `tapPlayer`/`subPick` substitution wiring, and `RosterPitch` editing — with display and edit deeply entangled (the same JSX renders the jersey *and* wires the sub tap). Flipping its display alone while keeping us/them edit handlers would be awkward and is redone wholesale by ③.3 (the symmetric-editor rework). So:

- **③.2b flips only the read-only editor display** (score header, Details tab, game-mode timeline).
- **The interactive lineup tab + game-mode entry buttons stay us/them → ③.3.**
- **`lineupBadges` stays dual-keyed** (its editor caller — the lineup pitch — still passes `"us"|"them"`); the collapse to home/away-only moves to **③.3**, when the editor lineup is rebuilt. (Harmless: the dual key is explicitly transitional.)

This keeps ③.2b small, safe, and provably behaviour-preserving.

## File Structure

- `components/MatchTracker.tsx` — add home/away display vars; swap inline us/them in the read-only render; import `sideToVenue`.
- `lib/constants.ts` — `APP_VERSION` bump.

No tests change (the editor has no unit tests; it's `@ts-nocheck`). Verification = `tsc --noEmit` clean (other files), full suite green, and manual parity check.

---

## Task 1: Add home/away display vars + flip the editor's read-only render

**Files:**
- Modify: `components/MatchTracker.tsx`
- Modify: `lib/constants.ts`

- [ ] **Step 1: Import `sideToVenue`**

In `components/MatchTracker.tsx`, change the home-away import (line ~44):
```ts
import { venueSeries, venueItems } from "@/lib/home-away";
```
to:
```ts
import { venueSeries, venueItems, sideToVenue } from "@/lib/home-away";
```

- [ ] **Step 2: Add the home/away display vars**

In `components/MatchTracker.tsx`, find the existing block (around lines 646–650):
```ts
  const usIsHome = homeAway === "home";
  const homeSeries = venueSeries(series, usIsHome);
  const timelineHA = venueItems(timeline, usIsHome);
  const homeColor = usIsHome ? colorUs : colorThem;
  const awayColor = usIsHome ? colorThem : colorUs;
```
Immediately after the `const awayColor = …` line, add:
```ts
  // home/away display vars (③.2b) — each is exactly the inline us/them expression it
  // replaces in the read-only render. The us/them EDIT state stays (→ ③.3/③.4).
  const homeName = usIsHome ? usName : themName;
  const awayName = usIsHome ? themName : usName;
  const homeColor2 = usIsHome ? colorUs2 : colorThem2;
  const awayColor2 = usIsHome ? colorThem2 : colorUs2;
  const homeScorers = usIsHome ? usScorers : themScorers;
  const awayScorers = usIsHome ? themScorers : usScorers;
  const homeSquadV = usIsHome ? usSquad : oppSquad;
  const awaySquadV = usIsHome ? oppSquad : usSquad;
  const maxLeadVenue = sideToVenue(parsed.maxLeadSide, homeAway);
```
(`usName`/`themName` are defined at ~212–213, `usScorers`/`themScorers` at ~644–645, `usSquad`/`oppSquad` at ~203–204 — all before this point, so the vars resolve.)

- [ ] **Step 3: Flip the score-header IIFE (lines ~891–914)**

Replace the whole `{!nw && (() => { … })()}` score-header IIFE with:
```tsx
      {!nw && (() => {
        const homeT = usIsHome ? totals.us : totals.them;
        const awayT = usIsHome ? totals.them : totals.us;
        return (
          <ScoreHeader
            homeName={homeName}
            awayName={awayName}
            homeStr={homeT.str}
            awayStr={awayT.str}
            homeColors={[homeColor, homeColor2]}
            awayColors={[awayColor, awayColor2]}
            grade={header.label || sportLabel || ""}
            dateStr={matchDate ? fmtDateDow(matchDate) : ""}
            homeTotal={gpTotal(homeT.g, homeT.p, effMode)}
            awayTotal={gpTotal(awayT.g, awayT.p, effMode)}
            phase={phase}
            live={phase === "play" || phase === "ht"}
            homeSquad={homeSquadV}
            awaySquad={awaySquadV}
            action={<button className="sh-edit" onClick={() => { setShowDetails((o) => !o); if (showDetails) setColorPick(null); }}>{showDetails ? "▾ Hide" : "✎ Edit"}</button>}
          />
        );
      })()}
```
(`homeT`/`awayT` read the editor's own parsed `totals.us`/`totals.them` — parser data, resolved in ③.4 — analogous to `homeSeries` reading `series`. The identity props now read the home/away vars.)

- [ ] **Step 4: Flip the game-mode Timeline (line ~1177)**

Replace:
```tsx
            <Timeline timeline={timelineHA} halfMarks={halfMarks} colorHome={usIsHome ? colorUs : colorThem} colorHome2={usIsHome ? colorUs2 : colorThem2} colorAway={usIsHome ? colorThem : colorUs} colorAway2={usIsHome ? colorThem2 : colorUs2} nameHome={usIsHome ? usName : themName} nameAway={usIsHome ? themName : usName} />
```
with:
```tsx
            <Timeline timeline={timelineHA} halfMarks={halfMarks} colorHome={homeColor} colorHome2={homeColor2} colorAway={awayColor} colorAway2={awayColor2} nameHome={homeName} nameAway={awayName} />
```

- [ ] **Step 5: Flip the Details-tab stats biggest-lead (line ~1193)**

Replace:
```tsx
              { k: `Biggest lead${parsed.maxLeadSide ? " · " + (parsed.maxLeadSide === "us" ? usName : themName) : ""}`, v: parsed.maxLead },
```
with:
```tsx
              { k: `Biggest lead${maxLeadVenue ? " · " + (maxLeadVenue === "home" ? homeName : awayName) : ""}`, v: parsed.maxLead },
```

- [ ] **Step 6: Flip the Details-tab Scorers (line ~1202)**

Replace:
```tsx
            <Scorers home={usIsHome ? usScorers : themScorers} away={usIsHome ? themScorers : usScorers} colorHome={usIsHome ? colorUs : colorThem} colorHome2={usIsHome ? colorUs2 : colorThem2} colorAway={usIsHome ? colorThem : colorUs} colorAway2={usIsHome ? colorThem2 : colorUs2} mode={effMode} />
```
with:
```tsx
            <Scorers home={homeScorers} away={awayScorers} colorHome={homeColor} colorHome2={homeColor2} colorAway={awayColor} colorAway2={awayColor2} mode={effMode} />
```

- [ ] **Step 7: Flip the Details-tab Timeline (line ~1205)**

Replace:
```tsx
            <Timeline timeline={timelineHA} halfMarks={halfMarks} colorHome={usIsHome ? colorUs : colorThem} colorHome2={usIsHome ? colorUs2 : colorThem2} colorAway={usIsHome ? colorThem : colorUs} colorAway2={usIsHome ? colorThem2 : colorUs2} nameHome={usIsHome ? usName : themName} nameAway={usIsHome ? themName : usName} />
```
with:
```tsx
            <Timeline timeline={timelineHA} halfMarks={halfMarks} colorHome={homeColor} colorHome2={homeColor2} colorAway={awayColor} colorAway2={awayColor2} nameHome={homeName} nameAway={awayName} />
```

- [ ] **Step 8: Bump APP_VERSION**

In `lib/constants.ts`: `export const APP_VERSION = "v81";`

- [ ] **Step 9: Verify**

Run `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npx tsc --noEmit` (clean — note `MatchTracker.tsx` is `@ts-nocheck`, so this only checks the rest), then `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test` (expect 338 green — no test touches the editor, so this confirms no collateral breakage in shared modules).

Then a **read-only render grep** to confirm the targeted spots were flipped (these specific patterns should be gone from the *display* — the lineup tab, game-mode entry buttons, and ScoreHeader-action are allowed to retain us/them):
```
grep -n "usIsHome ? colorUs\|usIsHome ? usName\|usIsHome ? usScorers\|usIsHome ? usSquad\|maxLeadSide === \"us\"\|usIsHome ? totals" components/MatchTracker.tsx
```
Expected: only matches inside the **new var definitions** (Step 2) and the score-header IIFE's `homeT`/`awayT` (Step 3) remain; the five render sites (Steps 3–7) no longer contain the inline `usIsHome ? colorUs`/`usIsHome ? usName`/`usIsHome ? usScorers`/`maxLeadSide === "us"` patterns. (The game-mode team buttons at ~1137–1138 and lineup tab at ~1229–1302 legitimately still read `colorUs`/`usName`/`subArrows(n,"us")` — those are edit controls / interactive lineup, deferred to ③.3.)

- [ ] **Step 10: Commit**

```bash
git add components/MatchTracker.tsx lib/constants.ts
git commit -m "refactor(editor): read-only display reads home/away vars; bump v81 (③.2b)"
```

---

## Manual verification (after the task; human or reviewer)

Open the editor on an **away** match (e.g. SAMPLE — Racoons away) and a **home** match, and confirm parity with before:
- Score header: home-left/away-right, correct names/colours/score/squad/result.
- Details tab: stats biggest-lead names the right team; chart, scorers table, and timeline all home-left/away-right.
- Game mode: the running timeline reads home/away correctly.
- (Unchanged, still us/them by design: the lineup tab pitches, game-mode team/who/sub buttons, the Details edit panel + colour picker.)

## Scope / what stays us/them after ③.2b (→ ③.3 / ③.4)

- Editor **edit state** (`colorUs`/`myTeam`/`usRoster`/`usSquad` + the details edit panel + colour picker keyed us/us2/them/them2).
- **Game-mode entry** (`pickGmTeam("us"/"them")`, team/who/sub buttons + labels).
- The **interactive lineup tab** (per-team `editLineup`, `tapPlayer`/`subPick`, `subArrows`/`scoreFor` calls with `"us"|"them"`).
- **Notation block pills** (`b.e.side === "us"`, `b.e.usScore`) — read parser output directly (us/them is parser-side → ③.4).
- **`lineupBadges` dual key** — collapses to home/away-only in ③.3 with the editor lineup.

## Self-review (spec coverage)

- §5 read-only editor display (ScoreHeader, Details stats/chart/scorers/timeline, game-mode timeline) → Task 1, Steps 3–7.
- §5 lineup pitches + `lineupBadges` collapse → **deferred to ③.3** (deviation flagged above; lineup tab is interactive/edit-entangled).
- `ScoreChart` (Details ~1198) already reads `homeSeries`/`homeColor`/`awayColor` (② / earlier) — no change needed.
