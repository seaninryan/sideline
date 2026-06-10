# New-Match Wizard Polish (Team-Centric) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the new-match wizard pick/create real team records (identity = `(sport, name)`) via a type-ahead picker, deriving the sport from the teams and seeding both rosters on create.

**Architecture:** A pure helper module (`lib/match-sport.ts`) holds the sport/identity/filter logic; a typed `TeamPicker` component renders the type-ahead; `teamStore.findOrCreate` resolves a `(sport, name)` team; the `@ts-nocheck` `MatchTracker` wizard is rewired to use them and to link+seed via the existing `teamLinkPatch` (③b). A Supabase unique index on `(owner, sport, name)` is the DB guarantee.

**Tech Stack:** TypeScript, Next 14, Vitest, Supabase. Node 20 — prefix every node/npm/npx command with `bash -lc 'source ~/.nvm/nvm.sh; nvm use 20 >/dev/null; cd /home/sean/workspace/sideline && <cmd>'`. Branch: `wizard-polish` (already created; the design spec is its first commit).

**Reference (read once):** spec `docs/superpowers/specs/2026-06-10-new-match-wizard-polish-design.md`. Key existing pieces: `lib/team-store.ts` (`teamStore.list/get/set`), `lib/team-link.ts` (`teamLinkPatch(record,{usTeam,oppTeam,homeAway})` returns `{myTeam,label,homeAway,opponent,colorUs,colorUs2,colorThem,colorThem2,homeTeamId,awayTeamId,usRoster,oppRoster}`), `lib/team-templates.ts` (`templateForSport(sport)`), `lib/constants.ts` (`SPORTS` = {hurling,camogie,gaelic,soccer} each `{label,emoji,mode}`; `PALETTE`), `lib/util.ts` (`squash`, `mkId`, `contrastOn`, `toLocalInput`). `TeamRecord = {id,owner?,short_code?,name,color1?,color2?,sport?,roster:TeamRoster,updated_at?}`. `MatchTracker` already has `userUid` state (from `sb.auth.getUser`).

---

## Task 1: Pure wizard helpers — `lib/match-sport.ts`

**Files:**
- Create: `lib/match-sport.ts`
- Test: `test/match-sport.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from "vitest";
import { teamMatchKey, pairingError, filterTeams } from "@/lib/match-sport";
import type { TeamRecord } from "@/lib/types";

const T = (name: string, sport?: string): TeamRecord => ({ id: name + (sport || ""), name, sport, roster: { formation: [], players: [] } });

describe("teamMatchKey", () => {
  it("normalises name (case/space/punct) and includes sport", () => {
    expect(teamMatchKey("The Spuds", "hurling")).toBe(teamMatchKey("the  spuds!", "hurling"));
    expect(teamMatchKey("Spuds", "hurling")).not.toBe(teamMatchKey("Spuds", "soccer"));
  });
  it("treats missing sport as empty-sport, distinct from a set sport", () => {
    expect(teamMatchKey("Spuds")).toBe(teamMatchKey("spuds", ""));
    expect(teamMatchKey("Spuds")).not.toBe(teamMatchKey("Spuds", "soccer"));
  });
});

describe("pairingError", () => {
  it("null when sports match", () => expect(pairingError("hurling", "hurling")).toBeNull());
  it("null when a side is unresolved", () => {
    expect(pairingError("hurling", undefined)).toBeNull();
    expect(pairingError(undefined, undefined)).toBeNull();
  });
  it("message when both set and different", () => expect(pairingError("hurling", "soccer")).toMatch(/same sport/i));
});

describe("filterTeams", () => {
  const teams = [T("Spuds", "hurling"), T("Spuds", "soccer"), T("Wildebeests", "hurling")];
  it("scopes to sport when given", () => {
    expect(filterTeams(teams, "", "hurling").map((t) => t.name)).toEqual(["Spuds", "Wildebeests"]);
  });
  it("matches name substring (case-insensitive), unscoped when sport omitted", () => {
    expect(filterTeams(teams, "spud").length).toBe(2);
    expect(filterTeams(teams, "wild", "hurling").map((t) => t.name)).toEqual(["Wildebeests"]);
  });
  it("empty query returns all (within scope)", () => expect(filterTeams(teams, "").length).toBe(3));
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bash -lc '… npx vitest run match-sport'`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `lib/match-sport.ts`**

```ts
import { squash } from "@/lib/util";
import type { TeamRecord } from "@/lib/types";

// Identity of a team for find-or-create: normalised name + sport.
// (sport, name) is unique — football/Spuds and hurling/Spuds are different teams.
export function teamMatchKey(name: string, sport?: string): string {
  return squash(sport || "") + "::" + squash(name);
}

// Create-time guard: null when the pairing is valid (or a side is unresolved),
// else a user-facing message. With the opponent picker scoped to the working
// sport this is rarely hit, but it is the final gate before Create.
export function pairingError(usSport?: string, oppSport?: string): string | null {
  if (!usSport || !oppSport) return null;
  return usSport === oppSport ? null : "Both teams must play the same sport";
}

// Type-ahead filter for the picker: optional sport scope + name substring.
export function filterTeams(teams: TeamRecord[], query: string, sport?: string): TeamRecord[] {
  const q = squash(query);
  return teams.filter((t) => (!sport || (t.sport || "") === sport) && (!q || squash(t.name).includes(q)));
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `bash -lc '… npx vitest run match-sport'` → PASS. Then `bash -lc '… npx tsc --noEmit'` → clean.

- [ ] **Step 5: Commit**

```bash
git add lib/match-sport.ts test/match-sport.test.ts
git commit -m "feat: wizard team/sport pure helpers (teamMatchKey, pairingError, filterTeams) (TDD)"
```

---

## Task 2: `teamStore.findOrCreate`

**Files:**
- Modify: `lib/team-store.ts`

Adds a find-or-create-by-`(sport, name)` method. (No unit test — it calls Supabase; the matching logic it relies on, `teamMatchKey`, is tested in Task 1, and the method is exercised in the manual shakeout.)

- [ ] **Step 1: Add imports at the top of `lib/team-store.ts`**

```ts
import { teamMatchKey } from "@/lib/match-sport";
import { templateForSport } from "@/lib/team-templates";
import { mkId } from "@/lib/util";
```

- [ ] **Step 2: Add `findOrCreate` inside the `teamStore` object (after `set`)**

```ts
  // Find a team by (sport, name) for this owner, or create one with the sport's
  // template roster. Never mutates an existing team. Returns the TeamRecord (or null on save failure).
  async findOrCreate(
    userId: string,
    { name, sport, color1, color2 }: { name: string; sport: string; color1?: string; color2?: string },
  ): Promise<TeamRecord | null> {
    const want = teamMatchKey(name, sport);
    const existing = (await this.list(userId)).find((t) => teamMatchKey(t.name, t.sport) === want);
    if (existing) return existing;
    const rec: TeamRecord = { id: mkId(), name: name.trim(), sport, color1, color2, roster: templateForSport(sport) };
    const id = await this.set(rec);
    return id ? rec : null;
  },
```

- [ ] **Step 3: Verify build/types**

Run: `bash -lc '… npx tsc --noEmit'` → clean. `bash -lc '… npx vitest run'` → still all green (no behavioural change to existing tests).

- [ ] **Step 4: Commit**

```bash
git add lib/team-store.ts
git commit -m "feat: teamStore.findOrCreate by (sport,name) with template roster"
```

---

## Task 3: `TeamPicker` component

**Files:**
- Create: `components/TeamPicker.tsx`

A presentational type-ahead picker over a passed team list. Uses `filterTeams`. Emits `onPick(team)` for an existing team and `onCreate(name)` when the typed query matches nothing.

- [ ] **Step 1: Create `components/TeamPicker.tsx`**

```tsx
"use client";
import React, { useState } from "react";
import type { TeamRecord } from "@/lib/types";
import { SPORTS } from "@/lib/constants";
import { contrastOn } from "@/lib/util";
import { filterTeams } from "@/lib/match-sport";

// Type-ahead team picker. `sport` (when set) scopes suggestions to that sport.
// Picking an existing team → onPick; a typed name with no exact match → onCreate.
export default function TeamPicker({
  teams, sport, side, onPick, onCreate,
}: {
  teams: TeamRecord[];
  sport?: string;
  side: "us" | "them";
  onPick: (t: TeamRecord) => void;
  onCreate: (name: string) => void;
}) {
  const [q, setQ] = useState("");
  const matches = filterTeams(teams, q, sport).slice(0, 12);
  const exact = matches.some((t) => t.name.trim().toLowerCase() === q.trim().toLowerCase());
  const fallback = side === "us" ? ["#f5c518", "#1f7a4d"] : ["#c0392b", "#2c5fa8"];
  return (
    <div className="tp">
      <input
        className="nw-in tp-search"
        placeholder="Search or type a new team…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        autoFocus
      />
      <div className="mt-grid tp-list">
        {matches.map((t) => {
          const c1 = (side === "us" ? t.color1 : t.color1) || fallback[0];
          const c2 = (side === "us" ? t.color2 : t.color2) || fallback[1];
          return (
            <button key={t.id} className="mt-big nw-team" style={{ background: c1, color: contrastOn(c1), borderColor: c2 }} onClick={() => onPick(t)}>
              {t.sport && SPORTS[t.sport] ? SPORTS[t.sport].emoji + " " : ""}{t.name}
            </button>
          );
        })}
      </div>
      {q.trim() && !exact && (
        <button className="mt-add tp-create" onClick={() => onCreate(q.trim())}>+ Create “{q.trim()}”</button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify build/types**

Run: `bash -lc '… npx tsc --noEmit'` → clean. `bash -lc '… npm run build'` → succeeds.

- [ ] **Step 3: Commit**

```bash
git add components/TeamPicker.tsx
git commit -m "feat: TeamPicker type-ahead component (scoped by working sport)"
```

---

## Task 4: Rewire the wizard in `MatchTracker.tsx`

**Files:**
- Modify: `components/MatchTracker.tsx` (`@ts-nocheck`)
- Modify: `app/globals.css` (picker + bigger-date styles)

This is the integration task. Read the current wizard (`enterNew` ~L438, `finishNew` ~L447, `prevTeams` ~L158, the `view === "new"` render ~L923-990, imports ~L1-30). Keep the double-tap guard `creatingRef` and the `✕ Cancel`/`← Back`/`Next →` skeleton.

- [ ] **Step 1: Imports** — add near the existing `import { swapHomeAway } from "@/lib/team-link";` (L24):

```ts
import { teamLinkPatch } from "@/lib/team-link";
import { teamStore } from "@/lib/team-store";
import { pairingError } from "@/lib/match-sport";
import TeamPicker from "@/components/TeamPicker";
```

- [ ] **Step 2: Wizard state + team list.** Add state near the other wizard state (around `const [nw, setNw] = useState(null);` L127):

```ts
const [nwTeams, setNwTeams] = useState([]); // TeamRecord[] loaded when the wizard opens
```

Change `enterNew` (L438) so the wizard opens on the date step with the new `nw` shape and loads the owner's teams:

```ts
const enterNew = () => {
  setMenuOpen(false); setModal(null); setColorPick(null); setBlkEdit(null); setBlkIns(null); setLineupEdit(null);
  setNw({ stage: "date", date: toLocalInput(new Date()), label: "", sport: "", homeAway: "away", us: null, opp: null });
  if (userUid) teamStore.list(userUid).then(setNwTeams).catch(() => setNwTeams([]));
};
```

- [ ] **Step 3: Replace `finishNew`.** Replace the whole `finishNew` (L447-470) with a version that takes no args and links+seeds from `nw.us`/`nw.opp` (already resolved `TeamRecord`s):

```ts
const finishNew = async () => {
  if (creatingRef.current || !nw.us || !nw.opp) return;
  if (pairingError(nw.us.sport, nw.opp.sport)) return;
  creatingRef.current = true;
  try {
    const sportKey = nw.us.sport || nw.opp.sport || "";
    const mode = SPORTS[sportKey] ? SPORTS[sportKey].mode : "gaa";
    const patch = teamLinkPatch({ label: nw.label }, { usTeam: nw.us, oppTeam: nw.opp, homeAway: nw.homeAway });
    const label = (nw.label || "").trim() || nw.us.name;
    const rec = {
      raw: "", matchDate: nw.date, date: nw.date, scoringMode: mode, autoMode: true,
      sport: sportKey || undefined, notationV: 2, nameDisplay: "full", savedAt: Date.now(),
      ...patch, label,
    };
    // reflect locally (same-route replace → no remount)
    setRaw(""); setMyTeam(patch.myTeam); setOpponent(patch.opponent); setLabel(label);
    setHomeAway(patch.homeAway); setHomeTeamId(patch.homeTeamId); setAwayTeamId(patch.awayTeamId);
    setUsRoster(patch.usRoster); setOppRoster(patch.oppRoster); setLegacyRaw(undefined);
    setColorUs(patch.colorUs); setColorUs2(patch.colorUs2); setColorThem(patch.colorThem); setColorThem2(patch.colorThem2);
    setSport(sportKey); setScoringMode(mode); setAutoMode(true);
    setMatchDate(nw.date); setNw(null); setTab("game");
    const id = mkId();
    const ok = await store.set(id, rec);
    if (ok) { setCurId(id); router.replace(`/m/${id}`); }
    else { setCurId(null); setSavedMsg("NOT saved — check connection"); setTimeout(() => setSavedMsg(""), 6000); }
  } finally {
    creatingRef.current = false;
  }
};
```

- [ ] **Step 4: Add the pick/create handlers** (place just above `finishNew`):

```ts
// Your-team pick: an existing team sets the working sport; a new team needs a sport chosen first (nw.sport).
const nwPickUs = (t) => setNw({ ...nw, us: t, sport: t.sport || nw.sport, stage: "opp" });
const nwCreateUs = async (name) => {
  if (!userUid || !nw.sport) return; // a new your-team requires a sport (chosen via the sport buttons)
  const t = await teamStore.findOrCreate(userUid, { name, sport: nw.sport, color1: "#f5c518", color2: "#1f7a4d" });
  if (t) { setNwTeams((xs) => [t, ...xs.filter((x) => x.id !== t.id)]); setNw({ ...nw, us: t, stage: "opp" }); }
};
const nwPickOpp = (t) => setNw({ ...nw, opp: t });
const nwCreateOpp = async (name) => {
  if (!userUid || !nw.sport) return;
  const t = await teamStore.findOrCreate(userUid, { name, sport: nw.sport, color1: "#c0392b", color2: "#2c5fa8" });
  if (t) { setNwTeams((xs) => [t, ...xs.filter((x) => x.id !== t.id)]); setNw({ ...nw, opp: t }); }
};
// Change the working sport: re-resolve the already-picked your-team to its (newSport, name) variant; clear opp.
const nwSetSport = async (s) => {
  if (!userUid) { setNw({ ...nw, sport: s }); return; }
  let us = nw.us;
  if (us && us.sport !== s) {
    const v = await teamStore.findOrCreate(userUid, { name: us.name, sport: s, color1: us.color1, color2: us.color2 });
    if (v) { us = v; setNwTeams((xs) => [v, ...xs.filter((x) => x.id !== v.id)]); }
  }
  setNw({ ...nw, sport: s, us, opp: null });
};
```

- [ ] **Step 5: Replace the wizard render** (`nw.stage === "us"` and `nw.stage === "opp"` blocks, ~L946-988) with picker-based steps. Replace the date step's Skip line and the two team-step blocks:

Date step — drop the Skip button (delete the `<button className="mt-add alt" … onClick={doNew}>Skip — blank match</button>` line at ~L941). Leave the rest of the date step.

Your-team step:

```tsx
{nw.stage === "us" && (
  <>
    <p className="mt-note" style={{ marginTop: 0, marginBottom: 8 }}>Your team — pick a saved team or create one</p>
    <div className="mt-row" style={{ marginBottom: 8 }}>
      <input className="nw-in" placeholder="grade/label — e.g. U13A Championship" value={nw.label} onChange={(e) => setNw({ ...nw, label: e.target.value })} />
    </div>
    {/* a new team needs a sport; existing picks set it automatically */}
    <div className="mt-grid nw-sports">
      {Object.entries(SPORTS).map(([k, s]) => (
        <button key={k} className={"mt-big" + (nw.sport === k ? " on" : " off")} onClick={() => setNw({ ...nw, sport: k })}>{s.emoji} {s.label}</button>
      ))}
    </div>
    <TeamPicker teams={nwTeams} side="us" onPick={nwPickUs} onCreate={nwCreateUs} />
    <button className="mt-add alt" style={{ marginTop: 12 }} onClick={() => setNw({ ...nw, stage: "date" })}>← Back</button>
  </>
)}
```

Opponent step:

```tsx
{nw.stage === "opp" && (
  <>
    <div className="mt-grid" style={{ marginBottom: 10 }}>
      <button className={"mt-big" + (nw.homeAway === "home" ? " on" : " off")} onClick={() => setNw({ ...nw, homeAway: "home" })}>Home v</button>
      <button className={"mt-big" + (nw.homeAway === "away" ? " on" : " off")} onClick={() => setNw({ ...nw, homeAway: "away" })}>Away @</button>
    </div>
    <div className="mt-row" style={{ marginBottom: 8, alignItems: "center" }}>
      <span className="mt-note" style={{ margin: 0, flex: 1 }}>Sport: {nw.sport && SPORTS[nw.sport] ? `${SPORTS[nw.sport].emoji} ${SPORTS[nw.sport].label}` : "—"}</span>
      <div className="nw-sports-mini">
        {Object.entries(SPORTS).map(([k, s]) => (
          <button key={k} className={"mt-add" + (nw.sport === k ? "" : " alt")} onClick={() => nwSetSport(k)}>{s.emoji}</button>
        ))}
      </div>
    </div>
    <p className="mt-note" style={{ marginTop: 0, marginBottom: 8 }}>Opponent — {nw.opp ? <b>{nw.opp.name}</b> : "pick or create"}</p>
    <TeamPicker teams={nwTeams} sport={nw.sport} side="them" onPick={nwPickOpp} onCreate={nwCreateOpp} />
    <div className="mt-grid" style={{ marginTop: 12 }}>
      <button className="mt-big gm-team" disabled={!nw.us || !nw.opp || !!pairingError(nw.us && nw.us.sport, nw.opp && nw.opp.sport)} onClick={finishNew}>Create match →</button>
    </div>
    <button className="mt-add alt" style={{ marginTop: 12 }} onClick={() => setNw({ ...nw, stage: "us", opp: null })}>← Back</button>
  </>
)}
```

- [ ] **Step 6: Remove `prevTeams`.** Delete the `prevTeams` `useMemo` (L158-174) — it is now unused. Confirm with `grep -n "prevTeams" components/MatchTracker.tsx` → no matches.

- [ ] **Step 7: CSS.** Append to `app/globals.css`:

```css
/* new-match wizard: bigger date inputs + team picker */
.nw-date input { font-size: 18px; padding: 12px 14px; flex: 1; }
.nw-sports { margin-bottom: 10px; }
.nw-sports-mini { display: flex; gap: 6px; }
.tp .tp-search { width: 100%; font-size: 16px; padding: 11px 12px; margin-bottom: 10px; }
.tp .tp-list { margin-bottom: 8px; }
.tp .tp-create { width: 100%; }
```

- [ ] **Step 8: Verify**

Run: `bash -lc '… npx tsc --noEmit'` (clean; MatchTracker is @ts-nocheck so its errors won't show — reason carefully) → `bash -lc '… npm run build'` (succeeds) → `bash -lc '… npx vitest run'` (still green). Manually re-read the diff: `finishNew` links via `teamLinkPatch` and seeds `usRoster`/`oppRoster`; a new your-team requires `nw.sport`; the opponent picker is scoped to `nw.sport`; Create is disabled until both sides resolve and `pairingError` is null; `prevTeams` and the Skip button are gone; the post-create link-nudge (`!homeTeamId && !awayTeamId`) won't fire because wizard matches now carry team ids.

- [ ] **Step 9: Commit**

```bash
git add components/MatchTracker.tsx app/globals.css
git commit -m "feat: team-centric new-match wizard (TeamPicker, sport-derive+scope, link+seed rosters); drop prevTeams/Skip"
```

---

## Task 5: Migration SQL, docs, version, final verify

**Files:**
- Modify: `docs/teams-migration.sql`
- Modify: `lib/constants.ts` (`APP_VERSION`)
- Modify: `CLAUDE.md`

- [ ] **Step 1: Append the unique-index migration to `docs/teams-migration.sql`** (under a clear `-- ④ wizard: (owner, sport, name) uniqueness` header):

```sql
-- ④ new-match wizard: enforce one team per (owner, sport, name).
-- Run the dup-check first; it must return zero rows:
--   select owner, coalesce(sport,'') s, lower(name) n, count(*) from teams
--   group by owner, coalesce(sport,''), lower(name) having count(*) > 1;
create unique index if not exists teams_owner_sport_name_key
  on teams (owner, coalesce(sport, ''), lower(name));
```

- [ ] **Step 2: Bump `APP_VERSION`** in `lib/constants.ts` from `"v50"` to `"v51"`.

- [ ] **Step 3: Update `CLAUDE.md`** — in the new-match-wizard section, replace the description with the team-centric flow (pick/create real teams via `TeamPicker`; identity `(sport, name)`; opponent scoped to working sport; `finishNew` links via `teamLinkPatch` + seeds both rosters; `prevTeams`/Skip removed; new `lib/match-sport.ts` + `teamStore.findOrCreate`). Add `match-sport.test.ts` to the test-file list and update the test count to the new total. Bump the `Current: vNN` line to **v51**. Note the new `teams_owner_sport_name_key` index in the storage/migration section.

- [ ] **Step 4: Final verify**

Run: `bash -lc '… npx vitest run'` (all green; report total), `bash -lc '… npx tsc --noEmit'` (clean), `bash -lc '… npm run build'` (succeeds).

- [ ] **Step 5: Commit**

```bash
git add docs/teams-migration.sql lib/constants.ts CLAUDE.md
git commit -m "chore: ④ wizard — (owner,sport,name) index migration, CLAUDE.md, APP_VERSION v51"
```

---

## Self-review notes

- **Spec coverage:** team identity `(sport,name)` + no write-back (Task 2 `findOrCreate`, Task 4 `nwSetSport` re-resolves rather than mutating); type-ahead picker scoped to sport (Task 3 + Task 4 opp step); link+seed rosters at create (Task 4 `finishNew` via `teamLinkPatch`); sport derive + guard (`pairingError`, Task 1/4); bigger date + grade placeholder + sport icons + drop Skip + retire `prevTeams` (Task 4); DB unique index (Task 5); pure-helper tests (Task 1); v51 (Task 5).
- **Type consistency:** `nw` shape `{stage,date,label,sport,homeAway,us:TeamRecord|null,opp:TeamRecord|null}` used consistently across enterNew/handlers/render/finishNew; `teamStore.findOrCreate(userId,{name,sport,color1?,color2?})` and `TeamPicker` props match their definitions; `teamLinkPatch` return fields consumed in `finishNew` match ③b's `lib/team-link.ts`.
- **Edge:** a saved team with no `sport` → working sport stays `""`; the your-team step's sport buttons let the user set it; creating a new team is blocked until `nw.sport` is set (handlers early-return). `pairingError` is the final Create guard.
- **No new schema columns** — only the index; all match fields already live in `data` jsonb (③c).
