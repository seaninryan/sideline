# Team Lineup Sync — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When you edit the lineup in a team's most-recent match, push that lineup onto the team record's roster (both home and away teams) so the team's next match — which already seeds from `team.roster` — starts from the latest lineup.

**Architecture:** A pure, tested helper decides which team(s) a just-saved match should push its roster to (the side(s) for which this match is the team's chronologically-latest). A rename-safe `teamStore.setRoster` does a targeted roster-only DB update. The editor's existing debounced auto-save calls the helper, gated to the side whose roster actually changed. Seeding and the team page are unchanged — keeping `team.roster` fresh makes both reflect the latest lineup.

**Tech Stack:** Next.js 14, TypeScript, Supabase, Vitest. Node 20 (`nvm use 20` before every npm/npx — the default shell node is v14).

**Source spec:** `docs/superpowers/specs/2026-06-12-team-lineup-sync-design.md`
**Branch:** `team-lineup-sync` (already checked out; off `sport-cleanup`).

Baseline before this plan: **297 tests passing**. Current `APP_VERSION`: `v74`.

---

## File Structure

**New:** `lib/team-roster-sync.ts` (pure: `latestMatchForTeam` + `teamRosterPushes`), `test/team-roster-sync.test.ts`.
**Modified:** `lib/team-store.ts` (+`setRoster`), `components/MatchTracker.tsx` (auto-save sync), `lib/constants.ts` (version bump).

Tasks ordered so tests + build pass at every commit.

---

## Task 1: Pure helper — `team-roster-sync.ts`

**Files:**
- Create: `lib/team-roster-sync.ts`
- Test: `test/team-roster-sync.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/team-roster-sync.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { latestMatchForTeam, teamRosterPushes } from "@/lib/team-roster-sync";
import type { MatchRecord, TeamRoster } from "@/lib/types";

const roster = (n: number): TeamRoster => ({ formation: [[n]], players: [{ num: n, name: `P${n}`, role: "starting" }] });
const empty: TeamRoster = { formation: [], players: [] };

const m = (id: string, opts: Partial<any> = {}) => ({
  id, homeTeamId: opts.homeTeamId ?? null, awayTeamId: opts.awayTeamId ?? null,
  matchDate: opts.matchDate, date: opts.date, savedAt: opts.savedAt,
});

describe("latestMatchForTeam", () => {
  const matches = [
    m("a", { homeTeamId: "T", matchDate: "2026-01-01" }),
    m("b", { awayTeamId: "T", matchDate: "2026-03-01" }),
    m("c", { homeTeamId: "OTHER", matchDate: "2026-09-01" }),
  ];
  it("picks the latest linked match by date", () => {
    expect(latestMatchForTeam(matches, "T")).toBe("b");
  });
  it("ignores matches not linked to the team", () => {
    expect(latestMatchForTeam(matches, "T")).not.toBe("c");
  });
  it("returns null when the team has no linked matches", () => {
    expect(latestMatchForTeam(matches, "NONE")).toBeNull();
  });
  it("breaks date ties by savedAt", () => {
    const tie = [
      m("x", { homeTeamId: "T", matchDate: "2026-05-01", savedAt: 100 }),
      m("y", { homeTeamId: "T", matchDate: "2026-05-01", savedAt: 200 }),
    ];
    expect(latestMatchForTeam(tie, "T")).toBe("y");
  });
});

describe("teamRosterPushes", () => {
  // home match: us=home team H, opp=away team A
  const base = {
    raw: "", sport: "hurling", homeAway: "home", homeTeamId: "H", awayTeamId: "A",
    usRoster: roster(7), oppRoster: roster(9),
  } as unknown as MatchRecord & { id: string };

  it("pushes both sides when this match is each team's latest", () => {
    const rec = { ...base, id: "m1" };
    const matches = [m("m1", { homeTeamId: "H", awayTeamId: "A", matchDate: "2026-02-01" })];
    const pushes = teamRosterPushes(rec, matches);
    expect(pushes).toEqual([
      { teamId: "H", side: "us", roster: roster(7) },
      { teamId: "A", side: "opp", roster: roster(9) },
    ]);
  });

  it("maps us→awayTeamId when homeAway is away", () => {
    const rec = { ...base, id: "m1", homeAway: "away" };
    const matches = [m("m1", { homeTeamId: "H", awayTeamId: "A", matchDate: "2026-02-01" })];
    const pushes = teamRosterPushes(rec, matches);
    // us roster goes to the away team A; opp roster to the home team H
    expect(pushes).toEqual([
      { teamId: "A", side: "us", roster: roster(7) },
      { teamId: "H", side: "opp", roster: roster(9) },
    ]);
  });

  it("excludes a side when this match is NOT that team's latest", () => {
    const rec = { ...base, id: "m1" };
    const matches = [
      m("m1", { homeTeamId: "H", awayTeamId: "A", matchDate: "2026-02-01" }),
      m("m2", { homeTeamId: "H", matchDate: "2026-08-01" }), // newer H match
    ];
    const pushes = teamRosterPushes(rec, matches);
    expect(pushes).toEqual([{ teamId: "A", side: "opp", roster: roster(9) }]); // only A (m1 is A's latest, not H's)
  });

  it("excludes unlinked sides and empty rosters", () => {
    const rec = { ...base, id: "m1", awayTeamId: null, oppRoster: empty };
    const matches = [m("m1", { homeTeamId: "H", matchDate: "2026-02-01" })];
    expect(teamRosterPushes(rec, matches)).toEqual([{ teamId: "H", side: "us", roster: roster(7) }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use 20; npx vitest run test/team-roster-sync.test.ts`
Expected: FAIL — cannot resolve `@/lib/team-roster-sync`.

- [ ] **Step 3: Implement `lib/team-roster-sync.ts`**

```ts
import type { MatchRecord, TeamRoster } from "@/lib/types";

type MatchLite = {
  id: string;
  homeTeamId?: string | null;
  awayTeamId?: string | null;
  matchDate?: string;
  date?: string;
  savedAt?: number;
};

// id of the team's chronologically-latest linked match (max date, tie-broken by
// savedAt desc then id), or null if the team has no linked matches.
export function latestMatchForTeam(matches: MatchLite[], teamId: string): string | null {
  const linked = matches.filter((m) => m.homeTeamId === teamId || m.awayTeamId === teamId);
  if (!linked.length) return null;
  const key = (m: MatchLite) => m.matchDate || m.date || "";
  let best = linked[0];
  for (const m of linked.slice(1)) {
    const a = key(m), b = key(best);
    if (a > b) { best = m; continue; }
    if (a === b) {
      const sa = m.savedAt ?? 0, sb = best.savedAt ?? 0;
      if (sa > sb || (sa === sb && m.id > best.id)) best = m;
    }
  }
  return best.id;
}

// For the just-saved match, the team-roster pushes to make: the us side
// (teamId = homeAway==="home" ? homeTeamId : awayTeamId, roster = usRoster) and the
// opp side (the other id, oppRoster) — each only when this match is that team's
// latest and the roster is non-empty.
export function teamRosterPushes(
  record: MatchRecord & { id: string },
  matches: MatchLite[],
): { teamId: string; side: "us" | "opp"; roster: TeamRoster }[] {
  const usTeamId = record.homeAway === "home" ? record.homeTeamId : record.awayTeamId;
  const oppTeamId = record.homeAway === "home" ? record.awayTeamId : record.homeTeamId;
  const out: { teamId: string; side: "us" | "opp"; roster: TeamRoster }[] = [];
  const consider = (teamId: string | null | undefined, side: "us" | "opp", roster?: TeamRoster) => {
    if (!teamId || !roster || !roster.formation || !roster.formation.length) return;
    if (latestMatchForTeam(matches, teamId) === record.id) out.push({ teamId, side, roster });
  };
  consider(usTeamId, "us", record.usRoster);
  consider(oppTeamId, "opp", record.oppRoster);
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/team-roster-sync.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/team-roster-sync.ts test/team-roster-sync.test.ts
git commit -m "feat(lineup-sync): latestMatchForTeam + teamRosterPushes pure helpers"
```

---

## Task 2: `teamStore.setRoster` (rename-safe targeted write)

**Files:**
- Modify: `lib/team-store.ts`

No unit test (thin Supabase I/O wrapper); verified by tsc + the editor integration.

- [ ] **Step 1: Add `setRoster` to the `teamStore` object**

In `lib/team-store.ts`, add this method to the `teamStore` object (place it next to `del`/`setPrivacy`, ~line 81–97). It updates only the `roster` column — NOT via `teamStore.set`, whose name-dedup could rename a team (you have duplicate teams):

```ts
  // Roster-only update for an existing team. Does NOT run the name-dedup/short-code
  // logic that teamStore.set does (that could rename a team when duplicates exist).
  async setRoster(id: string, roster: TeamRoster): Promise<boolean> {
    const { error } = await sb.from("teams").update({ roster, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) { console.warn("team roster sync failed", error.message); return false; }
    return true;
  },
```

`TeamRoster` is already imported at the top of `lib/team-store.ts` (`import type { TeamRecord, TeamRoster, NameDisplay } from "@/lib/types";`). If not, add it.

- [ ] **Step 2: Verify it type-checks + suite still green**

Run: `nvm use 20; npx tsc --noEmit` → no new errors.
Run: `npm test 2>&1 | grep -E "Tests "` → all passing (the Task-1 suite count + 297 baseline).

- [ ] **Step 3: Commit**

```bash
git add lib/team-store.ts
git commit -m "feat(lineup-sync): teamStore.setRoster — rename-safe roster-only update"
```

---

## Task 3: Editor auto-save wiring

**Files:**
- Modify: `components/MatchTracker.tsx` (`// @ts-nocheck`; verify via build + manual)

`teamStore` is already imported (line 26).

- [ ] **Step 1: Import the helper**

At the top of `components/MatchTracker.tsx`, add:

```ts
import { teamRosterPushes } from "@/lib/team-roster-sync";
```

- [ ] **Step 2: Sync in the auto-save effect**

The debounced auto-save effect (~lines 279–291) currently is:

```tsx
  useEffect(() => {
    if (!curId || !dirty) return;
    const t = setTimeout(async () => {
      const ok = await store.set(curId, { ...recordPayload(), savedAt: Date.now() });
      // our save is now the latest copy — any pending cross-device conflict notice is moot.
      if (ok) { setRemoteConflict(false); setSavedMsg("Auto-saved ✓"); setTimeout(() => setSavedMsg(""), 1200); }
      else { setSavedMsg("NOT saved — check connection"); setTimeout(() => setSavedMsg(""), 6000); }
      await refreshList();
    }, 2500);
    return () => clearTimeout(t);
    // eslint-disable-next-line
  }, [curId, dirty, raw, matchDate, myTeam, sport, colorUs, colorUs2, colorThem, colorThem2, nameDisplay, label, homeAway, opponent, usRoster, homeTeamId, awayTeamId, oppRoster, usSquad, oppSquad]);
```

Replace the body of the `setTimeout` callback with (capturing the pre-save record FIRST, then syncing rosters after a successful save):

```tsx
    const t = setTimeout(async () => {
      const prev = cache[curId]; // pre-save copy, to detect which roster changed
      const usChanged = JSON.stringify(prev?.usRoster) !== JSON.stringify(usRoster);
      const oppChanged = JSON.stringify(prev?.oppRoster) !== JSON.stringify(oppRoster);
      const ok = await store.set(curId, { ...recordPayload(), savedAt: Date.now() });
      // our save is now the latest copy — any pending cross-device conflict notice is moot.
      if (ok) { setRemoteConflict(false); setSavedMsg("Auto-saved ✓"); setTimeout(() => setSavedMsg(""), 1200); }
      else { setSavedMsg("NOT saved — check connection"); setTimeout(() => setSavedMsg(""), 6000); }
      // Push the lineup to the linked team(s) when a roster changed and this is that team's latest match.
      if (ok && (usChanged || oppChanged)) {
        try {
          const matchList = Object.entries(cache).map(([id, d]) => ({
            id, homeTeamId: d.homeTeamId, awayTeamId: d.awayTeamId,
            matchDate: d.matchDate, date: d.date, savedAt: d.savedAt,
          }));
          const pushes = teamRosterPushes({ ...recordPayload(), id: curId }, matchList);
          for (const p of pushes) {
            if (p.side === "us" ? usChanged : oppChanged) await teamStore.setRoster(p.teamId, p.roster);
          }
        } catch (e) { console.warn("team lineup sync failed", e); }
      }
      await refreshList();
    }, 2500);
```

(`cache` is imported from `@/lib/store` and `store.set` updates `cache[curId]` synchronously before its `await` resolves, so `matchList` includes the just-saved match with its current date — making the latest-match check correct.)

- [ ] **Step 3: Verify**

Run: `nvm use 20; npm test 2>&1 | grep -E "Tests "` → all passing (unchanged from Task 1).
Run: `npm run build 2>&1 | tail -6` → success.
Manual (dev server): open a match that's a team's latest, edit its lineup on the Lineup tab, wait for "Auto-saved ✓". Then create/open that team's next match (or open its `/teams` page) → the lineup reflects the edit. Edit an *older* match's lineup → the team's roster is unchanged. A non-lineup edit (e.g. opponent name) → no team write.

- [ ] **Step 4: Commit**

```bash
git add components/MatchTracker.tsx
git commit -m "feat(lineup-sync): push latest-match lineup to linked team(s) on auto-save"
```

---

## Task 4: Version bump + final verification

**Files:**
- Modify: `lib/constants.ts`

- [ ] **Step 1: Bump `APP_VERSION`**

In `lib/constants.ts`, change `APP_VERSION` from `"v74"` to `"v75"`.

- [ ] **Step 2: Full verification**

Run: `nvm use 20; npm test 2>&1 | grep -E "Test Files|Tests "` → all passing (297 baseline + the new `team-roster-sync` cases).
Run: `npm run build 2>&1 | tail -6` → success.

- [ ] **Step 3: Commit**

```bash
git add lib/constants.ts
git commit -m "chore: bump APP_VERSION to v75 (team lineup sync)"
```

> **Tell the user:** look for **v75**. No DB migration needed (uses the existing `teams.roster` column).

---

## Self-Review notes (addressed)

- **Spec coverage:** §1 pure helpers → Task 1; §2 `setRoster` → Task 2; §3 editor auto-save wiring (changed-side gating, latest-match push) → Task 3; §4 seeding/team-page unchanged (no task needed); version bump → Task 4. All mapped.
- **Type consistency:** `latestMatchForTeam(matches, teamId): string | null` and `teamRosterPushes(record, matches): {teamId, side, roster}[]` used identically in Task 1 (def/test) and Task 3 (call). `MatchLite` shape (`id, homeTeamId, awayTeamId, matchDate, date, savedAt`) matches what Task 3 builds from `cache`. `teamStore.setRoster(id, roster)` signature matches Task 3's call. `TeamRoster` (`formation`, `players`) per `lib/types.ts`.
- **Placeholder scan:** no TBD/TODO; all code shown.
- **Ordering:** pure helper (Task 1) + `setRoster` (Task 2) precede the editor wiring (Task 3) that consumes both; green at each commit.
