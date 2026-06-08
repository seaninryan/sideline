# Here We Go Rebrand + herewego.ie Domain — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebrand Sideline → "Here We Go", refresh the title-bar wordmark and app icon, relocate the version number, block crawlers, and document the herewego.ie domain/SSL/auth console steps.

**Architecture:** Mostly string + CSS + asset changes across `components/`, `app/`, `lib/`, and `tools/`. No logic changes. The existing Vitest suite (143 tests) and `npm run build` are the regression guards — no test asserts the literal "Sideline", so the rename is safe. Console steps (Vercel/DNS/Supabase/Google) are documented for the user, not automated.

**Tech Stack:** Next.js 14 App Router, TypeScript, React, Vitest, Python+PIL (icon generation), Vercel + Supabase (hosting/auth).

---

## File map

- `lib/constants.ts` — bump `APP_VERSION`.
- `components/MatchTracker.tsx` — new wordmark markup + pill logo SVG; remove inline version; add footer.
- `components/SignIn.tsx`, `components/EditorApp.tsx` — `<h1>` text.
- `app/layout.tsx`, `app/m/[id]/page.tsx`, `app/m/[id]/opengraph-image.tsx` — title/name strings.
- `lib/infographic.ts` — poster footer strings.
- `app/globals.css` — `.mt-brand` / `.mt-wm` / `.mt-go` / `.mt-chant` / `.mt-foot` styles.
- `app/robots.ts` — **create**, block all crawlers.
- `tools/make-icon.py` — rewrite to draw the pill+HWG icon.
- `icon-180.png`, `icon-touch-180.png`, `public/icon-180.png`, `public/icon-touch-180.png` — regenerated.
- `CLAUDE.md`, `SETUP.md` — product-name prose.

---

## Task 1: Bump version to v41

**Files:**
- Modify: `lib/constants.ts:2`

- [ ] **Step 1: Change the version constant**

In `lib/constants.ts`, change:

```ts
export const APP_VERSION = "v40";
```
to:
```ts
export const APP_VERSION = "v41";
```

- [ ] **Step 2: Commit**

```bash
git add lib/constants.ts
git commit -m "v41: bump version for Here We Go rebrand"
```

---

## Task 2: Rename Sideline → Here We Go (strings)

**Files:**
- Modify: `components/SignIn.tsx`, `components/EditorApp.tsx`, `app/layout.tsx`, `app/m/[id]/page.tsx`, `app/m/[id]/opengraph-image.tsx`, `lib/infographic.ts`

(The title-bar logo string in `MatchTracker.tsx` is handled in Task 4, since it becomes new markup rather than a text swap.)

- [ ] **Step 1: SignIn heading**

`components/SignIn.tsx` — change `<h1>SIDELINE</h1>` to:
```tsx
<h1>HERE WE GO</h1>
```

- [ ] **Step 2: EditorApp heading**

`components/EditorApp.tsx` — change `<h1>SIDELINE</h1>` to:
```tsx
<h1>HERE WE GO</h1>
```

- [ ] **Step 3: Root metadata title**

`app/layout.tsx` — in the `metadata` object change `title: "Sideline",` to:
```ts
  title: "Here We Go",
```

- [ ] **Step 4: Public page titles**

`app/m/[id]/page.tsx` — change the two occurrences:
```ts
  if (!row) return { title: "Here We Go" };
```
```ts
  return { title: `${title} · Here We Go`, openGraph: { title, type: "website" } };
```

- [ ] **Step 5: OG image fallback name**

`app/m/[id]/opengraph-image.tsx` — in the fallback object change `usName: "Sideline"` to:
```ts
usName: "Here We Go",
```
(leave the rest of that fallback object untouched).

- [ ] **Step 6: Infographic poster strings**

`lib/infographic.ts` — change the footer wordmark (~line 34):
```ts
  parts.push(t(W / 2, 605, "HERE WE GO", 24, MUTE, { w: 700, a: "middle" }));
```
and the score-card footer (~line 249):
```ts
  body.push(T(W / 2, y + 22, `Here We Go · ${m.grade || m.sport || ""}`, 9.5, MUTE, { a: "middle", ls: 0.5 }));
```

- [ ] **Step 7: Verify build + tests still pass**

Run: `npm test`
Expected: 143 passed.

Run: `npm run build`
Expected: build succeeds (no type errors in the touched files).

- [ ] **Step 8: Commit**

```bash
git add components/SignIn.tsx components/EditorApp.tsx app/layout.tsx app/m/[id]/page.tsx app/m/[id]/opengraph-image.tsx lib/infographic.ts
git commit -m "Rename Sideline -> Here We Go across UI, metadata, OG, infographic"
```

---

## Task 3: robots.txt — block all crawlers

**Files:**
- Create: `app/robots.ts`

- [ ] **Step 1: Create the robots route**

Create `app/robots.ts`:
```ts
import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", disallow: "/" },
  };
}
```

- [ ] **Step 2: Verify it builds and serves**

Run: `npm run build`
Expected: build output lists `/robots.txt` as a generated route.

Optional local check: `npm run dev`, then `curl -s localhost:3000/robots.txt` → contains `User-Agent: *` and `Disallow: /`.

- [ ] **Step 3: Commit**

```bash
git add app/robots.ts
git commit -m "Add robots.txt blocking all crawlers (pre-launch)"
```

---

## Task 4: Title-bar wordmark + version footer

**Files:**
- Modify: `components/MatchTracker.tsx` (logo block ~line 636-643; footer before `</div>` at ~line 1311)
- Modify: `app/globals.css` (after the `.mt-ver` rule, ~line 30)

- [ ] **Step 1: Replace the logo markup**

In `components/MatchTracker.tsx`, the current `.mt-logo` block is:
```tsx
        <div className="mt-logo">
          {/* same ball as icon-180.png (tools/make-icon.py geometry) */}
          <svg width="22" height="22" viewBox="0 0 128 128" aria-hidden="true">…ball…</svg>
          SIDELINE <i className="mt-ver">{APP_VERSION}</i>
        </div>
```

Replace the **entire** `.mt-logo` div with (note: ball SVG → pill SVG, text → stacked wordmark, version removed):

```tsx
        <div className="mt-logo">
          {/* same pill as icon-180.png (tools/make-icon.py geometry) */}
          <svg width="40" height="22" viewBox="0 0 128 70" aria-hidden="true" style={{ flex: "none" }}>
            <rect x="4" y="8" width="120" height="54" rx="27" fill="#0c3b2a" stroke="#f5c518" strokeWidth="4" />
            <text x="64" y="48" fontSize="34" textAnchor="middle" style={{ fontFamily: "var(--font-bebas), sans-serif" }}>
              <tspan fill="#f4efe1">HW</tspan><tspan fill="#f5c518">G</tspan>
            </text>
          </svg>
          <span className="mt-brand">
            <span className="mt-wm">HERE WE <span className="mt-go">GO</span></span>
            <span className="mt-chant">HERE WE GO · HERE WE GO</span>
          </span>
        </div>
```

- [ ] **Step 2: Add the version footer**

In `components/MatchTracker.tsx`, find the end of the render (the notation view closes, then `</div>` at ~line 1311 closes `.mt-root` at 1312). Immediately **before** the `.mt-root`-closing `</div>` (the one at 4-space indent, line ~1312), insert:

```tsx
      {!(gm || nw || share) && (
        <div className="mt-foot">Here We Go · {APP_VERSION}</div>
      )}
```

This shows the footer in normal tab views and hides it during the game-mode / new-match / share takeovers (matching the top-bar gating).

- [ ] **Step 3: Add the CSS**

In `app/globals.css`, immediately after the existing `.mt-ver{…}` rule (~line 30), add:

```css
.mt-brand{display:flex; flex-direction:column; line-height:1;}
.mt-wm{font-family:var(--font-bebas); font-size:26px; letter-spacing:1px; line-height:.9;}
.mt-go{color:#f5c518;}
.mt-chant{font-family:var(--font-oswald); font-weight:600; font-size:8.5px; letter-spacing:2px; color:#8fb0a3; margin-top:3px;}
.mt-foot{font-family:var(--font-oswald); font-size:10px; letter-spacing:.5px; color:var(--muted); text-align:center; padding:14px 0 18px;}
```

The `.mt-logo` rule already sets Bebas/size on itself; `.mt-wm` re-declares size so the stacked wordmark matches the old 26px. The `.mt-ver` rule can stay (now unused) or be removed — leave it; it's harmless and small.

- [ ] **Step 4: Verify build + visual**

Run: `npm run build`
Expected: succeeds.

Run: `npm run dev` → open http://localhost:3000. Confirm:
- Title bar shows the pill mark + "HERE WE **GO**" (yellow GO) + the muted "HERE WE GO · HERE WE GO" tagline beneath.
- No version in the bar; `Here We Go · v41` appears centred at the bottom of the page.
- At ~320px width (devtools narrow), the tagline doesn't overflow the bar. If it does, reduce `.mt-chant` letter-spacing to `1.4px` or drop one echo (`HERE WE GO`). Apply only if needed.
- Eyeball the small "HWG" pill sitting next to the "HERE WE GO" wordmark — if it reads as redundant, it's fine to drop the bar SVG entirely (wordmark alone). Note for the user; don't change unilaterally beyond the redundancy call.

- [ ] **Step 5: Commit**

```bash
git add components/MatchTracker.tsx app/globals.css
git commit -m "Title bar: stacked HERE WE GO wordmark + pill mark; move version to footer"
```

---

## Task 5: App icon — pill + HWG (transparent)

**Files:**
- Modify: `tools/make-icon.py` (full rewrite of the drawing logic)
- Regenerate: `icon-180.png`, `icon-touch-180.png` (repo root), then copy to `public/`

- [ ] **Step 1: Rewrite the icon generator**

Replace the entire body of `tools/make-icon.py` with:

```python
#!/usr/bin/env python3
"""Generate the Here We Go app icons.

A pitch-green pill with a yellow outline and "HWG" (cream HW, yellow G),
on a TRANSPARENT background. Both outputs are identical and transparent:

- icon-180.png        favicon
- icon-touch-180.png  apple-touch-icon (iOS fills transparency with black;
                      the pill + cream/yellow stays legible there)

Text uses the bundled LiberationSans-Bold (PIL has no Bebas); the on-screen
title-bar logo uses Bebas via the web font, so they are close but not
pixel-identical. Rendered 4x and downscaled for antialiasing.

Usage: python3 tools/make-icon.py   (writes both PNGs in the repo root)
"""
import os
from PIL import Image, ImageDraw, ImageFont

S = 180          # final size (apple-touch-icon standard)
AA = 4           # supersampling factor
W = S * AA       # 720
CX = W / 2

PITCH = "#0c3b2a"
CREAM = "#f4efe1"
YELLOW = "#f5c518"

root = os.path.join(os.path.dirname(__file__), "..")
FONT = os.path.join(root, "assets", "LiberationSans-Bold.ttf")


def icon_layer():
    """Transparent RGBA layer: yellow-outlined green pill with 'HWG'."""
    layer = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    # pill geometry: mockup 128-space rect (6,34)-(122,94) r30, scaled x5.625
    x0, y0, x1, y1 = 34, 191, 686, 529
    d.rounded_rectangle([x0, y0, x1, y1], radius=169,
                        fill=PITCH, outline=YELLOW, width=22)
    # "HWG": HW cream, G yellow, centred on the pill
    font = ImageFont.truetype(FONT, 225)
    cy = (y0 + y1) / 2
    w_hw = d.textlength("HW", font=font)
    w_g = d.textlength("G", font=font)
    start = CX - (w_hw + w_g) / 2
    d.text((start, cy), "HW", font=font, fill=CREAM, anchor="lm")
    d.text((start + w_hw, cy), "G", font=font, fill=YELLOW, anchor="lm")
    return layer


icon = icon_layer().resize((S, S), Image.LANCZOS)
icon.save(os.path.join(root, "icon-180.png"), optimize=True)
icon.save(os.path.join(root, "icon-touch-180.png"), optimize=True)

print("wrote icon-180.png and icon-touch-180.png (transparent pill)")
```

- [ ] **Step 2: Regenerate the PNGs**

Run: `python3 tools/make-icon.py`
Expected: prints `wrote icon-180.png and icon-touch-180.png (transparent pill)`; both files updated in the repo root.

If PIL is missing: `pip install Pillow` (or `python3 -m pip install Pillow`) then re-run.

- [ ] **Step 3: Copy into public/**

Run: `cp icon-180.png icon-touch-180.png public/`
Expected: `public/icon-180.png` and `public/icon-touch-180.png` now match the root copies.

- [ ] **Step 4: Eyeball the PNGs**

Open `public/icon-180.png` and `public/icon-touch-180.png`. Confirm: transparent background, green pill with yellow outline, "HW" cream + "G" yellow, legible. (Optional: view on a black background to mimic iOS — the cream/yellow should still read.)

- [ ] **Step 5: Commit**

```bash
git add tools/make-icon.py icon-180.png icon-touch-180.png public/icon-180.png public/icon-touch-180.png
git commit -m "Icon: yellow-trim green HWG pill, transparent (favicon + touch)"
```

---

## Task 6: Docs prose rename

**Files:**
- Modify: `CLAUDE.md`, `SETUP.md`

- [ ] **Step 1: Rename the product in CLAUDE.md prose**

In `CLAUDE.md`, update the product name where it appears as prose (the "## What this is" line and any sentence naming the app), e.g. change the opening "Sideline — a personal match tracker…" to "Here We Go — a personal match tracker…". Update the current-version note to `v41`. Do **not** rewrite unrelated architecture text, and do **not** touch the parser-invariant assertions (final score, lead changes, etc.).

- [ ] **Step 2: Rename in SETUP.md**

In `SETUP.md`, replace user-facing "Sideline" product-name mentions with "Here We Go". Leave technical/config values (Supabase, Vercel, env var names) unchanged.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md SETUP.md
git commit -m "Docs: rename product to Here We Go"
```

---

## Task 7: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Full test suite**

Run: `npm test`
Expected: 143 passed, 0 failed.

- [ ] **Step 2: Production build**

Run: `npm run build`
Expected: succeeds; route list includes `/robots.txt`, `/`, `/m/[id]`, `/m/[id]/opengraph-image`.

- [ ] **Step 3: Manual smoke (dev)**

Run: `npm run dev`. Confirm in the browser:
- Title bar wordmark + footer version `Here We Go · v41`.
- Sign-in / loading cards read "HERE WE GO".
- Favicon (browser tab) shows the pill.
- `localhost:3000/robots.txt` → `Disallow: /`.

- [ ] **Step 4: Hand off the console steps to the user**

Surface the deploy + domain checklist (do NOT attempt to automate). Tell the user to look for **v41** after deploy. The console steps are:

  1. **Deploy:** push the production branch; Vercel auto-builds.
  2. **Vercel → Settings → Domains:** add `herewego.ie`; add `www.herewego.ie` redirecting to the apex.
  3. **Blacknight DNS:** create exactly the records Vercel shows (typically apex `@` A-record → Vercel IP; `www` CNAME → `cname.vercel-dns.com`).
  4. **SSL:** automatic once DNS resolves (Let's Encrypt via Vercel) — no action.
  5. **Supabase → Auth → URL Configuration:** Site URL `https://herewego.ie`; add `https://herewego.ie/**` to Redirect URLs (keep existing `*.vercel.app` entries).
  6. **Google Cloud → OAuth client:** add `https://herewego.ie` to Authorized JavaScript origins (redirect URI stays the `…supabase.co/auth/v1/callback`).
  7. **Verify live:** `https://herewego.ie` loads with a valid cert; Google sign-in completes from the new domain; `/robots.txt` returns `Disallow: /`.

---

## Notes for the implementer

- **TDD note:** these are string/CSS/asset changes with no new pure logic, so there are no new unit tests — the existing 143-test suite plus `npm run build` are the regression guards. Run both after each code task (already in the steps). Do not invent artificial tests for metadata strings.
- **`@ts-nocheck`:** `MatchTracker.tsx` carries `// @ts-nocheck`, so JSX edits there won't be type-checked — read the surrounding markup carefully when inserting the footer and replacing the logo block.
- **Don't hardcode the Vercel apex IP** anywhere — it's surfaced from the dashboard at setup time (Task 7).
