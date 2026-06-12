# Teams match-count + 0-match inline delete

**Date:** 2026-06-12
**Status:** Approved (brainstorm) — pending implementation plan
**Branch:** `teams-match-count` (off `main`, v75).

## Goal

On the `/teams` list, show how many matches each team is involved in, and offer a
one-tap (confirm-first) delete on teams with **zero** matches — so unused teams
(duplicates, test teams, abandoned imports) are easy to spot and remove, while
in-use teams are protected from accidental deletion.

## Decisions (from brainstorm)

- **Count basis:** linked matches only — a match counts for a team when the team
  is its `home_team_id` **or** `away_team_id` (both your own team records). Not
  legacy name-matching.
- **Inline delete:** shown **only** on teams with 0 matches; in-use teams keep
  just the existing duplicate (⧉) button.

## 1. Pure helper — `lib/team-stats.ts` (unit-tested)

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

Unit-tested in `test/team-stats.test.ts`: both-sides tally, multiple teams, a team
appearing on both sides across matches, null/absent ids ignored, empty input → `{}`.

## 2. `TeamsList` data wiring (`components/TeamsList.tsx`)

- Add state: `const [counts, setCounts] = useState<Record<string, number>>({});`
- Add a loader that runs with `reload` (so counts stay fresh after
  create/edit/duplicate/delete):

```tsx
const sb = createClient(); // already present in the component
const loadCounts = async () => {
  const { data } = await sb.from("matches").select("home_team_id,away_team_id").eq("owner", userId);
  setCounts(countMatchesByTeam((data as any[]) || []));
};
```
- The existing `reload` becomes `const reload = () => Promise.all([teamStore.list(userId).then(setTeams), loadCounts()]);`
  (so every reload refreshes both teams and counts). The `useEffect(() => { reload() }, [userId])` already calls it on mount.
- Import `countMatchesByTeam` from `@/lib/team-stats`.

(`createClient`/`sb` and `userId` are already in scope in `TeamsList`.)

## 3. Display the count

In `meta(t)` (currently sport icon + "N players"), append the match count.
Define a small inline formatter and add it to the meta line:

```tsx
const matchLabel = (n: number) => `${n} ${n === 1 ? "match" : "matches"}`;
// in meta(t)'s returned span, after the players count:
//   … {t.roster.players.length} players · {matchLabel(counts[t.id] || 0)}
```
Keep it within the existing `tl-meta` span so layout is unchanged.

## 4. Inline delete on 0-match teams

- Add per-row confirm state: `const [confirmDelId, setConfirmDelId] = useState<string | null>(null);`
  (only one row armed at a time).
- In the "Your teams" row (the `tl-row` with the `dup` button, ~line 95–100),
  render a delete button **only when** `(counts[t.id] || 0) === 0`:

```tsx
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
```
- `stopPropagation` prevents the row's `onClick={() => setEditing(t)}` from firing.
- After delete, `reload()` refreshes teams + counts so the row disappears.

CSS in `app/globals.css` (mirror the existing `tl-dup` button styling; add a danger state):

```css
.tl-del { background: none; border: none; cursor: pointer; opacity: .6; font-size: 14px; padding: 2px 6px; }
.tl-del:hover { opacity: 1; }
.tl-del.danger { opacity: 1; color: #fff; background: #c0392b; border-radius: 6px; }
```
(Match the actual `tl-dup` rule's conventions when implementing — keep it visually consistent with that button.)

## Testing

- `test/team-stats.test.ts` — `countMatchesByTeam` as above.
- TeamsList wiring + confirm-delete: verified by build + manual (a 0-match team
  shows "0 matches" + a 🗑 that arms then deletes on second tap and disappears; an
  in-use team shows its count and **no** delete button; the count updates after
  delete/duplicate).

## Scope / YAGNI

- Counts computed client-side from the owner's match rows (`.eq("owner", userId)`);
  no DB view, no schema change.
- The global "Public teams" feed rows (`Link` rows) get **no** count/delete — only
  your own teams.
- No bulk delete, no "merge duplicates" (separate future idea); delete is per-row,
  0-match only.
- Reuses the existing `teamStore.del` + `reload`.

## Files touched

**New:** `lib/team-stats.ts`, `test/team-stats.test.ts`.
**Changed:** `components/TeamsList.tsx` (counts state + loader + meta label + inline
delete), `app/globals.css` (`.tl-del`), `lib/constants.ts` (bump `APP_VERSION`).
