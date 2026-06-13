# Consume home/away — data layer + read-only surfaces (③.2a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `buildModel`'s read-only consumers (`PublicMatch`, the share/OG infographic) and `applyNameDisplay` consume a complete home/away view, then drop the model's us/them output keys — so the public/share surfaces carry no us/them.

**Architecture:** `buildModel` keeps its internal us/them→home/away bridge (it still feeds the us/them parser and maps dynamic data via `usIsHome` — that's removed in ③.4). ③.2a (1) adds the missing home/away model outputs (`homeRoster`/`awayRoster`/`maxLeadVenue`), (2) makes `lineupBadges` venue-aware (dual-keyed, transitional), (3) makes `applyNameDisplay` redact the home/away keys (fixing a latent ② privacy regression), (4) flips `PublicMatch` + `infographic` to read only home/away, then (5) drops the us/them model output keys. Each task keeps `npm test` + `tsc --noEmit` green.

**Tech Stack:** TypeScript, Next.js 14, React, Vitest. Node 20 — prefix every command with `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH`. A dev server is live and shares `.next` — **never run `npm run build`; type-check with `npx tsc --noEmit`.**

**Spec:** `docs/superpowers/specs/2026-06-13-consume-home-away-design.md`

**Branch:** `consume-home-away` (off `record-home-away` / PR #19).

---

## Deviations from the spec (intentional, flagged at plan time)

- **Spec §1 "source identity from `recordHomeAway`":** `buildModel` already derives `homeName`/`awayName`/`homeColors`/`awayColors`/`homeSquad`/`awaySquad` inline via `usIsHome`, with richer name fallbacks (`header.opposition`, `"My Team"`/`"Opposition"`) that `recordHomeAway` lacks. We keep that inline mapping (it is the internal bridge, removed in ③.4) and use `recordHomeAway` only for the **rosters** (no fallback concern). Net effect demanded by the spec — consumers read only home/away, us/them is internal — is met.
- **Spec §2 `matchRowView`:** it already emits a correct home/away `RowView`; its internal us/them reads are producer-side bridging (removed in ③.4), not a consumer leak, and routing through `recordHomeAway` would regress its name fallbacks for zero consumer benefit. **No change in ③.2a.**
- **New (not in spec, required):** fix the latent ② redaction bug — `applyNameDisplay` must redact the home/away keys the consumers now read (Task 3).

## File Structure

- `lib/lineup-badges.ts` — venue-aware (dual-keyed) badge helper.
- `lib/model.ts` — add `homeRoster`/`awayRoster`/`maxLeadVenue`; later drop us/them outputs.
- `lib/name-display.ts` — redact the home/away keys.
- `components/PublicMatch.tsx` — read only home/away.
- `lib/infographic.ts` — read only home/away.
- `lib/constants.ts` — `APP_VERSION` bump.
- Tests: `test/lineup-badges.test.ts` (new), `test/model.test.ts`, `test/name-display.test.ts`, `test/score-card.test.ts`.

---

## Task 1: `lineupBadges` venue-aware (dual-keyed)

**Files:**
- Modify: `lib/lineup-badges.ts`
- Test: `test/lineup-badges.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `test/lineup-badges.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { lineupBadges } from "@/lib/lineup-badges";

// A model carrying BOTH keyings: us/them (timeline/usScorers/themScorers) and
// home/away (timelineHA/homeScorers/awayScorers). In this fixture us = home.
const model: any = {
  usScorers: [{ num: 10, g: 1, p: 2 }],
  themScorers: [{ num: 7, g: 0, p: 1 }],
  homeScorers: [{ num: 10, g: 1, p: 2 }],
  awayScorers: [{ num: 7, g: 0, p: 1 }],
  timeline: [
    { kind: "sub", side: "us", onNum: 12, offNum: 10 },
    { kind: "card", side: "them", num: 7, card: "yellow" },
    { kind: "score", side: "them", og: true, ogNum: 4 }, // own goal by an us player (#4)
  ],
  timelineHA: [
    { kind: "sub", side: "home", onNum: 12, offNum: 10 },
    { kind: "card", side: "away", num: 7, card: "yellow" },
    { kind: "score", side: "away", og: true, ogNum: 4 },
  ],
};

describe("lineupBadges us/them keying", () => {
  it("reads timeline + usScorers for an us player", () => {
    expect(lineupBadges(model, "us", 10)).toMatchObject({ subOff: true, score: { g: 1, p: 2 } });
    expect(lineupBadges(model, "us", 12)).toMatchObject({ subOn: true });
    expect(lineupBadges(model, "us", 4)).toMatchObject({ og: true });
  });
  it("reads themScorers + cards for a them player", () => {
    expect(lineupBadges(model, "them", 7)).toMatchObject({ cards: ["yellow"], score: { g: 0, p: 1 } });
  });
});

describe("lineupBadges home/away keying", () => {
  it("reads timelineHA + homeScorers for a home player", () => {
    expect(lineupBadges(model, "home", 10)).toMatchObject({ subOff: true, score: { g: 1, p: 2 } });
    expect(lineupBadges(model, "home", 12)).toMatchObject({ subOn: true });
    expect(lineupBadges(model, "home", 4)).toMatchObject({ og: true });
  });
  it("reads awayScorers + cards for an away player", () => {
    expect(lineupBadges(model, "away", 7)).toMatchObject({ cards: ["yellow"], score: { g: 0, p: 1 } });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test -- lineup-badges`
Expected: FAIL — the `"home"`/`"away"` cases return empty badges (helper ignores `timelineHA`/`homeScorers`).

- [ ] **Step 3: Implement the dual-keyed helper**

Replace the whole of `lib/lineup-badges.ts` from the `export function lineupBadges` signature down with:

```ts
// Side-aware lineup badges for ONE player (by shirt number) on ONE side.
// Single source of truth shared by the editor lineup, the public page, and the
// poster image. Dual-keyed during ③.2: "us"|"them" reads timeline + usScorers/
// themScorers; "home"|"away" reads timelineHA + homeScorers/awayScorers. The
// us/them branch is removed in ③.2b once the editor migrates.
export function lineupBadges(
  m: Pick<Model, "timeline" | "usScorers" | "themScorers"> &
     Partial<Pick<Model, "timelineHA" | "homeScorers" | "awayScorers">>,
  side: "us" | "them" | "home" | "away",
  num: number,
): LineupBadges {
  const venue = side === "home" || side === "away";
  const scorers = venue
    ? (side === "home" ? m.homeScorers : m.awayScorers)
    : (side === "them" ? m.themScorers : m.usScorers);
  const tl = (venue ? m.timelineHA : m.timeline) || [];
  const sc = (scorers || []).find((s: any) => s.num === num && (s.g || s.p));
  let subOn = false, subOff = false, og = false;
  const cards: string[] = [];
  tl.forEach((t: any) => {
    const tSide = venue
      ? (t.side === "away" ? "away" : "home")
      : (t.side === "them" ? "them" : "us");
    if (t.kind === "sub" && tSide === side) {
      if (t.onNum === num) subOn = true;
      if (t.offNum === num) subOff = true;
    } else if (t.kind === "card" && tSide === side && t.num === num) {
      cards.push(t.card);
    } else if (t.kind === "score" && t.og && t.ogNum === num && tSide !== side) {
      og = true;
    }
  });
  return { subOn, subOff, cards, og, score: sc ? { g: sc.g, p: sc.p } : null };
}
```

Keep the existing `import type { Model } from "./types";` and the `LineupBadges` interface above unchanged.

- [ ] **Step 4: Run to verify it passes**

Run: `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test -- lineup-badges`
Expected: PASS (both keyings).

- [ ] **Step 5: Full suite + typecheck**

Run: `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test` then `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npx tsc --noEmit`
Expected: all green, no type errors (existing `"us"|"them"` callers still type-check — the union widened).

- [ ] **Step 6: Commit**

```bash
git add lib/lineup-badges.ts test/lineup-badges.test.ts
git commit -m "feat(lineup-badges): venue-aware dual keying (③.2a)"
```

---

## Task 2: `buildModel` — add `homeRoster`/`awayRoster`/`maxLeadVenue`

**Files:**
- Modify: `lib/model.ts`
- Test: `test/model.test.ts`

- [ ] **Step 1: Write the failing test**

In `test/model.test.ts`, inside the existing `describe("canonical SAMPLE_RECORD", ...)` (or a new describe), add. `SAMPLE_RECORD` is `homeAway:"away"`, `usRoster: RACOONS`, `oppRoster: { formation: [], players: [] }`, and `maxLeadSide` for it is `"us"` (us led by 5) → venue `"away"`:

```ts
  it("exposes homeRoster/awayRoster/maxLeadVenue by venue", () => {
    const m = buildModel(SAMPLE_RECORD);
    // homeAway "away" → us is away → awayRoster is the Racoons (us) roster
    expect(m.awayRoster).toBe(SAMPLE_RECORD.usRoster);
    expect(m.homeRoster).toBe(SAMPLE_RECORD.oppRoster);
    expect(m.maxLeadVenue).toBe("away");
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test -- model`
Expected: FAIL — `m.awayRoster` / `m.maxLeadVenue` are `undefined`.

- [ ] **Step 3: Implement**

In `lib/model.ts`:

(a) Extend the home-away import (currently `import { matchOutcome, venueSeries, venueItems } from "@/lib/home-away";`) to:

```ts
import { matchOutcome, venueSeries, venueItems, sideToVenue, recordHomeAway } from "@/lib/home-away";
```

(b) After the line `const usIsHome = header.homeAway === "home";`, add:

```ts
  const ha = recordHomeAway(r);
```

(c) In the returned object, add these three keys (place them next to `homeSeries, timelineHA,`):

```ts
    homeRoster: ha.homeRoster || null,
    awayRoster: ha.awayRoster || null,
    maxLeadVenue: sideToVenue(parsed.maxLeadSide, r.homeAway),
```

- [ ] **Step 4: Run to verify it passes**

Run: `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test -- model`
Expected: PASS.

- [ ] **Step 5: Full suite + typecheck**

Run: `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test` then `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npx tsc --noEmit`
Expected: green.

- [ ] **Step 6: Commit**

```bash
git add lib/model.ts test/model.test.ts
git commit -m "feat(model): expose homeRoster/awayRoster/maxLeadVenue (③.2a)"
```

---

## Task 3: `applyNameDisplay` redacts the home/away keys (fix latent ② leak)

**Files:**
- Modify: `lib/name-display.ts`
- Test: `test/name-display.test.ts`

Context: `PublicMatch`/`infographic` read `homeScorers`/`awayScorers`/`homeRoster`/`awayRoster`/`timelineHA`, but `applyNameDisplay` only redacts the us/them keys — so names currently leak on public pages with `initials`/`none`. Add redaction of the home/away keys (keep the us/them redaction for now; it's removed in Task 6).

- [ ] **Step 1: Write the failing test**

In `test/name-display.test.ts`, add a block (adjust the import names to match the file's existing imports of `applyNameDisplay`):

```ts
describe("applyNameDisplay redacts home/away keys", () => {
  const base: any = {
    homeScorers: [{ num: 10, name: "Rick Sanchez", scorer: "Rick Sanchez", g: 1, p: 0 }],
    awayScorers: [{ num: 7, name: "Morty Smith", scorer: "Morty Smith", g: 0, p: 1 }],
    homeRoster: { formation: [[10]], players: [{ num: 10, name: "Rick Sanchez", role: "starting" }] },
    awayRoster: { formation: [[7]], players: [{ num: 7, name: "Morty Smith", role: "starting" }] },
    timelineHA: [{ kind: "score", side: "home", num: 10, scorer: "Rick Sanchez" }],
  };
  it("initials redacts home/away scorers, rosters, and timelineHA scorer", () => {
    const r = applyNameDisplay(base, "initials");
    expect(r.homeScorers[0].name).toBe("RS");
    expect(r.awayScorers[0].name).toBe("MS");
    expect(r.homeRoster.players[0].name).toBe("RS");
    expect(r.awayRoster.players[0].name).toBe("MS");
    expect(r.timelineHA[0].scorer).toBe("RS");
  });
  it("full is a no-op", () => {
    expect(applyNameDisplay(base, "full")).toBe(base);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test -- name-display`
Expected: FAIL — `homeScorers[0].name` is still `"Rick Sanchez"`.

- [ ] **Step 3: Implement**

In `lib/name-display.ts`, inside `applyNameDisplay`'s returned object (the spread after `if (mode === "full") return model;`), add these keys alongside the existing us/them ones:

```ts
    homeScorers: (model.homeScorers || []).map(fixScorer),
    awayScorers: (model.awayScorers || []).map(fixScorer),
    timelineHA: (model.timelineHA || []).map((t: any) =>
      t && t.scorer ? { ...t, scorer: redactName(t.scorer, t.num, mode) } : t,
    ),
    ...(model.homeRoster
      ? { homeRoster: { ...model.homeRoster, players: model.homeRoster.players.map(fixPlayer) } }
      : {}),
    ...(model.awayRoster
      ? { awayRoster: { ...model.awayRoster, players: model.awayRoster.players.map(fixPlayer) } }
      : {}),
```

- [ ] **Step 4: Run to verify it passes**

Run: `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test -- name-display`
Expected: PASS.

- [ ] **Step 5: Full suite + typecheck**

Run: `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test` then `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npx tsc --noEmit`
Expected: green.

- [ ] **Step 6: Commit**

```bash
git add lib/name-display.ts test/name-display.test.ts
git commit -m "fix(name-display): redact home/away model keys (closes ② public-page leak; ③.2a)"
```

---

## Task 4: `PublicMatch` reads only home/away

**Files:**
- Modify: `components/PublicMatch.tsx`

This task removes every `usIsHome ? …` and direct `m.us*`/`m.colorUs*`/`m.totals.us`/`m.starters`/`m.oppRoster` read. No unit test — verified by `tsc --noEmit` + green suite + the fact that nothing else reads these. Make the edits below exactly.

- [ ] **Step 1: Replace the badge/lineup helpers (lines ~34–52)**

Find:

```tsx
  const mForBadges = m as Pick<Model, "timeline" | "usScorers" | "themScorers">;
  const badges = (n: number, side: "us" | "them") => {
    const b = lineupBadges(mForBadges, side, n);
```

The block spans the `badges`, `scoreFor`, and `findName` definitions (through line ~52). Replace the three helpers with venue-keyed versions. Replace from `const mForBadges` down to the `findName` line with:

```tsx
  const badges = (n: number, side: "home" | "away") => {
    const b = lineupBadges(m, side, n);
```

(Keep the body of `badges` that follows — only the signature line and the `lineupBadges(mForBadges, side, n)` call change: drop `mForBadges`, pass `m`.) Then for `scoreFor`:

```tsx
  const scoreFor = (n: number, side: "home" | "away") => {
    const sc = lineupBadges(m, side, n).score;
```

And replace `findName` with a roster-scoped helper:

```tsx
  const nameIn = (roster: any, n: number) => { const p = (roster?.players || []).find((x: any) => x.num === n); return p ? p.name : ""; };
```

> If you cannot cleanly isolate the three helpers, read lines 34–52 and rewrite them as the three definitions above (`badges`, `scoreFor`, `nameIn`). Remove the now-unused `mForBadges`.

- [ ] **Step 2: Fix the filename/title (lines ~113–114)**

Replace:

```tsx
  const imgFilename = `${safe(m.usName || "match")}-${safe(m.themName || "")}.png`;
  const imgTitle = `${m.usName} ${m.totals.us.str} – ${m.totals.them.str} ${m.themName}`;
```

with:

```tsx
  const imgFilename = `${safe(m.homeName || "match")}-${safe(m.awayName || "")}.png`;
  const imgTitle = `${m.homeName} ${m.homeTotals?.str ?? ""} – ${m.awayTotals?.str ?? ""} ${m.awayName}`;
```

- [ ] **Step 3: Replace the score-header block (lines ~150–178)**

Replace the entire IIFE that starts `{(() => {` at ~150 and ends `})()}` at ~178 with:

```tsx
      {(() => {
        const homeTotal = gpTotal(m.homeTotals.g, m.homeTotals.p, m.effMode);
        const awayTotal = gpTotal(m.awayTotals.g, m.awayTotals.p, m.effMode);
        const finished = (m.halfMarks || []).some((mk: any) => mk.marker === "FT");
        const started = (m.halfMarks || []).length > 0 || (m.timeline || []).length > 0;
        const phase = finished ? "over" : started ? "play" : "pre";
        const live = started && !finished;
        return (
          <div key={pulse} className={pulse > 0 ? "pm-score-wrap pm-pulse" : "pm-score-wrap"}>
            <ScoreHeader
              homeName={m.homeName}
              awayName={m.awayName}
              homeStr={m.homeTotals.str}
              awayStr={m.awayTotals.str}
              homeColors={m.homeColors}
              awayColors={m.awayColors}
              grade={m.grade || m.sport || ""}
              dateStr={m.dateStr}
              homeTotal={homeTotal}
              awayTotal={awayTotal}
              phase={phase}
              live={live}
              homeSquad={m.homeSquad}
              awaySquad={m.awaySquad}
            />
          </div>
        );
      })()}
```

- [ ] **Step 4: Fix the Biggest-lead stat (line ~187)**

Replace:

```tsx
          { k: `Biggest lead${m.maxLeadSide ? ` · ${sideToVenue(m.maxLeadSide, m.homeAway) === "home" ? homeShort : awayShort}` : ""}`, v: m.maxLead },
```

with:

```tsx
          { k: `Biggest lead${m.maxLeadVenue ? ` · ${m.maxLeadVenue === "home" ? homeShort : awayShort}` : ""}`, v: m.maxLead },
```

- [ ] **Step 5: Replace the whole lineup IIFE (lines ~205–286) with a symmetric home/away renderer**

Replace the entire lineup IIFE (`{(() => { const usVenue … })()}`, ~205–286) with:

```tsx
      {/* lineup — two symmetric pitches, home then away */}
      {(() => {
        const renderPitch = (name: string, roster: any, colors: [string, string], side: "home" | "away") => {
          const players = roster?.players || [];
          const starters = players.filter((p: any) => p.role === "starting");
          const subsL = players.filter((p: any) => p.role === "sub");
          const missingL = players.filter((p: any) => p.role === "missing");
          const formation: number[][] = (roster?.formation && roster.formation.length) ? roster.formation : [];
          if (!(formation.length || starters.length)) return null;
          const [c1, c2] = colors;
          return (
            <section className="pm-sec" key={side}>
              <p className="pm-label">Team · {(name || "").toUpperCase()}</p>
              {formation.length ? (
                <div className="pm-pitch">
                  {formation.map((row: number[], ri: number) => (
                    <div className="pm-pitch-row" key={ri}>
                      {row.map((n, ci) => (
                        <div className="pm-jersey" key={ci}>
                          <Jersey c1={c1} c2={c2} num={n} size={40} />
                          <div className="nm">{nameIn(roster, n)} {badges(n, side)}</div>
                          {scoreFor(n, side)}
                        </div>
                      ))}
                    </div>
                  ))}
                  {subsL.length > 0 && (
                    <>
                      <div className="pm-subhead">Subs</div>
                      <div className="pm-pitch-row">
                        {subsL.map((p: any) => (
                          <div className="pm-jersey" key={p.num}>
                            <Jersey c1={c1} c2={c2} num={p.num} size={34} />
                            <div className="nm">{p.name} {badges(p.num, side)}</div>
                            {scoreFor(p.num, side)}
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <div className="pm-lineup-list">
                  {starters.map((p: any, i: number) => (
                    <span className="pm-lineup-item" key={i}>{p.num ? `${p.num}. ` : ""}{p.name}{lineupBadges(m, side, p.num).subOff ? " ▼" : ""}</span>
                  ))}
                </div>
              )}
              {!formation.length && subsL.length > 0 && <p className="pm-bench">Subs: {subsL.map((p: any) => `${p.num} ${p.name}`).join("  ·  ")}</p>}
              {missingL.length > 0 && <p className="pm-bench">Missing: {missingL.map((p: any) => `${p.num} ${p.name}`).join("  ·  ")}</p>}
            </section>
          );
        };
        return <>{renderPitch(m.homeName, m.homeRoster, m.homeColors, "home")}{renderPitch(m.awayName, m.awayRoster, m.awayColors, "away")}</>;
      })()}
```

- [ ] **Step 6: Remove the now-unused `sideToVenue` import if present**

Check the top imports. If `sideToVenue` is imported and no longer referenced (Step 4 removed the only use), delete it from the import. Run a grep to be sure:

Run: `grep -n "sideToVenue\|m\.usName\|m\.themName\|m\.colorUs\|m\.colorThem\|m\.totals\.us\|m\.starters\|m\.oppRoster\|m\.subs\|m\.missing\|usIsHome\|mForBadges\|findName(" components/PublicMatch.tsx`
Expected: **no matches** (every us/them read is gone). If any remain, fix them to the home/away equivalent.

- [ ] **Step 7: Typecheck + full suite**

Run: `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npx tsc --noEmit` then `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test`
Expected: clean + green.

- [ ] **Step 8: Commit**

```bash
git add components/PublicMatch.tsx
git commit -m "refactor(public): read only home/away from the model (③.2a)"
```

---

## Task 5: `infographic.ts` reads only home/away

**Files:**
- Modify: `lib/infographic.ts`
- Test: `test/score-card.test.ts` (verify still green; adjust only if it asserts a dropped key)

- [ ] **Step 1: Drop the `colorUs`/`colorThem` fallbacks (lines ~40–43 and ~111–114)**

Replace (poster, ~40–43):

```ts
  const homeC1 = m.homeColors?.[0] ?? m.colorUs ?? "#f5c518";
  const homeC2 = m.homeColors?.[1] ?? m.colorUs2 ?? "#1f7a4d";
  const awayC1 = m.awayColors?.[0] ?? m.colorThem ?? "#c0392b";
  const awayC2 = m.awayColors?.[1] ?? m.colorThem2 ?? "#2c5fa8";
```

with:

```ts
  const homeC1 = m.homeColors?.[0] ?? "#f5c518";
  const homeC2 = m.homeColors?.[1] ?? "#1f7a4d";
  const awayC1 = m.awayColors?.[0] ?? "#c0392b";
  const awayC2 = m.awayColors?.[1] ?? "#2c5fa8";
```

And the OG-card equivalents (~111–114):

```ts
  const hC1 = m.homeColors?.[0] ?? "#f5c518";
  const hC2 = m.homeColors?.[1] ?? "#1f7a4d";
  const aC1 = m.awayColors?.[0] ?? "#c0392b";
  const aC2 = m.awayColors?.[1] ?? "#2c5fa8";
```

- [ ] **Step 2: Fix the maxLead stat (lines ~145–149)**

Replace:

```ts
  const maxLeadVenue = sideToVenue(m.maxLeadSide, m.homeAway);
  const maxLeadTeam = maxLeadVenue === "home" ? m.homeName.split(" ")[0] : maxLeadVenue === "away" ? m.awayName.split(" ")[0] : "";
```

with (use the model's `maxLeadVenue`; rename the local to avoid the shadow):

```ts
  const maxLeadV = m.maxLeadVenue;
  const maxLeadTeam = maxLeadV === "home" ? (m.homeName || "").split(" ")[0] : maxLeadV === "away" ? (m.awayName || "").split(" ")[0] : "";
```

Then update the stat row just below — replace the two `m.maxLeadSide` references:

```ts
    ["BIGGEST LEAD", `${m.maxLead}${m.maxLeadSide ? " " + maxLeadTeam : ""}`]];
```

with:

```ts
    ["BIGGEST LEAD", `${m.maxLead}${maxLeadV ? " " + maxLeadTeam : ""}`]];
```

- [ ] **Step 3: Switch `drawPitch`/`drawBench` side params to home/away**

Change the two signatures:

```ts
  const drawPitch = (rows: number[][], c1: string, c2: string, nameFor: (n: number) => string, side: "us" | "them") => {
```
→
```ts
  const drawPitch = (rows: number[][], c1: string, c2: string, nameFor: (n: number) => string, side: "home" | "away") => {
```

and

```ts
  const drawBench = (players: any[], side: "us" | "them", c1: string, c2: string) => {
```
→
```ts
  const drawBench = (players: any[], side: "home" | "away", c1: string, c2: string) => {
```

(Their bodies call `lineupBadges(m as any, side, …)` — now correctly venue-keyed.)

- [ ] **Step 4: Replace the lineup-pitch wiring (lines ~289–326) with home/away rosters**

Replace from `// ---- lineup pitches: home first, then away ----` (~289) through the away-team `if/else if` block (~326) with:

```ts
  // ---- lineup pitches: home first, then away (symmetric, from the venue rosters) ----
  const pitchFor = (roster: any) => {
    const players = (roster?.players) || [];
    const formation: number[][] = (roster?.formation && roster.formation.length) ? roster.formation : [];
    const nameFor = (n: number) => { const p = players.find((x: any) => x.num === n); return p ? p.name : ""; };
    const subsList = players.filter((p: any) => p.role === "sub");
    const missingList = players.filter((p: any) => p.role === "missing");
    return { formation, nameFor, subsList, missingList };
  };

  const renderTeamPitch = (
    teamName: string, formation: number[][], c1: string, c2: string,
    findNameFn: (n: number) => string, badgeSide: "home" | "away",
    subsList: any[], missingList: any[],
  ) => {
    body.push(T(P, y, `TEAM · ${(teamName || "").toUpperCase()}`, 11, MUTE, { w: 700, ls: 1 }));
    y += 12;
    drawPitch(formation, c1, c2, findNameFn, badgeSide);
    if (subsList.length) {
      body.push(T(P, y + 15, "SUBS", 9, MUTE, { w: 700, ls: 1 }));
      drawBench(subsList, badgeSide, c1, c2);
    }
    if (missingList.length) { body.push(T(P, y + 8, "Missing: " + missingList.map((p: any) => `${p.num} ${p.name}`).join("   "), 10, MUTE)); y += 18; }
    y += 16;
  };

  const home = pitchFor(m.homeRoster);
  const away = pitchFor(m.awayRoster);
  if (home.formation.length) renderTeamPitch(m.homeName, home.formation, hC1, hC2, home.nameFor, "home", home.subsList, home.missingList);
  if (away.formation.length) renderTeamPitch(m.awayName, away.formation, aC1, aC2, away.nameFor, "away", away.subsList, away.missingList);
```

(This deletes the old `usIsHome`/`usFindName`/`usFormation`/`oppFindName`/`oppFormation`/`oppSubsList` locals and the venue `if/else if` ladder.)

- [ ] **Step 5: Remove the now-unused `sideToVenue` import if present**

Run: `grep -n "sideToVenue\|m\.maxLeadSide\|m\.colorUs\|m\.colorThem\|m\.starters\|m\.oppRoster\|m\.formationRows\|usIsHome\|m\.subs\|m\.missing" lib/infographic.ts`
Expected: **no matches**. If `sideToVenue` is imported but unused now, delete it from the import line. Fix any remaining match to home/away.

- [ ] **Step 6: Typecheck + suite**

Run: `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npx tsc --noEmit` then `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test`
Expected: clean + green (`score-card.test.ts` still passes; it asserts the neutral OG card which is unchanged).

- [ ] **Step 7: Commit**

```bash
git add lib/infographic.ts
git commit -m "refactor(infographic): read only home/away from the model (③.2a)"
```

---

## Task 6: Drop the us/them model outputs + bump version

**Files:**
- Modify: `lib/model.ts`, `lib/name-display.ts`, `lib/constants.ts`
- Test: `test/model.test.ts`

- [ ] **Step 1: Verify no consumer still reads a us/them model output**

Run this grep across all `buildModel`/model consumers:

```
grep -rn "\.usName\|\.themName\|\.usScorers\|\.themScorers\|\.colorUs\|\.colorThem\|\.maxLeadSide\|\.usSquad\|\.oppSquad\|\.formationRows\|\.oppRoster\|m\.starters\|m\.subs\|m\.missing\|m\.totals\b\|m\.result\b" components/PublicMatch.tsx lib/infographic.ts components/ShareImageModal.tsx app/m/[id]/opengraph-image.tsx
```

Expected: **no matches**. (The editor `MatchTracker` reads its own state/`parsed`, not these model keys — confirmed; its share call `buildModel(recordPayload())` feeds the infographic which is now home/away. `applyNameDisplay` still references the us/them keys — that's Step 3.) If any match appears, STOP and fix that consumer first.

- [ ] **Step 2: Rewrite the existing `model.test.ts` assertions that reference dropped keys**

These current assertions read keys this task removes — rewrite them to the home/away equivalents (SAMPLE is `homeAway:"away"`, so Racoons=away, Wildebeests=home; SAMPLE colours: `colorUs` `#f5c518`/`#1f7a4d`, `colorThem` `#c0392b`/`#2c5fa8`). The home/away keys already exist (Task 2 / ②), so after this edit these assertions stay green.

In the `describe("buildModel", …)` block (lines ~9–17), replace:
```ts
  it("carries totals + result", () => {
    expect(m.totals.us.str).toBe("2-6");
    expect(m.totals.them.str).toBe("2-7");
    expect(m.result).toBe("Loss");
  });
  it("names from record + parser", () => {
    expect(m.usName).toBe("Racoons");
    expect(m.themName).toBe("Wildebeests");
  });
```
with:
```ts
  it("carries home/away totals + neutral outcome", () => {
    expect(m.awayTotals.str).toBe("2-6"); // Racoons are away
    expect(m.homeTotals.str).toBe("2-7"); // Wildebeests are home
    expect(m.outcome).toEqual({ winner: "home", margin: 1 });
  });
  it("home/away names from record + parser", () => {
    expect(m.awayName).toBe("Racoons");
    expect(m.homeName).toBe("Wildebeests");
  });
```

In `describe("canonical SAMPLE_RECORD", …)`, replace the "reproduces…" body (lines ~26–28):
```ts
    expect(m.totals.us.str).toBe("2-6");
    expect(m.totals.them.str).toBe("2-7");
    expect(m.result).toBe("Loss");
```
with:
```ts
    expect(m.awayTotals.str).toBe("2-6");
    expect(m.homeTotals.str).toBe("2-7");
    expect(m.outcome).toEqual({ winner: "home", margin: 1 });
```

Replace the `themScorers` array-shape test (lines ~39–43):
```ts
  it("exposes themScorers as an array (may be empty when scores are team-level)", () => {
    // SAMPLE uses team-level opponent attribution ("Wildebeests free") so
    // themScorers is empty — this confirms the field is always present and array-shaped.
    expect(Array.isArray(m.themScorers)).toBe(true);
  });
```
with:
```ts
  it("exposes homeScorers as an array (empty when scores are team-level)", () => {
    // SAMPLE uses team-level opponent attribution ("Wildebeests free"); Wildebeests
    // are home, so homeScorers is empty — confirms the field is present + array-shaped.
    expect(Array.isArray(m.homeScorers)).toBe(true);
  });
```

In "pins the discrete-sequence stats" (line ~48), replace:
```ts
    expect(m.maxLeadSide).toBe("us");
```
with:
```ts
    expect(m.maxLeadVenue).toBe("away"); // us led; us is away
```

In "exposes neutral home/away view" (lines ~56–57), replace:
```ts
    expect(m.homeColors).toEqual([m.colorThem, m.colorThem2]);
    expect(m.awayColors).toEqual([m.colorUs, m.colorUs2]);
```
with:
```ts
    expect(m.homeColors).toEqual(["#c0392b", "#2c5fa8"]);
    expect(m.awayColors).toEqual(["#f5c518", "#1f7a4d"]);
```

In `describe("buildModel themScorers — named opponent scorer", …)` (no `homeAway` on that record → us is away, opponent is home), replace lines ~93–101:
```ts
  it("surfaces named opponent scorer in themScorers", () => {
    expect(m.themScorers.length).toBeGreaterThan(0);
    const gerald = m.themScorers.find((s: any) => s.name === "Gerald");
    expect(gerald).toBeDefined();
    expect(gerald).toMatchObject({ side: "them", g: 1 });
  });
  it("usScorers still contains own-team scorer", () => {
    const morty = m.usScorers.find((s: any) => s.name === "Morty");
    expect(morty).toMatchObject({ side: "us", g: 1 });
```
with:
```ts
  it("surfaces named opponent scorer in homeScorers", () => {
    expect(m.homeScorers.length).toBeGreaterThan(0);
    const gerald = m.homeScorers.find((s: any) => s.name === "Gerald");
    expect(gerald).toBeDefined();
    expect(gerald).toMatchObject({ side: "them", g: 1 }); // item retains its parser side tag
  });
  it("awayScorers still contains own-team scorer", () => {
    const morty = m.awayScorers.find((s: any) => s.name === "Morty");
    expect(morty).toMatchObject({ side: "us", g: 1 });
```
(The scorer **items** keep their original `side: "us"|"them"` field — only the array they live in is re-keyed by venue. Leave the `side` in `toMatchObject` unchanged.)

Run `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test -- model` — these rewritten assertions should be **green already** (home/away keys exist).

- [ ] **Step 3: Write the regression test (us/them keys are gone)**

In `test/model.test.ts`, add:

```ts
  it("no longer exposes us/them output keys", () => {
    const m = buildModel(SAMPLE_RECORD);
    for (const k of ["usName", "themName", "usScorers", "themScorers", "colorUs", "colorThem", "usSquad", "oppSquad", "maxLeadSide", "formationRows", "oppRoster", "totals", "result", "starters", "subs", "missing"]) {
      expect(m[k], k).toBeUndefined();
    }
    // home/away view still complete
    expect(m.homeName).toBeTruthy();
    expect(m.homeScorers).toBeDefined();
    expect(m.homeRoster).toBeDefined();
  });
```

- [ ] **Step 4: Run to verify the new test fails**

Run: `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test -- model`
Expected: the "no longer exposes us/them output keys" test FAILS (keys still present); all the rewritten assertions PASS.

- [ ] **Step 5: Drop the us/them keys from `buildModel`'s return**

In `lib/model.ts`, remove these keys from the returned object: `totals`, `result`, `usScorers`, `themScorers`, `formationRows`, `starters`, `subs`, `missing`, `usName`, `themName`, `colorUs`, `colorUs2`, `colorThem`, `colorThem2`, `usSquad`, `oppSquad`, `oppRoster`, `maxLeadSide`. Keep everything else (`grade`, `sport`, `homeAway`, `dateStr`, `effMode`, `ht`, `leadChanges`, `timesLevel`, `maxLead`, `maxLeadVenue`, `series`, `goalDots`, `chartMarkers`, `htLine`, `halfMarks`, `timeline`, `nameDisplay`, the full home/away view, `homeSeries`, `timelineHA`, `outcome`, `parsed`). Also delete now-unused local bindings (`usName`, `themName`, `usScorers`, `themScorers`, `starters`, `subs`, `missing`, `formationRows`, `cUs`/`cThem`, `sqUs`/`sqOpp`) **only if** they are no longer referenced by the kept home/away computations — many ARE still referenced (e.g. `homeName: usIsHome ? usName : themName`), so keep those locals; just stop emitting them as output keys.

> The home/away outputs depend on the us/them locals (the internal bridge), so the locals stay; only the **output keys** are removed.

- [ ] **Step 6: Drop the us/them redaction from `applyNameDisplay`**

In `lib/name-display.ts`, remove the now-dead us/them keys from the returned object: `usScorers`, `themScorers`, `starters`, `subs`, `missing`, `formationRows`, `timeline` (the us/them timeline; `timelineHA` stays), and the `oppRoster` spread. Keep the home/away keys added in Task 3 (`homeScorers`, `awayScorers`, `timelineHA`, `homeRoster`, `awayRoster`).

> Verify `applyNameDisplay` is only used on `buildModel` output (public page + OG). It is — `PublicMatch.tsx:72`, `opengraph-image.tsx`. The team page (`redactRoster`) is separate and unaffected.

- [ ] **Step 7: Bump APP_VERSION**

In `lib/constants.ts`: `export const APP_VERSION = "v80";`

- [ ] **Step 8: Run to verify pass + typecheck + full suite**

Run: `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test -- model` (the new test passes), then `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npx tsc --noEmit` and `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm test`.
Expected: all green, no type errors.

- [ ] **Step 9: Commit**

```bash
git add lib/model.ts lib/name-display.ts lib/constants.ts test/model.test.ts
git commit -m "refactor(model): drop us/them output keys; redact home/away only; bump v80 (③.2a)"
```

---

## Manual verification (after all tasks; human or a final reviewer)

- Open a public match (`/m/<code>`): score header, chart, scorers, **two lineup pitches (home then away)**, and timeline all read home-left/away-right with no regression.
- Set the match's name privacy to **initials**/**none** and confirm **scorer + lineup names are redacted on the public page** (this was the latent ② leak; Task 3 fixes it).
- Generate the share image (poster) and confirm the OG card — both home-left/away-right, correct colours, lineup pitches present.

## Self-review notes (spec coverage)

- §1 (model complete home/away + drop us/them): Tasks 2 + 6. Identity stays inline (deviation flagged above).
- §2 (matchRowView): no-op (deviation flagged — already a home/away producer).
- §3 (PublicMatch): Task 4.
- §4 (infographic): Task 5.
- §6 (lineup-badges venue-aware): Task 1 (dual-keyed; collapse in ③.2b).
- Latent ② redaction leak: Task 3 (new, required).
- §7 testing: lineup-badges, model (add + drop), name-display, score-card.
