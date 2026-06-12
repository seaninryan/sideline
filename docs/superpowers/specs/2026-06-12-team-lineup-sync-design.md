# Carry a team's latest-match lineup to its next match

**Date:** 2026-06-12
**Status:** Approved (brainstorm) — pending implementation plan
**Branch:** `team-lineup-sync` (off `sport-cleanup`).

## Goal

When you edit the lineup in a team's **most-recent** match, push that lineup onto
the **team record's roster**, so the team's *next* match starts from the most
recent lineup (and the team page reflects it). Applies to **both** the home and
away teams of a match.

## Key insight

New matches already seed their lineup from `team.roster` (the wizard's
`finishNew` → `teamLinkPatch` does `usRoster = hasRoster ? record.usRoster :
clone(usTeam.roster)`). So the *only* change required is to keep `team.roster`
fresh with the latest match's lineup. Seeding is untouched; the team page
(`TeamPage`, which renders `team.roster`) reflects the latest lineup for free.

## Decisions (from brainstorm)

- **Mechanism:** auto-push on save (not an explicit button, not derive-on-read).
- **Sides:** both home and away teams.
- **Guard:** only the team's chronologically-latest match feeds the team roster —
  editing an older match must not clobber it.

## Data model recap

- A match record has `usRoster` (the `myTeam` side) and `oppRoster` (opponent),
  plus `homeTeamId`/`awayTeamId` and `matchDate`/`savedAt`.
- `homeTeamId = homeAway === "home" ? usTeamId : oppTeamId` (set by `teamLinkPatch`).
  So **us-team id** = `homeAway === "home" ? homeTeamId : awayTeamId`, and the
  **opp-team id** is the other.
- A team record has `roster` (canonical lineup), persisted via `teamStore`.
- All the owner's matches live in `cache` (client), so "this team's latest match"
  is computable without a query.
- Historical matches keep their own `usRoster`/`oppRoster` snapshots — only the
  team template (`roster`) and future seeds change.

## 1. Pure helper — `lib/team-roster-sync.ts` (unit-tested)

```ts
import type { MatchRecord, TeamRoster } from "@/lib/types";

type MatchLite = Pick<MatchRecord, "homeTeamId" | "awayTeamId" | "matchDate" | "date" | "savedAt"> & { id: string };

// id of the team's chronologically-latest linked match (max matchDate, tie-broken
// by savedAt then id), or null if the team has no linked matches.
export function latestMatchForTeam(matches: MatchLite[], teamId: string): string | null;

// For the just-saved match, the team-roster pushes it should make: the us side
// (teamId = homeAway==="home" ? homeTeamId : awayTeamId, roster = usRoster) and the
// opp side (other id, oppRoster), each included ONLY when this match is that team's
// latest (per latestMatchForTeam) AND the roster is non-empty. 0–2 entries.
export function teamRosterPushes(
  record: MatchRecord & { id: string },
  matches: MatchLite[],
): { teamId: string; side: "us" | "opp"; roster: TeamRoster }[];
```

`latestMatchForTeam`:
- considers matches where `homeTeamId === teamId || awayTeamId === teamId`;
- date key = `matchDate || date || ""`; compares lexically (ISO dates sort
  correctly); tie-break by `savedAt ?? 0` desc, then `id` for determinism;
- returns the winning match's `id`, or `null` if none linked.

`teamRosterPushes` includes a side only when: the side's team id is set, the
side's roster has `formation.length` (non-empty), and
`latestMatchForTeam(matches, teamId) === record.id`.

## 2. Targeted team-roster write — `lib/team-store.ts`

Add a roster-only update that does **not** run the name-dedup / short-code logic
(`teamStore.set` does, and with duplicate teams present it could *rename* the team
as a side effect — we must not):

```ts
async setRoster(id: string, roster: TeamRoster): Promise<boolean> {
  const { error } = await sb.from("teams").update({ roster, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) { console.warn("team roster sync failed", error.message); return false; }
  return true;
}
```

## 3. Editor wiring — `components/MatchTracker.tsx`

In the **auto-save success path** (the debounced `useEffect` that calls
`store.set(curId, …)`), after a successful save, sync the latest-match team
rosters — gated to the side(s) whose roster actually changed this save:

- **Before** `store.set` overwrites `cache[curId]`, capture the previous record:
  `const prev = cache[curId];`
- Determine changed sides:
  `usChanged = JSON.stringify(prev?.usRoster) !== JSON.stringify(usRoster)`,
  `oppChanged = JSON.stringify(prev?.oppRoster) !== JSON.stringify(oppRoster)`.
- If neither changed → skip entirely (no team writes on non-lineup saves).
- Else, after the save resolves, build the match list from `cache` (keyed by id)
  and compute the pushes:

```ts
const matchList = Object.entries(cache).map(([id, d]) => ({
  id, homeTeamId: d.homeTeamId, awayTeamId: d.awayTeamId,
  matchDate: d.matchDate, date: d.date, savedAt: d.savedAt,
}));
const pushes = teamRosterPushes({ ...recordPayload(), id: curId }, matchList);
for (const p of pushes) {
  if (p.side === "us" ? usChanged : oppChanged) await teamStore.setRoster(p.teamId, p.roster);
}
```

(`cache[curId]` already holds the just-saved record, so the current match is in
`matchList` with its date for the latest-match computation.)

Wrap the sync in `try/catch` (best-effort; a failure must not disrupt the match
save). Run it after `store.set` resolves so `cache` reflects the saved match for
the latest-match computation.

No change to `recordPayload`, seeding, `teamLinkPatch`, or the new-match wizard.

## 4. Seeding & team page (no code change)

- New match → `teamLinkPatch` seeds `usRoster`/`oppRoster` from `team.roster`,
  which is now the latest lineup. ✓
- `TeamPage` renders `team.roster` → shows the latest lineup. ✓

## Testing

- `test/team-roster-sync.test.ts`:
  - `latestMatchForTeam`: picks max-date match; tie-break by savedAt; ignores
    matches not linked to the team; returns null when none linked.
  - `teamRosterPushes`: returns the us push when the match is the us-team's latest;
    the opp push for the opp team; both when both are latest; empty for a
    non-latest match, an unlinked match, or empty rosters; correct teamId mapping
    for `homeAway` home vs away.
- The editor wiring and `teamStore.setRoster` are I/O — verified by build + manual
  (edit the latest match's lineup → reopen/create that team's next match starts
  from it; edit an older match → team unchanged).

## Scope / YAGNI

- No explicit "save to team" button (auto on save).
- No migration/backfill of existing teams' rosters from their latest matches —
  the sync starts applying from the next lineup edit forward.
- No change to historical match snapshots.
- `teamStore.set` (with dedup) is untouched; the new `setRoster` is the only write
  path used here.

## Files touched

**New:** `lib/team-roster-sync.ts`, `test/team-roster-sync.test.ts`.
**Changed:** `lib/team-store.ts` (+`setRoster`), `components/MatchTracker.tsx`
(auto-save sync), `lib/constants.ts` (bump `APP_VERSION`).
