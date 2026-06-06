# Proposal: Sideline as a public multi-user website

Status: **proposal for review** — not yet approved, nothing built. Written up 2026-06-06 after a costs/legal/architecture discussion. To go ahead, point Claude at this doc and say so; the next step is a proper brainstorm of Phase 1 into a spec (`docs/superpowers/specs/`) and an implementation plan.

## The idea

Take today's Sideline (single static `index.html` on GitHub Pages, data in the owner's own Google Drive, sign-in locked to one account) and release it publicly:

- anyone can sign up with email/password or a Google account
- a bought domain name
- match data stored per-user in a real database
- users can make a match public and share it via a short link

## Decisions already taken (Sean, 2026-06-06)

- **Go ahead if costs stay low** — they do (see Costs).
- **Player names on public pages:** ask for the **age grade** of the match and put the responsibility on the person tracking the game — they choose whether to use real names at all (many won't bother), and they own the consent question when publishing. No hard blocking of names by the platform. (An underage-grade nudge/written warning at publish time is still worth considering — see Open questions.)

## Costs

| Item | Cost |
|---|---|
| Domain (.com via Cloudflare, at-cost; .ie €20–30) | ~€10–12/yr |
| Static hosting — Cloudflare Pages / Netlify free tier | €0 |
| Supabase free tier — Postgres 500MB, auth (email + Google), 50k MAU | €0 |
| **Realistic total** | **~€10–30/yr (the domain)** |

Free-tier caveats: Supabase pauses free projects after ~a week of no API activity (weekly use or a scheduled ping keeps it alive); built-in auth email is rate-limited to a handful/hour (fine at club scale; pluggable free SMTP if not). The only plausible future cost is Supabase Pro at $25/mo if it outgrows the free tier. Match data is kilobytes; storage is never the problem. **The real cost is maintenance attention, not money.**

## Target architecture

- **Front-end carries over unchanged:** `parseMatch`, notation blocks, live entry, chart, lineup, infographic — all pure client-side. The entire current "backend" hides behind the 4-method `store.list/get/set/del` interface plus the auth preamble; that is the swap surface.
- **Supabase (EU/Dublin region)** replaces Google Drive:
  - Auth: email/password + "Continue with Google", proper refresh-token sessions (weeks, not 1 hour — kills the re-login popup problem as a side effect). Dropping the `drive.appdata` scope also takes the Google consent screen out of Testing mode with minimal verification.
  - Postgres, one table to start:
    ```sql
    matches (
      id uuid primary key,
      user_id uuid references auth.users,
      raw text,            -- the notation, still source of truth
      settings jsonb,      -- colours, team names, sport, date, grade
      is_public boolean default false,
      share_slug text unique,   -- unguessable 8+ char nanoid
      updated_at timestamptz
    )
    ```
  - Row-Level Security: owner full access; anyone may read rows where `is_public`.
- **Hosting:** static site on Cloudflare Pages behind the new domain. The GitHub Pages + Drive version stays live as a private fallback during (and after) transition.
- **Public share page:** `domain/m/<slug>` renders the existing Overview/timeline read-only for unauthenticated visitors.
- **Migration:** the existing Backup/Import JSON flow is the migration tool.

## Build order — three shippable sub-projects

1. **Foundation: accounts + database + hosting.** Supabase project (EU), auth, `matches` + RLS, swap the Drive store for a Supabase store behind the same interface, replace `SignIn`, deploy to the domain, import existing matches. *Ships as: the same app, but anyone can sign up; matches private per account.*
2. **Public sharing.** Grade field + publish flow (responsibility-on-tracker, grade captured at publish), unlisted short links, read-only share page reusing existing rendering. *Ships as: "make this match public" + a link for the group chat.*
3. **Launch polish.** Privacy policy + ToS, signup captcha (Supabase/Turnstile) and rate limits, account deletion (cascade) and export, offline cache + sync for pitchside networks, PWA install. *Ships as: ready for strangers.*

## Child protection & GDPR notes (from the 2026-06-06 discussion; practical guidance, not legal advice)

- No law flatly bans naming juveniles in match reports (local papers do it weekly), but the **GAA Code of Behaviour (Underage)** (mandatory across Gaelic games bodies) expects parental consent / risk assessment around publishing children's images and details, and the **Irish DPC's "Fundamentals for a Child-Oriented Approach"** gives children's data heightened protection. The chosen mitigation: grade capture + tracker responsibility + everything private by default + unlisted slugs. Clubs' own membership consent forms often already cover "match reports on the club website" — the natural machinery for users to lean on.
- **GDPR:** once others sign up, Sean is a data controller. Checklist: Supabase EU region; short privacy policy + ToS (accounts 16+, realistically adults — Ireland's digital age of consent is 16); deletion cascades and export (Backup already is the export); a contact address for third-party erasure requests (a parent asking to remove a child's name from someone else's match); Supabase DPA; never add ads/tracking/profiling (profiling children's data is a criminal offence in Ireland — stay miles away).
- Sources: GAA Child Safeguarding Policy & Code of Behaviour (gaa.ie), DPC children's-data guidance and Fundamentals (dataprotection.ie), Law Society GDPR guidance 8.

## Open questions to settle when this resumes (each affects the Phase-1 spec)

1. **Build tooling fork:** keep the single-file/no-build charm (Supabase JS via CDN, second `.html` for the share page) vs. move to Vite + real files first. The file is ~2,300 lines and a second route strains the single-file model; but no-build is part of what makes the project easy to maintain. **Leaning: decide this first — it shapes everything.**
2. **Repo & branding:** same repo or fresh one? Keep the name "Sideline" (and does the domain follow it)? Which TLD?
3. **Auth details:** require email verification on signup? Allow anonymous "try it" mode with local-only storage?
4. **Grade field semantics:** the parser already extracts a grade label from the header (`U13A Hurling @ …`) — formalise as a settings field (dropdown: U8…U21, Adult)? Captured at publish time or per match?
5. **Publish-flow wording:** the exact responsibility/consent text shown when making a match public, and whether an underage grade adds a stronger warning (or an optional "hide names on the public page" toggle — cheap to build since the roster is parsed).
6. **Offline scope:** is localStorage cache + sync needed in Phase 1 (pitchside reliability with the new store) or genuinely deferrable to Phase 3?
7. **The Drive version's future:** keep maintaining both UIs, or freeze the GitHub Pages version once migrated?

## What stays true regardless

- The notation text remains the single source of truth; the parser and its test harness don't change.
- No real player/club names in the repo, ever — the fictional Racoons/Wildebeests sample data stays.
- Every deployable change bumps `APP_VERSION`.
