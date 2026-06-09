# App Shell & Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dropdown-driven single page with a list-first landing (your matches + a global public feed), one persistent header whose actions change by context, and a dual-mode `/m/[id]` page that shows the editor to the owner and a read-only view to everyone else.

**Architecture:** Two new pure, unit-tested modules (`lib/match-list.ts` for a match-row view-model + relative dates, `lib/match-view.ts` for the editor-vs-public-vs-404 decision) underpin new React components (`AppHeader`, `MatchRow`, `Landing`, `ShareSheet`). `app/page.tsx` renders the landing; `app/m/[id]/page.tsx` becomes dual-mode (resolves the row through RLS, then branches). `MatchTracker` is rewired to boot from a route id (dropdown removed) and to navigate via the router for New/Delete/finish. No schema migration, no parser change.

**Tech Stack:** Next.js 14 App Router, React 18, TypeScript, `@supabase/ssr`, Vitest. Node 20 (`nvm use 20`).

**Design doc:** `docs/superpowers/specs/2026-06-09-app-shell-navigation-design.md`

---

## File Structure

**Create:**
- `lib/match-list.ts` — `matchRowView(record)` (home/away ordering, score strings, winner side, sport emoji, kit colours) + `relativeDate(iso, now)`. Pure.
- `lib/match-view.ts` — `resolveMatchView({found,isOwner,isPublic})` → `"editor" | "public" | "notfound"`. Pure.
- `test/match-list.test.ts`, `test/match-view.test.ts` — unit tests.
- `components/AppHeader.tsx` — persistent header shell (brand + back + New + slot + account/sign-in).
- `components/MatchRow.tsx` — one match list row (uses `matchRowView`).
- `components/Landing.tsx` — the landing page body (your matches + filter, public feed + infinite scroll).
- `components/ShareSheet.tsx` — contextual Share panel for the owner (private→publish; public→copy link / name privacy / unshare) + "share as image" entry.

**Modify:**
- `app/page.tsx` — render `<Landing>` instead of `SignInGate`/`EditorApp`.
- `app/m/[id]/page.tsx` — dual-mode: resolve row via RLS, branch editor / read-only / 404; handle the `"new"` sentinel.
- `components/EditorApp.tsx` — accept and forward `initialId` + `wizard` props.
- `components/MatchTracker.tsx` — boot from route id, remove the dropdown, replace top bar with `<AppHeader>`, Resync/Delete as header icons, Share via `ShareSheet`, New/finish/cancel/delete navigate via router, drop Duplicate & Backup UI.
- `components/PublicMatch.tsx` — add `<AppHeader>` with a visitor Share (copy link + share-as-image from the model).
- `app/globals.css` — append styles for the header back-link and the match-list rows/sections.
- `lib/constants.ts` — bump `APP_VERSION` to `v46`.

**Leave untouched (intentionally):** `lib/parser.ts`, `lib/model.ts`, the scoreboard markup in `MatchTracker` (restyle is sub-project ②), the new-match wizard internals beyond navigation (polish is ④), `lib/store.ts` cache shape.

---

## Task 1: Match-row view-model + relative date (pure)

**Files:**
- Create: `lib/match-list.ts`
- Test: `test/match-list.test.ts`

- [ ] **Step 1: Write the failing test**

`test/match-list.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { matchRowView, relativeDate } from "@/lib/match-list";
import { SAMPLE } from "@/lib/sample";
import type { MatchRecord } from "@/lib/types";

const rec: MatchRecord = {
  raw: SAMPLE, myTeam: "Racoons", sport: "hurling", autoMode: true,
  colorUs: "#f5c518", colorUs2: "#1f7a4d", colorThem: "#c0392b", colorThem2: "#2c5fa8",
};

describe("matchRowView", () => {
  const v = matchRowView(rec);
  // SAMPLE header is "U13A Hurling @ Wildebeests" → Racoons are AWAY, so home = Wildebeests.
  it("orders home team (opponent here) on the home side", () => {
    expect(v.homeName).toBe("Wildebeests");
    expect(v.awayName).toBe("Racoons");
  });
  it("carries each side's score string", () => {
    // canonical SAMPLE: Racoons 2-6, Wildebeests 2-7
    expect(v.homeStr).toBe("2-7");
    expect(v.awayStr).toBe("2-6");
  });
  it("marks the higher total as the winner (home here — Racoons lose)", () => {
    expect(v.winner).toBe("home");
  });
  it("resolves the sport emoji", () => {
    expect(v.sportEmoji).toBe("🏑");
  });
  it("assigns kit colours to the correct side", () => {
    expect(v.homeColors).toEqual(["#c0392b", "#2c5fa8"]); // them = home
    expect(v.awayColors).toEqual(["#f5c518", "#1f7a4d"]); // us = away
  });
});

describe("matchRowView draw", () => {
  it("returns draw when totals are equal", () => {
    const drawRec: MatchRecord = { raw: "Home v Away\n12:00\n5 Home\n6 Away", myTeam: "Home", sport: "soccer" };
    expect(matchRowView(drawRec).winner).toBe("draw");
  });
});

describe("relativeDate", () => {
  const now = Date.parse("2026-06-09T12:00:00");
  it("minutes", () => expect(relativeDate("2026-06-09T11:30:00", now)).toBe("30m ago"));
  it("hours", () => expect(relativeDate("2026-06-09T10:00:00", now)).toBe("2h ago"));
  it("yesterday", () => expect(relativeDate("2026-06-08T09:00:00", now)).toBe("Yesterday"));
  it("falls back to a short date for older", () => {
    expect(relativeDate("2026-05-01T09:00:00", now)).toMatch(/May/);
  });
  it("empty input → empty string", () => expect(relativeDate("", now)).toBe(""));
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- match-list`
Expected: FAIL — `Cannot find module '@/lib/match-list'`.

- [ ] **Step 3: Write the implementation**

`lib/match-list.ts`:

```ts
import { parseMatch } from "@/lib/parser";
import { gpTotal, fmtDateShort, MONTHS } from "@/lib/util";
import { SPORTS } from "@/lib/constants";
import type { MatchRecord } from "@/lib/types";

export interface RowView {
  homeName: string;
  awayName: string;
  homeStr: string;
  awayStr: string;
  winner: "home" | "away" | "draw";
  sportEmoji: string;
  homeColors: [string, string];
  awayColors: [string, string];
}

// Sport glyph: an explicit sport key wins, else a sport named in the header,
// else goals-mode implies soccer. Mirrors the editor's local sportEmoji helper.
function sportEmoji(sportKey: string | undefined, headerSport: string, mode: string): string {
  if (sportKey && SPORTS[sportKey]) return SPORTS[sportKey].emoji;
  const byLabel = Object.values(SPORTS).find((s) => s.label === headerSport);
  if (byLabel) return byLabel.emoji;
  return mode === "goals" ? SPORTS.soccer.emoji : "";
}

// Build the compact view-model for a single list row from a stored record.
// Pure: no Date.now, no DOM. Home/away ordering comes from the parsed header;
// winner is decided on the running totals (us-perspective `result` isn't used so
// the same function serves other people's matches in the public feed).
export function matchRowView(rec: MatchRecord): RowView {
  const sp = (SPORTS as Record<string, { mode: string }>)[rec.sport || ""];
  const scoringMode = sp ? (sp.mode as "gaa" | "goals") : (rec.autoMode ? undefined : rec.scoringMode);
  const parsed = parseMatch(rec.raw, { myTeam: rec.myTeam, scoringMode });
  const { header, totals } = parsed;
  const mode = parsed.mode;

  const usTotal = gpTotal(totals.us.g, totals.us.p, mode);
  const themTotal = gpTotal(totals.them.g, totals.them.p, mode);
  const usIsHome = header.homeAway === "home";

  const usName = rec.myTeam || "My Team";
  const themName = header.opposition || "Opponent";
  const usColors: [string, string] = [rec.colorUs || "#f5c518", rec.colorUs2 || "#1f7a4d"];
  const themColors: [string, string] = [rec.colorThem || "#c0392b", rec.colorThem2 || "#2c5fa8"];

  let winnerSide: "us" | "them" | "draw";
  if (usTotal === themTotal) winnerSide = "draw";
  else winnerSide = usTotal > themTotal ? "us" : "them";
  const winner: RowView["winner"] =
    winnerSide === "draw" ? "draw" : (winnerSide === "us") === usIsHome ? "home" : "away";

  return {
    homeName: usIsHome ? usName : themName,
    awayName: usIsHome ? themName : usName,
    homeStr: usIsHome ? totals.us.str : totals.them.str,
    awayStr: usIsHome ? totals.them.str : totals.us.str,
    winner,
    sportEmoji: sportEmoji(rec.sport, header.sport, mode),
    homeColors: usIsHome ? usColors : themColors,
    awayColors: usIsHome ? themColors : usColors,
  };
}

// Human "2h ago" / "Yesterday" / short-date, given an explicit `now` (testable).
export function relativeDate(iso: string | undefined, now: number): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (isNaN(t)) return "";
  const diff = now - t;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = new Date(t);
  const nd = new Date(now);
  const dayStart = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((dayStart(nd) - dayStart(d)) / 86400000);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return fmtDateShort(iso);
}
```

> Note: `MONTHS`, `fmtDateShort`, and `gpTotal` are all exported from `lib/util.ts` (verified).

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- match-list`
Expected: PASS (all cases green).

- [ ] **Step 5: Commit**

```bash
git add lib/match-list.ts test/match-list.test.ts
git commit -m "feat: match-row view-model + relative date (pure)"
```

---

## Task 2: Dual-mode view resolver (pure)

**Files:**
- Create: `lib/match-view.ts`
- Test: `test/match-view.test.ts`

- [ ] **Step 1: Write the failing test**

`test/match-view.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { resolveMatchView } from "@/lib/match-view";

describe("resolveMatchView", () => {
  it("missing row → notfound", () => {
    expect(resolveMatchView({ found: false, isOwner: false, isPublic: false })).toBe("notfound");
  });
  it("owner → editor (even when private)", () => {
    expect(resolveMatchView({ found: true, isOwner: true, isPublic: false })).toBe("editor");
  });
  it("owner of a public match still gets the editor", () => {
    expect(resolveMatchView({ found: true, isOwner: true, isPublic: true })).toBe("editor");
  });
  it("non-owner, public → read-only", () => {
    expect(resolveMatchView({ found: true, isOwner: false, isPublic: true })).toBe("public");
  });
  it("non-owner, private → notfound (RLS would not return it anyway)", () => {
    expect(resolveMatchView({ found: true, isOwner: false, isPublic: false })).toBe("notfound");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- match-view`
Expected: FAIL — `Cannot find module '@/lib/match-view'`.

- [ ] **Step 3: Write the implementation**

`lib/match-view.ts`:

```ts
export type MatchViewKind = "editor" | "public" | "notfound";

// Decide what to render at /m/[id]. The row is only ever fetched through RLS,
// which returns it when the viewer owns it OR it is public — so a returned
// private row that the viewer doesn't own can't actually occur, but we still
// guard for it (returns notfound).
export function resolveMatchView(args: { found: boolean; isOwner: boolean; isPublic: boolean }): MatchViewKind {
  if (!args.found) return "notfound";
  if (args.isOwner) return "editor";
  if (args.isPublic) return "public";
  return "notfound";
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- match-view`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/match-view.ts test/match-view.test.ts
git commit -m "feat: dual-mode /m/[id] view resolver (pure)"
```

---

## Task 3: AppHeader component

**Files:**
- Create: `components/AppHeader.tsx`
- Modify: `app/globals.css` (append)

- [ ] **Step 1: Create the component**

`components/AppHeader.tsx`:

```tsx
"use client";
import React, { useState } from "react";
import Link from "next/link";

// The persistent header used on every screen. Brand + optional back link on the
// left; a context-specific action cluster (children) plus New and the account /
// sign-in control on the right. Reuses the editor's existing `mt-bar`/`mt-btn`/
// `mt-logo` classes so it inherits the established styling.
export default function AppHeader({
  email = null,
  showNew = false,
  onNew,
  onSignIn,
  onSignOut,
  backHref = null,
  children,
}: {
  email?: string | null;
  showNew?: boolean;
  onNew?: () => void;
  onSignIn?: () => void;
  onSignOut?: () => void;
  backHref?: string | null;
  children?: React.ReactNode;
}) {
  const [acct, setAcct] = useState(false);
  return (
    <>
      <div className="mt-bar">
        <Link className="mt-logo" href="/" aria-label="Here We Go — home" style={{ textDecoration: "none" }}>
          <svg width="40" height="22" viewBox="0 0 128 70" aria-hidden="true" style={{ flex: "none" }}>
            <rect x="4" y="8" width="120" height="54" rx="27" fill="#0c3b2a" stroke="#f5c518" strokeWidth="4" />
            <text x="64" y="48" fontSize="34" textAnchor="middle" style={{ fontFamily: "var(--font-bebas), sans-serif" }}>
              <tspan fill="#f4efe1">HW</tspan><tspan fill="#f5c518">G</tspan>
            </text>
          </svg>
          <span className="mt-brand"><span className="mt-wm">HERE WE <span className="mt-go">GO</span></span></span>
        </Link>
        {backHref && <Link className="ah-back" href={backHref}>‹ matches</Link>}
        <div className="grow" />
        {showNew && <button className="mt-btn solid" onClick={onNew}>＋ New</button>}
        {children}
        {email ? (
          <button className={"mt-btn" + (acct ? " solid" : "")} onClick={() => setAcct((o) => !o)}>{email} ▾</button>
        ) : (
          <button className="mt-btn" onClick={onSignIn}>Sign in</button>
        )}
      </div>
      {email && acct && (
        <div className="mt-bar sub">
          <button className="mt-btn" onClick={() => { setAcct(false); onSignOut && onSignOut(); }}>Sign out</button>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 2: Append the back-link style + the shared share-glyph helper to globals.css**

Append to the end of `app/globals.css`:

```css
/* --- App shell (v46) --- */
.ah-back { color: var(--muted, #6f7d72); font-size: 13px; text-decoration: none; margin-left: 8px; align-self: center; }
.ah-back:hover { text-decoration: underline; }
.ah-icn { display: inline-flex; align-items: center; justify-content: center; }
.ah-icn svg { width: 18px; height: 18px; }
```

> The standard share glyph is provided inline by callers via this SVG (three dots joined by two lines):
> ```tsx
> const ShareGlyph = (
>   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
>     <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
>     <line x1="8.6" y1="10.5" x2="15.4" y2="6.5" /><line x1="8.6" y1="13.5" x2="15.4" y2="17.5" />
>   </svg>
> );
> ```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors referencing `AppHeader.tsx`.

- [ ] **Step 4: Commit**

```bash
git add components/AppHeader.tsx app/globals.css
git commit -m "feat: persistent AppHeader shell"
```

---

## Task 4: MatchRow component

**Files:**
- Create: `components/MatchRow.tsx`
- Modify: `app/globals.css` (append)

- [ ] **Step 1: Create the component**

`components/MatchRow.tsx`:

```tsx
"use client";
import React from "react";
import Link from "next/link";
import { matchRowView } from "@/lib/match-list";
import type { MatchRecord } from "@/lib/types";

// One row in a match list. Winner emphasis: the losing side is dimmed (`lose`),
// the winner stays full strength (`win`), a draw is neutral (`neu`).
export default function MatchRow({ record, href, date, privacy = null }: {
  record: MatchRecord;
  href: string;
  date: string;
  privacy?: "public" | "private" | null;
}) {
  const v = matchRowView(record);
  const cls = (side: "home" | "away") => (v.winner === "draw" ? "neu" : v.winner === side ? "win" : "lose");
  const flag = (c: [string, string]) => `linear-gradient(135deg, ${c[0]} 50%, ${c[1]} 50%)`;
  return (
    <Link className="ml-row" href={href}>
      <span className="ml-sport">{v.sportEmoji || "•"}</span>
      <span className="ml-teams">
        <span className={"ml-flag " + cls("home")} style={{ background: flag(v.homeColors) }} />
        <span className={"ml-name " + cls("home")}>{v.homeName}</span>
        <span className={"ml-score " + cls("home")}>{v.homeStr}</span>
        <span className="ml-dash">–</span>
        <span className={"ml-score " + cls("away")}>{v.awayStr}</span>
        <span className={"ml-name " + cls("away")}>{v.awayName}</span>
        <span className={"ml-flag " + cls("away")} style={{ background: flag(v.awayColors) }} />
      </span>
      <span className="grow" />
      <span className="ml-meta">
        <span className="ml-date">{date}</span>
        {privacy && <span className={"ml-priv " + privacy}>{privacy === "public" ? "◉ public" : "🔒 private"}</span>}
      </span>
    </Link>
  );
}
```

- [ ] **Step 2: Append row styles to globals.css**

Append to the end of `app/globals.css`:

```css
.ml-row { display: flex; align-items: center; gap: 12px; background: var(--card, #fff); border: 1px solid var(--line, #e4dcc6); border-radius: 10px; padding: 11px 14px; margin-bottom: 9px; text-decoration: none; color: inherit; }
.ml-row:hover { border-color: #1f7a4d; }
.ml-sport { width: 32px; height: 32px; border-radius: 50%; background: rgba(0,0,0,.05); display: flex; align-items: center; justify-content: center; font-size: 16px; flex: none; }
.ml-teams { display: flex; align-items: center; gap: 9px; min-width: 0; flex-wrap: wrap; }
.ml-flag { width: 13px; height: 13px; border-radius: 4px; flex: none; }
.ml-flag.lose { opacity: .45; }
.ml-name { font-weight: 600; font-size: 15px; }
.ml-score { font-weight: 800; font-size: 16px; font-variant-numeric: tabular-nums; }
.ml-dash { color: var(--muted, #9aa49a); }
.ml-name.win, .ml-score.win { color: var(--ink, #11241b); }
.ml-name.lose, .ml-score.lose { color: var(--muted, #9aa49a); }
.ml-name.neu, .ml-score.neu { color: #54635a; }
.ml-meta { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; text-align: right; }
.ml-date { color: var(--muted, #6f7d72); font-size: 12px; }
.ml-priv { font-size: 11px; }
.ml-priv.public { color: #1f86c8; }
.ml-priv.private { color: #9aa49a; }
```

> The app's palette variables (`--card`, `--line`, `--ink`, `--muted`) may not all exist; the fallbacks after each comma keep it correct either way. If you find the canonical variable names in `globals.css`, prefer them.

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors referencing `MatchRow.tsx`.

- [ ] **Step 4: Commit**

```bash
git add components/MatchRow.tsx app/globals.css
git commit -m "feat: MatchRow list row with winner emphasis"
```

---

## Task 5: Landing component

**Files:**
- Create: `components/Landing.tsx`
- Modify: `app/globals.css` (append)

- [ ] **Step 1: Create the component**

`components/Landing.tsx`:

```tsx
"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import MatchRow from "@/components/MatchRow";
import { createClient } from "@/lib/supabase/client";
import { relativeDate } from "@/lib/match-list";
import type { MatchRecord } from "@/lib/types";

interface Row { id: string; short_code: string | null; is_public?: boolean; data: MatchRecord; updated_at?: string; }
type Filter = "both" | "personal" | "public";
const PAGE = 20;

export default function Landing({ userId, email }: { userId: string | null; email: string | null }) {
  const sb = createClient();
  const router = useRouter();
  const now = Date.now();

  const [own, setOwn] = useState<Row[] | null>(null);
  const [filter, setFilter] = useState<Filter>("both");
  const [feed, setFeed] = useState<Row[]>([]);
  const [more, setMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const sentinel = useRef<HTMLDivElement | null>(null);

  // own matches (RLS already scopes to us, but filter by owner so the global
  // public rows that public_read would also return don't leak into "your matches")
  useEffect(() => {
    if (!userId) { setOwn([]); return; }
    sb.from("matches").select("id,short_code,is_public,data,updated_at").eq("owner", userId)
      .order("updated_at", { ascending: false })
      .then(({ data }) => setOwn(((data as Row[]) || [])));
  }, [userId]);

  const loadFeed = useCallback(async () => {
    if (loading || !more) return;
    setLoading(true);
    let q = sb.from("matches").select("id,short_code,data,updated_at")
      .eq("is_public", true).order("updated_at", { ascending: false });
    if (userId) q = q.neq("owner", userId); // own public matches already show above
    const { data } = await q.range(feed.length, feed.length + PAGE - 1);
    const rows = (data as Row[]) || [];
    setFeed((f) => [...f, ...rows]);
    if (rows.length < PAGE) setMore(false);
    setLoading(false);
  }, [feed.length, loading, more, userId]);

  useEffect(() => { loadFeed(); /* first page */ }, []); // eslint-disable-line

  // infinite scroll
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((es) => { if (es[0].isIntersecting) loadFeed(); }, { rootMargin: "300px" });
    io.observe(el);
    return () => io.disconnect();
  }, [loadFeed]);

  const onSignIn = async () => {
    const { error } = await sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${location.origin}/auth/callback` } });
    if (error) console.warn(error.message);
  };
  const onSignOut = async () => { await sb.auth.signOut(); router.refresh(); };

  const ownShown = (own || []).filter((r) =>
    filter === "both" ? true : filter === "public" ? r.is_public : !r.is_public);
  const href = (r: Row) => `/m/${r.short_code || r.id}`;

  return (
    <div className="mt-root">
      <AppHeader email={email} showNew={!!email} onNew={() => router.push("/m/new")} onSignIn={onSignIn} onSignOut={onSignOut} />

      <div className="ml-page">
        {email && (
          <>
            <div className="ml-sechead">
              <h3>Your matches</h3>
              <div className="ml-seg">
                {(["both", "personal", "public"] as Filter[]).map((f) => (
                  <button key={f} className={filter === f ? "on" : ""} onClick={() => setFilter(f)}>{f[0].toUpperCase() + f.slice(1)}</button>
                ))}
              </div>
            </div>
            {own === null ? (
              <p className="ml-note">Loading your matches…</p>
            ) : own.length === 0 ? (
              <div className="ml-empty">
                <p>No matches yet — track your first one.</p>
                <button className="mt-btn solid" onClick={() => router.push("/m/new")}>＋ New match</button>
              </div>
            ) : ownShown.length === 0 ? (
              <p className="ml-note">No {filter} matches.</p>
            ) : (
              ownShown.map((r) => (
                <MatchRow key={r.id} record={r.data} href={href(r)}
                  date={relativeDate(r.data.matchDate || r.data.date, now)}
                  privacy={r.is_public ? "public" : "private"} />
              ))
            )}
          </>
        )}

        <div className="ml-sechead" style={{ marginTop: email ? 26 : 0 }}><h3>Recent public matches</h3></div>
        {feed.map((r) => (
          <MatchRow key={r.id} record={r.data} href={href(r)} date={relativeDate(r.updated_at, now)} />
        ))}
        {!feed.length && !loading && <p className="ml-note">No public matches yet.</p>}
        {loading && <p className="ml-note">Loading…</p>}
        <div ref={sentinel} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Append landing styles to globals.css**

Append to the end of `app/globals.css`:

```css
.ml-page { max-width: 760px; margin: 0 auto; padding: 14px; }
.ml-sechead { display: flex; align-items: center; gap: 12px; margin: 8px 2px 12px; }
.ml-sechead h3 { margin: 0; font-size: 13px; letter-spacing: 1px; text-transform: uppercase; color: var(--muted, #6f7d72); }
.ml-seg { display: flex; border: 1px solid var(--line, #e4dcc6); border-radius: 8px; overflow: hidden; margin-left: auto; }
.ml-seg button { background: transparent; color: var(--muted, #6f7d72); border: none; padding: 6px 13px; font: inherit; font-size: 12px; cursor: pointer; }
.ml-seg button.on { background: #1f7a4d; color: #fff; }
.ml-note { color: var(--muted, #6f7d72); font-size: 13px; padding: 4px 2px; }
.ml-empty { text-align: center; padding: 22px; border: 1px dashed var(--line, #e4dcc6); border-radius: 10px; color: var(--muted, #6f7d72); }
.ml-empty button { margin-top: 10px; }
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors referencing `Landing.tsx`.

- [ ] **Step 4: Commit**

```bash
git add components/Landing.tsx app/globals.css
git commit -m "feat: Landing page (your matches + public feed)"
```

---

## Task 6: ShareSheet component

**Files:**
- Create: `components/ShareSheet.tsx`

This evolves `ShareWizard` into a contextual panel: it fetches the row's current publish state on open, then shows either a publish flow (private) or management controls (public: copy link, name privacy, unshare). A "Share as image" entry calls back into the editor's existing image builder.

- [ ] **Step 1: Create the component**

`components/ShareSheet.tsx`:

```tsx
"use client";
import React, { useEffect, useState } from "react";
import { store } from "@/lib/store";
import { createClient } from "@/lib/supabase/client";
import { genShortCode } from "@/lib/short-code";
import type { MatchRecord, NameDisplay } from "@/lib/types";

const NAME_OPTS: { v: NameDisplay; label: string }[] = [
  { v: "full", label: "Full" },
  { v: "initials", label: "Initials" },
  { v: "none", label: "None" },
];

export default function ShareSheet({ record, curId, onClose, onShareImage, onApplied }: {
  record: MatchRecord;
  curId: string;
  onClose: () => void;
  onShareImage: () => void;
  onApplied: (patch: { nameDisplay: NameDisplay; isPublic: boolean }) => void;
}) {
  const sb = createClient();
  const origin = typeof location !== "undefined" ? location.origin : "";
  const [loaded, setLoaded] = useState(false);
  const [isPublic, setIsPublic] = useState(false);
  const [slug, setSlug] = useState(curId);
  const [nameDisplay, setNameDisplay] = useState<NameDisplay>(record.nameDisplay || "full");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const shareUrl = `${origin}/m/${slug}`;

  useEffect(() => {
    sb.from("matches").select("is_public,short_code,name_display").eq("id", curId).maybeSingle()
      .then(({ data }) => {
        const d = data as { is_public?: boolean; short_code?: string | null; name_display?: NameDisplay } | null;
        if (d) { setIsPublic(!!d.is_public); if (d.short_code) setSlug(d.short_code); if (d.name_display) setNameDisplay(d.name_display); }
        setLoaded(true);
      });
  }, [curId]);

  // idempotent short_code mint (copied from ShareWizard.ensureShortCode)
  const ensureShortCode = async (): Promise<string> => {
    try {
      const { data: cur } = await sb.from("matches").select("short_code").eq("id", curId).maybeSingle();
      let code: string | null = (cur as any)?.short_code ?? null;
      for (let i = 0; i < 5 && !code; i++) {
        const cand = genShortCode();
        const { error } = await sb.from("matches").update({ short_code: cand }).eq("id", curId).is("short_code", null);
        if (error) { if (error.code === "23505") continue; break; }
        const { data: chk } = await sb.from("matches").select("short_code").eq("id", curId).maybeSingle();
        code = (chk as any)?.short_code ?? null;
      }
      return code || curId;
    } catch { return curId; }
  };

  const applyNameDisplay = async (v: NameDisplay) => {
    setNameDisplay(v);
    await store.set(curId, { ...record, nameDisplay: v });
    await sb.from("matches").update({ name_display: v }).eq("id", curId);
    onApplied({ nameDisplay: v, isPublic });
  };

  const publish = async () => {
    setBusy(true);
    await store.set(curId, { ...record, nameDisplay });
    const code = await ensureShortCode();
    setSlug(code);
    await sb.from("matches").update({ is_public: true, name_display: nameDisplay }).eq("id", curId);
    setIsPublic(true);
    onApplied({ nameDisplay, isPublic: true });
    setBusy(false);
  };

  const unshare = async () => {
    setBusy(true);
    await sb.from("matches").update({ is_public: false }).eq("id", curId);
    setIsPublic(false);
    onApplied({ nameDisplay, isPublic: false });
    setBusy(false);
  };

  const copy = () => { navigator.clipboard?.writeText(shareUrl); setCopied(true); setTimeout(() => setCopied(false), 1500); };

  return (
    <div className="mt-live" style={{ marginTop: 0 }}>
      <div className="mt-row">
        <span className="mt-h" style={{ margin: 0, flex: 1 }}>Share</span>
        <button className="mt-add alt" onClick={onClose}>✕ Close</button>
      </div>

      <button className="mt-add alt" style={{ marginTop: 8 }} onClick={onShareImage}>🖼 Share as image</button>

      {!loaded ? (
        <p className="mt-note" style={{ marginTop: 10 }}>Checking publish status…</p>
      ) : !isPublic ? (
        <>
          <p className="mt-note" style={{ margin: "12px 0 4px" }}>Player names on the public page:</p>
          <div className="mt-grid">
            {NAME_OPTS.map((o) => (
              <button key={o.v} className={"mt-big sm" + (nameDisplay === o.v ? " on" : "")} onClick={() => setNameDisplay(o.v)}>{o.label}</button>
            ))}
          </div>
          <button className="mt-add" style={{ marginTop: 10 }} disabled={busy} onClick={publish}>{busy ? "Publishing…" : "🌐 Make public & get link"}</button>
        </>
      ) : (
        <>
          <p className="mt-note" style={{ margin: "12px 0 4px" }}>Public link</p>
          <input className="mt-inp" readOnly value={shareUrl} onFocus={(e) => e.currentTarget.select()} style={{ width: "100%" }} />
          <button className="mt-add" style={{ marginTop: 6 }} onClick={copy}>{copied ? "Copied ✓" : "🔗 Copy public link"}</button>
          <p className="mt-note" style={{ margin: "12px 0 4px" }}>Name privacy</p>
          <div className="mt-grid">
            {NAME_OPTS.map((o) => (
              <button key={o.v} className={"mt-big sm" + (nameDisplay === o.v ? " on" : "")} onClick={() => applyNameDisplay(o.v)}>{o.label}</button>
            ))}
          </div>
          <button className="mt-add danger" style={{ marginTop: 10 }} disabled={busy} onClick={unshare}>🚫 Unshare (make private)</button>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors referencing `ShareSheet.tsx`.

- [ ] **Step 3: Commit**

```bash
git add components/ShareSheet.tsx
git commit -m "feat: contextual ShareSheet (publish / manage / image)"
```

---

## Task 7: Rewire MatchTracker + EditorApp to boot from a route

This is the largest change and touches the `@ts-nocheck` monolith. Make each edit by matching the exact quoted snippet. Work top-to-bottom.

**Files:**
- Modify: `components/EditorApp.tsx`
- Modify: `components/MatchTracker.tsx`

- [ ] **Step 1: EditorApp forwards `initialId` + `wizard`**

In `components/EditorApp.tsx`, replace:

```tsx
export default function EditorApp() {
  const [phase, setPhase] = useState<"load" | "ready" | "error">("load");
  useEffect(() => {
    loadAll().then(() => setPhase("ready")).catch(() => setPhase("error"));
  }, []);
  if (phase === "ready") return <MatchTracker />;
```

with:

```tsx
export default function EditorApp({ initialId = null, wizard = false }: { initialId?: string | null; wizard?: boolean }) {
  const [phase, setPhase] = useState<"load" | "ready" | "error">("load");
  useEffect(() => {
    loadAll().then(() => setPhase("ready")).catch(() => setPhase("error"));
  }, []);
  if (phase === "ready") return <MatchTracker initialId={initialId} wizard={wizard} />;
```

- [ ] **Step 2: MatchTracker accepts props + router; import AppHeader & ShareSheet**

In `components/MatchTracker.tsx`, replace the import of `ShareWizard`:

```tsx
import ShareWizard from "@/components/ShareWizard";
```

with:

```tsx
import ShareSheet from "@/components/ShareSheet";
import AppHeader from "@/components/AppHeader";
import { useRouter } from "next/navigation";
```

Then replace the function signature:

```tsx
export default function MatchTracker() {
  const [raw, setRaw] = useState(SAMPLE);
```

with:

```tsx
export default function MatchTracker({ initialId = null, wizard = false }) {
  const router = useRouter();
  const [raw, setRaw] = useState(SAMPLE);
```

- [ ] **Step 3: Boot from the route id instead of the dropdown default**

Replace:

```tsx
  useEffect(() => {
    (async () => {
      const items = await refreshList();
      if (items.length && !curId) doLoad(items[0].id); // open the most recent match by default
    })(); /* eslint-disable-next-line */
  }, []);
```

with:

```tsx
  useEffect(() => {
    (async () => {
      await refreshList();
      if (wizard) { enterNew(); return; }      // /m/new — open the new-match wizard
      if (initialId) doLoad(initialId);         // /m/<uuid> — open this match
    })(); /* eslint-disable-next-line */
  }, []);
```

- [ ] **Step 4: New, finish, skip, cancel and delete navigate via the router**

Replace `doNew` (it now creates + saves a blank match, then routes to it):

```tsx
  const doNew = () => {
    // header + roster stub only — the half starts when Start half is tapped at throw-in
    setRaw(`${myTeam.trim() || "My Team"} @ Opponent\n1 \n`);
    setMatchDate(toLocalInput(new Date())); setCurId(null); setNw(null); setTab("notation");
  };
```

with:

```tsx
  const doNew = async () => {
    // blank match: create + save immediately so it has a real /m/<uuid> home, then go there
    const team = myTeam.trim() || "My Team";
    const newRaw = `${team} @ Opponent\n1 \n`;
    const date = toLocalInput(new Date());
    const id = mkId();
    const ok = await store.set(id, { raw: newRaw, matchDate: date, date, myTeam: team, scoringMode: "gaa", autoMode: true, colorUs, colorUs2, colorThem, colorThem2, savedAt: Date.now() });
    if (ok) router.replace(`/m/${id}`);
    else { setSavedMsg("NOT saved — check connection"); setTimeout(() => setSavedMsg(""), 6000); }
  };
```

In `finishNew`, replace the success branch:

```tsx
      if (ok) { setCurId(id); await refreshList(); setSavedMsg("Match created ✓"); setTimeout(() => setSavedMsg(""), 2000); }
```

with:

```tsx
      if (ok) { router.replace(`/m/${id}`); }
```

Replace `doDelete` so it leaves the (now-gone) match page:

```tsx
  const doDelete = async () => {
    if (curId) { const ok = await store.del(curId); setCurId(null); await refreshList(); setSavedMsg(ok ? "Deleted" : "NOT deleted — check connection"); setTimeout(() => setSavedMsg(""), ok ? 1500 : 6000); }
  };
```

with:

```tsx
  const doDelete = async () => {
    if (!curId) return;
    const ok = await store.del(curId);
    if (ok) { router.push("/"); }
    else { setSavedMsg("NOT deleted — check connection"); setTimeout(() => setSavedMsg(""), 6000); }
  };
```

- [ ] **Step 5: Drop `share` from the body-view switch (ShareSheet becomes a panel)**

Replace:

```tsx
  const view = gm ? "game" : nw ? "new" : share ? "share" : tab; // game mode / new-match wizard / share wizard replace the tab body
```

with:

```tsx
  const view = gm ? "game" : nw ? "new" : tab; // game mode / new-match wizard replace the tab body; Share is an inline panel
```

- [ ] **Step 6: Replace the top bar (+ dropdown + overflow menu) with `<AppHeader>`**

Replace the entire block from:

```tsx
      {/* top bar */}
      {!(gm || nw || share) && (
      <div className="mt-bar">
```

through the end of the overflow-menu block:

```tsx
          }}>{confirmDel ? "Tap again to delete" : "Delete"}</button>}
        </div>
      )}
```

with:

```tsx
      {/* persistent header */}
      {!(gm || nw) && (
        <AppHeader
          email={userEmail}
          showNew
          backHref="/"
          onNew={() => router.push("/m/new")}
          onSignOut={async () => { await sb.auth.signOut(); router.push("/"); }}
        >
          <button className="mt-btn ah-icn" aria-label="Share" title="Share" onClick={enterShare}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
              <line x1="8.6" y1="10.5" x2="15.4" y2="6.5" /><line x1="8.6" y1="13.5" x2="15.4" y2="17.5" />
            </svg>
          </button>
          <button className="mt-btn" aria-label="Resync" title="Resync from server" onClick={doResync}>⟳</button>
          <button className={"mt-btn" + (confirmDel ? " danger" : "")} aria-label="Delete match" title={confirmDel ? "Tap again to delete" : "Delete match"} onClick={() => {
            if (!confirmDel) { setConfirmDel(true); setTimeout(() => setConfirmDel(false), 3500); return; }
            setConfirmDel(false); doDelete();
          }}>🗑</button>
        </AppHeader>
      )}
```

- [ ] **Step 7: Render `ShareSheet` as an inline panel; render the image modal still**

The image modal block (`{!(gm || nw || share) && modal && (` … `)}`) stays but its guard must drop `share`. Replace:

```tsx
      {!(gm || nw || share) && modal && (
```

with:

```tsx
      {!(gm || nw) && modal && (
```

Immediately **after** the closing `)}` of that modal block, add the ShareSheet panel:

```tsx
      {!(gm || nw) && share && curId && (
        <ShareSheet
          record={{ ...recordPayload(), savedAt: Date.now() }}
          curId={curId}
          onClose={() => setShare(false)}
          onShareImage={() => { setShare(false); doExport(); }}
          onApplied={({ nameDisplay }) => setNameDisplay(nameDisplay)}
        />
      )}
```

- [ ] **Step 8: Drop the remaining `share` guards on settings / colour picker / tabs; remove the old ShareWizard body block**

Replace each remaining `!(gm || nw || share)` with `!(gm || nw)`. There are three: the settings wrapper (`{!(gm || nw || share) && (` before `<div className="mt-settings">`), the colour-picker wrapper (`{!(gm || nw || share) && colorPick &&`), and the tabs wrapper (`{!(gm || nw || share) && (` before `<div className="mt-tabs">`). Also the footer wrapper at the bottom (`{!(gm || nw || share) && (` before `<div className="mt-foot">`).

Replace the scoreboard guard:

```tsx
      {!(nw || share) && (
      <div className="mt-board">
```

with:

```tsx
      {!nw && (
      <div className="mt-board">
```

Then delete the now-dead ShareWizard body block entirely:

```tsx
        {share && (
          <ShareWizard
            record={{ ...recordPayload(), savedAt: Date.now() }}
            curId={curId}
            onClose={() => setShare(false)}
            onApplied={({ nameDisplay }) => setNameDisplay(nameDisplay)}
          />
        )}
```

- [ ] **Step 9: Point the new-match wizard's Cancel at the landing**

In the new-match wizard header, replace:

```tsx
              <button className="mt-add alt" onClick={() => setNw(null)}>✕ Cancel</button>
```

with:

```tsx
              <button className="mt-add alt" onClick={() => router.push("/")}>✕ Cancel</button>
```

- [ ] **Step 10: Typecheck + build**

Run: `npx tsc --noEmit`
Expected: no errors. (`ShareWizard.tsx` is now unreferenced — that's fine; leave the file in place.)

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 11: Commit**

```bash
git add components/EditorApp.tsx components/MatchTracker.tsx
git commit -m "feat: boot editor from route; AppHeader + ShareSheet; router nav; drop dropdown/duplicate/backup UI"
```

---

## Task 8: Landing route (`app/page.tsx`)

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: Render the landing for everyone**

Replace the whole file with:

```tsx
import { createClient } from "@/lib/supabase/server";
import Landing from "@/components/Landing";

export default async function Home() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  return <Landing userId={user?.id ?? null} email={user?.email ?? null} />;
}
```

> The `auth_error` search param previously fed `SignInGate`; sign-in errors are now rare and the OAuth round-trip lands back on `/`. We drop that wiring here. (`SignInGate` / `SignIn` remain in the repo, still used by nothing — harmless; do not delete in this task.)

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: success; `/` compiles as a server component rendering the client `Landing`.

- [ ] **Step 3: Commit**

```bash
git add app/page.tsx
git commit -m "feat: landing route renders match list"
```

---

## Task 9: Dual-mode match route (`app/m/[id]/page.tsx`)

**Files:**
- Modify: `app/m/[id]/page.tsx`

- [ ] **Step 1: Rewrite the page for dual-mode + the `new` sentinel**

Replace the whole file with:

```tsx
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { buildModel } from "@/lib/model";
import { applyNameDisplay } from "@/lib/name-display";
import { isUuid } from "@/lib/util";
import { resolveMatchView } from "@/lib/match-view";
import PublicMatch from "@/components/PublicMatch";
import EditorApp from "@/components/EditorApp";
import type { MatchRow } from "@/lib/types";

// Fetch by short_code (new links) or UUID (legacy/private). NO is_public filter:
// RLS returns the row when the viewer owns it OR it is public, and we branch below.
async function fetchRow(slug: string): Promise<MatchRow | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("matches")
    .select("id,owner,data,is_public,name_display,short_code")
    .eq(isUuid(slug) ? "id" : "short_code", slug)
    .maybeSingle();
  return (data as MatchRow) || null;
}

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  if (params.id === "new") return { title: "New match · Here We Go" };
  const row = await fetchRow(params.id);
  if (!row || !row.is_public) return { title: "Here We Go" };
  const m = buildModel(row.data);
  const title = `${m.usName} ${m.totals.us.str} – ${m.totals.them.str} ${m.themName}`;
  const description = [m.grade, m.dateStr, m.result].filter(Boolean).join(" · ") || "Match report on Here We Go";
  const url = `/m/${params.id}`;
  return {
    title: `${title} · Here We Go`,
    description,
    openGraph: { title, description, url, siteName: "Here We Go", type: "website" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function MatchPage({ params }: { params: { id: string } }) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const viewerId = auth.user?.id ?? null;

  // "new" sentinel: the create flow. Requires sign-in; opens the wizard.
  if (params.id === "new") {
    if (!viewerId) redirect("/");
    return <EditorApp wizard />;
  }

  const row = await fetchRow(params.id);
  const kind = resolveMatchView({
    found: !!row,
    isOwner: !!row && !!viewerId && row.owner === viewerId,
    isPublic: !!row && !!row.is_public,
  });

  if (kind === "notfound") notFound();
  if (kind === "editor") return <EditorApp initialId={row!.id} />;

  // public read-only
  const model = applyNameDisplay(buildModel(row!.data), row!.name_display || row!.data.nameDisplay || "full");
  return <PublicMatch model={model} />;
}
```

> The OG image route `app/m/[id]/opengraph-image.tsx` is unchanged — it independently fetches `is_public=true` rows, which is still correct.

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add app/m/[id]/page.tsx
git commit -m "feat: dual-mode /m/[id] (owner editor / public view / 404) + new sentinel"
```

---

## Task 10: Public-view header with visitor Share

**Files:**
- Modify: `components/PublicMatch.tsx`

Give the read-only page the persistent header with a visitor Share (copy link + share-as-image built from the model). Replace the standalone `<BrandHeader />` with `<AppHeader>` (the brand still links home via the logo).

- [ ] **Step 1: Add imports + share handlers**

In `components/PublicMatch.tsx`, replace the import block:

```tsx
"use client";
import React from "react";
import ScoreChart from "@/components/ScoreChart";
import BrandHeader from "@/components/BrandHeader";
import { contrastOn } from "@/lib/util";
import { BRAND_SITE, BRAND_SITE_URL, BRAND_CHANT } from "@/lib/constants";
import type { Model } from "@/lib/types";
```

with:

```tsx
"use client";
import React, { useState } from "react";
import ScoreChart from "@/components/ScoreChart";
import AppHeader from "@/components/AppHeader";
import { createClient } from "@/lib/supabase/client";
import { contrastOn } from "@/lib/util";
import { buildInfographicSVG } from "@/lib/infographic";
import { svgToPng } from "@/lib/svg-to-png.client";
import { BRAND_SITE, BRAND_SITE_URL, BRAND_CHANT } from "@/lib/constants";
import type { Model } from "@/lib/types";
```

- [ ] **Step 2: Add the header + a small share panel inside the component**

Replace the opening of the returned markup:

```tsx
  return (
    <div className="pm-root mt-root">
      <BrandHeader />
```

with:

```tsx
  const sb = createClient();
  const [share, setShare] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  React.useEffect(() => { sb.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null)); }, []);
  const router = useRouter();
  const copyLink = () => { navigator.clipboard?.writeText(location.href); };
  const shareImage = () => {
    try {
      const { svg, width, height } = buildInfographicSVG(m);
      svgToPng(svg, width, height).then(({ blob }) => {
        const file = new File([blob], "match.png", { type: "image/png" });
        if (navigator.canShare && navigator.canShare({ files: [file] })) navigator.share({ files: [file] }).catch(() => {});
        else { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "match.png"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1500); }
      });
    } catch { /* ignore */ }
  };

  return (
    <div className="pm-root mt-root">
      <AppHeader
        email={email}
        showNew={!!email}
        onNew={() => router.push("/m/new")}
        onSignIn={async () => { await sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${location.origin}/auth/callback` } }); }}
        onSignOut={async () => { await sb.auth.signOut(); router.refresh(); }}
      >
        <button className="mt-btn ah-icn" aria-label="Share" title="Share" onClick={() => setShare((o) => !o)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
            <line x1="8.6" y1="10.5" x2="15.4" y2="6.5" /><line x1="8.6" y1="13.5" x2="15.4" y2="17.5" />
          </svg>
        </button>
      </AppHeader>
      {share && (
        <div className="mt-live" style={{ marginTop: 0 }}>
          <div className="mt-row"><span className="mt-h" style={{ margin: 0, flex: 1 }}>Share</span><button className="mt-add alt" onClick={() => setShare(false)}>✕ Close</button></div>
          <button className="mt-add" style={{ marginTop: 8 }} onClick={copyLink}>🔗 Copy link</button>
          <button className="mt-add alt" style={{ marginTop: 8 }} onClick={shareImage}>🖼 Share as image</button>
        </div>
      )}
```

Add the router import at the top (alongside the other imports):

```tsx
import { useRouter } from "next/navigation";
```

> `BrandHeader` is no longer imported by `PublicMatch` but is still used by `SignIn`; leave `components/BrandHeader.tsx` in place. The brand-as-home link requirement is preserved: `AppHeader`'s logo links to `/`.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: success.

- [ ] **Step 4: Commit**

```bash
git add components/PublicMatch.tsx
git commit -m "feat: public view gets persistent header + visitor share (link/image)"
```

---

## Task 11: Version bump, full test, build, and manual verification

**Files:**
- Modify: `lib/constants.ts`

- [ ] **Step 1: Bump APP_VERSION**

In `lib/constants.ts`, replace:

```ts
export const APP_VERSION = "v45";
```

with:

```ts
export const APP_VERSION = "v46";
```

- [ ] **Step 2: Full unit-test run**

Run: `npm test`
Expected: all suites PASS, including the new `match-list` and `match-view` tests (and the canonical `parser.test.ts` SAMPLE invariants unchanged). Confirm the total count went up by the two new files.

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: build succeeds with no type errors.

- [ ] **Step 4: Manual verification (dev server)**

Run: `npm run dev` and check, signed in:
- `/` shows **Your matches** (with Both/Personal/Public filter) and **Recent public matches**; the filter hides private/public correctly; winner side is full-strength, loser dimmed, draw neutral.
- Clicking one of **your** rows opens the editor at `/m/<uuid>`; the header shows ＋New, the share glyph, ⟳ Resync, 🗑 Delete, and `email ▾` (→ Sign out).
- **＋ New** → `/m/new` opens the wizard; finishing routes to `/m/<uuid>` (saved); **Cancel** returns to `/`.
- The **share glyph** opens the ShareSheet: a private match offers name-display + "Make public"; after publishing it shows Copy link + Name privacy + Unshare; "Share as image" produces the poster.
- 🗑 needs a second tap, then returns to `/`. ⟳ resyncs.
- Open a **public** match while signed out (or as a non-owner): read-only `PublicMatch` with the header's share glyph → Copy link / Share as image; logo returns home; a **private** non-owned id → 404.

Note any deviations; fix before committing if they're regressions in this plan's scope.

- [ ] **Step 5: Commit**

```bash
git add lib/constants.ts
git commit -m "chore: bump APP_VERSION to v46 (app shell & navigation)"
```

---

## Self-review notes (already reconciled)

- **Spec coverage:** landing two-section list + filter (Task 5) · global public feed + infinite scroll (Task 5) · dual-mode `/m/[id]` (Tasks 2, 9) · persistent header + button restructure incl. account=Sign-out-only and Backup unsurfaced (Tasks 3, 7) · single contextual Share menu with name-privacy + unshare (Tasks 6, 7) · public-view share icons (Task 10) · winner-emphasis rows, no W/L pill (Tasks 1, 4) · New keeps the existing wizard, reached via `/m/new` (Tasks 7, 9) · Resync/Delete as icons, Duplicate removed (Task 7) · no schema migration (Tasks 9, store reused) · APP_VERSION bump (Task 11).
- **Deviation from spec:** the public feed's *initial* page is fetched client-side (with a loading note), not server-rendered — chosen to avoid SSR/hydration duplication of the row set; acceptable while crawl is still blocked. Pagination is infinite-scroll via IntersectionObserver as specified.
- **Out of scope (deferred):** scoreboard restyle (②), tab renames/game-mode-default (②), home/away data-model rework (③), wizard polish incl. removing "Skip — blank match" (④), colour-picker close-on-select (⑤). "Skip — blank match" is retained but now saves + routes (Task 7) so the always-has-a-URL invariant holds until ④ removes it.
- **Type consistency:** `matchRowView`/`RowView`, `resolveMatchView`/`MatchViewKind`, `Landing({userId,email})`, `MatchRow({record,href,date,privacy})`, `AppHeader({email,showNew,onNew,onSignIn,onSignOut,backHref,children})`, `ShareSheet({record,curId,onClose,onShareImage,onApplied})`, `EditorApp({initialId,wizard})`, `MatchTracker({initialId,wizard})` are used consistently across tasks.
```
