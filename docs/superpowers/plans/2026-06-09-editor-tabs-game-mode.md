# Editor Tabs & Game-Mode-First Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reshape the editor into a game-mode-first tabbed UI (`Details · Lineup · Game mode · Advanced`), make Game mode a navigable tab instead of a full-screen takeover, fold the timeline into Details + the Game-mode tab, and give the editor and public page one shared, restyled score header with a neutral Leading/Won-by/Tie indicator.

**Architecture:** One new pure helper (`lib/score-header.ts`) + one new shared component (`components/ScoreHeader.tsx`) used by both `PublicMatch` and the editor. The bulk is surgical edits to the `// @ts-nocheck` monolith `components/MatchTracker.tsx`: tab set/keys, default-tab logic, timeline extraction, dismantling the `gm` takeover into `tab === "game"`, and removing the old "Add as it happens" live panel.

**Tech Stack:** Next.js 14, React 18, TypeScript, Vitest. Node 20 — prefix build/test commands with `bash -lc 'source ~/.nvm/nvm.sh; nvm use 20 >/dev/null; cd /home/sean/workspace/sideline && <cmd>'`.

**Design doc:** `docs/superpowers/specs/2026-06-09-editor-tabs-game-mode-design.md`. Branch: `editor-tabs`.

---

## File Structure

**Create:**
- `lib/score-header.ts` — `scoreHeaderResult({homeTotal,awayTotal,phase})` → `{kind:"lead"|"won"|"tie", side?, margin}`. Pure.
- `test/score-header.test.ts` — unit tests.
- `components/ScoreHeader.tsx` — shared presentational score header (meta · flags · names · scores · neutral result indicator).

**Modify:**
- `app/globals.css` — append `.sh-*` styles.
- `components/PublicMatch.tsx` — replace the inline `pm-head` block with `<ScoreHeader>`.
- `components/MatchTracker.tsx` — score header → `<ScoreHeader>`; tab set + keys + default tab; timeline into Details + Game mode; Game-mode-as-tab; remove the Advanced live panel.
- `lib/constants.ts` — `APP_VERSION` → `v47`.

**Untouched:** parser, model, infographic/OG SVG generators (keep their result wording for ③), Lineup.

---

## Task 1: `scoreHeaderResult` (pure)

**Files:**
- Create: `lib/score-header.ts`
- Test: `test/score-header.test.ts`

- [ ] **Step 1: Write the failing test** — `test/score-header.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { scoreHeaderResult } from "@/lib/score-header";

describe("scoreHeaderResult", () => {
  it("level → tie", () => {
    expect(scoreHeaderResult({ homeTotal: 13, awayTotal: 13, phase: "play" })).toEqual({ kind: "tie", margin: 0 });
  });
  it("home ahead in play → lead/home with margin", () => {
    expect(scoreHeaderResult({ homeTotal: 14, awayTotal: 12, phase: "play" })).toEqual({ kind: "lead", side: "home", margin: 2 });
  });
  it("away ahead in play → lead/away", () => {
    expect(scoreHeaderResult({ homeTotal: 9, awayTotal: 13, phase: "ht" })).toEqual({ kind: "lead", side: "away", margin: 4 });
  });
  it("home ahead at full time → won/home", () => {
    expect(scoreHeaderResult({ homeTotal: 20, awayTotal: 14, phase: "over" })).toEqual({ kind: "won", side: "home", margin: 6 });
  });
  it("away ahead at full time → won/away", () => {
    expect(scoreHeaderResult({ homeTotal: 1, awayTotal: 3, phase: "over" })).toEqual({ kind: "won", side: "away", margin: 2 });
  });
  it("level at full time → tie (not won)", () => {
    expect(scoreHeaderResult({ homeTotal: 10, awayTotal: 10, phase: "over" })).toEqual({ kind: "tie", margin: 0 });
  });
});
```

- [ ] **Step 2: Run it, confirm it fails**

Run: `bash -lc 'source ~/.nvm/nvm.sh; nvm use 20 >/dev/null; cd /home/sean/workspace/sideline && npm test -- score-header'`
Expected: FAIL — `Cannot find module '@/lib/score-header'`.

- [ ] **Step 3: Implement** — `lib/score-header.ts`:

```ts
export interface ScoreHeaderResult {
  kind: "lead" | "won" | "tie";
  side?: "home" | "away";
  margin: number;
}

// Neutral result indicator for the score header. In play → "lead"; at full time → "won";
// equal totals → "tie" in either phase. Margin is in whatever unit the totals are passed in
// (points for GAA via gpTotal, goals for soccer).
export function scoreHeaderResult(args: { homeTotal: number; awayTotal: number; phase: string }): ScoreHeaderResult {
  const { homeTotal, awayTotal, phase } = args;
  if (homeTotal === awayTotal) return { kind: "tie", margin: 0 };
  const side = homeTotal > awayTotal ? "home" : "away";
  return { kind: phase === "over" ? "won" : "lead", side, margin: Math.abs(homeTotal - awayTotal) };
}
```

- [ ] **Step 4: Run it, confirm PASS**

Run: `bash -lc 'source ~/.nvm/nvm.sh; nvm use 20 >/dev/null; cd /home/sean/workspace/sideline && npm test -- score-header'`
Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add lib/score-header.ts test/score-header.test.ts
git commit -m "feat: scoreHeaderResult (neutral lead/won/tie indicator)"
```

---

## Task 2: `ScoreHeader` component + CSS

**Files:**
- Create: `components/ScoreHeader.tsx`
- Modify: `app/globals.css` (append)

- [ ] **Step 1: Create the component** — `components/ScoreHeader.tsx`:

```tsx
"use client";
import React from "react";
import { scoreHeaderResult } from "@/lib/score-header";

// Shared score header for the editor (persistent, above the tabs) and the public page.
// Teams are passed already ordered home-left / away-right. Result indicator is neutral:
// "Leading by N" (in play) / "Won by N" (full time) under the leader, or "Tie" centred.
export default function ScoreHeader({
  homeName, awayName, homeStr, awayStr, homeColors, awayColors, grade, dateStr, homeTotal, awayTotal, phase,
}: {
  homeName: string; awayName: string;
  homeStr: string; awayStr: string;
  homeColors: [string, string]; awayColors: [string, string];
  grade: string; dateStr: string;
  homeTotal: number; awayTotal: number; phase: string;
}) {
  const r = scoreHeaderResult({ homeTotal, awayTotal, phase });
  const flag = (c: [string, string]) => (
    <span className="sh-flag"><i style={{ background: c[0] }} /><i style={{ background: c[1] }} /></span>
  );
  const lead = (side: "home" | "away") =>
    r.kind !== "tie" && r.side === side
      ? <span className="sh-lead">{r.kind === "won" ? "Won by" : "Leading by"} {r.margin}</span>
      : null;
  return (
    <div className="sh">
      <div className="sh-meta"><span>{(grade || "Match").toUpperCase()}</span><span>{dateStr}</span></div>
      <div className="sh-row">
        <div className="sh-team">{flag(homeColors)}<div className="sh-nm">{homeName}</div><div className="sh-sc">{homeStr}</div>{lead("home")}</div>
        {r.kind === "tie" ? <span className="sh-tie">TIE</span> : <span className="sh-dash">–</span>}
        <div className="sh-team">{flag(awayColors)}<div className="sh-nm">{awayName}</div><div className="sh-sc">{awayStr}</div>{lead("away")}</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Append CSS** — add to the END of `app/globals.css`:

```css
/* --- Shared ScoreHeader (v47) --- */
.sh { background: var(--card, #11171d); border-radius: 10px; padding: 14px; }
.sh-meta { display: flex; justify-content: space-between; color: var(--muted, #6f7d72); font-size: 11px; letter-spacing: .5px; text-transform: uppercase; margin-bottom: 12px; }
.sh-row { display: flex; align-items: flex-start; justify-content: center; gap: 12px; }
.sh-team { display: flex; flex-direction: column; align-items: center; gap: 5px; flex: 1; }
.sh-flag { display: flex; } .sh-flag i { width: 13px; height: 18px; display: block; }
.sh-nm { font-weight: 700; font-size: 15px; }
.sh-sc { font-weight: 800; font-size: 30px; line-height: 1; font-variant-numeric: tabular-nums; }
.sh-dash { color: var(--muted, #475569); font-size: 24px; align-self: center; }
.sh-tie { align-self: center; font-size: 11px; font-weight: 800; letter-spacing: 1px; color: #8a6d1a; background: #fdf0c8; border-radius: 6px; padding: 4px 10px; }
.sh-lead { margin-top: 4px; font-size: 11px; font-weight: 800; letter-spacing: .5px; color: #14532d; background: #c9f0d6; border-radius: 6px; padding: 3px 9px; }
```

> The app's light theme differs from the dark mockups; these colours read on the app's surfaces. If `globals.css` defines theme variables for card/muted, the fallbacks keep it correct.

- [ ] **Step 3: Typecheck**

Run: `bash -lc 'source ~/.nvm/nvm.sh; nvm use 20 >/dev/null; cd /home/sean/workspace/sideline && npx tsc --noEmit'`
Expected: no errors referencing `ScoreHeader.tsx`.

- [ ] **Step 4: Commit**

```bash
git add components/ScoreHeader.tsx app/globals.css
git commit -m "feat: shared ScoreHeader component"
```

---

## Task 3: PublicMatch uses ScoreHeader

**Files:**
- Modify: `components/PublicMatch.tsx`

The public page currently renders its score header inline as `pm-head` (a topline, meta, two `pm-team` blocks, and a `pm-result` pill). Replace that whole block with `<ScoreHeader>`, ordered home-left/away-right.

- [ ] **Step 1: Add imports**

In `components/PublicMatch.tsx`, after the existing `import AppHeader from "@/components/AppHeader";` line, add:

```tsx
import ScoreHeader from "@/components/ScoreHeader";
import { gpTotal } from "@/lib/util";
```

- [ ] **Step 2: Replace the `pm-head` block**

Replace this entire block:

```tsx
      {/* score header */}
      <div className="pm-head">
        <div className="pm-topline"><i style={{ background: m.colorUs }} /><i style={{ background: m.colorThem }} /></div>
        <div className="pm-meta">
          <span>{(m.grade || m.sport || "Match").toUpperCase()}</span>
          <span>{m.dateStr}</span>
        </div>
        <div className="pm-teams">
          <div className="pm-team">
            <span className="pm-flag"><i style={{ background: m.colorUs }} /><i style={{ background: m.colorUs2 }} /></span>
            <div className="pm-name">{m.usName}</div>
            <div className="pm-score">{m.totals.us.str}</div>
          </div>
          <div className="pm-dash">–</div>
          <div className="pm-team">
            <span className="pm-flag"><i style={{ background: m.colorThem }} /><i style={{ background: m.colorThem2 }} /></span>
            <div className="pm-name">{m.themName} ({m.homeAway === "home" ? "A" : "H"})</div>
            <div className="pm-score">{m.totals.them.str}</div>
          </div>
        </div>
        {m.result && <span className="pm-result" style={{ background: resBg, color: resFg }}>{resFull}</span>}
      </div>
```

with:

```tsx
      {/* score header (shared with the editor) */}
      {(() => {
        const usIsHome = m.homeAway === "home";
        const usTotal = gpTotal(m.totals.us.g, m.totals.us.p, m.effMode);
        const themTotal = gpTotal(m.totals.them.g, m.totals.them.p, m.effMode);
        const phase = (m.halfMarks || []).some((mk: any) => mk.marker === "FT") ? "over" : "play";
        return (
          <ScoreHeader
            homeName={usIsHome ? m.usName : m.themName}
            awayName={usIsHome ? m.themName : m.usName}
            homeStr={usIsHome ? m.totals.us.str : m.totals.them.str}
            awayStr={usIsHome ? m.totals.them.str : m.totals.us.str}
            homeColors={usIsHome ? [m.colorUs, m.colorUs2] : [m.colorThem, m.colorThem2]}
            awayColors={usIsHome ? [m.colorThem, m.colorThem2] : [m.colorUs, m.colorUs2]}
            grade={m.grade || m.sport || ""}
            dateStr={m.dateStr}
            homeTotal={usIsHome ? usTotal : themTotal}
            awayTotal={usIsHome ? themTotal : usTotal}
            phase={phase}
          />
        );
      })()}
```

> The old `resBg`/`resFg`/`resFull`/`resTxt`/`margin` locals near the top of the component are now unused. Leave them — they're harmless `const`s and removing them risks touching unrelated lines. (If `tsc`/lint complains about unused vars, it does not for this `@ts`-typed file at build; leave them.)

- [ ] **Step 3: Build**

Run: `bash -lc 'source ~/.nvm/nvm.sh; nvm use 20 >/dev/null; cd /home/sean/workspace/sideline && npm run build'`
Expected: success.

- [ ] **Step 4: Commit**

```bash
git add components/PublicMatch.tsx
git commit -m "feat: public page uses shared ScoreHeader (neutral result indicator)"
```

---

## Task 4: Editor — score header, tab set, timeline-in-Details, default tab

**Files:**
- Modify: `components/MatchTracker.tsx`

Apply by matching exact snippets. If one doesn't match, STOP and report BLOCKED.

- [ ] **Step 1: Import ScoreHeader**

Replace:

```tsx
import ShareSheet from "@/components/ShareSheet";
import AppHeader from "@/components/AppHeader";
```

with:

```tsx
import ShareSheet from "@/components/ShareSheet";
import AppHeader from "@/components/AppHeader";
import ScoreHeader from "@/components/ScoreHeader";
```

- [ ] **Step 2: Initial tab + default-tab-on-open effect**

Replace:

```tsx
  const [tab, setTab] = useState("overview");
```

with:

```tsx
  const [tab, setTab] = useState("details");
```

Then, immediately AFTER this existing effect:

```tsx
  useEffect(() => { setBlkEdit(null); setBlkIns(null); setLineupEdit(null); }, [curId]);
```

add:

```tsx
  // default tab when a match opens: Game mode while unfinished, Details once it's full time.
  // Keyed on curId so it only fires on open, never mid-session (won't yank the user off a tab).
  useEffect(() => { if (curId) setTab(phase === "over" ? "details" : "game"); /* eslint-disable-next-line */ }, [curId]);
  // switching tabs closes any open Advanced editor and resets the game-mode stage
  useEffect(() => { setBlkEdit(null); setBlkIns(null); setLineupEdit(null); setGmStage({ stage: "team" }); }, [tab]);
```

> `phase` and `setGmStage` are defined later in the component; both are in scope at call time (closures), and `phase` is recomputed each render so the effect reads the freshly-loaded match's phase. `gmStage` is introduced in Task 5 — this plan is executed in order, but if Task 5 hasn't run yet the `setGmStage` reference won't resolve; **do Task 4 and Task 5 as one continuous unit and run the build only at the end of Task 5.** (Commit at the end of each, but expect `tsc` to flag `setGmStage` until Task 5 adds it.)

- [ ] **Step 3: Tab definitions + keys**

Replace:

```tsx
  const tabs = [["overview", "Overview"], ["timeline", "Timeline"], ["lineup", "Lineup"], ["notation", "Notation / Live"]];
```

with:

```tsx
  const tabs = [["details", "Details"], ["lineup", "Lineup"], ["game", "Game mode"], ["advanced", "Advanced"]];
```

- [ ] **Step 4: Replace the `mt-board` scoreboard with `<ScoreHeader>`**

Replace this entire block:

```tsx
      {/* scoreboard */}
      {!nw && (
      <div className="mt-board">
        <div className="mt-meta">{sportLabel || "Match"} · {header.homeAway === "away" ? "Away" : header.homeAway === "home" ? "Home" : ""} {header.label ? "· " + header.label : ""}{matchDate ? " · " + fmtDate(matchDate) : ""}</div>
        <div className="mt-score">
          <div className="mt-team">
            <div className="nm"><span className="mt-chip" style={{ background: `linear-gradient(135deg, ${colorUs} 0 50%, ${colorUs2} 50% 100%)` }} /><b>{usName}</b></div>
            <div className="mt-big">{totals.us.str}</div>
            <div className="mt-tot">{effMode === "gaa" ? `${totals.us.total} pts` : "goals"}</div>
          </div>
          <div className="mt-vs">vs</div>
          <div className="mt-team">
            <div className="nm"><b>{themName}</b><span className="mt-chip" style={{ background: `linear-gradient(135deg, ${colorThem} 0 50%, ${colorThem2} 50% 100%)` }} /></div>
            <div className="mt-big">{totals.them.str}</div>
            <div className="mt-tot">{effMode === "gaa" ? `${totals.them.total} pts` : "goals"}</div>
          </div>
        </div>
        <div className="mt-resbar">
          <span className={"mt-res " + result}>
            {result === "Win" ? "Win" : result === "Loss" ? "Defeat" : "Draw"}
            {effMode === "gaa" && totals.us.total !== totals.them.total ? ` by ${Math.abs(totals.us.total - totals.them.total)}` : ""}
          </span>
        </div>
      </div>
      )}
```

with:

```tsx
      {/* score header (shared with the public page) */}
      {!nw && (() => {
        const usIsHome = header.homeAway === "home";
        const usTotal = gpTotal(totals.us.g, totals.us.p, effMode);
        const themTotal = gpTotal(totals.them.g, totals.them.p, effMode);
        return (
          <ScoreHeader
            homeName={usIsHome ? usName : themName}
            awayName={usIsHome ? themName : usName}
            homeStr={usIsHome ? totals.us.str : totals.them.str}
            awayStr={usIsHome ? totals.them.str : totals.us.str}
            homeColors={usIsHome ? [colorUs, colorUs2] : [colorThem, colorThem2]}
            awayColors={usIsHome ? [colorThem, colorThem2] : [colorUs, colorUs2]}
            grade={header.label || sportLabel || ""}
            dateStr={matchDate ? fmtDate(matchDate) : ""}
            homeTotal={usIsHome ? usTotal : themTotal}
            awayTotal={usIsHome ? themTotal : usTotal}
            phase={phase}
          />
        );
      })()}
```

- [ ] **Step 5: Extract the timeline into a reusable render**

The body currently has a standalone timeline tab. Convert it to a function so Details and Game mode can both use it. Replace the opening of the timeline block:

```tsx
        {view === "timeline" && (
          <div className="mt-tl">
```

with:

```tsx
        {false && (
          <div className="mt-tl">
```

Then find the matching close of that block (the `</div>` that ends `mt-tl`, followed by `)}`):

```tsx
            {timeline.length === 0 && <p style={{ color: "#6f7d72" }}>No events parsed.</p>}
          </div>
        )}
```

and replace it with:

```tsx
            {timeline.length === 0 && <p style={{ color: "#6f7d72" }}>No events parsed.</p>}
          </div>
        )}
        {/* timeline is rendered via renderTimeline() inside Details and Game mode */}
```

Then **define `renderTimeline` above the `return`** — add this just before `return (` (right after the `const view = ...` line you'll change in Task 5; for now add it after the `const tabs = ...` line). It is the same JSX, parameterised by nothing (uses closures):

```tsx
  const renderTimeline = () => (
    <div className="mt-tl">
      {[1, 2].map((h) => {
        const items = timeline.filter((t) => t.half === h);
        if (!items.length) return null;
        const mk = halfMarks.find((m) => m.half === h && m.clock);
        const addedMk = halfMarks.find((m) => m.half === h && m.marker && m.added > 0);
        return (
          <div key={h}>
            <div className="mt-half">{h === 1 ? "First half" : "Second half"}{mk ? ` · ${mk.clock}` : ""}</div>
            {items.map((it, i) => {
              if (it.kind === "score") {
                const descriptive = !it.sure && it.scorer && it.scorer !== "Opposition" && it.scorer !== "Unknown";
                const evName = it.scorer === "Opposition" ? themName : it.scorer;
                return (
                  <div key={i} className={`mt-ev ${it.side} ${it.type}`} style={{ "--dot": it.side === "us" ? colorUs : colorThem, "--ring": it.side === "us" ? colorUs2 : colorThem2 }}>
                    <span className="m">{it.mmin || it.minute}'</span>
                    <span>
                      {descriptive
                        ? <>{it.type === "goal" && <span className="mt-pill goal" style={{ marginLeft: 0, marginRight: 6 }}>goal</span>}<span style={{ color: "#6f7d72" }}>{it.desc || it.scorer}</span></>
                        : <>{evName}{it.type === "goal" ? <span className="mt-pill goal">goal</span> : it.fromFree ? <span className="mt-pill free">free</span> : it.setPiece ? <span className="mt-pill free">'{it.setPiece}</span> : ""}</>}
                    </span>
                    <span className="sc">{it.usScore} – {it.themScore}</span>
                  </div>
                );
              }
              if (it.kind === "card") {
                const whoTxt = it.side === "them" && (!it.who || /^t\d*$/i.test(it.who)) ? themName : (it.who || usName);
                return <div key={i} className={"mt-ev note" + (it.side === "them" ? " them" : "")}>
                  <span className="m">{it.minute != null ? `${it.mmin || it.minute}'` : "✎"}</span>
                  <span><span style={{ display: "inline-block", width: 9, height: 12, borderRadius: 2, background: it.card === "red" ? "#e74c3c" : "#f1c40f", border: "1px solid rgba(0,0,0,.25)", verticalAlign: "-2px", marginRight: 6 }} />{whoTxt}</span>
                </div>;
              }
              if (it.kind === "corner") {
                const nth = timeline.filter((x) => x.kind === "corner" && x.side === it.side && x.seq <= it.seq).length;
                const ord = nth === 1 ? "1st" : nth === 2 ? "2nd" : nth === 3 ? "3rd" : `${nth}th`;
                return <div key={i} className={"mt-ev note" + (it.side === "them" ? " them" : "")}>
                  <span className="m">{it.minute != null ? `${it.mmin || it.minute}'` : "✎"}</span>
                  <span style={{ color: "#6f7d72" }}>⚑ {ord} corner — {it.side === "them" ? themName : usName}</span>
                </div>;
              }
              if (it.kind === "sub") return <div key={i} className="mt-ev subev"><span className="m">{it.minute != null ? `${it.mmin || it.minute}'` : ""}</span><span><span style={{ color: "#1f7a4d", fontWeight: 600 }}>▲ {it.on}</span>&ensp;<span style={{ color: "#c0392b", fontWeight: 600 }}>▼ {it.off}</span></span></div>;
              return <div key={i} className="mt-ev note"><span className="m">{it.minute != null ? `${it.mmin || it.minute}'` : "✎"}</span><span style={{ color: "#6f7d72" }}>{it.text}</span></div>;
            })}
            {addedMk && <div className="mt-ev mid"><span className="chip">⏱ +{addedMk.added} added</span></div>}
          </div>
        );
      })}
      {timeline.length === 0 && <p style={{ color: "#6f7d72" }}>No events parsed.</p>}
    </div>
  );
```

> This duplicates the dead `{false && ...}` block intentionally — once verified, you may delete the `{false && (<div className="mt-tl">…</div>)}` block to avoid duplication, but it is dead and harmless if left. Deleting it is preferred; if deletion risks a mismatch, leave it.

- [ ] **Step 6: Rename the Overview view to Details and append the timeline**

Replace:

```tsx
        {view === "overview" && (
          <>
```

with:

```tsx
        {view === "details" && (
          <>
```

Then, in that Details block, replace its closing — the opposition-scorers conditional's end followed by the fragment close:

```tsx
                </table>
              </>
            )}
          </>
        )}
```

with:

```tsx
                </table>
              </>
            )}
            <p className="mt-h" style={{ marginTop: 18 }}>Timeline</p>
            {renderTimeline()}
          </>
        )}
```

- [ ] **Step 7: Rename the Notation view key to Advanced**

Replace:

```tsx
        {view === "notation" && (
```

with:

```tsx
        {view === "advanced" && (
```

- [ ] **Step 8: Commit (build runs at end of Task 5)**

```bash
git add components/MatchTracker.tsx
git commit -m "feat: editor score header + Details/Lineup/Game/Advanced tabs + timeline in Details"
```

> Do not run `npm run build` yet — `setGmStage` (referenced in Step 2) is added in Task 5. Proceed directly to Task 5.

---

## Task 5: Editor — Game mode as a tab + remove the Advanced live panel

**Files:**
- Modify: `components/MatchTracker.tsx`

- [ ] **Step 1: Replace the `gm` state with `gmStage`**

Replace:

```tsx
  // game mode: full-screen live entry — null when off, else {stage, team?, ev?, off?}
  // stages: "team" → "event" → "who"; "subOff" → "subOn" for substitutions
  const [gm, setGm] = useState(null);
```

with:

```tsx
  // game mode is a tab (tab === "game"); gmStage holds the staged-entry position.
  // stages: "team" → "event" → "who"; "subOff" → "subOn" for substitutions.
  const [gmStage, setGmStage] = useState({ stage: "team" });
```

- [ ] **Step 2: Drop the game-mode enter/exit helpers; clean `enterNew`/`enterShare`**

Replace:

```tsx
  // game mode entry closes every open editor/panel — same rule as other raw-mutation paths
  const enterGame = () => { setBlkEdit(null); setBlkIns(null); setLineupEdit(null); setModal(null); setColorPick(null); setMenuOpen(false); setGm({ stage: "team" }); };
  const exitGame = () => setGm(null);

  // the wizard touches nothing until its final step, so Cancel is just setNw(null)
  const enterNew = () => { setMenuOpen(false); setModal(null); setColorPick(null); setBlkEdit(null); setBlkIns(null); setLineupEdit(null); setGm(null); setNw({ stage: "date", date: toLocalInput(new Date()), team: "", label: "", sport: null, homeAway: "away", colors: null, oppName: "" }); };
  const enterShare = () => {
    setMenuOpen(false);
    if (!curId) { setSavedMsg("Save the match first, then share"); setTimeout(() => setSavedMsg(""), 2500); return; }
    setModal(null); setColorPick(null); setBlkEdit(null); setBlkIns(null); setLineupEdit(null); setGm(null); setNw(null);
    setShare(true);
  };
```

with:

```tsx
  // the wizard touches nothing until its final step, so Cancel is just setNw(null)
  const enterNew = () => { setMenuOpen(false); setModal(null); setColorPick(null); setBlkEdit(null); setBlkIns(null); setLineupEdit(null); setNw({ stage: "date", date: toLocalInput(new Date()), team: "", label: "", sport: null, homeAway: "away", colors: null, oppName: "" }); };
  const enterShare = () => {
    setMenuOpen(false);
    if (!curId) { setSavedMsg("Save the match first, then share"); setTimeout(() => setSavedMsg(""), 2500); return; }
    setModal(null); setColorPick(null); setBlkEdit(null); setBlkIns(null); setLineupEdit(null); setNw(null);
    setShare(true);
  };
```

- [ ] **Step 3: `view` computation (game is now a tab)**

Replace:

```tsx
  const view = gm ? "game" : nw ? "new" : tab; // game mode / new-match wizard replace the tab body; Share is an inline panel
```

with:

```tsx
  const view = nw ? "new" : tab; // new-match wizard replaces the tab body; game mode is the "game" tab; Share is an inline panel
```

- [ ] **Step 4: Drop `gm` from the chrome guards**

There are five `{!(gm || nw) &&` guards (header, modal, ShareSheet panel, settings, colour-picker) and the tabs guard. Replace **each** occurrence of `!(gm || nw)` with `!nw`. Concretely, replace `{!(gm || nw) && (` → `{!nw && (` (header, modal-less—careful), and the specific ones:

- `{!(gm || nw) && (` before `<AppHeader` → `{!nw && (`
- `{!(gm || nw) && modal && (` → `{!nw && modal && (`
- `{!(gm || nw) && share && curId && (` → `{!nw && share && curId && (`
- `{!(gm || nw) && (` before `<div className="mt-settings">` → `{!nw && (`
- `{!(gm || nw) && colorPick && (() => {` → `{!nw && colorPick && (() => {`
- `{!(gm || nw) && (` before `<div className="mt-tabs">` → `{!nw && (`

After this step, grep to confirm zero remaining: `grep -n '(gm || nw)\|\bgm\b' components/MatchTracker.tsx` should show no `gm` references except `gmStage`.

- [ ] **Step 5: Rework the Game-mode tab body**

Replace the game body header row + never-saved block + the `gm.stage === "team"` opening:

```tsx
        {view === "game" && (
          <div className="mt-game">
            <div className="mt-row" style={{ marginBottom: 12 }}>
              <span className="mt-h" style={{ margin: 0, flex: 1 }}>
                {phase === "pre" ? "Before throw-in" : phase === "ht" ? "Half time" : phase === "over" ? "Full time" : `Half ${halfMarks.filter((m) => !m.marker).length} — in play`}
              </span>
              <button className="mt-add alt" onClick={exitGame}>✕ Exit</button>
            </div>
            {/* a never-saved match doesn't auto-save, and the Save button is hidden in here */}
            {!curId && (
              <div className="mt-warn" style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ flex: 1 }}><b>Not saved yet</b> — auto-save is off until the first save.</span>
                <button className="mt-add" onClick={doSave}>Save</button>
              </div>
            )}

            {/* stage 1 — who? (+ phase-gated match controls) */}
            {gm.stage === "team" && (
```

with:

```tsx
        {view === "game" && (
          <div className="mt-game">
            <div className="mt-row" style={{ marginBottom: 12 }}>
              <span className="mt-h" style={{ margin: 0, flex: 1 }}>
                {phase === "pre" ? "Before throw-in" : phase === "ht" ? "Half time" : phase === "over" ? "Full time" : `Half ${halfMarks.filter((m) => !m.marker).length} — in play`}
              </span>
            </div>

            {/* full time: only Undo + a pointer to Advanced */}
            {phase === "over" && (
              <p className="mt-note" style={{ marginTop: 0 }}>
                <b>Full time — match closed.</b> Need to change something? Edit it in the <b>Advanced</b> tab. (Or undo the FT line below to keep adding.)
              </p>
            )}

            {/* stage 1 — who? (+ phase-gated match controls) */}
            {phase !== "over" && gmStage.stage === "team" && (
```

- [ ] **Step 6: Point the remaining staged-flow references at `gmStage`/`setGmStage`**

In the game body, replace these (each appears once):

```tsx
                  <button className="mt-big gm-team" disabled={phase !== "play"} style={{ background: colorUs, color: contrastOn(colorUs) }} onClick={() => setGm({ stage: "event", team: "us" })}>{usName}</button>
                  <button className="mt-big gm-team" disabled={phase !== "play"} style={{ background: colorThem, color: contrastOn(colorThem) }} onClick={() => setGm({ stage: "event", team: "them" })}>{themName}</button>
```

with:

```tsx
                  <button className="mt-big gm-team" disabled={phase !== "play"} style={{ background: colorUs, color: contrastOn(colorUs) }} onClick={() => setGmStage({ stage: "event", team: "us" })}>{usName}</button>
                  <button className="mt-big gm-team" disabled={phase !== "play"} style={{ background: colorThem, color: contrastOn(colorThem) }} onClick={() => setGmStage({ stage: "event", team: "them" })}>{themName}</button>
```

Replace:

```tsx
                    <button className="mt-big" onClick={() => setGm({ stage: "subOff" })}>Sub</button>
```

with:

```tsx
                    <button className="mt-big" onClick={() => setGmStage({ stage: "subOff" })}>Sub</button>
```

Replace the event-stage block:

```tsx
            {/* stage 2 — what happened? */}
            {gm.stage === "event" && (
              <>
                <p className="mt-note" style={{ marginTop: 0, marginBottom: 8 }}>{gm.team === "us" ? usName : themName} — what happened?</p>
                <div className="mt-grid">
                  {liveEvents.filter((ev) => !["half", "ht", "ft"].includes(ev.key)).map((ev) => (
                    <button key={ev.key} className="mt-big ev" onClick={() => {
                      // our player events wait for a "Who?" tap; everything else lands straight in the notation
                      if (gm.team === "us" && LIVE_PLAYER_EVENTS.includes(ev.key)) setGm({ ...gm, stage: "who", ev: ev.key });
                      else { addLive(ev.key, null, gm.team); setGm({ stage: "team" }); }
                    }}>{ev.label}</button>
                  ))}
                </div>
                <button className="mt-add alt" style={{ marginTop: 12 }} onClick={() => setGm({ stage: "team" })}>← Back</button>
              </>
            )}

            {/* stage 3 — which player? */}
            {gm.stage === "who" && (
              <>
                <p className="mt-note" style={{ marginTop: 0, marginBottom: 8 }}>{liveEvents.find((ev) => ev.key === gm.ev).label} — who?</p>
                {whoGrid((p) => { addLive(gm.ev, p, gm.team); setGm({ stage: "team" }); })}
                <button className="mt-add alt" style={{ marginTop: 12 }} onClick={() => setGm({ stage: "event", team: gm.team })}>← Back</button>
              </>
            )}

            {/* sub flow — off then on, same line shape as the Lineup tab */}
            {gm.stage === "subOff" && (
              <>
                <p className="mt-note" style={{ marginTop: 0, marginBottom: 8 }}>Substitution — who goes off?</p>
                {whoGrid((p) => p !== "unknown" && setGm({ stage: "subOn", off: p }))}
                <button className="mt-add alt" style={{ marginTop: 12 }} onClick={() => setGm({ stage: "team" })}>← Back</button>
              </>
            )}
            {gm.stage === "subOn" && (
              <>
                <p className="mt-note" style={{ marginTop: 0, marginBottom: 8 }}>{gm.off.name} off — who comes on?</p>
                {whoGrid((p) => { if (p === "unknown") return; completeSub(p.name, gm.off.name); setGm({ stage: "team" }); })}
                <button className="mt-add alt" style={{ marginTop: 12 }} onClick={() => setGm({ stage: "subOff" })}>← Back</button>
              </>
            )}

            {/* pinned bottom: last entry + undo */}
            <div className="gm-undo">
              <span className="t">{undoTarget ? `Last: ${undoTarget.text}` : "Nothing added yet"}</span>
              <button className="mt-add alt" disabled={!undoTarget} onClick={doUndo}>↩ Undo</button>
            </div>
          </div>
        )}
```

with:

```tsx
            {/* stage 2 — what happened? */}
            {phase !== "over" && gmStage.stage === "event" && (
              <>
                <p className="mt-note" style={{ marginTop: 0, marginBottom: 8 }}>{gmStage.team === "us" ? usName : themName} — what happened?</p>
                <div className="mt-grid">
                  {liveEvents.filter((ev) => !["half", "ht", "ft"].includes(ev.key)).map((ev) => (
                    <button key={ev.key} className="mt-big ev" onClick={() => {
                      // our player events wait for a "Who?" tap; everything else lands straight in the notation
                      if (gmStage.team === "us" && LIVE_PLAYER_EVENTS.includes(ev.key)) setGmStage({ ...gmStage, stage: "who", ev: ev.key });
                      else { addLive(ev.key, null, gmStage.team); setGmStage({ stage: "team" }); }
                    }}>{ev.label}</button>
                  ))}
                </div>
                <button className="mt-add alt" style={{ marginTop: 12 }} onClick={() => setGmStage({ stage: "team" })}>← Back</button>
              </>
            )}

            {/* stage 3 — which player? */}
            {phase !== "over" && gmStage.stage === "who" && (
              <>
                <p className="mt-note" style={{ marginTop: 0, marginBottom: 8 }}>{liveEvents.find((ev) => ev.key === gmStage.ev).label} — who?</p>
                {whoGrid((p) => { addLive(gmStage.ev, p, gmStage.team); setGmStage({ stage: "team" }); })}
                <button className="mt-add alt" style={{ marginTop: 12 }} onClick={() => setGmStage({ stage: "event", team: gmStage.team })}>← Back</button>
              </>
            )}

            {/* sub flow — off then on, same line shape as the Lineup tab */}
            {phase !== "over" && gmStage.stage === "subOff" && (
              <>
                <p className="mt-note" style={{ marginTop: 0, marginBottom: 8 }}>Substitution — who goes off?</p>
                {whoGrid((p) => p !== "unknown" && setGmStage({ stage: "subOn", off: p }))}
                <button className="mt-add alt" style={{ marginTop: 12 }} onClick={() => setGmStage({ stage: "team" })}>← Back</button>
              </>
            )}
            {phase !== "over" && gmStage.stage === "subOn" && (
              <>
                <p className="mt-note" style={{ marginTop: 0, marginBottom: 8 }}>{gmStage.off.name} off — who comes on?</p>
                {whoGrid((p) => { if (p === "unknown") return; completeSub(p.name, gmStage.off.name); setGmStage({ stage: "team" }); })}
                <button className="mt-add alt" style={{ marginTop: 12 }} onClick={() => setGmStage({ stage: "subOff" })}>← Back</button>
              </>
            )}

            {/* pinned bottom: last entry + undo */}
            <div className="gm-undo">
              <span className="t">{undoTarget ? `Last: ${undoTarget.text}` : "Nothing added yet"}</span>
              <button className="mt-add alt" disabled={!undoTarget} onClick={doUndo}>↩ Undo</button>
            </div>

            {/* running timeline beneath the controls */}
            <p className="mt-h" style={{ marginTop: 16 }}>Timeline</p>
            {renderTimeline()}
          </div>
        )}
```

- [ ] **Step 7: Remove the "Add as it happens" live panel from the Advanced tab**

Replace this block (the live panel at the top of the Advanced body):

```tsx
            <div className="mt-live">
              <div className="mt-row" style={{ marginBottom: 8 }}>
                <p className="mt-h" style={{ margin: 0, flex: 1 }}>Add as it happens</p>
                <button className="mt-add" onClick={enterGame}>▶ Game mode</button>
                <button className="mt-add alt" disabled={!undoTarget} onClick={doUndo}>↩ Undo</button>
              </div>
              <div className="mt-grid" style={{ marginBottom: 8 }}>
                <button className={"mt-big" + (lvTeam === "us" ? " on" : " off")} style={{ background: colorUs, color: contrastOn(colorUs) }} onClick={() => { setLvTeam("us"); setLvEvent(null); }}>{usName}</button>
                <button className={"mt-big" + (lvTeam === "them" ? " on" : " off")} style={{ background: colorThem, color: contrastOn(colorThem) }} onClick={() => { setLvTeam("them"); setLvEvent(null); }}>{themName}</button>
              </div>
              <div className="mt-grid">
                {liveEvents.map((ev) => (
                  <button key={ev.key} className={"mt-big ev" + (lvEvent === ev.key ? " on" : "")} disabled={!evEnabled(ev.key)}
                    onClick={() => {
                      // our player events wait for a "Who?" tap; everything else lands straight in the notation
                      if (lvTeam === "us" && LIVE_PLAYER_EVENTS.includes(ev.key)) setLvEvent(lvEvent === ev.key ? null : ev.key);
                      else addLive(ev.key, null);
                    }}>{ev.label}</button>
                ))}
              </div>
              {phase !== "play" && (
                <p className="mt-note" style={{ marginTop: 8, marginBottom: 0 }}>
                  {phase === "pre" ? "Tap Start half at throw-in to open scoring." : phase === "ht" ? "Half time — Start half opens the second half. Subs live in the Lineup tab." : "Full time — match closed. Undo the FT line to keep adding."}
                </p>
              )}
              {lvEvent && lvTeam === "us" && phase === "play" && (
                <>
                  <p className="mt-note" style={{ marginTop: 10, marginBottom: 4 }}>Who? — tap to add</p>
                  {whoGrid((p) => addLive(lvEvent, p))}
                </>
              )}
            </div>
            <div className="mt-row" style={{ marginTop: 14, marginBottom: 6 }}>
```

with:

```tsx
            <div className="mt-row" style={{ marginTop: 0, marginBottom: 6 }}>
```

> This deletes the manual live-entry panel (Game mode is now the sole live-entry surface). The shared helpers `addLive`, `whoGrid`, `liveEvents`, `evEnabled`, `buildEventLine` stay — the Game-mode tab and the block-insert forms still use them. `lvTeam`/`lvEvent` state is now unused but harmless; leave the `useState` declarations (removing them risks unrelated edits).

- [ ] **Step 8: Typecheck, build, full test**

Run: `bash -lc 'source ~/.nvm/nvm.sh; nvm use 20 >/dev/null; cd /home/sean/workspace/sideline && npx tsc --noEmit && npm run build && npm test 2>&1 | tail -4'`
Expected: `tsc` clean, build success, all tests pass (174 = 168 + 6 from Task 1).
Also confirm: `grep -nE '\bgm\b|enterGame|exitGame|view === "timeline"|view === "overview"|view === "notation"' components/MatchTracker.tsx` → no matches (only `gmStage`/`renderTimeline`/`view === "game"` remain).

- [ ] **Step 9: Commit**

```bash
git add components/MatchTracker.tsx
git commit -m "feat: game mode as a tab (not a takeover); timeline under controls; drop manual live panel"
```

---

## Task 6: Version bump + verify

**Files:**
- Modify: `lib/constants.ts`

- [ ] **Step 1: Bump APP_VERSION**

Replace:

```ts
export const APP_VERSION = "v46";
```

with:

```ts
export const APP_VERSION = "v47";
```

- [ ] **Step 2: Full test + build**

Run: `bash -lc 'source ~/.nvm/nvm.sh; nvm use 20 >/dev/null; cd /home/sean/workspace/sideline && npm test 2>&1 | tail -4 && npm run build 2>&1 | tail -8'`
Expected: all tests pass (174), build success.

- [ ] **Step 3: Manual verification (dev server)**

Run `npm run dev` and check (signed in):
- Open an **in-progress** match → it lands on **Game mode**; tabs read `Details · Lineup · Game mode · Advanced`; the score header shows kit flags + "Leading by N"/"Tie" under the right team; you can switch to Details/Lineup/Advanced and back.
- Game mode: team → event → who still works (staged); Start half / HT / FT / Sub gated by phase; the **timeline shows beneath the controls**.
- Tap **FT** → Game mode shows the "Full time — edit in Advanced" message + Undo only; **Details** now shows stats + chart + scorers + the **timeline at the bottom**.
- Open a **finished** match fresh → it lands on **Details**.
- **Advanced** tab = blocks + "Edit as text" only (no "Add as it happens" panel).
- The **public page** (`/m/<code>`) score header matches the editor's (Won by N / Tie), rest unchanged.

- [ ] **Step 4: Commit**

```bash
git add lib/constants.ts
git commit -m "chore: bump APP_VERSION to v47 (editor tabs & game-mode-first)"
```

---

## Self-review notes (reconciled)

- **Spec coverage:** tabs `Details·Lineup·Game·Advanced` + default-on-open (Task 4 Step 2/3); Details carries timeline + standalone Timeline tab removed (Task 4 Step 5/6); Advanced = raw editor, live panel removed (Task 5 Step 7); Game mode as a navigable tab keeping the staged flow, only-valid-options, completed→Undo+message, timeline beneath (Task 5); never-saved Save button removed (Task 5 Step 5); shared `ScoreHeader` on editor + public with neutral Leading/Won-by/Tie indicator (Tasks 1–4); APP_VERSION bump (Task 6). Infographic/OG wording deliberately untouched.
- **Cross-task dependency:** Task 4 Step 2 references `setGmStage` introduced in Task 5 — Tasks 4 and 5 are one continuous unit; the build is only expected to pass after Task 5 Step 8. This is called out at both ends.
- **Type/name consistency:** `scoreHeaderResult`/`ScoreHeaderResult`; `ScoreHeader` props (homeName/awayName/homeStr/awayStr/homeColors/awayColors/grade/dateStr/homeTotal/awayTotal/phase) identical in component, PublicMatch caller, and editor caller; view keys `details`/`lineup`/`game`/`advanced` consistent across tabs def and body blocks; `gmStage`/`setGmStage` replace `gm`/`setGm` everywhere.
- **Risk:** the Task 5 game-body replacement is the largest single snippet — apply verbatim and grep for leftover `\bgm\b` after.
