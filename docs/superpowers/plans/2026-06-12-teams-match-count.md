# Teams Match-Count + 0-Match Inline Delete — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On `/teams`, show each team's linked-match count and offer a confirm-first delete on teams with zero matches, so unused teams are easy to find and remove while in-use teams are protected.

**Architecture:** A pure, tested `countMatchesByTeam` tallies counts from the owner's match rows (`home_team_id`/`away_team_id`). `TeamsList` loads those counts alongside its team list, shows "N matches" in each row's meta, and renders a confirm-first 🗑 only on 0-match rows (reusing the existing `teamStore.del` + `reload`).

**Tech Stack:** Next.js 14, TypeScript, Supabase, Vitest. Node 20 (`nvm use 20` before every npm/npx — default shell node is v14).

**Source spec:** `docs/superpowers/specs/2026-06-12-teams-match-count-design.md`
**Branch:** `teams-match-count` (already checked out; off `main`, v75).

Baseline before this plan: **305 tests passing**. `APP_VERSION`: `v75`. Note: `components/TeamsList.tsx` is a typed file (not `@ts-nocheck`) — keep types correct.

---

## Task 1: `countMatchesByTeam` pure helper

**Files:**
- Create: `lib/team-stats.ts`
- Test: `test/team-stats.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/team-stats.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { countMatchesByTeam } from "@/lib/team-stats";

describe("countMatchesByTeam", () => {
  it("counts both the home and away team of each match", () => {
    const rows = [
      { home_team_id: "A", away_team_id: "B" },
      { home_team_id: "A", away_team_id: "C" },
    ];
    expect(countMatchesByTeam(rows)).toEqual({ A: 2, B: 1, C: 1 });
  });
  it("counts a team that appears on both sides across matches", () => {
    const rows = [
      { home_team_id: "A", away_team_id: "B" },
      { home_team_id: "B", away_team_id: "A" },
    ];
    expect(countMatchesByTeam(rows)).toEqual({ A: 2, B: 2 });
  });
  it("ignores null/absent ids", () => {
    const rows = [
      { home_team_id: "A", away_team_id: null },
      { home_team_id: null, away_team_id: undefined },
      { away_team_id: "A" },
    ];
    expect(countMatchesByTeam(rows)).toEqual({ A: 2 });
  });
  it("empty input → empty object", () => {
    expect(countMatchesByTeam([])).toEqual({});
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use 20; npx vitest run test/team-stats.test.ts`
Expected: FAIL — cannot resolve `@/lib/team-stats`.

- [ ] **Step 3: Implement `lib/team-stats.ts`**

```ts
type MatchLink = { home_team_id?: string | null; away_team_id?: string | null };

// Number of matches each team is involved in, keyed by team id. Each match
// increments BOTH its home and away team (both are the owner's team records).
// Null/absent ids are ignored.
export function countMatchesByTeam(rows: MatchLink[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const r of rows) {
    if (r.home_team_id) counts[r.home_team_id] = (counts[r.home_team_id] || 0) + 1;
    if (r.away_team_id) counts[r.away_team_id] = (counts[r.away_team_id] || 0) + 1;
  }
  return counts;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/team-stats.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/team-stats.ts test/team-stats.test.ts
git commit -m "feat(teams): countMatchesByTeam pure helper"
```

---

## Task 2: `TeamsList` — counts, match-count label, 0-match inline delete

**Files:**
- Modify: `components/TeamsList.tsx`, `app/globals.css`

`components/TeamsList.tsx` is typed (not `@ts-nocheck`) — verify with `tsc`. `sb` (`createClient()`), `userId`, `teamStore`, `reload`, `dup`, `meta`, and the `tl-row` rendering all already exist.

- [ ] **Step 1: Import the helper**

At the top of `components/TeamsList.tsx`, add to the imports:

```ts
import { countMatchesByTeam } from "@/lib/team-stats";
```

- [ ] **Step 2: Add counts + confirm state, a counts loader, and fold it into `reload`**

The current code (lines ~20–33) is:
```tsx
  const [teams, setTeams] = useState<TeamRecord[] | null>(null);
  const [editing, setEditing] = useState<null | "new" | TeamRecord>(null);
  const [filter, setFilter] = useState<Filter>("both");
  const [yourLimit, setYourLimit] = useState(PAGE);

  // public teams discovery feed (own + others), paginated
  const [feed, setFeed] = useState<TeamRecord[]>([]);
  const [feedMore, setFeedMore] = useState(true);
  const [feedLoading, setFeedLoading] = useState(false);
  const feedOffset = useRef(0);

  const reload = () => teamStore.list(userId).then(setTeams);
  const dup = async (t: TeamRecord) => { const d = await teamStore.duplicate(t); await reload(); if (d) setEditing(d); };
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [userId]);
```

Add the two state hooks (next to the other `useState`s) and the counts loader, and change `reload` to refresh both. Replace the `const reload = …` line and add above it:

```tsx
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [confirmDelId, setConfirmDelId] = useState<string | null>(null);

  const loadCounts = async () => {
    const { data } = await sb.from("matches").select("home_team_id,away_team_id").eq("owner", userId);
    setCounts(countMatchesByTeam((data as { home_team_id?: string | null; away_team_id?: string | null }[]) || []));
  };
  const reload = () => Promise.all([teamStore.list(userId).then(setTeams), loadCounts()]);
```

(Add `counts`/`confirmDelId` alongside the existing `useState` declarations; declare `loadCounts` before `reload` so `reload` can call it. `dup` and the `useEffect` already call `reload`, so counts now refresh on mount and after duplicate/edit.)

- [ ] **Step 3: Show the match count in `meta`**

The current `meta` (lines ~47–49) is:
```tsx
  const meta = (t: TeamRecord) => (
    <span className="tl-meta">{t.sport && SPORTS[t.sport] && <SportIcon sport={t.sport} size={15} />}{t.roster.players.length} players</span>
  );
```
Replace it with:
```tsx
  const matchLabel = (n: number) => `${n} ${n === 1 ? "match" : "matches"}`;
  const meta = (t: TeamRecord) => (
    <span className="tl-meta">{t.sport && SPORTS[t.sport] && <SportIcon sport={t.sport} size={15} />}{t.roster.players.length} players · {matchLabel(counts[t.id] || 0)}</span>
  );
```

- [ ] **Step 4: Add the 0-match inline delete button to the row**

Find the "Your teams" row (the `tl-row` with the duplicate button), currently:
```tsx
                <div className="tl-row" key={t.id} onClick={() => setEditing(t)}>
                  <span className="tl-flag" style={{ background: flag(t) }} />
                  <span className="tl-name">{t.name}{t.squad ? <span className="tl-squad">{t.squad}</span> : null}</span>
                  <span className={"tl-priv " + (t.is_public ? "public" : "private")}>{t.is_public ? "◉ public" : "🔒 private"}</span>
                  <button className="tl-dup" title="Duplicate" onClick={(e) => { e.stopPropagation(); dup(t); }}>⧉</button>
                  {meta(t)}
                </div>
```
Add the delete button immediately after the duplicate button (it renders only for 0-match teams):
```tsx
                  <button className="tl-dup" title="Duplicate" onClick={(e) => { e.stopPropagation(); dup(t); }}>⧉</button>
                  {(counts[t.id] || 0) === 0 && (
                    <button
                      className={"tl-del" + (confirmDelId === t.id ? " danger" : "")}
                      title="Delete team"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirmDelId !== t.id) { setConfirmDelId(t.id); setTimeout(() => setConfirmDelId((c) => (c === t.id ? null : c)), 3500); return; }
                        setConfirmDelId(null);
                        teamStore.del(t.id).then(reload);
                      }}
                    >{confirmDelId === t.id ? "Delete?" : "🗑"}</button>
                  )}
                  {meta(t)}
```

- [ ] **Step 5: Add `.tl-del` CSS**

In `app/globals.css`, directly after the `.tl-dup` rule (line ~528):
```css
.tl-del{background:none; border:none; cursor:pointer; font-size:14px; color:var(--muted); padding:2px 6px;}
.tl-del:hover{color:#c0392b;}
.tl-del.danger{color:#fff; background:#c0392b; border-radius:6px;}
```

- [ ] **Step 6: Verify**

Run: `nvm use 20; npx tsc --noEmit` → no new errors.
Run: `npm test 2>&1 | grep -E "Tests "` → all passing (305 baseline + the Task-1 suite).
Run: `npm run build 2>&1 | tail -6` → success. (A dev server on port 3000 may be disrupted by the build — expected.)
Manual (dev server): on `/teams`, each of your teams shows "… players · N matches". A team with 0 matches shows a 🗑 that arms ("Delete?") on first tap and deletes on the second, then disappears from the list; an in-use team shows its count and **no** 🗑. Counts update after a duplicate or delete.

- [ ] **Step 7: Commit**

```bash
git add components/TeamsList.tsx app/globals.css
git commit -m "feat(teams): show match counts + confirm-delete for 0-match teams"
```

---

## Task 3: Version bump + final verification

**Files:**
- Modify: `lib/constants.ts`

- [ ] **Step 1: Bump `APP_VERSION`**

In `lib/constants.ts`, change `APP_VERSION` from `"v75"` to `"v76"`.

- [ ] **Step 2: Full verification**

Run: `nvm use 20; npm test 2>&1 | grep -E "Test Files|Tests "` → all passing (305 + the new `team-stats` cases).
Run: `npm run build 2>&1 | tail -6` → success.

- [ ] **Step 3: Commit**

```bash
git add lib/constants.ts
git commit -m "chore: bump APP_VERSION to v76 (teams match-count + inline delete)"
```

> **Tell the user:** look for **v76**. No DB migration (counts are computed client-side from existing `home_team_id`/`away_team_id` columns).

---

## Self-Review notes (addressed)

- **Spec coverage:** §1 `countMatchesByTeam` → Task 1; §2 counts wiring (state + loader + reload) → Task 2 Step 2; §3 match-count label → Task 2 Step 3; §4 0-match inline delete + CSS → Task 2 Steps 4–5; version → Task 3. All mapped.
- **Type consistency:** `countMatchesByTeam(rows): Record<string, number>` used in Task 1 (def/test) and Task 2 (`setCounts`); `counts: Record<string,number>`, `confirmDelId: string | null` typed; `matchLabel(n: number)`. Matches the typed `TeamsList`.
- **Placeholder scan:** no TBD/TODO; all edits show concrete code with anchor context.
- **Ordering:** pure helper (Task 1) precedes its consumer (Task 2); green at each commit.
