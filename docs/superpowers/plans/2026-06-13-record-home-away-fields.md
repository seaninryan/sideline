# Record home/away fields + migration (③.1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every match record home/away-shaped fields (derived from the existing us/them values + `homeAway`) on save and via a one-time backfill, and drop the now-vestigial `my_team`/`opponent` DB columns — with zero display/editor/behaviour change.

**Architecture:** Additive scaffolding for the us/them → home/away conversion (sub-project ③). A pure `recordHomeAway(record)` helper computes the 10 home/away fields from us/them + `homeAway`; `store.set` spreads them onto every saved record; `loadAll` backfills any cached record missing them. The existing us/them fields stay untouched (torn out later in ③.4). Separately, the two unread DB columns `my_team`/`opponent` are dropped (code stops writing them + a one-time SQL migration).

**Tech Stack:** TypeScript, Next.js 14, Supabase (`@supabase/ssr`), Vitest. Node 20 (`nvm use 20`).

**Spec:** `docs/superpowers/specs/2026-06-13-record-home-away-fields-design.md`

---

## File Structure

- `lib/home-away.ts` — pure venue helpers. **Add** `recordHomeAway(record)` (the 10-field derivation). Needs a `TeamRoster` import (not currently imported).
- `lib/types.ts` — **add** 10 optional home/away fields to `interface MatchRecord`; **remove** `my_team`/`opponent` from `interface MatchRow`.
- `lib/store.ts` — `store.set` spreads `recordHomeAway`; `loadAll` gets a backfill pass; `matchCols` drops `my_team`/`opponent` and the dead `opp`/`parseMatch` derivation; remove the now-unused `parseMatch` import.
- `test/home-away.test.ts` — **add** a `recordHomeAway` describe block.
- `test/model.test.ts` — **add** a direct `recordHomeAway(SAMPLE_RECORD)` assertion.
- `docs/drop-myteam-opponent-migration.sql` — **new** one-time Supabase migration.
- `lib/constants.ts` — bump `APP_VERSION` `v78` → `v79`.

---

## Task 1: `recordHomeAway` helper + MatchRecord home/away fields

**Files:**
- Modify: `lib/types.ts` (add fields to `interface MatchRecord`, around line 14-37)
- Modify: `lib/home-away.ts` (add import + `recordHomeAway`)
- Test: `test/home-away.test.ts` (add describe block)
- Test: `test/model.test.ts` (add assertion)

- [ ] **Step 1: Add the home/away fields to `MatchRecord`**

In `lib/types.ts`, inside `interface MatchRecord` (after the existing `oppSquad?: string;` line, before `legacyRaw?`), add:

```ts
  // ③.1 — home/away scaffold, derived on save from us/them + homeAway (torn out in ③.4).
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

(`TeamRoster` is already declared in this file, so no import needed here.)

- [ ] **Step 2: Write the failing test for `recordHomeAway`**

In `test/home-away.test.ts`, update the import line at the top and append a describe block.

Change the import to add `recordHomeAway`:

```ts
import { sideToVenue, matchOutcome, venueSeries, venueItems, recordHomeAway } from "@/lib/home-away";
import type { MatchRecord } from "@/lib/types";
```

Append at the end of the file:

```ts
describe("recordHomeAway", () => {
  const base: MatchRecord = {
    raw: "", sport: "hurling",
    myTeam: "Racoons", opponent: "Wildebeests",
    colorUs: "#aaa", colorUs2: "#bbb", colorThem: "#ccc", colorThem2: "#ddd",
    usRoster: { formation: [], players: [{ num: 1, name: "U", role: "starting" }] },
    oppRoster: { formation: [], players: [{ num: 2, name: "T", role: "starting" }] },
    usSquad: "U13A", oppSquad: "U13B",
  };

  it("homeAway=home → home = us values", () => {
    const r = recordHomeAway({ ...base, homeAway: "home" });
    expect(r).toMatchObject({
      homeTeam: "Racoons", awayTeam: "Wildebeests",
      colorHome: "#aaa", colorHome2: "#bbb", colorAway: "#ccc", colorAway2: "#ddd",
      homeSquad: "U13A", awaySquad: "U13B",
    });
    expect(r.homeRoster).toBe(base.usRoster);
    expect(r.awayRoster).toBe(base.oppRoster);
  });

  it("homeAway=away → home = them values", () => {
    const r = recordHomeAway({ ...base, homeAway: "away" });
    expect(r).toMatchObject({
      homeTeam: "Wildebeests", awayTeam: "Racoons",
      colorHome: "#ccc", colorHome2: "#ddd", colorAway: "#aaa", colorAway2: "#bbb",
      homeSquad: "U13B", awaySquad: "U13A",
    });
    expect(r.homeRoster).toBe(base.oppRoster);
    expect(r.awayRoster).toBe(base.usRoster);
  });

  it("missing names/squads → empty strings", () => {
    const r = recordHomeAway({ raw: "", sport: "soccer", homeAway: "home" });
    expect(r.homeTeam).toBe("");
    expect(r.awayTeam).toBe("");
    expect(r.homeSquad).toBe("");
    expect(r.awaySquad).toBe("");
  });

  it("missing homeAway is treated as away (us = away)", () => {
    const r = recordHomeAway({ ...base, homeAway: undefined });
    expect(r.homeTeam).toBe("Wildebeests");
    expect(r.awayTeam).toBe("Racoons");
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test -- home-away`
Expected: FAIL — `recordHomeAway is not a function` (import resolves to `undefined`).

- [ ] **Step 4: Implement `recordHomeAway`**

In `lib/home-away.ts`, add a type-only import at the very top of the file:

```ts
import type { MatchRecord, TeamRoster } from "@/lib/types";
```

Then append at the end of the file:

```ts
// The 10 home/away record fields derived from a record's us/them values + homeAway.
// "us" is home iff homeAway === "home" (missing/anything-else → us is away). Returns a
// partial to spread onto the record. ③.1 scaffold — removed in ③.4 with us/them.
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

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- home-away`
Expected: PASS (all `recordHomeAway` cases green, existing `sideToVenue`/`matchOutcome`/`venueSeries`/`venueItems` still green).

- [ ] **Step 6: Add the SAMPLE_RECORD assertion to model.test.ts**

`SAMPLE_RECORD` is `homeAway: "away"`, `myTeam: "Racoons"`, `opponent: "Wildebeests"`, `colorThem: "#c0392b"`, so the home side derives to the opponent. In `test/model.test.ts`, add `recordHomeAway` to the imports from `@/lib/home-away` if such an import exists; otherwise add a new import line near the top:

```ts
import { recordHomeAway } from "@/lib/home-away";
```

Then add this describe block (place it after the existing `describe("canonical SAMPLE_RECORD", ...)` block):

```ts
describe("recordHomeAway(SAMPLE_RECORD)", () => {
  const r = recordHomeAway(SAMPLE_RECORD);
  it("homeAway 'away' → home = opponent (Wildebeests)", () => {
    expect(r.homeTeam).toBe("Wildebeests");
    expect(r.awayTeam).toBe("Racoons");
  });
  it("colours follow venue", () => {
    expect(r.colorHome).toBe(SAMPLE_RECORD.colorThem);
    expect(r.colorAway).toBe(SAMPLE_RECORD.colorUs);
  });
});
```

- [ ] **Step 7: Run the full suite to verify it passes**

Run: `npm test`
Expected: PASS — all suites green (was 197 tests; now higher with the new cases). No existing test regresses.

- [ ] **Step 8: Commit**

```bash
git add lib/types.ts lib/home-away.ts test/home-away.test.ts test/model.test.ts
git commit -m "feat(home-away): recordHomeAway helper + MatchRecord home/away fields (③.1)"
```

---

## Task 2: Derive home/away on save + one-time backfill

**Files:**
- Modify: `lib/store.ts` (import `recordHomeAway`; enrich in `store.set`; backfill pass in `loadAll`)

- [ ] **Step 1: Import `recordHomeAway` in store.ts**

In `lib/store.ts`, add to the imports near the top (after the existing `import { linkExistingMatchPatch } from "@/lib/team-link";` line):

```ts
import { recordHomeAway } from "@/lib/home-away";
```

- [ ] **Step 2: Enrich the record in `store.set`**

In `lib/store.ts`, replace the body of `store.set` so it derives the home/away fields before caching/upserting. Change:

```ts
  async set(id: string, data: MatchRecord): Promise<boolean> { // single-row upsert; owner defaults to auth.uid() on insert (RLS-checked)
    cache[id] = data;
    const { error } = await sb.from("matches").upsert(Object.assign(
      { id, data, updated_at: new Date().toISOString() }, matchCols(data),
    ));
    if (error) console.warn("save failed", error.message);
    return !error;
  },
```

to:

```ts
  async set(id: string, data: MatchRecord): Promise<boolean> { // single-row upsert; owner defaults to auth.uid() on insert (RLS-checked)
    const rec = { ...data, ...recordHomeAway(data) }; // ③.1 — derive home/away fields on every save
    cache[id] = rec;
    const { error } = await sb.from("matches").upsert(Object.assign(
      { id, data: rec, updated_at: new Date().toISOString() }, matchCols(rec),
    ));
    if (error) console.warn("save failed", error.message);
    return !error;
  },
```

- [ ] **Step 3: Add the backfill pass in `loadAll`**

In `lib/store.ts`, in `loadAll`, after the existing `backfillNotation` `Promise.allSettled(...)` block (ends at the line `}));` near line 33) and before the closing `}` of `loadAll`, add:

```ts
  // ③.1 one-time home/away backfill: derive the fields for any cached record that
  // lacks them (presence check on `homeTeam`). Idempotent + resilient. `store.set`
  // also derives them, so this is belt-and-braces for records not otherwise re-saved.
  const haIds = Object.keys(cache).filter((id) => cache[id] && cache[id].homeTeam === undefined);
  await Promise.allSettled(haIds.map(async (id) => {
    try {
      const enriched = { ...cache[id], ...recordHomeAway(cache[id]) };
      cache[id] = enriched;
      await store.set(id, enriched);
    } catch (e) { console.warn("home/away backfill failed for", id, e); }
  }));
```

- [ ] **Step 4: Type-check via build**

The `store.set`/`loadAll` wiring isn't unit-testable (browser-backed Supabase client), so verify it compiles cleanly. Make sure the dev server is **not** running (it shares `.next`), then:

Run: `npm run build`
Expected: build succeeds with no type errors. (`recordHomeAway(cache[id])` is fine — `cache[id]` is `MatchRecord`.)

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS — all suites still green (this change is additive; no behaviour change).

- [ ] **Step 6: Commit**

```bash
git add lib/store.ts
git commit -m "feat(home-away): derive home/away on save + one-time backfill (③.1)"
```

---

## Task 3: Drop the vestigial `my_team`/`opponent` DB columns + version bump

**Files:**
- Modify: `lib/store.ts` (`matchCols` drops the two columns + dead `opp` derivation; remove unused `parseMatch` import)
- Modify: `lib/types.ts` (`interface MatchRow` drops `my_team`/`opponent`)
- Create: `docs/drop-myteam-opponent-migration.sql`
- Modify: `lib/constants.ts` (bump `APP_VERSION`)

Context: confirmed no `.select(...)` anywhere reads the `my_team` or `opponent` columns (queries read `data` jsonb + a fixed column set), so the code can stop writing them and the columns can be dropped. The record fields `data.myTeam`/`data.opponent` (jsonb) are load-bearing and are **not** touched here.

- [ ] **Step 1: Simplify `matchCols` — drop the two columns and the dead derivation**

In `lib/store.ts`, replace the whole `matchCols` function. Change:

```ts
// Derive the promoted columns from a record. `data` (jsonb) stays the source of truth.
// `opponent` lives on the record now; fall back to a legacy header parse only if absent.
function matchCols(data: MatchRecord) {
  let opp: string | null = data.opponent || null;
  if (!opp) {
    try { opp = (parseMatch(data.raw, { myTeam: data.myTeam, usRoster: data.usRoster, oppRoster: data.oppRoster }).opp) || null; } catch {}
  }
  return {
    match_date: data.matchDate || data.date || null,
    my_team: data.myTeam || null,
    opponent: opp,
    sport: data.sport || "soccer",
    name_display: data.nameDisplay || "full",
    home_team_id: data.homeTeamId || null,
    away_team_id: data.awayTeamId || null,
  };
}
```

to:

```ts
// Derive the promoted columns from a record. `data` (jsonb) stays the source of truth.
// The vestigial my_team/opponent columns were dropped in ③.1 (nothing SELECTed them);
// team identity lives in the home_team_id/away_team_id links + data jsonb.
function matchCols(data: MatchRecord) {
  return {
    match_date: data.matchDate || data.date || null,
    sport: data.sport || "soccer",
    name_display: data.nameDisplay || "full",
    home_team_id: data.homeTeamId || null,
    away_team_id: data.awayTeamId || null,
  };
}
```

- [ ] **Step 2: Remove the now-unused `parseMatch` import**

`parseMatch` was only used by the deleted `opp` derivation. In `lib/store.ts`, delete this import line (near the top):

```ts
import { parseMatch } from "@/lib/parser";
```

- [ ] **Step 3: Drop `my_team`/`opponent` from `interface MatchRow`**

In `lib/types.ts`, in `interface MatchRow`, delete these two lines:

```ts
  my_team: string | null;
  opponent: string | null;
```

- [ ] **Step 4: Build to confirm nothing referenced the dropped column fields**

Make sure the dev server is **not** running, then:

Run: `npm run build`
Expected: build succeeds. If a type error surfaces in a component reading `row.my_team`/`row.opponent`, that's a real consumer the spec missed — STOP and report it (the audit found none; all readers use `data.myTeam`/`data.opponent` on the record, not the row columns).

- [ ] **Step 5: Create the migration SQL**

Create `docs/drop-myteam-opponent-migration.sql`:

```sql
-- ③.1: drop the vestigial promoted columns my_team/opponent.
-- Nothing SELECTs them; team identity lives in home_team_id/away_team_id + data jsonb
-- (data.myTeam / data.opponent remain the load-bearing record fields).
-- Run once in the Supabase SQL editor.
alter table matches drop column if exists my_team;
alter table matches drop column if exists opponent;
```

- [ ] **Step 6: Bump APP_VERSION**

In `lib/constants.ts`, change line 2:

```ts
export const APP_VERSION = "v79";
```

- [ ] **Step 7: Run the full suite**

Run: `npm test`
Expected: PASS — all suites green.

- [ ] **Step 8: Commit**

```bash
git add lib/store.ts lib/types.ts docs/drop-myteam-opponent-migration.sql lib/constants.ts
git commit -m "chore(home-away): drop vestigial my_team/opponent columns; bump v79 (③.1)"
```

---

## Post-implementation (human steps — do NOT do these as part of execution)

1. Run `docs/drop-myteam-opponent-migration.sql` once in the Supabase SQL editor. Until then, the columns simply linger unwritten (upsert without those keys is fine).
2. Deploy; confirm the footer reads **v79**.

## Notes / scope guard

- **Additive only.** No display/editor/behaviour change. Every us/them field stays (removed later in ③.4). The home/away fields are scaffolding for ③.2 (flip consumers).
- **`homeAway` is kept** — it drives the derivation (removed in ③.4).
- **Order of operations is safe:** Task 3 stops writing the columns *before* the DB migration runs; an upsert that omits those column keys does not error against a table that still has them.
- After Task 3, `data.myTeam`/`data.opponent` (jsonb) and the `home_team_id`/`away_team_id` links are untouched — the just-completed data cleanup means they all agree, so `recordHomeAway`'s string-based derivation is reliable.
