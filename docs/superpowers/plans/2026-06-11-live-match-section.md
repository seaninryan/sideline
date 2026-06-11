# Live Section in the Match List — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a derived "Live" section to the main match list, rendered between Upcoming and Past in both "Your matches" and the public feed.

**Architecture:** A new pure helper `isLive(rec, now, updatedAt?)` in `lib/match-list.ts` decides liveness by parsing the notation (started + not finished) and checking a 3h recency window against `match_date` or `updated_at`. `MatchRow` gains a `live` prop (red 🔴 LIVE pill + pulse); `Landing` derives `ownLive`/`feedLive` and renders a `Live` subhead, with Past redefined as "not upcoming and not live".

**Tech Stack:** Next.js 14 / TypeScript / React, Vitest. Pure logic in `lib/`, styles in `app/globals.css`.

---

## File Structure

- **`lib/match-list.ts`** — add `isLive` helper + `LIVE_WINDOW_MS` const. Owns liveness derivation, alongside the existing `isUpcoming`.
- **`test/match-list.test.ts`** — add `isLive` behavioural cases.
- **`components/MatchRow.tsx`** — add `live?` prop + LIVE pill rendering.
- **`app/globals.css`** — `.ml-row.live` / `.ml-live` styles + a `livepulse` keyframe.
- **`components/Landing.tsx`** — derive `ownLive`/`feedLive`, redefine Past, render the Live subhead in both lists.
- **`lib/constants.ts`** — bump `APP_VERSION` v70 → v71.

---

### Task 1: `isLive` helper in `lib/match-list.ts`

**Files:**
- Modify: `lib/match-list.ts` (add helper after `isUpcoming`, ~line 95)
- Test: `test/match-list.test.ts`

**Context:** `parseMatch` is already imported at the top of `lib/match-list.ts` and is called by `matchRowView`. Its return value has `scoring`, `notes`, and `halfMarks` arrays. A full-time marker is an entry in `halfMarks` with `marker === "FT"`. `isUpcoming(iso, now)` already exists in this file and returns true for a future calendar day. The `MatchRecord` fields used: `rec.matchDate || rec.date` for the kickoff ISO, plus the parser inputs already used by `matchRowView` (`myTeam`, `scoringMode`, `usRoster`, `oppRoster`, `label`, `homeAway`, `opponent`).

- [ ] **Step 1: Write the failing tests**

Add to `test/match-list.test.ts`. First check the existing imports at the top of that file and extend the `import { ... } from "@/lib/match-list"` line to include `isLive`. Then add this block:

```ts
describe("isLive", () => {
  const NOW = Date.parse("2026-06-11T20:00:00");
  // a started, unfinished match: one scoring event, no FT marker
  const started = { raw: "20:00\n3 Rick goal", myTeam: "Racoons", opponent: "Wildebeests" } as any;
  const finished = { raw: "20:00\n3 Rick goal\nFT", myTeam: "Racoons", opponent: "Wildebeests" } as any;
  const empty = { raw: "", myTeam: "Racoons", opponent: "Wildebeests" } as any;
  const recentIso = "2026-06-11T19:30"; // 30m before NOW
  const staleIso = "2026-06-11T15:00"; // 5h before NOW
  const futureIso = "2026-06-12T19:00"; // tomorrow

  it("is live when started, unfinished, kickoff within 3h", () => {
    expect(isLive({ ...started, matchDate: recentIso }, NOW)).toBe(true);
  });
  it("is not live once FT is recorded", () => {
    expect(isLive({ ...finished, matchDate: recentIso }, NOW)).toBe(false);
  });
  it("is not live with no events", () => {
    expect(isLive({ ...empty, matchDate: recentIso }, NOW)).toBe(false);
  });
  it("is not live when both kickoff and last edit are stale", () => {
    expect(isLive({ ...started, matchDate: staleIso }, NOW, staleIso)).toBe(false);
  });
  it("is not live for a future calendar day", () => {
    expect(isLive({ ...started, matchDate: futureIso }, NOW)).toBe(false);
  });
  it("is live when kickoff is missing but it was edited recently", () => {
    expect(isLive({ ...started, matchDate: "" }, NOW, recentIso)).toBe(true);
  });
  it("is live when kickoff is stale but it was edited recently", () => {
    expect(isLive({ ...started, matchDate: staleIso }, NOW, recentIso)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- match-list`
Expected: FAIL — `isLive is not a function` (or an import error for `isLive`).

- [ ] **Step 3: Implement `isLive`**

Add to `lib/match-list.ts`, immediately after the `isUpcoming` function (after line 95):

```ts
const LIVE_WINDOW_MS = 3 * 60 * 60 * 1000; // 3h rolling window for "live"

// True when a match is currently in progress: not a future fixture, has started
// (≥1 event), has no FT marker, and either kickoff or the last edit is within the
// last 3h. `now` and `updatedAt` are passed in so the function stays pure.
export function isLive(rec: MatchRecord, now: number, updatedAt?: string): boolean {
  const iso = rec.matchDate || rec.date;
  if (isUpcoming(iso, now)) return false;

  const recent = (s: string | undefined) => {
    if (!s) return false;
    const t = Date.parse(s);
    if (isNaN(t)) return false;
    const diff = now - t;
    return diff >= 0 && diff < LIVE_WINDOW_MS;
  };
  if (!recent(iso) && !recent(updatedAt)) return false;

  const sp = (SPORTS as Record<string, { mode: string }>)[rec.sport || ""];
  const scoringMode = sp ? (sp.mode as "gaa" | "goals") : (rec.autoMode ? undefined : rec.scoringMode);
  const parsed = parseMatch(rec.raw, {
    myTeam: rec.myTeam, scoringMode,
    usRoster: rec.usRoster, oppRoster: rec.oppRoster,
    label: rec.label, homeAway: rec.homeAway, opponent: rec.opponent,
  });
  const started = parsed.scoring.length > 0 || parsed.notes.length > 0 || parsed.halfMarks.length > 0;
  if (!started) return false;
  const finished = parsed.halfMarks.some((m: any) => m.marker === "FT");
  return !finished;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- match-list`
Expected: PASS (all `isLive` cases green, existing cases still green).

- [ ] **Step 5: Commit**

```bash
git add lib/match-list.ts test/match-list.test.ts
git commit -m "feat(match-list): add isLive helper (started, unfinished, recent)"
```

---

### Task 2: `live` prop on `MatchRow`

**Files:**
- Modify: `components/MatchRow.tsx`

**Context:** `MatchRow` currently takes an `upcoming` prop that adds an `upcoming` class to `.ml-row` and prefixes the date with `📅`. `live` is mutually exclusive with `upcoming` (the caller picks exactly one group per row), so they don't need to combine.

- [ ] **Step 1: Add the `live` prop to the signature**

Change the destructured props and the interface:

```tsx
export default function MatchRow({ record, href, date, privacy = null, upcoming = false, live = false }: {
  record: MatchRecord;
  href: string;
  date: string;
  privacy?: "public" | "private" | null;
  upcoming?: boolean;
  live?: boolean;
}) {
```

- [ ] **Step 2: Add the `live` class to the root `<Link>`**

Change:

```tsx
    <Link className={"ml-row" + (upcoming ? " upcoming" : "")} href={href}>
```

to:

```tsx
    <Link className={"ml-row" + (upcoming ? " upcoming" : "") + (live ? " live" : "")} href={href}>
```

- [ ] **Step 3: Render the LIVE pill in the meta area**

Change the `.ml-meta` block:

```tsx
      <span className="ml-meta">
        <span className={"ml-date" + (upcoming ? " upcoming" : "")}>{upcoming ? `📅 ${date}` : date}</span>
        {privacy && <span className={"ml-priv " + privacy}>{privacy === "public" ? "◉ public" : "🔒 private"}</span>}
      </span>
```

to:

```tsx
      <span className="ml-meta">
        {live && <span className="ml-live">🔴 LIVE</span>}
        <span className={"ml-date" + (upcoming ? " upcoming" : "")}>{upcoming ? `📅 ${date}` : date}</span>
        {privacy && <span className={"ml-priv " + privacy}>{privacy === "public" ? "◉ public" : "🔒 private"}</span>}
      </span>
```

- [ ] **Step 4: Verify it compiles**

Run: `npm run build`
Expected: build succeeds (no TypeScript errors). If the full build is slow, `npx tsc --noEmit` is an acceptable faster check.

- [ ] **Step 5: Commit**

```bash
git add components/MatchRow.tsx
git commit -m "feat(match-row): add live prop with LIVE pill"
```

---

### Task 3: Live styles in `app/globals.css`

**Files:**
- Modify: `app/globals.css` (near the `.ml-row.upcoming` rule at line 360 and the `.ml-priv` rules ~line 377)

**Context:** `.ml-row.upcoming` uses a coloured left border (`border-left: 3px solid #1f86c8`). There is already a pulse keyframe pattern (`gmpulse` at line 192) using `box-shadow`. We add a red equivalent for the LIVE pill.

- [ ] **Step 1: Add the live row + pill styles**

Add immediately after the `.ml-row.upcoming { ... }` rule (line 360):

```css
.ml-row.live { border-left: 3px solid #d62828; }
.ml-live { font-size: 11px; font-weight: 700; color: #d62828; letter-spacing: .02em; animation: livepulse 1.6s ease-in-out infinite; }
@keyframes livepulse { 0% { opacity: 1; } 50% { opacity: .45; } 100% { opacity: 1; } }
```

- [ ] **Step 2: Verify the dev server renders without CSS errors**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add app/globals.css
git commit -m "feat(landing): live row border + pulsing LIVE pill styles"
```

---

### Task 4: Wire the Live section into `Landing`

**Files:**
- Modify: `components/Landing.tsx`

**Context:** `Landing` already computes `ownUpcoming`/`ownPast` (lines 76-77) and `feedUpcoming`/`feedPast` (lines 80-81) and renders `Upcoming`/`Past` subheads for each (lines 147-157 for own, 164-171 for feed). `now`, `dateOf`, `dateMs`, and the `row()` helper already exist. `isLive` must be added to the import from `@/lib/match-list` (line 9). Each `Row` carries `updated_at`.

- [ ] **Step 1: Import `isLive`**

Change line 9:

```tsx
import { matchRowView, relativeDate, isUpcoming } from "@/lib/match-list";
```

to:

```tsx
import { matchRowView, relativeDate, isUpcoming, isLive } from "@/lib/match-list";
```

- [ ] **Step 2: Derive `ownLive` and redefine `ownPast`**

Replace line 77:

```tsx
  const ownPast = ownFiltered.filter((r) => !isUpcoming(dateOf(r), now)); // already date-desc from the query
```

with:

```tsx
  const ownNotUpcoming = ownFiltered.filter((r) => !isUpcoming(dateOf(r), now));
  const ownLive = ownNotUpcoming.filter((r) => isLive(r.data, now, r.updated_at)).sort((a, b) => dateMs(b) - dateMs(a));
  const ownPast = ownNotUpcoming.filter((r) => !isLive(r.data, now, r.updated_at)); // already date-desc from the query
```

- [ ] **Step 3: Derive `feedLive` and redefine `feedPast`**

Replace line 81:

```tsx
  const feedPast = feedFiltered.filter((r) => !isUpcoming(dateOf(r), now));
```

with:

```tsx
  const feedNotUpcoming = feedFiltered.filter((r) => !isUpcoming(dateOf(r), now));
  const feedLive = feedNotUpcoming.filter((r) => isLive(r.data, now, r.updated_at)).sort((a, b) => dateMs(b) - dateMs(a));
  const feedPast = feedNotUpcoming.filter((r) => !isLive(r.data, now, r.updated_at));
```

- [ ] **Step 4: Extend the `row()` helper to accept `live`**

Replace the `row` helper (lines 88-93):

```tsx
  const row = (r: Row, opts: { privacy?: boolean; upcoming?: boolean } = {}) => (
    <MatchRow key={r.id} record={r.data} href={href(r)}
      date={relativeDate(dateOf(r), now)}
      upcoming={opts.upcoming}
      privacy={opts.privacy ? (r.is_public ? "public" : "private") : null} />
  );
```

with:

```tsx
  const row = (r: Row, opts: { privacy?: boolean; upcoming?: boolean; live?: boolean } = {}) => (
    <MatchRow key={r.id} record={r.data} href={href(r)}
      date={relativeDate(dateOf(r), now)}
      upcoming={opts.upcoming}
      live={opts.live}
      privacy={opts.privacy ? (r.is_public ? "public" : "private") : null} />
  );
```

- [ ] **Step 5: Render the Live block in "Your matches"**

Replace the own-matches render block (lines 146-158, the `<>` containing `ownUpcoming`/`ownPast`):

```tsx
              <>
                {ownUpcoming.length > 0 && (
                  <>
                    <div className="ml-subhead">Upcoming</div>
                    {ownUpcoming.map((r) => row(r, { privacy: true, upcoming: true }))}
                    {ownPast.length > 0 && <div className="ml-subhead">Past</div>}
                  </>
                )}
                {ownPast.slice(0, ownLimit).map((r) => row(r, { privacy: true }))}
                {ownPast.length > ownLimit && (
                  <button className="ml-more" onClick={() => setOwnLimit((n) => n + PAGE)}>Show older</button>
                )}
              </>
```

with:

```tsx
              <>
                {ownUpcoming.length > 0 && (
                  <>
                    <div className="ml-subhead">Upcoming</div>
                    {ownUpcoming.map((r) => row(r, { privacy: true, upcoming: true }))}
                  </>
                )}
                {ownLive.length > 0 && (
                  <>
                    <div className="ml-subhead">Live</div>
                    {ownLive.map((r) => row(r, { privacy: true, live: true }))}
                  </>
                )}
                {ownPast.length > 0 && (ownUpcoming.length > 0 || ownLive.length > 0) && <div className="ml-subhead">Past</div>}
                {ownPast.slice(0, ownLimit).map((r) => row(r, { privacy: true }))}
                {ownPast.length > ownLimit && (
                  <button className="ml-more" onClick={() => setOwnLimit((n) => n + PAGE)}>Show older</button>
                )}
              </>
```

- [ ] **Step 6: Render the Live block in the public feed**

Replace the feed render block (lines 164-171):

```tsx
        {feedUpcoming.length > 0 && (
          <>
            <div className="ml-subhead">Upcoming</div>
            {feedUpcoming.map((r) => row(r, { upcoming: true }))}
            {feedPast.length > 0 && <div className="ml-subhead">Past</div>}
          </>
        )}
        {feedPast.map((r) => row(r))}
```

with:

```tsx
        {feedUpcoming.length > 0 && (
          <>
            <div className="ml-subhead">Upcoming</div>
            {feedUpcoming.map((r) => row(r, { upcoming: true }))}
          </>
        )}
        {feedLive.length > 0 && (
          <>
            <div className="ml-subhead">Live</div>
            {feedLive.map((r) => row(r, { live: true }))}
          </>
        )}
        {feedPast.length > 0 && (feedUpcoming.length > 0 || feedLive.length > 0) && <div className="ml-subhead">Past</div>}
        {feedPast.map((r) => row(r))}
```

- [ ] **Step 7: Verify it compiles and tests pass**

Run: `npm run build && npm test`
Expected: build succeeds; all tests pass.

- [ ] **Step 8: Commit**

```bash
git add components/Landing.tsx
git commit -m "feat(landing): render Live section between Upcoming and Past"
```

---

### Task 5: Bump `APP_VERSION`

**Files:**
- Modify: `lib/constants.ts:2`

- [ ] **Step 1: Bump the version**

Change line 2:

```ts
export const APP_VERSION = "v70";
```

to:

```ts
export const APP_VERSION = "v71";
```

- [ ] **Step 2: Commit**

```bash
git add lib/constants.ts
git commit -m "chore: bump APP_VERSION to v71"
```

---

## Manual verification (after all tasks)

1. `npm run dev`, open `http://localhost:3000`.
2. Sign in. Create/open a match dated today, enter at least one event, and do **not** record FT → it appears under a **Live** subhead with a red 🔴 LIVE pill and red left border, between Upcoming and Past.
3. Record **FT** on that match, reload → it moves to **Past**.
4. A match with no events dated today stays under Past, not Live.
5. Footer shows `Here We Go · v71`.

---

## Notes / out of scope

- The landing list is a per-load snapshot (no Realtime subscription here, by design). A match enters/leaves Live on reload or navigation. Live auto-refresh of the landing list is a possible follow-up.
