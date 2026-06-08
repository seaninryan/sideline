# Branded public page + share surfaces — design

**Date:** 2026-06-08
**Status:** Approved (ready for implementation plan)
**Target version:** v42

## Problem

Three share surfaces are inconsistent and under-branded:

1. **The shared game** — the public match page at `/m/[id]` (`components/PublicMatch.tsx`) is plain HTML: a heading, the `ScoreChart`, and two bullet lists. It looks nothing like the polished poster.
2. **The match image** — `buildInfographicSVG` (portrait poster, "Share image" button) carries only a faint `Here We Go · <grade>` footer.
3. **The link preview** — `buildScoreCardSVG` (OG card, 1200×630) shows only the text `HERE WE GO`.

We want the public page rebuilt to look like the poster, and a consistent **Here We Go** brand lockup — HWG pill + wordmark + chant + `herewego.ie` — applied across all three, with a clickable home/link where the surface is HTML.

## Goals

- Rebuild the public match page as a responsive, poster-style HTML page (approach **A**: bespoke HTML reusing the `Model` and the existing `ScoreChart`).
- Apply a single, shared brand lockup to: the public page, the poster image, and the OG card.
- The brand block on **public surfaces** is a clickable home link to `/`; a `herewego.ie` link in the public-page footer is clickable. The two images show the same lockup as text (images can't carry links).

## Non-goals

- No change to the editor (`MatchTracker`) top bar behaviour — its logo stays non-clickable (decided: "public surfaces only").
- No change to parsing, the data model, auth, or storage.
- No new domain/DNS work (tracked separately).

## Shared brand assets

Single source of truth so all surfaces stay identical.

- **`lib/constants.ts`** — add brand constants:
  - `BRAND_HOME = "/"` (relative home target — portable across prod/preview/localhost)
  - `BRAND_SITE = "herewego.ie"` (display text) and `BRAND_SITE_URL = "https://herewego.ie"` (footer link href)
  - `BRAND_CHANT = "Here we go · Here we go"`
- **`lib/infographic.ts`** — add `brandPillSVG(x, y, scale): string`: draws the HWG pill (green rounded rect `#0c3b2a`, yellow outline `#f5c518`, "HW" cream `#f4efe1` + "G" yellow) using the existing `viewBox 0 0 128 70` geometry, scaled. Pill text uses the SVG's rasterization font (Liberation Sans / Arial), matching the app-icon look. Reused by `buildInfographicSVG` and `buildScoreCardSVG`.
- **`components/BrandHeader.tsx`** (new) — React brand block: inline `<svg>` HWG pill + `HERE WE GO` wordmark (Bebas) + chant subheading (the `.mt-chant`-style line). Wrapped in `<a href="/">` so the whole block is a home link. Used by `PublicMatch` and `SignIn` for consistency. (The editor top bar keeps its own inline logo — unchanged.)

Colours/fonts: HTML surfaces use the live app fonts (Bebas Neue for display numbers, Oswald base via `.mt-root`/`.pm-*`); the two images keep their rasterization-safe fonts (Arial for the poster, bundled LiberationSans for the OG card).

## Surface 1 — public match page (`PublicMatch.tsx` rebuilt)

Wiring is unchanged: `app/m/[id]/page.tsx` still fetches `is_public=true`, runs `buildModel` then `applyNameDisplay`, and renders `<PublicMatch model={model} />`. Only the component's markup/styles change. Name redaction is already applied upstream, so the page renders whatever names are in the model.

Top-to-bottom (see `.superpowers/brainstorm/public-page-mockup.html` for the validated layout):

1. **Brand bar** (`<BrandHeader/>`) — HWG pill + `HERE WE GO` wordmark + `Here we go · Here we go` chant subheading, on pitch-green, linking to `/`.
2. **Score header** — two-colour top stripe (`colorUs` / `colorThem`), grade + date row, kit flags (two-colour, like the poster), team names with `(H)`/`(A)`, the scores (Bebas), and the result pill (gold Win / red Loss / cream Draw; GAA shows "… BY `<margin>`").
3. **Stats 2×2** — Half-time, Lead changes, Times level, Biggest lead (with the leading team's first name).
4. **Score progression** — the existing `<ScoreChart>` component, unchanged (`series`, `goalDots`, `htLine`, `colorUs`, `colorThem`).
5. **Scorers · `<usName>`** — name left, `g-p (Nf)` right (goals-mode shows just goals), styled like the poster rows. Empty state: "No scores recorded".
6. **Team / lineup** — jersey grid on a green pitch panel, one row per `formationRows` entry, jersey number + name, gold scorer badge under scorers, sub-off marker; subs and missing listed beneath as in the poster.
7. **Timeline** — centre-rail, us-left / them-right, half dividers, per-event minute + label + running score, subs (▲/▼) and notes. Reflows to the rail layout on mobile.
8. **Brand footer** — HWG pill, **clickable** `herewego.ie` (`<a href="https://herewego.ie">`), faint chant line.

Styles: new `.pm-*` classes added to `app/globals.css` alongside the existing app styles. Fully responsive (single column, `max-width` ~560px centred).

## Surface 2 — match image / poster (`buildInfographicSVG`)

Replace the current single-line footer:

```
body.push(L(P, y + 2, P + CW, y + 2, LINE, 1));
body.push(T(W / 2, y + 22, `Here We Go · ${m.grade || m.sport || ""}`, 9.5, MUTE, {...}));
const H = y + 38;
```

with a brand footer: a separator line, then the `brandPillSVG` lockup + `HERE WE GO` wordmark centred, `herewego.ie` beneath, and the faint chant as the bottom line. The poster's total height `H` grows by ~24px to fit. Everything above the footer is unchanged.

## Surface 3 — link preview / OG card (`buildScoreCardSVG`)

Replace the lone bottom `HERE WE GO` text with the shared lockup: `brandPillSVG` + `HERE WE GO` wordmark side-by-side near the bottom, with `herewego.ie` as a small line beneath — same lockup as the poster, scaled for 1200×630. No player names (unchanged). The OG route (`app/m/[id]/opengraph-image.tsx`) and its `Cache-Control: public, max-age=3600` are unchanged.

## Testing

- `test/score-card.test.ts` — assert the OG SVG contains the brand lockup: `herewego.ie`, the wordmark, and the pill (e.g. the `HW`/`G` tspans or pill rect).
- New small test for `brandPillSVG` — returns a valid SVG fragment with the `HW` and `G` tspans and the pill rect.
- Assert `buildInfographicSVG` output contains `herewego.ie` and `HERE WE GO`.
- `PublicMatch` render smoke test — renders the sample model without throwing; output contains the score, the `href="/"` brand link, and the `href="https://herewego.ie"` footer link.
- The canonical `SAMPLE` parser regression in `test/parser.test.ts` is untouched and must still pass (Racoons 2-6, Wildebeests 2-7, Loss, etc.).

## Version & docs

- Bump `APP_VERSION` to **v42** in `lib/constants.ts`.
- Update `CLAUDE.md`: the public page is now a full poster-style responsive page; a shared brand lockup (`brandPillSVG` / `BrandHeader`) is applied across the public page, poster, and OG card; brand-as-home (`/`) on public surfaces only.

## Risks / notes

- The lineup pitch and centre-rail timeline are the only non-trivial responsive CSS; both reflow to a single column. Validate on a narrow viewport.
- The pill in the images uses the rasterization fonts (Arial / LiberationSans), so it will look like the app icon, not pixel-identical to the Bebas top-bar pill — acceptable and consistent with the existing icon.
- `herewego.ie` is not yet live; the footer link and brand text are correct regardless and go live with the domain.
