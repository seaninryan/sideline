# Record home/away fields + migration (③.1 of us/them → home/away)

**Date:** 2026-06-13
**Status:** Approved (brainstorm) — pending implementation plan
**Branch:** `record-home-away` (off `main`, v78 — has ①+②).

## Context

The us/them → home/away conversion: ① added a neutral home/away view at the
**model** layer; ② flipped all **display** onto it. ③ removes us/them from the
**record** entirely. ③ is a 4-piece programme — this spec is **③.1**, the
additive foundation: store home/away fields on the record (derived from the
existing us/them + `homeAway`) and migrate every stored match, keeping us/them
alongside as temporary scaffolding. (③.2 points the data layer at the new fields,
③.3 rebuilds the editor symmetric, ③.4 **deletes** us/them — after which
`grep us/them` returns nothing. The "alongside" duplication here is scaffolding
torn out in ③.4, not a permanent state.)

This spec also drops the **vestigial DB columns** `my_team`/`opponent` (the user's
original ask) — confirmed unread by any query.

## Goal

Give every match record home/away-shaped fields, derived from us/them + `homeAway`,
on save and via a one-time backfill — with no display/editor/behaviour change.

## Decisions (from brainstorm)

- **Additive**: every existing us/them field stays; new home/away fields appear
  alongside (scaffold for ③.2–③.4).
- **Flat colour naming** (`colorHome`/`colorHome2`/`colorAway`/`colorAway2`),
  mirroring the existing flat `colorUs`/`colorUs2`.
- **Drop the dead DB columns** `my_team`/`opponent` here.

## 1. Pure helper — `lib/home-away.ts` (extend; unit-tested)

```ts
import type { MatchRecord } from "@/lib/types";

// The 8 home/away record fields derived from a record's us/them values + homeAway.
// "us" is home iff homeAway === "home". Returns a partial to spread onto the record.
export function recordHomeAway(r: MatchRecord): {
  homeTeam: string; awayTeam: string;
  colorHome?: string; colorHome2?: string; colorAway?: string; colorAway2?: string;
  homeRoster?: TeamRoster; awayRoster?: TeamRoster;
  homeSquad: string; awaySquad: string;
} {
  const usIsHome = r.homeAway === "home";
  return {
    homeTeam: (usIsHome ? r.myTeam : r.opponent) || "",
    awayTeam: (usIsHome ? r.opponent : r.myTeam) || "",
    colorHome: usIsHome ? r.colorUs : r.colorThem,
    colorHome2: usIsHome ? r.colorUs2 : r.colorThem2,
    colorAway: usIsHome ? r.colorThem : r.colorUs,
    colorAway2: usIsHome ? r.colorThem2 : r.colorUs2,
    homeRoster: usIsHome ? r.usRoster : r.oppRoster,
    awayRoster: usIsHome ? r.oppRoster : r.usRoster,
    homeSquad: (usIsHome ? r.usSquad : r.oppSquad) || "",
    awaySquad: (usIsHome ? r.oppSquad : r.usSquad) || "",
  };
}
```
(`TeamRoster` already imported in the module or add it. `homeTeamId`/`awayTeamId`
are already home/away — not part of this derivation.)

Tested in `test/home-away.test.ts`: `homeAway:"home"` → home = us values; `"away"`
→ home = them values; missing names → `""`; rosters/squads mapped by venue.

## 2. Types — `lib/types.ts`

Add to `interface MatchRecord` (all optional, additive; existing fields untouched):
```ts
  homeTeam?: string;
  awayTeam?: string;
  colorHome?: string;
  colorHome2?: string;
  colorAway?: string;
  colorAway2?: string;
  homeRoster?: TeamRoster;
  awayRoster?: TeamRoster;
  homeSquad?: string;
  awaySquad?: string;
```

## 3. `store.set` derives home/away on save (`lib/store.ts`)

In `store.set(id, data)`, before writing, merge the derived fields so every saved
record carries fresh home/away values:
```ts
  async set(id, data) {
    const rec = { ...data, ...recordHomeAway(data) };
    cache[id] = rec;
    const { error } = await sb.from("matches").upsert(Object.assign({ id, data: rec, updated_at: … }, matchCols(rec)));
    …
  }
```
(Import `recordHomeAway`. `matchCols` receives the enriched record — fine.)

## 4. One-time backfill migration (`lib/store.ts loadAll`)

After the existing `backfillNotation` pass, add a pass that derives the home/away
fields for any cached record missing them (presence check on `homeTeam`):
```ts
  const haIds = Object.keys(cache).filter((id) => cache[id] && cache[id].homeTeam === undefined);
  await Promise.allSettled(haIds.map(async (id) => {
    try {
      const enriched = { ...cache[id], ...recordHomeAway(cache[id]) };
      cache[id] = enriched;
      await store.set(id, enriched);
    } catch (e) { console.warn("home/away backfill failed for", id, e); }
  }));
```
Idempotent (skips records that already have `homeTeam`); resilient (one failure
doesn't abort). `store.set` itself also derives them, so this is belt-and-braces
for records that aren't otherwise re-saved.

## 5. Drop the vestigial DB columns `my_team`/`opponent`

- `lib/store.ts matchCols`: remove `my_team` and `opponent` from the returned object,
  and delete the now-pointless `opp` derivation (the `parseMatch(...).opp` fallback
  block) — it only fed the dropped `opponent` column.
- `lib/types.ts`: remove `my_team` and `opponent` from `interface MatchRow`.
- `docs/drop-myteam-opponent-migration.sql` (run once in Supabase):
  ```sql
  alter table matches drop column if exists my_team;
  alter table matches drop column if exists opponent;
  ```
- Confirmed no `.select(...)` reads these columns; safe.

## Testing

- `test/home-away.test.ts` — `recordHomeAway` for `homeAway` home/away, missing
  names → `""`, roster/squad/colour mapping by venue.
- `test/model.test.ts` — assert `SAMPLE_RECORD` (homeAway:"away") through
  `store.set` semantics is awkward to unit-test directly; instead add a direct
  `recordHomeAway(SAMPLE_RECORD)` assertion: `homeTeam === "Wildebeests"`,
  `awayTeam === "Racoons"`, `colorHome === SAMPLE_RECORD.colorThem`. (Pure, no I/O.)
- `store.set`/`loadAll` wiring verified by build + the existing suite staying green
  (no behaviour change — derived fields are additive).

## Scope / YAGNI

- No consumer/display/editor change — additive only (③.2 flips consumers).
- `homeAway` field kept (drives the derivation; removed in ③.4).
- No removal of any us/them record field (③.4).
- The dropped DB columns were already unread; their data lives in `data` jsonb if
  ever needed.

## Files touched

**New:** `docs/drop-myteam-opponent-migration.sql`.
**Changed:** `lib/home-away.ts` (+`recordHomeAway`), `lib/types.ts` (MatchRecord
home/away fields; MatchRow drops my_team/opponent), `lib/store.ts` (set derives;
loadAll backfill; matchCols drops the two columns), `test/home-away.test.ts`,
`test/model.test.ts`, `lib/constants.ts` (bump `APP_VERSION`).
