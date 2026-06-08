# Branded Public Page + Share Surfaces — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the public match page (`/m/[id]`) as a responsive poster-style HTML page, and apply one shared "Here We Go" brand lockup (HWG pill + wordmark + chant + `herewego.ie`) across the public page, the poster image, and the OG link-preview card.

**Architecture:** Approach A — bespoke responsive HTML for the public page, reusing the existing `Model` and the `ScoreChart` component. A new `brandPillSVG` helper in `lib/infographic.ts` is the single source of the pill mark for the two rasterised images; a new `BrandHeader` React component is the shared brand block for HTML surfaces (public page + sign-in), linking home to `/`. Brand strings centralised in `lib/constants.ts`.

**Tech Stack:** Next.js 14 App Router, React 18, TypeScript, Vitest (node env, pure-lib tests only), CSS in `app/globals.css`.

**Spec:** `docs/superpowers/specs/2026-06-08-branded-public-page-and-share-surfaces-design.md`

**Testing note:** The Vitest environment is `node` and only includes `test/**/*.test.ts` (no jsdom / testing-library). Pure SVG functions are unit-tested; the React components (`PublicMatch`, `BrandHeader`, `SignIn`) are presentational and verified by running the app in the final task. Do NOT add a DOM test harness.

---

### Task 1: Brand constants + version bump

**Files:**
- Modify: `lib/constants.ts`

- [ ] **Step 1: Add brand constants and bump the version**

In `lib/constants.ts`, change the version line:

```ts
export const APP_VERSION = "v42";
```

And add, directly below the `APP_VERSION` line:

```ts
// Brand lockup — shared across the public page, the poster image, and the OG card.
export const BRAND_HOME = "/";                       // home link target (relative — portable across prod/preview/localhost)
export const BRAND_SITE = "herewego.ie";             // domain, shown as text
export const BRAND_SITE_URL = "https://herewego.ie"; // clickable href on HTML surfaces
export const BRAND_WORDMARK = "HERE WE GO";
export const BRAND_CHANT = "Here we go · Here we go";
```

- [ ] **Step 2: Verify it compiles**

Run: `cd /home/sean/workspace/sideline && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add lib/constants.ts
git commit -m "Add brand constants, bump APP_VERSION to v42"
```

---

### Task 2: `brandPillSVG` helper

**Files:**
- Modify: `lib/infographic.ts` (add exported helper near top, after imports)
- Test: `test/brand.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `test/brand.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { brandPillSVG } from "@/lib/infographic";

describe("brandPillSVG", () => {
  it("returns an SVG group with the HWG pill geometry", () => {
    const s = brandPillSVG(10, 20, 0.5);
    expect(s).toContain('transform="translate(10,20) scale(0.5)"');
    expect(s).toContain('rx="27"');          // the pill
    expect(s).toContain('stroke="#f5c518"'); // yellow outline
  });
  it("renders HW in cream and G in yellow", () => {
    const s = brandPillSVG(0, 0, 1);
    expect(s).toContain('<tspan fill="#f4efe1">HW</tspan>');
    expect(s).toContain('<tspan fill="#f5c518">G</tspan>');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/sean/workspace/sideline && npx vitest run test/brand.test.ts`
Expected: FAIL — `brandPillSVG is not a function` / not exported.

- [ ] **Step 3: Write the implementation**

In `lib/infographic.ts`, after the existing `import` lines (before `buildScoreCardSVG`), add:

```ts
/* Shared HWG brand pill (same geometry as the app icon / top-bar logo).
   Drawn as an SVG string so the poster and OG card share one source of truth.
   Pill text uses the rasterisation font (Liberation Sans / Arial), matching the icon. */
export function brandPillSVG(x: number, y: number, scale = 1): string {
  return `<g transform="translate(${x},${y}) scale(${scale})">`
    + `<rect x="4" y="8" width="120" height="54" rx="27" fill="#0c3b2a" stroke="#f5c518" stroke-width="4"/>`
    + `<text x="64" y="50" font-family="Liberation Sans, Arial, sans-serif" font-size="40" font-weight="700" text-anchor="middle">`
    + `<tspan fill="#f4efe1">HW</tspan><tspan fill="#f5c518">G</tspan></text>`
    + `</g>`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/sean/workspace/sideline && npx vitest run test/brand.test.ts`
Expected: PASS (both tests).

- [ ] **Step 5: Commit**

```bash
git add lib/infographic.ts test/brand.test.ts
git commit -m "Add brandPillSVG shared pill helper"
```

---

### Task 3: Branded poster footer (`buildInfographicSVG`)

**Files:**
- Modify: `lib/infographic.ts` (the footer block, currently around lines 247-250)
- Test: `test/brand.test.ts` (extend)

- [ ] **Step 1: Write the failing test**

Append to `test/brand.test.ts`:

```ts
import { buildInfographicSVG } from "@/lib/infographic";
import { buildModel } from "@/lib/model";
import { SAMPLE } from "@/lib/sample";

describe("buildInfographicSVG branding", () => {
  const model = buildModel({ raw: SAMPLE, myTeam: "Racoons", scoringMode: "gaa" });
  const { svg } = buildInfographicSVG(model);
  it("carries the brand lockup in the footer", () => {
    expect(svg).toContain("HERE WE GO");
    expect(svg).toContain("herewego.ie");
    expect(svg).toContain("Here we go · Here we go".toUpperCase()); // chant rendered uppercase
    expect(svg).toContain('<tspan fill="#f4efe1">HW</tspan>');      // the pill
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/sean/workspace/sideline && npx vitest run test/brand.test.ts`
Expected: FAIL — `herewego.ie` not found (current footer says `Here We Go · <grade>`).

- [ ] **Step 3: Replace the footer block**

In `lib/infographic.ts`, add `BRAND_SITE, BRAND_WORDMARK, BRAND_CHANT` to the constants import at the top of the file:

```ts
import { BRAND_SITE, BRAND_WORDMARK, BRAND_CHANT } from "@/lib/constants";
```

Then find the footer block in `buildInfographicSVG`:

```ts
  // ---- footer ----
  body.push(L(P, y + 2, P + CW, y + 2, LINE, 1));
  body.push(T(W / 2, y + 22, `Here We Go · ${m.grade || m.sport || ""}`, 9.5, MUTE, { a: "middle", ls: 0.5 }));
  const H = y + 38;
```

Replace it with:

```ts
  // ---- brand footer ----
  body.push(L(P, y + 2, P + CW, y + 2, LINE, 1));
  const pillS = 0.5;                          // 128*0.5 = 64 wide, 70*0.5 = 35 tall
  body.push(brandPillSVG(W / 2 - 32, y + 10, pillS));
  body.push(T(W / 2, y + 62, BRAND_WORDMARK, 13, INK, { w: 800, a: "middle", ls: 1.5 }));
  body.push(T(W / 2, y + 78, BRAND_SITE, 10, MUTE, { a: "middle", ls: 0.5 }));
  body.push(T(W / 2, y + 92, BRAND_CHANT.toUpperCase(), 8, "#9aa89e", { a: "middle", ls: 2 }));
  const H = y + 104;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/sean/workspace/sideline && npx vitest run test/brand.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/infographic.ts test/brand.test.ts
git commit -m "Brand the poster footer with the HWG lockup"
```

---

### Task 4: Branded OG card lockup (`buildScoreCardSVG`)

**Files:**
- Modify: `lib/infographic.ts` (the OG card footer line in `buildScoreCardSVG`)
- Test: `test/score-card.test.ts` (extend)

- [ ] **Step 1: Write the failing test**

In `test/score-card.test.ts`, add a new `it` block inside the existing `describe("buildScoreCardSVG", ...)`:

```ts
  it("carries the brand lockup", () => {
    expect(svg).toContain("HERE WE GO");
    expect(svg).toContain("herewego.ie");
    expect(svg).toContain('<tspan fill="#f4efe1">HW</tspan>'); // the pill
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/sean/workspace/sideline && npx vitest run test/score-card.test.ts`
Expected: FAIL — `herewego.ie` not found.

- [ ] **Step 3: Replace the OG footer line**

In `lib/infographic.ts`, in `buildScoreCardSVG`, find:

```ts
  parts.push(t(W / 2, 605, "HERE WE GO", 24, MUTE, { w: 700, a: "middle" }));
```

Replace it with a horizontal lockup (pill + wordmark + domain) near the bottom. `brandPillSVG` is already defined in this file; `BRAND_SITE` / `BRAND_WORDMARK` are imported at the top (added in Task 3):

```ts
  // brand lockup: [pill] HERE WE GO   herewego.ie
  parts.push(brandPillSVG(W / 2 - 215, 565, 0.62));        // 128*0.62 ≈ 79 wide, 70*0.62 ≈ 43 tall
  parts.push(t(W / 2 - 120, 600, BRAND_WORDMARK, 30, INK, { w: 700 }));     // anchor start
  parts.push(t(W / 2 + 130, 600, BRAND_SITE, 22, MUTE, { w: 400 }));        // anchor start
```

Note: `INK` is already defined in `buildScoreCardSVG` (`#0c3b2a`).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/sean/workspace/sideline && npx vitest run test/score-card.test.ts`
Expected: PASS (the existing "no player names" test still passes — the lockup adds no names).

- [ ] **Step 5: Commit**

```bash
git add lib/infographic.ts test/score-card.test.ts
git commit -m "Brand the OG card with the HWG lockup"
```

---

### Task 5: `BrandHeader` component + CSS

**Files:**
- Create: `components/BrandHeader.tsx`
- Modify: `app/globals.css` (add `.bh-*` classes)

- [ ] **Step 1: Create the component**

Create `components/BrandHeader.tsx`:

```tsx
import React from "react";
import { BRAND_HOME, BRAND_CHANT } from "@/lib/constants";

/* Shared brand block for public/HTML surfaces (public match page, sign-in).
   The whole block links home to `/`. The editor top bar keeps its own logo. */
export default function BrandHeader() {
  return (
    <a className="bh" href={BRAND_HOME} aria-label="Here We Go — home">
      <svg className="bh-pill" width="46" height="26" viewBox="0 0 128 70" aria-hidden="true">
        <rect x="4" y="8" width="120" height="54" rx="27" fill="#0c3b2a" stroke="#f5c518" strokeWidth="4" />
        <text x="64" y="48" fontSize="34" textAnchor="middle" style={{ fontFamily: "var(--font-bebas), sans-serif" }}>
          <tspan fill="#f4efe1">HW</tspan><tspan fill="#f5c518">G</tspan>
        </text>
      </svg>
      <span className="bh-brand">
        <span className="bh-wm">HERE WE <span className="bh-go">GO</span></span>
        <span className="bh-chant">{BRAND_CHANT}</span>
      </span>
    </a>
  );
}
```

- [ ] **Step 2: Add the CSS**

Append to `app/globals.css`:

```css
/* shared brand header (public surfaces) */
.bh{display:flex; align-items:center; gap:10px; padding:12px 16px; background:#0c3b2a; text-decoration:none;}
.bh-pill{flex:none;}
.bh-brand{display:flex; flex-direction:column; line-height:1;}
.bh-wm{font-family:var(--font-bebas), sans-serif; font-size:26px; letter-spacing:1px; line-height:.9; color:#f4efe1;}
.bh-go{color:#f5c518;}
.bh-chant{font-family:var(--font-oswald), sans-serif; font-weight:600; font-size:8.5px; letter-spacing:2px; color:#8fb0a3; margin-top:3px; text-transform:uppercase;}
```

- [ ] **Step 3: Verify it compiles**

Run: `cd /home/sean/workspace/sideline && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add components/BrandHeader.tsx app/globals.css
git commit -m "Add shared BrandHeader component (links home)"
```

---

### Task 6: Rebuild `PublicMatch` as a poster-style page

**Files:**
- Modify: `components/PublicMatch.tsx` (full rewrite)
- Modify: `app/globals.css` (add `.pm-*` classes)

- [ ] **Step 1: Rewrite the component**

Replace the entire contents of `components/PublicMatch.tsx` with:

```tsx
"use client";
import React from "react";
import ScoreChart from "@/components/ScoreChart";
import BrandHeader from "@/components/BrandHeader";
import { contrastOn } from "@/lib/util";
import { BRAND_SITE, BRAND_SITE_URL, BRAND_CHANT } from "@/lib/constants";
import type { Model } from "@/lib/types";

export default function PublicMatch({ model }: { model: Model }) {
  const m = model;
  const margin = Math.abs(m.totals.us.total - m.totals.them.total);
  const resTxt = m.result === "Win" ? "WIN" : m.result === "Loss" ? "DEFEAT" : "DRAW";
  const resFull = resTxt + (m.effMode === "gaa" && margin ? ` BY ${margin}` : "");
  const resBg = m.result === "Win" ? "#f5c518" : m.result === "Loss" ? "#c0392b" : "#e7dec6";
  const resFg = m.result === "Loss" ? "#fff" : "#11241b";
  const usShort = (m.usName || "Us").split(" ")[0];
  const themShort = (m.themName || "Them").split(" ")[0];

  // subs involved (for lineup arrows), mirrors the poster
  const subOff = new Set<number>();
  (m.timeline || []).forEach((t: any) => { if (t.kind === "sub" && t.offNum != null) subOff.add(t.offNum); });
  const scoreText = (s: any) => (m.effMode === "goals" ? `${s.g}` : `${s.g}-${s.p}`) + (s.frees ? ` (${s.frees}f)` : "");
  const findName = (n: number) => { const p = (m.starters || []).find((x: any) => x.num === n); return p ? p.name : ""; };
  const halves: number[] = [...new Set((m.timeline || []).map((t: any) => t.half))].sort((a, b) => a - b);

  return (
    <div className="pm-root mt-root">
      <BrandHeader />

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
            <div className="pm-name">{m.themName} ({m.homeAway === "home" ? "H" : "A"})</div>
            <div className="pm-score">{m.totals.them.str}</div>
          </div>
        </div>
        {m.result && <span className="pm-result" style={{ background: resBg, color: resFg }}>{resFull}</span>}
      </div>

      {/* stats 2x2 */}
      <section className="pm-sec">
        <p className="pm-label">Match stats</p>
        <div className="pm-stats">
          <div className="pm-stat"><b>{m.ht || "—"}</b><span>Half-time</span></div>
          <div className="pm-stat"><b>{m.leadChanges}</b><span>Lead changes</span></div>
          <div className="pm-stat"><b>{m.timesLevel}</b><span>Times level</span></div>
          <div className="pm-stat"><b>{m.maxLead}</b><span>Biggest lead{m.maxLeadSide ? ` · ${(m.maxLeadSide === "us" ? usShort : themShort)}` : ""}</span></div>
        </div>
      </section>

      {/* chart */}
      <section className="pm-sec">
        <p className="pm-label">Score progression</p>
        <div className="pm-chart">
          <ScoreChart series={m.series} goalDots={m.goalDots} htLine={m.htLine} colorUs={m.colorUs} colorThem={m.colorThem} />
        </div>
      </section>

      {/* scorers */}
      <section className="pm-sec">
        <p className="pm-label">Scorers · {(m.usName || "").toUpperCase()}</p>
        {!m.usScorers.length && <p className="pm-empty">No scores recorded</p>}
        {m.usScorers.map((s: any, i: number) => (
          <div className="pm-scorer" key={i}>
            <span>{s.num ? `${s.num}. ` : ""}{s.name}</span><b>{scoreText(s)}</b>
          </div>
        ))}
      </section>

      {/* lineup */}
      {(m.formationRows && m.formationRows.length > 0) && (
        <section className="pm-sec">
          <p className="pm-label">Team · {(m.usName || "").toUpperCase()}</p>
          <div className="pm-pitch">
            {m.formationRows.map((row: number[], ri: number) => (
              <div className="pm-pitch-row" key={ri}>
                {row.map((n, ci) => {
                  const sc = (m.usScorers || []).find((s: any) => s.num === n && (s.g || s.p));
                  return (
                    <div className="pm-jersey" key={ci}>
                      <div className="sq" style={{ background: m.colorUs, color: contrastOn(m.colorUs) }}>{n}</div>
                      <div className="nm">{findName(n)}{subOff.has(n) ? " ▼" : ""}</div>
                      {sc && <div className="sc">{m.effMode === "goals" ? "●".repeat(sc.g) : `${sc.g}-${sc.p}`}</div>}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          {m.subs && m.subs.length > 0 && <p className="pm-bench">Subs: {m.subs.map((p: any) => `${p.num} ${p.name}`).join("  ·  ")}</p>}
          {m.missing && m.missing.length > 0 && <p className="pm-bench">Missing: {m.missing.map((p: any) => `${p.num} ${p.name}`).join("  ·  ")}</p>}
        </section>
      )}

      {/* timeline */}
      {(m.timeline && m.timeline.length > 0) && (
        <section className="pm-sec">
          <p className="pm-label">Timeline</p>
          <div className="pm-tl">
            {halves.map((h) => (
              <React.Fragment key={h}>
                <div className="pm-half"><span>{h === 1 ? "FIRST HALF" : h === 2 ? "SECOND HALF" : `PERIOD ${h}`}</span></div>
                {m.timeline.filter((t: any) => t.half === h).map((it: any, i: number) => {
                  const mm = it.minute != null ? `${it.mmin || it.minute}'` : "";
                  const us = it.side === "us";
                  if (it.kind === "score") {
                    const col = us ? m.colorUs : m.colorThem;
                    const evName = it.scorer === "Opposition" ? m.themName : it.scorer;
                    const label = `${evName}${it.type === "goal" ? "  GOAL" : it.fromFree ? "  (free)" : it.setPiece ? `  ('${it.setPiece})` : ""}`;
                    const run = `${it.usScore} – ${it.themScore}`;
                    return (
                      <div className="pm-ev" key={i}>
                        <div className="us">{us && <><span className="min">{mm}</span> {label}<div className="run">{run}</div></>}</div>
                        <div className="dot" style={{ background: col }} />
                        <div className="them">{!us && <>{mm} {label}<div className="run">{run}</div></>}</div>
                      </div>
                    );
                  }
                  if (it.kind === "sub") {
                    return (
                      <div className="pm-ev" key={i}>
                        <div className="us">{mm} <span className="on">▲ {it.on}</span> <span className="off">▼ {it.off}</span></div>
                        <div className="dot alt" />
                        <div className="them" />
                      </div>
                    );
                  }
                  return (
                    <div className="pm-ev" key={i}>
                      <div className="us note">{mm} {it.text}</div>
                      <div className="dot alt" />
                      <div className="them" />
                    </div>
                  );
                })}
              </React.Fragment>
            ))}
          </div>
        </section>
      )}

      {/* brand footer */}
      <footer className="pm-foot">
        <svg width="56" height="32" viewBox="0 0 128 70" aria-hidden="true">
          <rect x="4" y="8" width="120" height="54" rx="27" fill="#0c3b2a" stroke="#f5c518" strokeWidth="4" />
          <text x="64" y="48" fontSize="34" textAnchor="middle" style={{ fontFamily: "var(--font-bebas), sans-serif" }}>
            <tspan fill="#f4efe1">HW</tspan><tspan fill="#f5c518">G</tspan>
          </text>
        </svg>
        <a href={BRAND_SITE_URL}>{BRAND_SITE}</a>
        <div className="pm-chant">{BRAND_CHANT}</div>
      </footer>
    </div>
  );
}
```

- [ ] **Step 2: Add the `.pm-*` CSS**

Append to `app/globals.css`:

```css
/* public match page (poster-style) */
.pm-root{max-width:560px; margin:0 auto; background:var(--paper,#f4efe1); min-height:100vh;}
.pm-head{background:#0c3b2a; color:#f4efe1; padding:6px 16px 22px; position:relative;}
.pm-topline{height:6px; display:flex; margin:0 -16px 16px;}
.pm-topline i{flex:1;}
.pm-meta{display:flex; justify-content:space-between; font-size:12px; letter-spacing:1px; text-transform:uppercase; color:#cfe3d8;}
.pm-teams{display:flex; align-items:flex-start; margin-top:14px;}
.pm-team{flex:1; text-align:center;}
.pm-flag{width:34px; height:20px; border-radius:2px; overflow:hidden; display:inline-block; border:1px solid rgba(255,255,255,.55);}
.pm-flag i{display:block; height:50%;}
.pm-name{font-weight:700; font-size:16px; margin-top:8px;}
.pm-score{font-family:var(--font-bebas), sans-serif; font-size:54px; line-height:.9; margin-top:6px;}
.pm-dash{align-self:center; color:#7fa395; font-size:26px; padding:0 4px; margin-top:24px;}
.pm-result{display:block; text-align:center; margin:14px auto 0; width:max-content; padding:4px 16px; border-radius:14px; font-weight:700; font-size:13px; letter-spacing:1px;}
.pm-sec{padding:18px 16px; border-bottom:1px solid #ded4ba;}
.pm-label{font-size:11px; letter-spacing:1.5px; text-transform:uppercase; color:#6f7d72; font-weight:700; margin:0 0 12px;}
.pm-empty{color:#6f7d72; font-size:14px;}
.pm-stats{display:grid; grid-template-columns:1fr 1fr; gap:1px; background:#ded4ba;}
.pm-stat{background:var(--paper,#f4efe1); padding:14px; text-align:center;}
.pm-stat b{display:block; font-family:var(--font-bebas), sans-serif; font-size:30px; color:#0c3b2a; line-height:1;}
.pm-stat span{font-size:10px; letter-spacing:.5px; text-transform:uppercase; color:#6f7d72; font-weight:700;}
.pm-chart{background:#fff; border:1px solid #ded4ba; border-radius:10px; padding:8px;}
.pm-scorer{display:flex; justify-content:space-between; padding:9px 0; border-bottom:1px solid #ece3cb; font-size:15px;}
.pm-scorer b{color:#0c3b2a;}
.pm-pitch{background:#0c3b2a; border-radius:12px; padding:16px 8px;}
.pm-pitch-row{display:flex; justify-content:center; gap:6%; margin-bottom:18px;}
.pm-pitch-row:last-child{margin-bottom:0;}
.pm-jersey{text-align:center; width:56px;}
.pm-jersey .sq{width:34px; height:34px; border-radius:8px; margin:0 auto; display:flex; align-items:center; justify-content:center; font-family:var(--font-bebas), sans-serif; font-size:18px;}
.pm-jersey .nm{font-size:10px; color:#eaf3ee; margin-top:4px; line-height:1.1;}
.pm-jersey .sc{font-size:10px; color:#f5c518; font-weight:700;}
.pm-bench{font-size:12px; color:#6f7d72; margin:12px 0 0;}
.pm-tl{position:relative;}
.pm-tl::before{content:""; position:absolute; left:50%; top:0; bottom:0; width:2px; background:#ded4ba; transform:translateX(-1px);}
.pm-half{text-align:center; margin:6px 0 12px; position:relative;}
.pm-half span{background:var(--paper,#f4efe1); border:1px solid #ded4ba; border-radius:8px; padding:3px 12px; font-size:11px; letter-spacing:1px; font-weight:700; color:#0c3b2a;}
.pm-ev{display:grid; grid-template-columns:1fr 18px 1fr; align-items:center; gap:8px; margin:8px 0; font-size:13px;}
.pm-ev .dot{width:11px; height:11px; border-radius:50%; margin:0 auto; border:2px solid #fff;}
.pm-ev .dot.alt{background:#f4efe1; border-color:#6f7d72;}
.pm-ev .us{text-align:right;}
.pm-ev .them{text-align:left;}
.pm-ev .min{color:#6f7d72;}
.pm-ev .note{color:#6f7d72;}
.pm-ev .on{color:#1f7a4d; font-weight:700;}
.pm-ev .off{color:#c0392b; font-weight:700;}
.pm-ev .run{font-size:11px; color:#0c3b2a; font-weight:700;}
.pm-foot{background:#0c3b2a; color:#f4efe1; text-align:center; padding:22px 16px;}
.pm-foot a{color:#f5c518; font-weight:700; text-decoration:none; font-size:16px; letter-spacing:.5px; display:inline-block; margin-top:8px;}
.pm-foot a:hover{text-decoration:underline;}
.pm-chant{font-size:11px; letter-spacing:3px; color:#5f7a6c; margin-top:10px; text-transform:uppercase;}
```

- [ ] **Step 3: Verify it compiles**

Run: `cd /home/sean/workspace/sideline && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Run the full test suite (ensure nothing regressed)**

Run: `cd /home/sean/workspace/sideline && npm test`
Expected: all tests pass (143 + the new brand assertions).

- [ ] **Step 5: Commit**

```bash
git add components/PublicMatch.tsx app/globals.css
git commit -m "Rebuild public match page in poster style"
```

---

### Task 7: Use `BrandHeader` on the sign-in screen

**Files:**
- Modify: `components/SignIn.tsx`

- [ ] **Step 1: Replace the serif `<h1>` with the brand header**

In `components/SignIn.tsx`, add the import at the top:

```tsx
import BrandHeader from "@/components/BrandHeader";
```

Then replace this line inside the `.si-card`:

```tsx
      <h1>HERE WE GO</h1>
```

with:

```tsx
      <div className="si-brand"><BrandHeader /></div>
```

- [ ] **Step 2: Add a small style so the brand block sits centred on the card**

Append to `app/globals.css`:

```css
.si-brand{display:flex; justify-content:center; margin:0 0 16px;}
.si-brand .bh{background:transparent; padding:0;}
.si-brand .bh-chant{color:#6f7d72;}
```

- [ ] **Step 3: Verify it compiles**

Run: `cd /home/sean/workspace/sideline && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add components/SignIn.tsx app/globals.css
git commit -m "Use shared BrandHeader on the sign-in screen"
```

---

### Task 8: Docs, full verification, and manual check

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update the docs**

In `CLAUDE.md`:

- Bump the version note in the Versioning section: `Current: **v42**.`
- In the "Public match page + OG image" section, update the `/m/[id]` bullet to note it is now a full poster-style responsive page (brand header → score header → 2×2 stats → ScoreChart → scorers → lineup pitch → timeline → brand footer with a clickable `herewego.ie` link), and add a line: "A shared brand lockup — `brandPillSVG` (images) and `<BrandHeader>` (HTML, links home to `/`) — is applied across the public page, the poster (`buildInfographicSVG` footer), and the OG card (`buildScoreCardSVG`). The brand-as-home link is on public surfaces only; the editor top bar is unchanged."

- [ ] **Step 2: Run the full suite**

Run: `cd /home/sean/workspace/sideline && npm test`
Expected: all pass.

- [ ] **Step 3: Build to catch any Next/SSR issues**

Run: `cd /home/sean/workspace/sideline && npm run build`
Expected: build succeeds (the public page and OG route compile).

- [ ] **Step 4: Manual verification (run the app)**

Run: `cd /home/sean/workspace/sideline && npm run dev`, then:
- Open a published match at `/m/<id>` — confirm the page shows the brand header, score header with flags, stats, chart, scorers, lineup pitch, timeline, and a footer with a clickable `herewego.ie` link; the brand header links to `/`.
- In the editor, click **Share image** — confirm the poster footer shows the HWG pill + HERE WE GO + herewego.ie + chant.
- In the Share wizard step 3, confirm the OG preview (`/m/<id>/opengraph-image`) shows the pill + HERE WE GO + herewego.ie.
- Confirm the footer reads `Here We Go · v42`.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "Docs: v42 — branded public page + shared brand lockup"
```

---

## Self-review notes

- **Spec coverage:** Shared assets (Task 1, 2, 5) ✓; public page rebuild full parity (Task 6) ✓; poster footer (Task 3) ✓; OG card (Task 4) ✓; sign-in consistency (Task 7) ✓; tests (Tasks 2-4, 6) ✓; version + docs (Tasks 1, 8) ✓.
- **Testing deviation from spec:** the spec listed a `PublicMatch` render smoke test; the Vitest env is node-only with no DOM harness and the project keeps pure-lib tests only, so `PublicMatch`/`BrandHeader`/`SignIn` are verified by `npm run build` + manual run (Task 8) instead of adding jsdom. Pure SVG functions are unit-tested as specified.
- **Type consistency:** `brandPillSVG(x, y, scale)` signature is used identically in Tasks 2-4; `BRAND_SITE`/`BRAND_WORDMARK`/`BRAND_CHANT`/`BRAND_HOME`/`BRAND_SITE_URL` defined in Task 1 and consumed unchanged.
- **No placeholders:** every code step contains full code.
