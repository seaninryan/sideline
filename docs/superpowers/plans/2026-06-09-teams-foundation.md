# Teams Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add teams as a first-class, reusable, publicly-shareable entity — a `teams` table + RLS, a tap-to-name team editor seeded by sport templates, a `/teams` management list, and public `/t/[id]` team pages — without touching the parser or any existing match.

**Architecture:** Two new pure, unit-tested modules (`lib/team-templates.ts`, `lib/team-roster.ts`) define the roster shape, sport templates, and immutable roster mutations. A small `lib/team-store.ts` mirrors `lib/store.ts` for the `teams` table. New components `TeamEditor`/`TeamsList`/`TeamPage` and routes `/teams` + `/t/[id]` provide the UI; `AppHeader` gains a Teams link. Purely additive — no parser/match change, so all existing tests stand.

**Tech Stack:** Next.js 14 App Router, React 18, TypeScript, `@supabase/ssr`, Vitest. Node 20 — prefix test/build with `bash -lc 'source ~/.nvm/nvm.sh; nvm use 20 >/dev/null; cd /home/sean/workspace/sideline && <cmd>'`.

**Design doc:** `docs/superpowers/specs/2026-06-09-teams-foundation-design.md`. Branch: `home-away-model`.

**⚠️ Requires a one-time Supabase migration (Task 8) before the feature works at runtime.**

---

## File Structure

**Create:**
- `lib/team-templates.ts` — `TEAM_TEMPLATES` (soccer, gaa) + `templateForSport(sport)`. Pure.
- `lib/team-roster.ts` — `renamePlayer`/`renumberPlayer`/`addPlayer`/`removePlayer`. Pure, immutable.
- `lib/team-store.ts` — `teamStore` (browser Supabase CRUD over `teams`, mints `short_code`).
- `components/TeamEditor.tsx` — create/edit a team (name, colours, sport→template, tap-to-name grid).
- `components/TeamsList.tsx` — your teams list + New; hosts `TeamEditor` inline.
- `components/TeamPage.tsx` — public team page render (identity + pitch + fixtures placeholder).
- `app/teams/page.tsx` — server: auth-gate, render `TeamsList`.
- `app/t/[id]/page.tsx` — server: fetch team by short_code/UUID, render `TeamPage` (+ metadata).
- `test/team-templates.test.ts`, `test/team-roster.test.ts`.

**Modify:**
- `lib/types.ts` — add `TeamRoster`, `TeamRecord`.
- `components/AppHeader.tsx` — add a "Teams" link.
- `app/globals.css` — append team editor/list/page styles.
- `lib/constants.ts` — `APP_VERSION` → `v48`.

**Untouched:** parser, model, matches table, MatchTracker, store.ts.

---

## Task 1: Types + sport templates (pure)

**Files:**
- Modify: `lib/types.ts`
- Create: `lib/team-templates.ts`, `test/team-templates.test.ts`

- [ ] **Step 1: Add types to `lib/types.ts`** (append at the end):

```ts
export interface TeamRoster {
  formation: number[][];                 // rows of shirt numbers (starting XV/XI layout)
  players: { num: number; name: string; role: "starting" | "sub" }[];
}

export interface TeamRecord {
  id: string;
  owner?: string;
  short_code?: string | null;
  name: string;
  color1?: string;
  color2?: string;
  sport?: string;
  roster: TeamRoster;
  updated_at?: string;
}
```

- [ ] **Step 2: Write the failing test** — `test/team-templates.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { TEAM_TEMPLATES, templateForSport } from "@/lib/team-templates";

describe("TEAM_TEMPLATES", () => {
  it("soccer: 11 starters + 1 sub, GK alone on the first row", () => {
    const t = TEAM_TEMPLATES.soccer;
    expect(t.players.filter((p) => p.role === "starting")).toHaveLength(11);
    expect(t.players.filter((p) => p.role === "sub")).toHaveLength(1);
    expect(t.formation[0]).toEqual([1]);
    expect(t.formation.flat()).toHaveLength(11);
  });
  it("gaa: 15 starters + 1 sub across 6 rows", () => {
    const t = TEAM_TEMPLATES.gaa;
    expect(t.players.filter((p) => p.role === "starting")).toHaveLength(15);
    expect(t.players.filter((p) => p.role === "sub")).toHaveLength(1);
    expect(t.formation).toHaveLength(6);
    expect(t.formation.flat()).toHaveLength(15);
  });
});

describe("templateForSport", () => {
  it("soccer → soccer template", () => {
    expect(templateForSport("soccer").players).toHaveLength(12);
  });
  it("hurling / camogie / gaelic → GAA template", () => {
    for (const s of ["hurling", "camogie", "gaelic"]) {
      expect(templateForSport(s).players).toHaveLength(16);
      expect(templateForSport(s).formation).toHaveLength(6);
    }
  });
  it("unknown / undefined → empty roster", () => {
    expect(templateForSport(undefined)).toEqual({ formation: [], players: [] });
    expect(templateForSport("rugby")).toEqual({ formation: [], players: [] });
  });
  it("returns a fresh deep copy (callers can mutate safely)", () => {
    const a = templateForSport("soccer");
    a.players[0].name = "X";
    expect(templateForSport("soccer").players[0].name).toBe("GK");
  });
});
```

- [ ] **Step 3: Run it, confirm fail**

Run: `bash -lc 'source ~/.nvm/nvm.sh; nvm use 20 >/dev/null; cd /home/sean/workspace/sideline && npm test -- team-templates'`
Expected: FAIL — `Cannot find module '@/lib/team-templates'`.

- [ ] **Step 4: Implement** — `lib/team-templates.ts`:

```ts
import type { TeamRoster } from "@/lib/types";

const clone = (r: TeamRoster): TeamRoster => JSON.parse(JSON.stringify(r));

const SOCCER: TeamRoster = {
  formation: [[1], [2, 4, 5, 3], [7, 6, 8, 11], [10, 9]],
  players: [
    { num: 1, name: "GK", role: "starting" },
    { num: 2, name: "RB", role: "starting" }, { num: 4, name: "RCB", role: "starting" }, { num: 5, name: "LCB", role: "starting" }, { num: 3, name: "LB", role: "starting" },
    { num: 7, name: "RW", role: "starting" }, { num: 6, name: "CDM", role: "starting" }, { num: 8, name: "CAM", role: "starting" }, { num: 11, name: "LW", role: "starting" },
    { num: 10, name: "SS", role: "starting" }, { num: 9, name: "S", role: "starting" },
    { num: 12, name: "Sub", role: "sub" },
  ],
};

const GAA: TeamRoster = {
  formation: [[1], [2, 3, 4], [5, 6, 7], [8, 9], [10, 11, 12], [13, 14, 15]],
  players: [
    { num: 1, name: "GK", role: "starting" },
    { num: 2, name: "RCB", role: "starting" }, { num: 3, name: "FB", role: "starting" }, { num: 4, name: "LCB", role: "starting" },
    { num: 5, name: "RWB", role: "starting" }, { num: 6, name: "CB", role: "starting" }, { num: 7, name: "LWB", role: "starting" },
    { num: 8, name: "MID", role: "starting" }, { num: 9, name: "MID", role: "starting" },
    { num: 10, name: "RWF", role: "starting" }, { num: 11, name: "CF", role: "starting" }, { num: 12, name: "LWF", role: "starting" },
    { num: 13, name: "RCF", role: "starting" }, { num: 14, name: "FF", role: "starting" }, { num: 15, name: "LCF", role: "starting" },
    { num: 16, name: "Sub", role: "sub" },
  ],
};

export const TEAM_TEMPLATES: Record<string, TeamRoster> = { soccer: SOCCER, gaa: GAA };

// Map a SPORTS key to a starting template (a fresh deep copy each call). GAA sports share one.
export function templateForSport(sport?: string): TeamRoster {
  if (sport === "soccer") return clone(SOCCER);
  if (sport === "hurling" || sport === "camogie" || sport === "gaelic") return clone(GAA);
  return { formation: [], players: [] };
}
```

- [ ] **Step 5: Run it, confirm PASS**

Run: `bash -lc 'source ~/.nvm/nvm.sh; nvm use 20 >/dev/null; cd /home/sean/workspace/sideline && npm test -- team-templates'`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add lib/types.ts lib/team-templates.ts test/team-templates.test.ts
git commit -m "feat: team roster types + sport templates (pure)"
```

---

## Task 2: Roster mutation helpers (pure)

**Files:**
- Create: `lib/team-roster.ts`, `test/team-roster.test.ts`

- [ ] **Step 1: Write the failing test** — `test/team-roster.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { renamePlayer, renumberPlayer, addPlayer, removePlayer } from "@/lib/team-roster";
import type { TeamRoster } from "@/lib/types";

const base = (): TeamRoster => ({
  formation: [[1], [2, 3]],
  players: [
    { num: 1, name: "GK", role: "starting" },
    { num: 2, name: "RB", role: "starting" },
    { num: 3, name: "CB", role: "starting" },
    { num: 12, name: "Bench", role: "sub" },
  ],
});

describe("renamePlayer", () => {
  it("sets the name by number, leaves others", () => {
    const r = renamePlayer(base(), 2, "Alex");
    expect(r.players.find((p) => p.num === 2)!.name).toBe("Alex");
    expect(r.players.find((p) => p.num === 1)!.name).toBe("GK");
  });
  it("does not mutate the input", () => {
    const b = base(); renamePlayer(b, 2, "Alex");
    expect(b.players.find((p) => p.num === 2)!.name).toBe("RB");
  });
});

describe("renumberPlayer", () => {
  it("changes the number in players and formation", () => {
    const r = renumberPlayer(base(), 3, 5);
    expect(r.players.find((p) => p.num === 5)!.name).toBe("CB");
    expect(r.players.some((p) => p.num === 3)).toBe(false);
    expect(r.formation).toEqual([[1], [2, 5]]);
  });
  it("no-op if the new number is already taken", () => {
    const r = renumberPlayer(base(), 3, 2);
    expect(r).toEqual(base());
  });
});

describe("addPlayer", () => {
  it("adds a starter with the next free number and a new formation row", () => {
    const r = addPlayer(base(), "starting");
    expect(r.players).toHaveLength(5);
    const added = r.players[r.players.length - 1];
    expect(added).toEqual({ num: 4, name: "", role: "starting" });
    expect(r.formation[r.formation.length - 1]).toEqual([4]);
  });
  it("adds a sub with the next free number, not in the formation", () => {
    const r = addPlayer(base(), "sub");
    const added = r.players[r.players.length - 1];
    expect(added.role).toBe("sub");
    expect(added.num).toBe(4);
    expect(r.formation.flat()).not.toContain(4);
  });
});

describe("removePlayer", () => {
  it("removes from players and formation, dropping empty rows", () => {
    const r = removePlayer(base(), 1);
    expect(r.players.some((p) => p.num === 1)).toBe(false);
    expect(r.formation).toEqual([[2, 3]]); // the [1] row is gone
  });
});
```

- [ ] **Step 2: Run it, confirm fail**

Run: `bash -lc 'source ~/.nvm/nvm.sh; nvm use 20 >/dev/null; cd /home/sean/workspace/sideline && npm test -- team-roster'`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** — `lib/team-roster.ts`:

```ts
import type { TeamRoster } from "@/lib/types";

const clone = (r: TeamRoster): TeamRoster => JSON.parse(JSON.stringify(r));
const nextFreeNum = (r: TeamRoster): number => {
  const used = new Set(r.players.map((p) => p.num));
  let n = 1; while (used.has(n)) n++; return n;
};

export function renamePlayer(r: TeamRoster, num: number, name: string): TeamRoster {
  const c = clone(r);
  const p = c.players.find((x) => x.num === num);
  if (p) p.name = name;
  return c;
}

export function renumberPlayer(r: TeamRoster, oldNum: number, newNum: number): TeamRoster {
  if (oldNum === newNum) return clone(r);
  if (r.players.some((p) => p.num === newNum)) return clone(r); // taken → no-op
  const c = clone(r);
  const p = c.players.find((x) => x.num === oldNum);
  if (!p) return c;
  p.num = newNum;
  c.formation = c.formation.map((row) => row.map((n) => (n === oldNum ? newNum : n)));
  return c;
}

export function addPlayer(r: TeamRoster, role: "starting" | "sub"): TeamRoster {
  const c = clone(r);
  const num = nextFreeNum(c);
  c.players.push({ num, name: "", role });
  if (role === "starting") c.formation.push([num]); // appended as its own row; user can reshuffle later
  return c;
}

export function removePlayer(r: TeamRoster, num: number): TeamRoster {
  const c = clone(r);
  c.players = c.players.filter((p) => p.num !== num);
  c.formation = c.formation.map((row) => row.filter((n) => n !== num)).filter((row) => row.length > 0);
  return c;
}
```

- [ ] **Step 4: Run it, confirm PASS**

Run: `bash -lc 'source ~/.nvm/nvm.sh; nvm use 20 >/dev/null; cd /home/sean/workspace/sideline && npm test -- team-roster'`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add lib/team-roster.ts test/team-roster.test.ts
git commit -m "feat: pure team-roster mutation helpers"
```

---

## Task 3: `team-store` (browser CRUD over `teams`)

**Files:**
- Create: `lib/team-store.ts`

Mirrors `lib/store.ts` for the `teams` table. Mints a `short_code` on first save (idempotent, like `ShareSheet.ensureShortCode`). Degrades gracefully if the table/columns are absent (returns `[]`/`false`, logs).

- [ ] **Step 1: Create `lib/team-store.ts`**

```ts
"use client";
import { createClient } from "@/lib/supabase/client";
import { genShortCode } from "@/lib/short-code";
import type { TeamRecord, TeamRoster } from "@/lib/types";

const sb = createClient();

interface TeamRow {
  id: string; owner?: string; short_code?: string | null;
  name: string; color1?: string | null; color2?: string | null;
  sport?: string | null; roster: TeamRoster; updated_at?: string;
}

const toRecord = (r: TeamRow): TeamRecord => ({
  id: r.id, owner: r.owner, short_code: r.short_code ?? null,
  name: r.name, color1: r.color1 ?? undefined, color2: r.color2 ?? undefined,
  sport: r.sport ?? undefined, roster: r.roster, updated_at: r.updated_at,
});

// idempotent short_code mint (mirrors ShareSheet.ensureShortCode)
async function ensureShortCode(id: string): Promise<string | null> {
  try {
    const { data: cur } = await sb.from("teams").select("short_code").eq("id", id).maybeSingle();
    let code: string | null = (cur as any)?.short_code ?? null;
    for (let i = 0; i < 5 && !code; i++) {
      const cand = genShortCode();
      const { error } = await sb.from("teams").update({ short_code: cand }).eq("id", id).is("short_code", null);
      if (error) { if (error.code === "23505") continue; break; }
      const { data: chk } = await sb.from("teams").select("short_code").eq("id", id).maybeSingle();
      code = (chk as any)?.short_code ?? null;
    }
    return code;
  } catch { return null; }
}

export const teamStore = {
  async list(userId: string): Promise<TeamRecord[]> {
    const { data, error } = await sb.from("teams").select("*").eq("owner", userId).order("updated_at", { ascending: false });
    if (error) { console.warn("teams list failed", error.message); return []; }
    return (data as TeamRow[] || []).map(toRecord);
  },
  async get(id: string): Promise<TeamRecord | null> {
    const { data } = await sb.from("teams").select("*").eq("id", id).maybeSingle();
    return data ? toRecord(data as TeamRow) : null;
  },
  // upsert a team; returns the saved id (with a freshly-minted short_code on create) or null on failure
  async set(t: TeamRecord): Promise<string | null> {
    const row = { id: t.id, name: t.name, color1: t.color1 ?? null, color2: t.color2 ?? null, sport: t.sport ?? null, roster: t.roster, updated_at: new Date().toISOString() };
    const { error } = await sb.from("teams").upsert(row);
    if (error) { console.warn("team save failed", error.message); return null; }
    await ensureShortCode(t.id);
    return t.id;
  },
  async del(id: string): Promise<boolean> {
    const { error } = await sb.from("teams").delete().eq("id", id);
    return !error;
  },
};
```

> `owner` is omitted from the upsert payload — it defaults to `auth.uid()` on insert (RLS-checked), exactly like `matches`. `short_code` is never sent in the main upsert (so a re-save can't clobber it); it's minted separately by `ensureShortCode`.

- [ ] **Step 2: Typecheck**

Run: `bash -lc 'source ~/.nvm/nvm.sh; nvm use 20 >/dev/null; cd /home/sean/workspace/sideline && npx tsc --noEmit'`
Expected: no errors referencing `team-store.ts`.

- [ ] **Step 3: Commit**

```bash
git add lib/team-store.ts
git commit -m "feat: team-store browser CRUD over teams table"
```

---

## Task 4: AppHeader gains a "Teams" link

**Files:**
- Modify: `components/AppHeader.tsx`

- [ ] **Step 1: Add a `showTeams` prop + the link**

In `components/AppHeader.tsx`, replace the props destructure + type:

```tsx
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
```

with:

```tsx
export default function AppHeader({
  email = null,
  showNew = false,
  showTeams = false,
  onNew,
  onSignIn,
  onSignOut,
  backHref = null,
  children,
}: {
  email?: string | null;
  showNew?: boolean;
  showTeams?: boolean;
  onNew?: () => void;
  onSignIn?: () => void;
  onSignOut?: () => void;
  backHref?: string | null;
  children?: React.ReactNode;
}) {
```

Then add the Teams link right after the back-link line. Replace:

```tsx
        {backHref && <Link className="ah-back" href={backHref}>‹ matches</Link>}
        <div className="grow" />
```

with:

```tsx
        {backHref && <Link className="ah-back" href={backHref}>‹ matches</Link>}
        {showTeams && <Link className="ah-back" href="/teams">Teams</Link>}
        <div className="grow" />
```

- [ ] **Step 2: Surface it on the landing**

In `components/Landing.tsx`, find the `<AppHeader` usage and add `showTeams={!!email}` to its props (next to `showNew={!!email}`). The line currently is:

```tsx
      <AppHeader email={email} showNew={!!email} onNew={() => router.push("/m/new")} onSignIn={onSignIn} onSignOut={onSignOut} />
```

Replace with:

```tsx
      <AppHeader email={email} showNew={!!email} showTeams={!!email} onNew={() => router.push("/m/new")} onSignIn={onSignIn} onSignOut={onSignOut} />
```

Also add `showTeams` to the editor's AppHeader. In `components/MatchTracker.tsx`, the `<AppHeader` usage has `email={userEmail} showNew backHref="/"`. Replace `showNew` there with `showNew showTeams`:

```tsx
          email={userEmail}
          showNew
          backHref="/"
```

with:

```tsx
          email={userEmail}
          showNew
          showTeams
          backHref="/"
```

- [ ] **Step 3: Build**

Run: `bash -lc 'source ~/.nvm/nvm.sh; nvm use 20 >/dev/null; cd /home/sean/workspace/sideline && npm run build'`
Expected: success.

- [ ] **Step 4: Commit**

```bash
git add components/AppHeader.tsx components/Landing.tsx components/MatchTracker.tsx
git commit -m "feat: Teams link in AppHeader (landing + editor)"
```

---

## Task 5: `TeamEditor` component + CSS

**Files:**
- Create: `components/TeamEditor.tsx`
- Modify: `app/globals.css` (append)

- [ ] **Step 1: Create `components/TeamEditor.tsx`**

```tsx
"use client";
import React, { useState } from "react";
import { teamStore } from "@/lib/team-store";
import { templateForSport } from "@/lib/team-templates";
import { renamePlayer, renumberPlayer, addPlayer, removePlayer } from "@/lib/team-roster";
import { mkId, contrastOn } from "@/lib/util";
import { PALETTE, SPORTS } from "@/lib/constants";
import type { TeamRecord, TeamRoster } from "@/lib/types";

const EMPTY: TeamRoster = { formation: [], players: [] };

export default function TeamEditor({ initial, onDone }: { initial?: TeamRecord | null; onDone: () => void }) {
  const [id] = useState(() => initial?.id || mkId());
  const [name, setName] = useState(initial?.name || "");
  const [color1, setColor1] = useState(initial?.color1 || "#f5c518");
  const [color2, setColor2] = useState(initial?.color2 || "#1f7a4d");
  const [sport, setSport] = useState(initial?.sport || "");
  const [roster, setRoster] = useState<TeamRoster>(initial?.roster || EMPTY);
  const [edit, setEdit] = useState<{ num: number; name: string; num2: string } | null>(null);
  const [pick, setPick] = useState<null | "c1" | "c2">(null);
  const [busy, setBusy] = useState(false);

  const byNum = (n: number) => roster.players.find((p) => p.num === n);
  const subs = roster.players.filter((p) => p.role === "sub");

  const chooseSport = (s: string) => {
    setSport(s);
    const hasNames = roster.players.some((p) => p.name && !["GK","RB","RCB","LCB","LB","RW","CDM","CAM","LW","SS","S","Sub","RWB","CB","LWB","MID","RWF","CF","LWF","RCF","FF","LCF","FB"].includes(p.name));
    if (roster.players.length && hasNames && !window.confirm("Replace the current roster with the " + (SPORTS[s]?.label || s) + " template?")) return;
    if (s) setRoster(templateForSport(s));
  };

  const openSlot = (num: number) => { const p = byNum(num); setEdit({ num, name: p?.name || "", num2: String(num) }); };
  const applySlot = () => {
    if (!edit) return;
    let r = renamePlayer(roster, edit.num, edit.name.trim());
    const n2 = parseInt(edit.num2, 10);
    if (n2 >= 1 && n2 <= 99 && n2 !== edit.num) r = renumberPlayer(r, edit.num, n2);
    setRoster(r); setEdit(null);
  };

  const save = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    const rec: TeamRecord = { id, name: name.trim(), color1, color2, sport: sport || undefined, roster };
    const ok = await teamStore.set(rec);
    setBusy(false);
    if (ok) onDone();
  };

  const swatch = (val: string, set: (c: string) => void, which: "c1" | "c2") => (
    <>
      <button className="mt-swatch" style={{ background: val }} onClick={() => setPick(pick === which ? null : which)} />
      {pick === which && (
        <div className="te-pick">
          {PALETTE.map((c) => <button key={c} className="mt-swatch" style={{ background: c }} onClick={() => { set(c); setPick(null); }} />)}
          <input type="color" value={val} onChange={(e) => set(e.target.value)} />
        </div>
      )}
    </>
  );

  return (
    <div className="te">
      <div className="mt-row"><span className="mt-h" style={{ flex: 1, margin: 0 }}>{initial ? "Edit team" : "New team"}</span>
        <button className="mt-add alt" onClick={onDone}>✕ Cancel</button></div>

      <label className="te-field">Name <input className="mt-inp" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Racoons" /></label>
      <div className="te-field">Colours {swatch(color1, setColor1, "c1")} {swatch(color2, setColor2, "c2")}</div>
      <label className="te-field">Sport
        <select className="mt-sel" value={sport} onChange={(e) => chooseSport(e.target.value)}>
          <option value="">— none —</option>
          {Object.entries(SPORTS).map(([k, s]) => <option key={k} value={k}>{s.emoji} {s.label}</option>)}
        </select>
      </label>

      <p className="mt-note">Tap a player to name them. {sport ? "" : "Pick a sport to load a template, or add players below."}</p>
      <div className="te-pitch" style={{ background: `linear-gradient(${color2}22, #0c3b2a 60%)` }}>
        {roster.formation.map((row, ri) => (
          <div className="mt-line" key={ri}>
            {row.map((n) => { const p = byNum(n); return (
              <button className="mt-jersey te-slot" key={n} onClick={() => openSlot(n)}>
                <span className="j" style={{ background: color1, color: contrastOn(color1), borderBottom: `4px solid ${color2}` }}>{n}</span>
                <span className="nm">{p?.name || "—"}</span>
              </button>
            ); })}
          </div>
        ))}
      </div>

      {edit && (
        <div className="mt-live" style={{ marginTop: 8 }}>
          <div className="mt-row">
            <span className="mt-h" style={{ margin: 0 }}>Player {edit.num}</span>
            <button className="mt-add alt" style={{ marginLeft: "auto" }} onClick={() => setEdit(null)}>Cancel</button>
          </div>
          <input className="mt-inp" autoFocus value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="player name" />
          <div className="mt-row" style={{ marginTop: 6 }}>
            <label className="mt-note">No. <input style={{ width: 54 }} value={edit.num2} onChange={(e) => setEdit({ ...edit, num2: e.target.value.replace(/\D/g, "") })} /></label>
            <button className="mt-add" onClick={applySlot}>OK</button>
            <button className="mt-add danger" onClick={() => { setRoster(removePlayer(roster, edit.num)); setEdit(null); }}>Remove</button>
          </div>
        </div>
      )}

      <p className="mt-h" style={{ marginTop: 12 }}>Subs</p>
      <div className="mt-bench">
        {subs.map((p) => <button className="b" key={p.num} onClick={() => openSlot(p.num)}>{p.num}. {p.name || "—"}</button>)}
      </div>
      <div className="mt-row" style={{ marginTop: 8 }}>
        <button className="mt-add alt" onClick={() => setRoster(addPlayer(roster, "starting"))}>+ Player</button>
        <button className="mt-add alt" onClick={() => setRoster(addPlayer(roster, "sub"))}>+ Sub</button>
      </div>

      <div className="mt-row" style={{ marginTop: 14 }}>
        <button className="mt-add" disabled={!name.trim() || busy} onClick={save}>{busy ? "Saving…" : "Save team"}</button>
      </div>
    </div>
  );
}
```

> Reuses existing classes (`mt-*`, the lineup pitch `mt-pitch/mt-line/mt-jersey`, `mt-bench`) and `PALETTE`/`SPORTS`/`mkId`/`contrastOn`. `onDone` lets the host (`TeamsList`) refresh + close and handle navigation, so `TeamEditor` needs no router.

- [ ] **Step 2: Append CSS** to the end of `app/globals.css`:

```css
/* --- Teams (v48) --- */
.te { max-width: 620px; margin: 0 auto; }
.te-field { display: flex; align-items: center; gap: 8px; margin: 10px 0; font-weight: 600; }
.te-field .mt-inp, .te-field .mt-sel { flex: 1; }
.te-pick { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; margin-left: 4px; }
.te-pitch { border-radius: 10px; padding: 14px 8px; }
.te-slot { cursor: pointer; }
.tl-list { max-width: 760px; margin: 0 auto; }
.tl-row { display: flex; align-items: center; gap: 12px; background: var(--card, #fff); border: 1px solid var(--line, #e4dcc6); border-radius: 10px; padding: 11px 14px; margin-bottom: 9px; cursor: pointer; }
.tl-row:hover { border-color: #1f7a4d; }
.tl-flag { width: 16px; height: 16px; border-radius: 4px; flex: none; }
.tl-name { font-weight: 700; font-size: 15px; flex: 1; }
.tl-meta { color: var(--muted, #6f7d72); font-size: 12px; }
.tp-id { display: flex; align-items: center; gap: 12px; padding: 14px; }
.tp-flag { width: 30px; height: 30px; border-radius: 7px; flex: none; }
.tp-fixtures { color: var(--muted, #6f7d72); text-align: center; padding: 20px; border: 1px dashed var(--line, #e4dcc6); border-radius: 10px; margin: 14px; }
```

- [ ] **Step 3: Typecheck**

Run: `bash -lc 'source ~/.nvm/nvm.sh; nvm use 20 >/dev/null; cd /home/sean/workspace/sideline && npx tsc --noEmit'`
Expected: no errors referencing `TeamEditor.tsx`.

- [ ] **Step 4: Commit**

```bash
git add components/TeamEditor.tsx app/globals.css
git commit -m "feat: TeamEditor (tap-to-name roster, template seeding)"
```

---

## Task 6: `TeamsList` + `/teams` route

**Files:**
- Create: `components/TeamsList.tsx`, `app/teams/page.tsx`

- [ ] **Step 1: Create `components/TeamsList.tsx`**

```tsx
"use client";
import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import TeamEditor from "@/components/TeamEditor";
import { teamStore } from "@/lib/team-store";
import { createClient } from "@/lib/supabase/client";
import { SPORTS } from "@/lib/constants";
import type { TeamRecord } from "@/lib/types";

export default function TeamsList({ userId, email }: { userId: string; email: string | null }) {
  const router = useRouter();
  const sb = createClient();
  const [teams, setTeams] = useState<TeamRecord[] | null>(null);
  const [editing, setEditing] = useState<null | "new" | TeamRecord>(null);

  const reload = () => teamStore.list(userId).then(setTeams);
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [userId]);

  if (editing) {
    return (
      <div className="mt-root">
        <AppHeader email={email} showNew showTeams backHref="/" onNew={() => router.push("/m/new")} onSignOut={async () => { await sb.auth.signOut(); router.push("/"); }} />
        <div className="ml-page">
          <TeamEditor initial={editing === "new" ? null : editing} onDone={() => { setEditing(null); reload(); }} />
        </div>
      </div>
    );
  }

  return (
    <div className="mt-root">
      <AppHeader email={email} showNew showTeams backHref="/" onNew={() => router.push("/m/new")} onSignOut={async () => { await sb.auth.signOut(); router.push("/"); }} />
      <div className="tl-list ml-page">
        <div className="ml-sechead"><h3>Your teams</h3><button className="mt-btn solid" style={{ marginLeft: "auto" }} onClick={() => setEditing("new")}>＋ New team</button></div>
        {teams === null ? <p className="ml-note">Loading…</p>
          : teams.length === 0 ? <div className="ml-empty"><p>No teams yet.</p><button className="mt-btn solid" onClick={() => setEditing("new")}>＋ New team</button></div>
          : teams.map((t) => (
            <div className="tl-row" key={t.id} onClick={() => setEditing(t)}>
              <span className="tl-flag" style={{ background: `linear-gradient(135deg, ${t.color1 || "#888"} 50%, ${t.color2 || "#555"} 50%)` }} />
              <span className="tl-name">{t.name}</span>
              <span className="tl-meta">{t.sport && SPORTS[t.sport] ? SPORTS[t.sport].emoji + " " : ""}{t.roster.players.length} players</span>
            </div>
          ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `app/teams/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import TeamsList from "@/components/TeamsList";

export default async function TeamsPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/");
  return <TeamsList userId={data.user.id} email={data.user.email ?? null} />;
}
```

- [ ] **Step 3: Build**

Run: `bash -lc 'source ~/.nvm/nvm.sh; nvm use 20 >/dev/null; cd /home/sean/workspace/sideline && npm run build'`
Expected: success; `/teams` listed as a route.

- [ ] **Step 4: Commit**

```bash
git add components/TeamsList.tsx app/teams/page.tsx
git commit -m "feat: /teams list + create/edit via TeamEditor"
```

---

## Task 7: `TeamPage` + public `/t/[id]` route

**Files:**
- Create: `components/TeamPage.tsx`, `app/t/[id]/page.tsx`

- [ ] **Step 1: Create `components/TeamPage.tsx`**

```tsx
"use client";
import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { createClient } from "@/lib/supabase/client";
import { contrastOn } from "@/lib/util";
import { SPORTS } from "@/lib/constants";
import type { TeamRecord } from "@/lib/types";

export default function TeamPage({ team, isOwner }: { team: TeamRecord; isOwner: boolean }) {
  const router = useRouter();
  const sb = createClient();
  const [email, setEmail] = useState<string | null>(null);
  useEffect(() => { sb.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null)); }, []);
  const byNum = (n: number) => team.roster.players.find((p) => p.num === n);
  const subs = team.roster.players.filter((p) => p.role === "sub");
  const c1 = team.color1 || "#888", c2 = team.color2 || "#555";

  return (
    <div className="pm-root mt-root">
      <AppHeader email={email} showNew={!!email} showTeams={!!email}
        onNew={() => router.push("/m/new")}
        onSignIn={async () => { await sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${location.origin}/auth/callback` } }); }}
        onSignOut={async () => { await sb.auth.signOut(); router.refresh(); }}>
        {isOwner && <button className="mt-btn" onClick={() => router.push("/teams")}>Edit</button>}
      </AppHeader>

      <div className="tp-id">
        <span className="tp-flag" style={{ background: `linear-gradient(135deg, ${c1} 50%, ${c2} 50%)` }} />
        <div><div className="mt-h" style={{ margin: 0 }}>{team.name}</div>
          <div className="mt-note" style={{ margin: 0 }}>{team.sport && SPORTS[team.sport] ? `${SPORTS[team.sport].emoji} ${SPORTS[team.sport].label}` : "Team"}</div></div>
      </div>

      {team.roster.formation.length > 0 && (
        <div className="te-pitch" style={{ margin: 14, background: `linear-gradient(${c2}22, #0c3b2a 60%)` }}>
          {team.roster.formation.map((row, ri) => (
            <div className="mt-line" key={ri}>
              {row.map((n) => { const p = byNum(n); return (
                <div className="mt-jersey" key={n}>
                  <span className="j" style={{ background: c1, color: contrastOn(c1), borderBottom: `4px solid ${c2}` }}>{n}</span>
                  <span className="nm">{p?.name || ""}</span>
                </div>
              ); })}
            </div>
          ))}
        </div>
      )}
      {subs.length > 0 && <p className="mt-note" style={{ margin: "0 14px" }}>Subs: {subs.map((p) => `${p.num} ${p.name}`).join("  ·  ")}</p>}

      <p className="mt-h" style={{ margin: "18px 14px 6px" }}>Fixtures</p>
      <div className="tp-fixtures">Fixtures involving this team will appear here.</div>
    </div>
  );
}
```

- [ ] **Step 2: Create `app/t/[id]/page.tsx`**

```tsx
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/util";
import TeamPage from "@/components/TeamPage";
import type { TeamRecord } from "@/lib/types";

async function fetchTeam(slug: string): Promise<TeamRecord | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("teams").select("*")
    .eq(isUuid(slug) ? "id" : "short_code", slug).maybeSingle();
  return (data as TeamRecord) || null;
}

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const t = await fetchTeam(params.id);
  if (!t) return { title: "Here We Go" };
  return { title: `${t.name} · Here We Go`, description: `${t.name} squad on Here We Go` };
}

export default async function TeamRoutePage({ params }: { params: { id: string } }) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const team = await fetchTeam(params.id);
  if (!team) notFound();
  return <TeamPage team={team} isOwner={!!auth.user && auth.user.id === team.owner} />;
}
```

- [ ] **Step 3: Build**

Run: `bash -lc 'source ~/.nvm/nvm.sh; nvm use 20 >/dev/null; cd /home/sean/workspace/sideline && npm run build'`
Expected: success; `/t/[id]` listed.

- [ ] **Step 4: Commit**

```bash
git add components/TeamPage.tsx app/t/[id]/page.tsx
git commit -m "feat: public team page /t/[id] (identity + roster pitch + fixtures placeholder)"
```

---

## Task 8: Migration SQL, version bump, verify

**Files:**
- Modify: `lib/constants.ts`
- Create: `docs/teams-migration.sql` (reference for the manual step)

- [ ] **Step 1: Write the migration SQL** — create `docs/teams-migration.sql`:

```sql
-- Run once in the Supabase SQL editor (project ref in SETUP.md).
create table if not exists teams (
  id          uuid primary key default gen_random_uuid(),
  owner       uuid not null default auth.uid(),
  short_code  text unique,
  name        text not null,
  color1      text,
  color2      text,
  sport       text,
  roster      jsonb not null default '{"formation":[],"players":[]}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table teams enable row level security;
create policy teams_own_all on teams for all using (owner = auth.uid()) with check (owner = auth.uid());
create policy teams_public_read on teams for select using (true);
```

- [ ] **Step 2: Bump APP_VERSION**

In `lib/constants.ts`, replace `export const APP_VERSION = "v47";` with `export const APP_VERSION = "v48";`.

- [ ] **Step 3: Full test + build**

Run: `bash -lc 'source ~/.nvm/nvm.sh; nvm use 20 >/dev/null; cd /home/sean/workspace/sideline && npm test 2>&1 | tail -4 && npm run build 2>&1 | tail -8'`
Expected: all tests pass (was 174 + the new team-templates & team-roster suites), build success.

- [ ] **Step 4: Commit**

```bash
git add lib/constants.ts docs/teams-migration.sql
git commit -m "chore: teams migration SQL + bump APP_VERSION to v48"
```

- [ ] **Step 5: Manual verification (after running the migration)**

The reviewer/user runs `docs/teams-migration.sql` in Supabase, then `npm run dev` (signed in):
- Header shows **Teams** → `/teams` lists your teams (empty state first).
- **New team** → editor: name, two colour swatches, pick **Soccer** → grid seeds the 11+1 template; tap a slot → name + number + remove; **+ Player / + Sub**; **Save** → returns to the list with the team shown.
- Edit the team (click its row) → changes persist.
- Open `/t/<short_code>` (signed out / another account) → public team page: identity, roster pitch, "Fixtures will appear here"; owner sees an **Edit** button.
- A non-existent `/t/zzzzzz` → 404. Existing matches/editor unaffected.

---

## Self-review notes (reconciled)

- **Spec coverage:** `teams` table + RLS (Task 8 SQL); `roster` shape + types (Task 1); templates + `templateForSport` (Task 1); roster mutation helpers (Task 2); `team-store` CRUD + short_code (Task 3); Teams header link (Task 4); tap-to-name editor seeded by sport (Task 5); `/teams` list (Task 6); public `/t/[id]` page with roster pitch + fixtures placeholder + owner Edit (Task 7); version bump (Task 8). No parser/match change anywhere.
- **Type/name consistency:** `TeamRoster`/`TeamRecord` (Task 1) used identically by `team-templates`, `team-roster`, `team-store`, `TeamEditor`, `TeamsList`, `TeamPage`; helper names `renamePlayer`/`renumberPlayer`/`addPlayer`/`removePlayer` consistent across Task 2 and Task 5; `teamStore.set` returns `string | null` and `TeamEditor.save` treats truthy as success; `templateForSport` shared by Task 1 test and Task 5.
- **Tested seams:** the two pure modules are TDD'd; the Supabase store and React UI are build-verified, matching the repo pattern.
- **Deviations/notes:** `TeamEditor` keeps the formation simple (added starters append as their own row; reshuffle/positioning beyond template is out of ③a scope). `owner` relies on the `auth.uid()` default on insert (same as matches). The migration is manual and must precede runtime use; `team-store` degrades to `[]`/`null` if the table is absent.
- **Out of scope (later phases):** matches referencing teams, real fixtures on the team page, neutral two-team display/swap (③b); event-only notation (③c); global team browse/search; team delete UI (helper exists in store, no button yet — add if desired, but not required by the spec).
