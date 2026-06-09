# App Shell & Navigation — Design

**Date:** 2026-06-09
**Status:** Approved (design)
**Sub-project:** ① of a 5-part restructure (see "Context" below)

## Context

This is the first of five interlocking sub-projects restructuring *Here We Go*. The full set, in dependency order:

1. **App shell & navigation** *(this doc)* — landing match-list, persistent header, button restructure, dual-mode match page.
2. Editor tabs & game-mode-first editing (Details/Lineup/Advanced/Game-mode tabs; restyled in-editor score display).
3. Home/Away model (replace "us v them"; both-team lineups; sport templates) — the deepest, riskiest change.
4. New-match wizard polish.
5. Small polish (colour picker closes on select).

Sub-projects 2–4 slot into the skeleton this one establishes. Each gets its own spec → plan → build cycle. **Anything in 2–5 is out of scope here** and is called out where it would otherwise leak in.

## Goal

Replace the single-page, dropdown-driven app with a **list-first** structure: the landing page is a list of matches, each match has one canonical URL, and a single persistent header frames every screen with only its action buttons changing by context.

## Non-goals (this sub-project)

- No change to the parser, the match data model, or the "us/them" internals (→ ③).
- No tab renames or game-mode behaviour changes (→ ②).
- No restyle of the in-editor score display (→ ②).
- No new-match wizard changes beyond reaching it from the new "New" button (→ ④).

---

## 1. Routing model

One canonical URL per match: **`/m/[id]`**, made *dual-mode*.

- `[id]` resolves by `short_code` when it isn't a UUID, else by `id` (unchanged from today).
- New/private matches have no `short_code` yet, so their URL is `/m/<uuid>`. A `short_code` is still minted on publish; the prettier `/m/<short_code>` link also resolves. Both keep working.
- The page (`app/m/[id]/page.tsx`, a server component) reads the session via `getUser()` and fetches the row through the server Supabase client (RLS-respecting):
  - **Viewer is the owner** → render the **editor** (`MatchTracker`) booted on this match id.
  - **Not owner, row is `is_public`** → render the existing read-only `<PublicMatch>`.
  - **Otherwise** (private row, not owner / not found) → **404**.
- RLS already supports this: `own_all` (`owner = auth.uid()`) lets an owner read their private row; `public_read` (`is_public = true`) covers visitors. No policy changes needed.

**Landing page is `/`** — the match list (replaces today's `SignInGate`-or-`EditorApp` choice).

### Editor boot change

`MatchTracker` today loads *all* matches and switches the active one via a dropdown. The dropdown is removed. The editor now boots with an **initial match id from the route**. It still calls `loadAll()` on mount to populate `cache` (needed for prev-teams mining and "used colours"), but the *active* match comes from the route, not a selector. "New" and the prev-teams features are otherwise unchanged.

---

## 2. The persistent header

One header frame on every screen — brand/logo on the left (always links home, `/`), a context-dependent action cluster on the right. Only the action cluster changes.

| Context | Action cluster (right side) |
|---|---|
| **Landing, logged in** | `＋ New` · `email ▾` |
| **Landing, logged out** | `Sign in` |
| **Your match (edit)** | `＋ New` · `Share` (icon) · `Resync` (icon) · `Delete` (icon) · `email ▾` |
| **Public match, logged out** | `Share` (icon) · `Sign in` |
| **Public match, logged in (not owner)** | `＋ New` · `Share` (icon) · `email ▾` |

Details:
- **New** appears on all logged-in screens, labelled just **"New"** (not "New match"). It launches the existing new-match wizard, then routes to the created match's `/m/<uuid>`.
- **Share** is a single icon using the **standard share glyph** (three dots joined by two lines) — *not* a link/chain icon. Its menu is contextual (§4).
- **Resync** and **Delete** are **icon buttons with hover tooltips** on the edit header (replacing the old overflow-menu items). Delete keeps its two-tap confirm.
- **`email ▾`** opens the account menu containing **only "Sign out"**. (Backup is no longer surfaced — its code remains but has no UI entry. There is no global "resync all"; the per-match Resync icon covers it.)
- **Duplicate** and the **match dropdown** are removed entirely.
- The old "Share image / Backup as inline panels under the top bar" pattern is superseded by the Share menu; the top-bar toggle buttons for them are removed.

---

## 3. Landing page — the match list

### Logged-in layout (two sections)

1. **Your matches** — always shown. A segmented sub-filter **Both / Personal / Public** (default **Both**) filters *your own* matches by privacy (Personal = private, Public = published). Most-recent first.
   - Empty (you own nothing): a friendly **"Track your first match"** empty state with a New call-to-action, in place of the row list. The public section still renders below.
2. **Recent public matches** — the **global** discovery feed: the most recent public matches from *all* users, ordered by most-recently-published/updated. **Infinite scroll** (initial page server-rendered; subsequent pages fetched client-side via the browser Supabase client). No owner identity is shown.

### Logged-out layout

Header shows brand + **Sign in**. Body shows **only** the "Recent public matches" feed (infinite scroll). No "Your matches" section.

### Row click targets

- A **your-matches** row → `/m/<id>` (you're the owner → editor).
- A **public-feed** row → `/m/<code>` (read-only, unless it happens to be your own public match, in which case dual-mode shows you the editor).

### Match-row anatomy

`[sport icon] · [home flag] Home  SCORE – SCORE  Away [away flag] · · · [date] [privacy indicator]`

- **Sport icon** in a small circle (hurling / football / soccer).
- **Kit-colour flags** (two-tone, from each team's primary/secondary colours).
- **Teams ordered home-left / away-right** using the existing home/away flag. (Neutral framing — see Winner emphasis. The deeper home/away rework is ③; this row only needs the existing flag to decide order.)
- **Winner emphasis (no WIN/LOSS pill):** the **losing** side is **dimmed/greyed** (name + score + flag at reduced strength); the winning side stays full-strength white. A **draw** renders both sides neutral (equal, mid-strength). This treatment is identical on your-matches rows and public-feed rows.
- **Date** (relative for recent, e.g. "2h ago" / "Yesterday"; absolute otherwise).
- **Privacy indicator** on *your* rows only: "◉ public" or "🔒 private". Public-feed rows show no privacy indicator.

---

## 4. The Share menu (contextual)

Opened by the standard-share-glyph icon. Contents depend on viewer + publish state:

- **Owner, match still private:** `Share as image` · `Make public & get link` (the existing publish flow: choose name display → publish → link).
- **Owner, match already public:** `Copy public link` · `Share as image` · **`Name privacy`** segmented control (Full / Initials / None — updates `name_display` on the row) · **`Unshare`** (set `is_public = false`, back to private).
- **Visitor on a public match:** `Copy link` · `Share as image` (no privacy / unshare — not theirs).

This **absorbs the existing `ShareWizard`** and adds two owner controls for already-public matches: change `name_display`, and **unshare**. "Share as image" reuses the existing client rasteriser; "Copy link" copies the `/m/<short_code>` URL.

The **public read-only view** thus gains its requested re-share-link + share-as-image actions, surfaced through this same Share icon (visitor variant).

---

## 5. Data & queries

- **Your matches:** existing owner-scoped read (RLS `own_all`). The privacy sub-filter is a client-side filter over the loaded set (or an `is_public` predicate).
- **Public feed:** `select … from matches where is_public = true order by updated_at desc` with range-based pagination for infinite scroll. RLS `public_read` already permits this for any (even anonymous) client.
- **Name redaction:** the feed rows show only team names / score / date / sport — **no player names** — so `name_display` redaction is not needed for the list. It continues to apply on the public match *page* as today.
- **No schema migration** is required for this sub-project (reuses `is_public`, `short_code`, `name_display`, `updated_at`, and the promoted columns).

---

## 6. Testing considerations

- Pure logic stays unit-tested as today; the canonical `SAMPLE` parser invariants are untouched (no parser change).
- New testable seams worth covering: the **row view-model** (which side is home, who's the winner / draw, dim-flags, relative-date formatting) as a pure function, and the **dual-mode resolver** decision (owner → editor / public → read-only / else 404) factored so it can be unit-tested without a live request.
- `APP_VERSION` bump on deploy, per project convention.

---

## 7. Risks / watch-items

- **Editor boot refactor:** removing the dropdown and booting `MatchTracker` from a route param is the largest code change. `MatchTracker` carries `// @ts-nocheck`; touch the boot/selection path surgically rather than decomposing it (decomposition is explicitly deferred).
- **Dual-mode page complexity:** one page now branches into editor vs read-only vs 404. Keep the branch at the page boundary; don't entangle `PublicMatch` and `MatchTracker`.
- **No middleware constraint stands:** auth is still cookie + browser-refresh only (the `ws`/`__dirname` Edge crash). The dual-mode server component uses the existing server client + `getUser()`, consistent with current `/m/[id]`.
- **Infinite scroll reads:** unbounded scrolling on a growing public table — paginate by range and stop at the end; acceptable at current volume.
- **Backup removal:** dropping the Backup UI removes the only manual export path. Acceptable given Supabase is the source of truth; flagged for awareness.
