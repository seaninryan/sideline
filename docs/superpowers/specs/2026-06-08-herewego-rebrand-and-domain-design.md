# Here We Go — rebrand + herewego.ie domain

**Date:** 2026-06-08
**Status:** Approved (design); ready for implementation plan

## Goal

Rebrand the app from **Sideline** to **Here We Go** (echoing the terrace chant), refresh the logo and app icon, and serve it from the newly purchased domain **herewego.ie** over HTTPS. Keep the site out of search engines for now.

The repo's "no real club/player names" rule is unaffected — this is product branding only.

## Scope

Two tracks:

- **Code + assets (Claude's work):** rename strings, new title-bar wordmark, new app icon, `robots.txt`, version bump.
- **Console steps (user's work):** Vercel domain, Blacknight DNS, Supabase + Google auth allow-lists. Documented here and surfaced at hand-off; not automatable from the repo.

Out of scope: any change to match parsing, storage, auth flow logic, or the public-page/OG feature set.

## 1. Rename Sideline → Here We Go

Replace the display string "SIDELINE" / "Sideline" in all six locations:

| File | Current | New |
|------|---------|-----|
| `components/MatchTracker.tsx` (title bar) | `SIDELINE <i className="mt-ver">{APP_VERSION}</i>` | new wordmark markup (§2); version removed from bar |
| `components/SignIn.tsx` | `<h1>SIDELINE</h1>` | `<h1>HERE WE GO</h1>` |
| `components/EditorApp.tsx` | `<h1>SIDELINE</h1>` | `<h1>HERE WE GO</h1>` |
| `app/layout.tsx` metadata | `title: "Sideline"` | `title: "Here We Go"` |
| `app/m/[id]/page.tsx` | `{ title: "Sideline" }` and `` `${title} · Sideline` `` | `"Here We Go"` / `` `${title} · Here We Go` `` |
| `app/m/[id]/opengraph-image.tsx` | fallback `usName: "Sideline"` | `usName: "Here We Go"` |
| `lib/infographic.ts` | poster footer `"SIDELINE"` (line ~34) and `` `Sideline · ${m.grade…}` `` (line ~249) | `"HERE WE GO"` / `` `Here We Go · ${m.grade…}` `` |

The sign-in `<h1>` keeps its existing serif/letter-spaced style (`.si-card h1`) — only the text changes.

## 2. Title-bar wordmark (option E)

Replace the single-line `.mt-logo` text with a stacked treatment:

- **Line 1 (wordmark):** `HERE WE ` + `GO` where `GO` is wrapped in a span coloured kit-yellow `#f5c518`. Bebas Neue, current `.mt-logo` size (~26px).
- **Line 2 (tagline):** `HERE WE GO · HERE WE GO` — Oswald, ~8.5px, weight 600, letter-spacing ~2px, muted green `#8fb0a3`, small top margin.

Markup shape (inside `.mt-logo`, after the icon SVG):

```
<span className="mt-brand">
  <span className="mt-wm">HERE WE <span className="mt-go">GO</span></span>
  <span className="mt-chant">HERE WE GO · HERE WE GO</span>
</span>
```

CSS additions in `app/globals.css` near the existing `.mt-logo` block:
- `.mt-brand{display:flex;flex-direction:column;line-height:1;}`
- `.mt-wm` inherits the Bebas/size from `.mt-logo`; `.mt-go{color:#f5c518;}`
- `.mt-chant{font-family:var(--font-oswald);font-weight:600;font-size:8.5px;letter-spacing:2px;color:#8fb0a3;margin-top:3px;}`

The `.mt-logo` itself keeps `display:flex;align-items:center;gap:9px;` (icon beside the stacked brand). Remove the inline `{APP_VERSION}` from here.

**Narrow-screen check:** confirm the tagline doesn't wrap awkwardly or overflow the bar at ~320px width; if it does, the tagline may shrink letter-spacing or drop to a single echo. Verify during implementation.

## 3. Version number → page bottom

Move `APP_VERSION` out of the title bar to a small muted footer line at the bottom of the app body, reading `Here We Go · v<n>`.

- Add a `.mt-foot` element at the end of the main tab body in `MatchTracker.tsx` (outside the game-mode/wizard takeovers, since those hide chrome).
- Style: Oswald, ~10px, muted (`var(--muted)`), centred, modest top/bottom padding.

## 4. App icon (option C)

A pitch-green pill with a yellow outline and "HWG" (cream "HW", yellow "G"), transparent background.

**Geometry (viewBox 0 0 128 128):** rounded rect `x=6 y=34 w=116 h=60 rx=30`, fill `#0c3b2a`, stroke `#f5c518` width 4; centred text "HWG" ~40px, "HW" in `#f4efe1`, "G" in `#f5c518`.

Two outputs, **both transparent** (confirmed readable on iOS's black fill in mockup):
- `icon-180.png` — favicon, transparent.
- `icon-touch-180.png` — apple-touch icon, also transparent (no pitch tile behind it anymore).

**`tools/make-icon.py` rewrite:** replace the ball-drawing geometry with the pill + "HWG" text. Both PNGs become the transparent pill (the script no longer needs a separate pitch-tile branch). Text is rendered with the repo's bundled `assets/LiberationSans-Bold.ttf` (PIL has no Bebas; Liberation Bold is the closest bundled face). Regenerate both PNGs in the repo root, then copy/confirm into `public/`.

**Inline logo SVG (title bar):** replace the ball `<svg>` in `MatchTracker.tsx` `.mt-logo` with the pill+HWG SVG so the bar icon matches the app icon. The bar SVG can use the web Bebas font for the letters (closer to mockup); the PNG uses Liberation Bold. **Accepted caveat:** bar (Bebas) and home-screen PNG (Liberation Bold) are visually close but not pixel-identical.

Update the source comment in `MatchTracker.tsx` that currently says "same ball as icon-180.png".

## 5. robots.txt — block all crawlers

Add `app/robots.ts` (Next.js App Router metadata route):

```ts
import type { MetadataRoute } from "next";
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", disallow: "/" } };
}
```

Serves `/robots.txt` with `Disallow: /` for all agents. Direct `/m/<id>` share links still resolve; this only blocks indexing until launch.

## 6. Domain herewego.ie + SSL (user console steps)

1. **Vercel** → project → Settings → Domains → add `herewego.ie`, and add `www.herewego.ie` set to redirect to the apex.
2. Vercel displays the exact DNS records. At **Blacknight** DNS, create them — typically: apex `@` **A record** → Vercel's shown IP; `www` **CNAME** → `cname.vercel-dns.com`. **Use exactly what the Vercel dashboard shows** (the apex IP is not hardcoded here, as Vercel has changed it over time).
3. **SSL:** automatic. Once DNS resolves, Vercel provisions a Let's Encrypt certificate. No manual cert handling.

## 7. Auth allow-lists (user console steps — required, or sign-in breaks)

Sign-in uses `redirectTo: location.origin + "/auth/callback"`, so it adapts to the new domain automatically — but the new origin must be allow-listed:

- **Supabase** → Authentication → URL Configuration: Site URL = `https://herewego.ie`; add `https://herewego.ie/**` to Redirect URLs (keep existing Vercel `*.vercel.app` entries during transition).
- **Google Cloud** → OAuth client: add `https://herewego.ie` to Authorized JavaScript origins. The Google **redirect URI** stays the Supabase `https://<ref>.supabase.co/auth/v1/callback` (unchanged — Supabase is the OAuth handler).

## 8. Version bump

Bump `APP_VERSION` in `lib/constants.ts` from `v40` to `v41`, per the repo's deploy convention. Footer (§3) shows it. Tell the user to "look for v41".

## Verification

- `npm test` — all 143 tests still pass (string changes shouldn't touch parser assertions; confirm no test asserts the literal "Sideline").
- `npm run build` — clean production build, including the OG route and new `robots.ts`.
- Visual: title bar shows the stacked HERE WE GO wordmark + tagline; version reads `Here We Go · v41` at the page bottom; favicon and home-screen icon both show the transparent yellow-trim pill.
- `tools/make-icon.py` runs and regenerates both PNGs without error.
- Post-deploy (user): `https://herewego.ie` serves with a valid cert; Google sign-in completes from the new domain; `https://herewego.ie/robots.txt` returns `Disallow: /`.

## Open considerations / non-goals

- The Bebas-vs-Liberation icon font difference is accepted (not pixel-identical).
- No PWA manifest / `name` field exists today; if one is added later it should also read "Here We Go". Out of scope now.
- `CLAUDE.md` and `SETUP.md` reference "Sideline" in prose; update the user-facing name there too as part of the rename (docs pass), without rewriting unrelated content.
