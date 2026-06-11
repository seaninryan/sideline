# Team squads, duplication & unified privacy — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give teams a squad label that's part of their identity, a duplicate action, a unified 3-way Private/Unlisted/Listed privacy control shared by matches and teams, and surface the squad as a sub-line everywhere a team is shown.

**Architecture:** Pure logic stays in tested `lib/` modules (`privacy.ts`, `match-sport.ts`, `team-store.ts` helpers, `team-link.ts`, `match-list.ts`); a new presentational `<PrivacyControl>` is owned by `ShareSheet` (matches) and `TeamEditor` (teams), which keep the persistence. Squad becomes part of `(sport, name, squad)` team identity and is snapshotted onto the match record (`usSquad`/`oppSquad`) at link time so display surfaces need no live lookup.

**Tech Stack:** Next.js 14 App Router, React, TypeScript, Supabase (Postgres + RLS), Vitest. Node 20 (`nvm use 20`).

**Conventions for this plan:**
- Run tests with `export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use 20 >/dev/null; npx vitest run <file>` (or `npm test` for all).
- `MatchTracker.tsx` is `// @ts-nocheck`; validate its JSX with `npx next build` (look for "✓ Compiled successfully"), not `tsc`.
- After a build, `rm -rf .next` before running `npm run dev` (prod artifacts collide with dev).
- Pure modules are unit-tested; components are verified by `npx tsc --noEmit` + `npx next build` + live review (the repo's established pattern).
- Commit after each task.

---

## Phase 0 — schema & types

### Task 1: Migration SQL + types

**Files:**
- Create: `docs/teams-squad-migration.sql`
- Modify: `lib/types.ts:83-95` (TeamRecord), `lib/types.ts:14-37` (MatchRecord)
- Modify: `CLAUDE.md` (storage section — document the new columns + migration)

- [ ] **Step 1: Write the migration file**

Create `docs/teams-squad-migration.sql`:

```sql
-- Team squads + per-team public-feed visibility (run once in Supabase).
-- squad: part of team identity (sport, name, squad). listed: mirror of matches.listed.
alter table teams add column if not exists squad text not null default '';
alter table teams add column if not exists listed boolean not null default true;

-- Identity is now (owner, sport, name, squad). Swap the unique index.
-- (Safe: the old index already enforced (sport, name) uniqueness, so no dupes exist.)
drop index if exists teams_owner_sport_name_key;
create unique index if not exists teams_owner_sport_name_squad_key
  on teams (owner, coalesce(sport,''), lower(name), lower(squad));
```

- [ ] **Step 2: Extend the types**

In `lib/types.ts`, `TeamRecord` — add after `name: string;` (line 87):

```typescript
  squad?: string;       // squad label, part of identity: (sport, name, squad). "" = plain club team.
```

and add after `name_display?: NameDisplay;` (line 93):

```typescript
  listed?: boolean;     // when public, also shown in the public-teams feed
```

In `lib/types.ts`, `MatchRecord` — add after `opponent?: string;` (line 33):

```typescript
  usSquad?: string;     // squad sub-line, snapshotted from the linked teams at link time
  oppSquad?: string;
```

- [ ] **Step 3: Document in CLAUDE.md**

In the Storage / teams section of `CLAUDE.md`, add a bullet noting: `teams.squad` (part of identity `(sport, name, squad)`, index `teams_owner_sport_name_squad_key`) and `teams.listed` (mirror of `matches.listed`), with the migration in `docs/teams-squad-migration.sql`. Note that matches snapshot `usSquad`/`oppSquad` at link time.

- [ ] **Step 4: Typecheck + commit**

Run: `export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use 20 >/dev/null; npx tsc --noEmit`
Expected: exit 0.

```bash
git add lib/types.ts docs/teams-squad-migration.sql CLAUDE.md
git commit -m "feat(teams): squad + listed columns, match squad snapshot fields, migration"
```

---

## Phase 1 — unified 3-way privacy control

### Task 2: `lib/privacy.ts` + tests

**Files:**
- Create: `lib/privacy.ts`
- Test: `test/privacy.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/privacy.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { privacyLevel, levelToColumns } from "@/lib/privacy";

describe("privacyLevel", () => {
  it("private when not public", () => {
    expect(privacyLevel(false, true)).toBe("private");
    expect(privacyLevel(false, false)).toBe("private");
    expect(privacyLevel(undefined, undefined)).toBe("private");
  });
  it("listed when public and listed (listed defaults true)", () => {
    expect(privacyLevel(true, true)).toBe("listed");
    expect(privacyLevel(true, undefined)).toBe("listed");
  });
  it("unlisted when public but not listed", () => {
    expect(privacyLevel(true, false)).toBe("unlisted");
  });
});

describe("levelToColumns", () => {
  it("round-trips each level", () => {
    expect(levelToColumns("private")).toEqual({ is_public: false, listed: true });
    expect(levelToColumns("unlisted")).toEqual({ is_public: true, listed: false });
    expect(levelToColumns("listed")).toEqual({ is_public: true, listed: true });
    (["private", "unlisted", "listed"] as const).forEach((lv) => {
      const c = levelToColumns(lv);
      expect(privacyLevel(c.is_public, c.listed)).toBe(lv === "private" ? "private" : lv);
    });
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use 20 >/dev/null; npx vitest run test/privacy.test.ts`
Expected: FAIL (cannot find module `@/lib/privacy`).

- [ ] **Step 3: Implement `lib/privacy.ts`**

```typescript
// One privacy model shared by matches and teams. Three levels map onto the
// (is_public, listed) columns: Private = not public; Unlisted = public, link-only;
// Listed = public and shown in the public feed.
export type PrivacyLevel = "private" | "unlisted" | "listed";

export function privacyLevel(isPublic?: boolean, listed?: boolean): PrivacyLevel {
  if (!isPublic) return "private";
  return listed === false ? "unlisted" : "listed"; // listed defaults true
}

export function levelToColumns(level: PrivacyLevel): { is_public: boolean; listed: boolean } {
  if (level === "private") return { is_public: false, listed: true };
  if (level === "unlisted") return { is_public: true, listed: false };
  return { is_public: true, listed: true };
}

export const PRIVACY_LEVELS: { v: PrivacyLevel; label: string; hint: string }[] = [
  { v: "private", label: "Private", hint: "Only you" },
  { v: "unlisted", label: "Unlisted", hint: "Anyone with the link" },
  { v: "listed", label: "Listed", hint: "In the public feed" },
];
```

- [ ] **Step 4: Run tests to confirm pass**

Run: `npx vitest run test/privacy.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/privacy.ts test/privacy.test.ts
git commit -m "feat(privacy): shared 3-way Private/Unlisted/Listed model"
```

### Task 3: `<PrivacyControl>` presentational component

**Files:**
- Create: `components/PrivacyControl.tsx`
- Modify: `app/globals.css` (segmented-control styles)

- [ ] **Step 1: Implement the component**

Create `components/PrivacyControl.tsx`:

```tsx
"use client";
import React from "react";
import { PRIVACY_LEVELS, type PrivacyLevel } from "@/lib/privacy";
import type { NameDisplay } from "@/lib/types";

const NAME_OPTS: { v: NameDisplay; label: string }[] = [
  { v: "full", label: "Full" }, { v: "initials", label: "Initials" }, { v: "none", label: "None" },
];

// Shared 3-way privacy control (matches + teams). The parent owns persistence and
// passes the current level + the public link; this is presentational only.
export default function PrivacyControl({
  level, onLevel, link, copied, onCopy, nameDisplay, onNameDisplay, busy = false,
}: {
  level: PrivacyLevel;
  onLevel: (l: PrivacyLevel) => void;
  link?: string;
  copied?: boolean;
  onCopy?: () => void;
  nameDisplay: NameDisplay;
  onNameDisplay: (v: NameDisplay) => void;
  busy?: boolean;
}) {
  return (
    <div className="pc">
      <div className="pc-seg" role="radiogroup" aria-label="Privacy">
        {PRIVACY_LEVELS.map((o) => (
          <button key={o.v} role="radio" aria-checked={level === o.v} disabled={busy}
            className={"pc-opt" + (level === o.v ? " on" : "")} onClick={() => onLevel(o.v)}>
            <span className="pc-lbl">{o.label}</span>
            <span className="pc-hint">{o.hint}</span>
          </button>
        ))}
      </div>
      {level !== "private" && (
        <>
          {link && (
            <div className="pc-link">
              <input className="mt-inp" readOnly value={link} onFocus={(e) => e.currentTarget.select()} style={{ width: "100%" }} />
              {onCopy && <button className="mt-add" style={{ marginTop: 6 }} onClick={onCopy}>{copied ? "Copied ✓" : "🔗 Copy link"}</button>}
            </div>
          )}
          <p className="mt-note" style={{ margin: "12px 0 4px" }}>Player names on the public page:</p>
          <div className="mt-grid">
            {NAME_OPTS.map((o) => (
              <button key={o.v} className={"mt-big sm" + (nameDisplay === o.v ? " on" : "")} disabled={busy} onClick={() => onNameDisplay(o.v)}>{o.label}</button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add styles**

In `app/globals.css`, append:

```css
.pc-seg{display:grid; grid-template-columns:1fr 1fr 1fr; gap:6px; margin-top:8px;}
.pc-opt{display:flex; flex-direction:column; align-items:center; gap:2px; padding:8px 4px; border:1px solid var(--line); border-radius:10px; background:#fff; cursor:pointer;}
.pc-opt.on{background:var(--pitch); border-color:var(--pitch);}
.pc-opt.on .pc-lbl, .pc-opt.on .pc-hint{color:#f4efe1;}
.pc-lbl{font-family:var(--font-oswald),sans-serif; font-weight:600; font-size:13px; color:var(--pitch);}
.pc-hint{font-size:9px; text-transform:uppercase; letter-spacing:.5px; color:var(--muted); text-align:center; line-height:1.1;}
.pc-link{margin-top:10px;}
```

- [ ] **Step 3: Typecheck + commit**

Run: `npx tsc --noEmit` → exit 0.

```bash
git add components/PrivacyControl.tsx app/globals.css
git commit -m "feat(privacy): PrivacyControl segmented component"
```

### Task 4: Wire PrivacyControl into ShareSheet (matches)

**Files:**
- Modify: `components/ShareSheet.tsx`

- [ ] **Step 1: Replace the publish / listed / name-display UI with PrivacyControl**

In `components/ShareSheet.tsx`:

1. Add import: `import PrivacyControl from "@/components/PrivacyControl";` and `import { privacyLevel, levelToColumns, type PrivacyLevel } from "@/lib/privacy";`.
2. Replace the `isPublic` + `listed` state with a single `level`:
   - In the initial select `.then`, compute `setLevel(privacyLevel(!!d.is_public, d.listed))` (default `d.listed` undefined → listed). Keep reading `short_code` and `name_display`.
   - Replace `const [isPublic, setIsPublic] = useState(false);` and `const [listed, setListed] = useState(true);` with `const [level, setLevel] = useState<PrivacyLevel>("private");`.
3. Add a single handler that writes both columns and (on first publish) mints the short code:

```tsx
const applyLevel = async (next: PrivacyLevel) => {
  setBusy(true);
  setLevel(next);
  const cols = levelToColumns(next);
  await store.set(curId, { ...record, nameDisplay });
  if (cols.is_public && level === "private") { const code = await ensureShortCode(); setSlug(code); }
  await sb.from("matches").update({ ...cols, name_display: nameDisplay }).eq("id", curId);
  if (cols.is_public && teamIds.length) await sb.from("teams").update({ is_public: true, name_display: nameDisplay }).in("id", teamIds);
  onApplied({ nameDisplay, isPublic: cols.is_public });
  setBusy(false);
};
```

4. Replace the whole `!isPublic ? (...) : (...)` block (the publish flow + the public flow incl. the v65 "Public home page" toggle) with:

```tsx
<PrivacyControl
  level={level}
  onLevel={applyLevel}
  link={level !== "private" ? shareUrl : undefined}
  copied={copied}
  onCopy={copy}
  nameDisplay={nameDisplay}
  onNameDisplay={applyNameDisplay}
  busy={busy}
/>
```

5. Keep `applyNameDisplay` but base its public-check on `level !== "private"` instead of `isPublic`. Delete the now-unused `publish`, `unshare`, and `toggleListed` functions and the `NAME_OPTS` array (now in PrivacyControl).

- [ ] **Step 2: Typecheck + build**

Run: `npx tsc --noEmit` → exit 0. Then `npx next build` → "✓ Compiled successfully".

- [ ] **Step 3: Commit**

```bash
git add components/ShareSheet.tsx
git commit -m "feat(privacy): ShareSheet uses the 3-way PrivacyControl"
```

### Task 5: team-store `listed` + listPublic filter + TeamEditor PrivacyControl

**Files:**
- Modify: `lib/team-store.ts` (TeamRow, toRecord, set, publish→setPrivacy, setListed, listPublic)
- Modify: `components/TeamEditor.tsx`

- [ ] **Step 1: team-store — carry squad+listed, add setPrivacy, filter the feed**

In `lib/team-store.ts`:

1. `TeamRow` interface — add `squad?: string | null;` and `listed?: boolean | null;`.
2. `toRecord` — add `squad: r.squad ?? "",` and `listed: r.listed ?? true,`.
3. `set` row — add `squad: t.squad ?? "",` (do NOT write `listed`/`is_public` here — privacy is managed separately, like matches).
4. Replace `publish`/`unpublish` with a single `setPrivacy`:

```typescript
  async setPrivacy(id: string, cols: { is_public: boolean; listed: boolean }): Promise<boolean> {
    if (cols.is_public) await ensureShortCode(id);
    const { error } = await sb.from("teams").update(cols).eq("id", id).select().maybeSingle();
    return !error;
  },
```

5. `listPublic` query — add `.eq("listed", true)` after `.eq("is_public", true)`.

- [ ] **Step 2: TeamEditor — use PrivacyControl**

In `components/TeamEditor.tsx`:
1. Imports: `import PrivacyControl from "@/components/PrivacyControl";` and `import { privacyLevel, levelToColumns, type PrivacyLevel } from "@/lib/privacy";`.
2. Replace `isPub` state with `const [level, setLevel] = useState<PrivacyLevel>(privacyLevel(!!initial?.is_public, initial?.listed));`.
3. Replace `doPublish`/`doUnpublish` with:

```tsx
const applyLevel = async (next: PrivacyLevel) => {
  setShareBusy(true);
  setLevel(next);
  await teamStore.setPrivacy(id, levelToColumns(next));
  setShareBusy(false);
};
```

4. `changeNameDisp` — gate on `level !== "private"` instead of `isPub`.
5. Replace the `initial && (...)` sharing block's switch + name-grid with `<PrivacyControl level={level} onLevel={applyLevel} link={typeof location !== "undefined" ? location.origin + "/t/" + (initial?.short_code || id) : undefined} nameDisplay={nameDisp} onNameDisplay={changeNameDisp} busy={shareBusy} />` (still wrapped in `{initial && (<div className="mt-live" ...>...)}`). Remove the local `NAME_OPTS`.

- [ ] **Step 3: Typecheck + build + commit**

Run: `npx tsc --noEmit` → 0; `npx next build` → compiled.

```bash
git add lib/team-store.ts components/TeamEditor.tsx
git commit -m "feat(privacy): teams use 3-way PrivacyControl; listed filter on the feed"
```

---

## Phase 2 — squad identity

### Task 6: `match-sport.ts` squad arg + tests

**Files:**
- Modify: `lib/match-sport.ts`
- Test: `test/match-sport.test.ts` (extend existing)

- [ ] **Step 1: Add failing tests**

Append to `test/match-sport.test.ts`:

```typescript
import { teamMatchKey, filterTeams } from "@/lib/match-sport";

describe("teamMatchKey with squad", () => {
  it("distinguishes squads of the same club", () => {
    expect(teamMatchKey("Racoons", "hurling", "U11 Boys"))
      .not.toBe(teamMatchKey("Racoons", "hurling", "Senior Men"));
  });
  it("blank squad matches blank squad", () => {
    expect(teamMatchKey("Racoons", "hurling", "")).toBe(teamMatchKey("racoons", "hurling"));
  });
});

describe("filterTeams matches name or squad", () => {
  const teams = [
    { id: "1", name: "Racoons", sport: "hurling", squad: "U11 Boys", roster: { formation: [], players: [] } },
    { id: "2", name: "Racoons", sport: "hurling", squad: "Senior Men", roster: { formation: [], players: [] } },
  ] as any[];
  it("filters by squad text too", () => {
    expect(filterTeams(teams, "u11", "hurling").map((t) => t.id)).toEqual(["1"]);
  });
});
```

- [ ] **Step 2: Run to confirm fail** — `npx vitest run test/match-sport.test.ts` → FAIL (arity / squad not matched).

- [ ] **Step 3: Implement**

In `lib/match-sport.ts`:

```typescript
export function teamMatchKey(name: string, sport?: string, squad?: string): string {
  return squash(sport || "") + "::" + squash(name) + "::" + squash(squad || "");
}
```

and in `filterTeams`, match name OR squad:

```typescript
export function filterTeams(teams: TeamRecord[], query: string, sport?: string): TeamRecord[] {
  const q = squash(query);
  return teams.filter((t) => (!sport || (t.sport || "") === sport)
    && (!q || squash(t.name).includes(q) || squash(t.squad || "").includes(q)));
}
```

- [ ] **Step 4: Run all tests** — `npm test` → all pass (confirm the SAMPLE finals still hold). Commit:

```bash
git add lib/match-sport.ts test/match-sport.test.ts
git commit -m "feat(teams): squad in teamMatchKey + filterTeams"
```

### Task 7: collision-safe identity helper + team-store findOrCreate/set squad

**Files:**
- Modify: `lib/match-sport.ts` (add `dedupeTeamName`)
- Test: `test/match-sport.test.ts`
- Modify: `lib/team-store.ts`

- [ ] **Step 1: Failing test for `dedupeTeamName`**

Append to `test/match-sport.test.ts`:

```typescript
import { dedupeTeamName } from "@/lib/match-sport";

describe("dedupeTeamName", () => {
  const keyset = (teams: any[]) => new Set(teams.map((t) => teamMatchKey(t.name, t.sport, t.squad)));
  it("returns the name unchanged when no clash", () => {
    expect(dedupeTeamName(new Set(), "Racoons", "hurling", "U11")).toBe("Racoons");
  });
  it("appends (2) on a clash", () => {
    const s = keyset([{ name: "Racoons", sport: "hurling", squad: "U11" }]);
    expect(dedupeTeamName(s, "Racoons", "hurling", "U11")).toBe("Racoons (2)");
  });
  it("appends (2) (2) when (2) also clashes", () => {
    const s = keyset([
      { name: "Racoons", sport: "hurling", squad: "U11" },
      { name: "Racoons (2)", sport: "hurling", squad: "U11" },
    ]);
    expect(dedupeTeamName(s, "Racoons", "hurling", "U11")).toBe("Racoons (2) (2)");
  });
});
```

- [ ] **Step 2: Run to confirm fail** — FAIL (no `dedupeTeamName`).

- [ ] **Step 3: Implement `dedupeTeamName` in `lib/match-sport.ts`**

```typescript
// Make (sport, name, squad) unique against `existingKeys` (a set of teamMatchKey
// values) by appending " (2)" to the NAME, repeating if needed. Used by team save +
// duplicate so a clash never hard-fails.
export function dedupeTeamName(existingKeys: Set<string>, name: string, sport?: string, squad?: string): string {
  let n = name.trim();
  while (existingKeys.has(teamMatchKey(n, sport, squad))) n = `${n} (2)`;
  return n;
}
```

- [ ] **Step 4: team-store — squad in set/findOrCreate, collision-safe**

In `lib/team-store.ts`:

1. `set` — make it collision-safe and return the (possibly bumped) name. Replace the body:

```typescript
  async set(t: TeamRecord): Promise<{ id: string; name: string } | null> {
    let name = t.name.trim();
    if (t.owner) {
      const others = (await this.list(t.owner)).filter((x) => x.id !== t.id);
      const keys = new Set(others.map((x) => teamMatchKey(x.name, x.sport, x.squad)));
      name = dedupeTeamName(keys, name, t.sport, t.squad);
    }
    const row = { id: t.id, name, color1: t.color1 ?? null, color2: t.color2 ?? null, sport: t.sport ?? null, squad: t.squad ?? "", roster: t.roster, updated_at: new Date().toISOString() };
    const { error } = await sb.from("teams").upsert(row);
    if (error) { console.warn("team save failed", error.message); return null; }
    await ensureShortCode(t.id);
    return { id: t.id, name };
  },
```

   Add `import { teamMatchKey, dedupeTeamName } from "@/lib/match-sport";` (extend the existing import).

   > Note: `set` callers that ignored the return value still work (they only checked truthiness). The TeamEditor caller (Task 8) will read `.name` to reflect a rename.

2. `findOrCreate` — accept `squad`, key on `(sport, name, squad)`:

```typescript
  async findOrCreate(
    userId: string,
    { name, sport, squad, color1, color2 }: { name: string; sport: string; squad?: string; color1?: string; color2?: string },
  ): Promise<TeamRecord | null> {
    const want = teamMatchKey(name, sport, squad || "");
    const existing = (await this.list(userId)).find((t) => teamMatchKey(t.name, t.sport, t.squad) === want);
    if (existing) return existing;
    const rec: TeamRecord = { id: mkId(), owner: userId, name: name.trim(), sport, squad: (squad || "").trim(), color1, color2, roster: templateForSport(sport) };
    const saved = await this.set(rec);
    return saved ? { ...rec, name: saved.name } : null;
  },
```

- [ ] **Step 5: Run all tests + typecheck**

Run: `npm test` → pass; `npx tsc --noEmit` → 0 (fix any callers of `teamStore.set` that destructured a string id — search `teamStore.set(` and `findOrCreate(`; update `MatchTracker.tsx`/`TeamEditor.tsx`/`team-link` callers to use `.id`/`.name` from the object or ignore it). Build: `npx next build`.

- [ ] **Step 6: Commit**

```bash
git add lib/match-sport.ts lib/team-store.ts test/match-sport.test.ts
git commit -m "feat(teams): collision-safe (sport,name,squad) save + find-or-create"
```

### Task 8: TeamEditor squad field

**Files:**
- Modify: `components/TeamEditor.tsx`

- [ ] **Step 1: Add the Squad field + persist it**

In `components/TeamEditor.tsx`:
1. Add state: `const [squad, setSquad] = useState(initial?.squad || "");`.
2. Add a field after the Name field (line 74):

```tsx
<label className="te-field">Squad <input className="mt-inp" value={squad} onChange={(e) => setSquad(e.target.value)} placeholder="e.g. U12 Boys (optional)" /></label>
```

3. `persist` — include squad and reflect any rename:

```tsx
const persist = async () => { if (!name.trim()) return; const saved = await teamStore.set({ id, owner: userId, name: name.trim(), squad: squad.trim(), color1, color2, sport: sport || undefined, roster }); if (saved && saved.name !== name) setName(saved.name); };
```

   (Add `userId` to `TeamEditor`'s props — pass it from `TeamsList`; see Task 12. If a quick path is preferred, read `owner` from `initial?.owner`.)
4. Add `squad` to the auto-save effect deps array (line 54): `[name, squad, color1, color2, sport, roster]`.

- [ ] **Step 2: Typecheck + build + commit**

```bash
git add components/TeamEditor.tsx
git commit -m "feat(teams): squad field in TeamEditor"
```

### Task 9: TeamPicker squad in create + display

**Files:**
- Modify: `components/TeamPicker.tsx`
- Modify: `components/MatchTracker.tsx` (the wizard `onCreate` handler)

- [ ] **Step 1: TeamPicker — show squad sub-line + collect squad on create**

In `components/TeamPicker.tsx`:
1. Change the `onCreate` prop type to `onCreate: (name: string, squad: string) => void;`.
2. Add `const [squad, setSquad] = useState("");`.
3. In each `tp-row`, render the squad sub-line under the name:

```tsx
<span className="tp-name">{t.name}{t.squad ? <span className="tp-squad">{t.squad}</span> : null}</span>
```

4. Replace the Create button block with a name + squad mini-form:

```tsx
{q.trim() && !exact && (
  <div className="tp-createbox">
    <input className="nw-in" placeholder="Squad (optional, e.g. U12 Boys)" value={squad} onChange={(e) => setSquad(e.target.value)} />
    <button className="mt-add tp-create" onClick={() => onCreate(q.trim(), squad.trim())}>+ Create &quot;{q.trim()}{squad.trim() ? ` · ${squad.trim()}` : ""}&quot;</button>
  </div>
)}
```

5. Add CSS to `app/globals.css`: `.tp-squad{display:block; font-size:11px; color:var(--muted);} .tp-createbox{display:flex; flex-direction:column; gap:6px; margin-top:8px;}`.

- [ ] **Step 2: MatchTracker — pass squad through create**

In `components/MatchTracker.tsx`, find the `<TeamPicker ... onCreate={...}>` usages (grep `onCreate`) and the handler that calls `teamStore.findOrCreate`. Update the handler signature to `(name, squad) => ...` and pass `squad` into `findOrCreate({ name, sport, squad, ... })`. (There are two pickers — us + opponent; update both.)

- [ ] **Step 3: Build (MatchTracker is @ts-nocheck) + commit**

Run: `npx next build` → compiled.

```bash
git add components/TeamPicker.tsx components/MatchTracker.tsx app/globals.css
git commit -m "feat(teams): squad on team create in the wizard"
```

### Task 10: team-link snapshots squad onto the match + test

**Files:**
- Modify: `lib/team-link.ts`
- Test: `test/team-link.test.ts` (extend)

- [ ] **Step 1: Failing test**

Append to `test/team-link.test.ts` (mirror the existing `teamLinkPatch` test setup there):

```typescript
it("snapshots each team's squad onto the match", () => {
  const rec: any = { raw: "", usRoster: { formation: [], players: [] } };
  const usTeam: any = { id: "u", name: "Racoons", squad: "U12 Boys", roster: { formation: [], players: [] } };
  const oppTeam: any = { id: "o", name: "Wildebeests", squad: "Senior", roster: { formation: [], players: [] } };
  const patch = teamLinkPatch(rec, { usTeam, oppTeam, homeAway: "home" });
  expect(patch.usSquad).toBe("U12 Boys");
  expect(patch.oppSquad).toBe("Senior");
});
```

- [ ] **Step 2: Run to confirm fail** — FAIL (`usSquad` undefined).

- [ ] **Step 3: Implement** — in `teamLinkPatch`'s returned object, add:

```typescript
    usSquad: usTeam.squad || "",
    oppSquad: oppTeam.squad || "",
```

- [ ] **Step 4: Run tests + commit**

```bash
git add lib/team-link.ts test/team-link.test.ts
git commit -m "feat(teams): snapshot squad onto the match at link time"
```

---

## Phase 3 — duplicate a team

### Task 11: `teamStore.duplicate` + test

**Files:**
- Modify: `lib/team-store.ts`
- Test: `test/team-store-duplicate.test.ts` (pure-shape test of the copy builder)

- [ ] **Step 1: Extract a pure copy builder + failing test**

Add to `lib/match-sport.ts` a pure builder (testable without Supabase):

Create `test/team-store-duplicate.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { duplicateTeamRecord } from "@/lib/match-sport";

describe("duplicateTeamRecord", () => {
  const src: any = { id: "a", owner: "me", name: "Racoons", squad: "U11 Boys", sport: "hurling",
    color1: "#111", color2: "#222", is_public: true, listed: true,
    roster: { formation: [[1]], players: [{ num: 1, name: "Rick", role: "starting" }] } };
  it("copies roster+colours+sport+squad, names it (2), starts private, new id", () => {
    const d = duplicateTeamRecord(src, "newid");
    expect(d.id).toBe("newid");
    expect(d.name).toBe("Racoons (2)");
    expect(d.squad).toBe("U11 Boys");
    expect(d.sport).toBe("hurling");
    expect(d.color1).toBe("#111");
    expect(d.roster).toEqual(src.roster);
    expect(d.roster).not.toBe(src.roster); // deep clone
    expect(d.is_public).toBeFalsy();
  });
});
```

- [ ] **Step 2: Run to confirm fail** — FAIL (no `duplicateTeamRecord`).

- [ ] **Step 3: Implement `duplicateTeamRecord` in `lib/match-sport.ts`**

```typescript
import type { TeamRecord } from "@/lib/types";
// (TeamRecord is already imported in this file.)

// Build a private copy of a team for the "duplicate" action: same roster/colours/
// sport/squad, name suffixed " (2)" so the (sport, name, squad) identity is unique,
// a fresh id, never public. The caller persists it via the collision-safe set().
export function duplicateTeamRecord(src: TeamRecord, newId: string): TeamRecord {
  return {
    id: newId,
    owner: src.owner,
    name: `${src.name} (2)`,
    squad: src.squad || "",
    sport: src.sport,
    color1: src.color1,
    color2: src.color2,
    roster: JSON.parse(JSON.stringify(src.roster)),
    is_public: false,
    listed: true,
  };
}
```

- [ ] **Step 4: Add `teamStore.duplicate`**

In `lib/team-store.ts` (import `duplicateTeamRecord`):

```typescript
  async duplicate(src: TeamRecord): Promise<TeamRecord | null> {
    const copy = duplicateTeamRecord(src, mkId());
    const saved = await this.set(copy);            // collision-safe: bumps name again if needed
    return saved ? { ...copy, name: saved.name } : null;
  },
```

- [ ] **Step 5: Run tests + typecheck + commit**

```bash
git add lib/match-sport.ts lib/team-store.ts test/team-store-duplicate.test.ts
git commit -m "feat(teams): duplicate a team (private copy, name (2))"
```

### Task 12: Duplicate UI (TeamsList rows + TeamEditor)

**Files:**
- Modify: `components/TeamsList.tsx`
- Modify: `components/TeamEditor.tsx`

- [ ] **Step 1: TeamsList — pass userId to TeamEditor + a Duplicate action**

In `components/TeamsList.tsx`:
1. Pass `userId` to TeamEditor: `<TeamEditor initial={...} userId={userId} onDone={...} />`.
2. Add a duplicate handler and a small button on each of "Your teams" rows (the `tl-row`). Because the row's `onClick` opens the editor, render the button with `onClick={(e) => { e.stopPropagation(); dup(t); }}`:

```tsx
const dup = async (t: TeamRecord) => { const d = await teamStore.duplicate(t); await reload(); if (d) setEditing(d); };
```

   In the row JSX, before `{meta(t)}`:

```tsx
<button className="tl-dup" title="Duplicate" onClick={(e) => { e.stopPropagation(); dup(t); }}>⧉</button>
```

   Add CSS: `.tl-dup{background:none; border:none; cursor:pointer; font-size:15px; color:var(--muted); padding:2px 6px;}`.

- [ ] **Step 2: TeamEditor — accept userId prop + a Duplicate button**

In `components/TeamEditor.tsx`:
1. Props: `{ initial, userId, onDone }: { initial?: TeamRecord | null; userId: string; onDone: () => void }`.
2. For existing teams, add a Duplicate button near Done (only when `initial`):

```tsx
{initial && <button className="mt-add alt" onClick={async () => { await persist(); const d = await teamStore.duplicate({ ...initial, name, squad, color1, color2, sport: sport || undefined, roster }); if (d) onDone(); }}>⧉ Duplicate</button>}
```

- [ ] **Step 3: Build + commit**

Run: `npx next build` → compiled.

```bash
git add components/TeamsList.tsx components/TeamEditor.tsx
git commit -m "feat(teams): duplicate action in TeamsList + TeamEditor"
```

---

## Phase 4 — squad sub-line everywhere

### Task 13: matchRowView carries squad + test

**Files:**
- Modify: `lib/match-list.ts` (RowView + matchRowView)
- Test: `test/match-list.test.ts` (extend)

- [ ] **Step 1: Failing test**

Append to `test/match-list.test.ts`:

```typescript
it("maps usSquad/oppSquad to home/away by venue", () => {
  const rec: any = { raw: "", myTeam: "Racoons", opponent: "Wildebeests", homeAway: "home",
    usSquad: "U12 Boys", oppSquad: "Senior" };
  const v = matchRowView(rec);
  expect(v.homeSquad).toBe("U12 Boys");
  expect(v.awaySquad).toBe("Senior");
});
```

- [ ] **Step 2: Run to confirm fail** — FAIL (`homeSquad` undefined).

- [ ] **Step 3: Implement**

In `lib/match-list.ts`, add to `RowView`: `homeSquad: string; awaySquad: string;`. In `matchRowView`, before the return compute `const usSquad = rec.usSquad || ""; const oppSquad = rec.oppSquad || "";` and add to the returned object:

```typescript
    homeSquad: usIsHome ? usSquad : oppSquad,
    awaySquad: usIsHome ? oppSquad : usSquad,
```

- [ ] **Step 4: Run tests + commit**

```bash
git add lib/match-list.ts test/match-list.test.ts
git commit -m "feat(teams): squad sub-line in matchRowView"
```

### Task 14: MatchRow sub-line

**Files:**
- Modify: `components/MatchRow.tsx`, `app/globals.css`

- [ ] **Step 1: Render the squad under each team name**

In `components/MatchRow.tsx`, under each `ml-name` add a sub-line (home and away):

```tsx
<span className={"ml-name " + cls("home")}>{v.homeName}{v.homeSquad && <span className="ml-squad">{v.homeSquad}</span>}</span>
```
```tsx
<span className={"ml-name " + cls("away")}>{v.awayName}{v.awaySquad && <span className="ml-squad">{v.awaySquad}</span>}</span>
```

Add CSS: `.ml-squad{display:block; font-size:10px; font-weight:400; color:var(--muted); line-height:1;}`.

- [ ] **Step 2: Build + commit**

```bash
git add components/MatchRow.tsx app/globals.css
git commit -m "feat(teams): squad sub-line on match rows"
```

### Task 15: ScoreHeader sub-line (editor + public) + Model

**Files:**
- Modify: `components/ScoreHeader.tsx`, `app/globals.css`
- Modify: `lib/model.ts` (Model + buildModel: usSquad/oppSquad), `lib/types.ts` (Model interface)
- Modify: `components/PublicMatch.tsx`, `components/MatchTracker.tsx` (pass squads to ScoreHeader)

- [ ] **Step 1: ScoreHeader — optional squad props**

In `components/ScoreHeader.tsx`, add props `homeSquad?: string; awaySquad?: string;` and render under each name:

```tsx
<div className="sh-nm">{homeName}{homeSquad ? <span className="sh-squad">{homeSquad}</span> : null}</div>
```
```tsx
<div className="sh-nm">{awayName}{awaySquad ? <span className="sh-squad">{awaySquad}</span> : null}</div>
```

Add CSS: `.sh-squad{display:block; font-size:11px; font-weight:400; color:var(--muted);}`.

- [ ] **Step 2: Model carries the squads**

In `lib/types.ts` `Model` interface, add `usSquad?: string; oppSquad?: string;`. In `lib/model.ts` `buildModel` return, add `usSquad: r.usSquad || "", oppSquad: r.oppSquad || "",`.

- [ ] **Step 3: Pass squads from both consumers**

In `components/PublicMatch.tsx`, the `<ScoreHeader>` call: add `homeSquad={usIsHome ? m.usSquad : m.oppSquad} awaySquad={usIsHome ? m.oppSquad : m.usSquad}`.

In `components/MatchTracker.tsx`, find the editor `<ScoreHeader ...>` and pass `homeSquad`/`awaySquad` from the record's `usSquad`/`oppSquad` mapped by `header.homeAway` (mirror PublicMatch). (Record fields are in component state; if not yet held, read from `recordPayload()` — add `usSquad`/`oppSquad` to `recordPayload` and to the load in `applyRecord`/`setX` so they round-trip.)

- [ ] **Step 4: Build + tests + commit**

Run `npx next build` → compiled; `npm test` → pass.

```bash
git add components/ScoreHeader.tsx lib/model.ts lib/types.ts components/PublicMatch.tsx components/MatchTracker.tsx app/globals.css
git commit -m "feat(teams): squad sub-line in the score header (editor + public)"
```

### Task 16: Poster sub-line (buildInfographicSVG)

**Files:**
- Modify: `lib/infographic.ts`
- Modify: `components/MatchTracker.tsx` (doExport model: add usSquad/oppSquad)

- [ ] **Step 1: Render the squad under each team name in the poster header**

In `lib/infographic.ts` `buildInfographicSVG`, the header band currently puts team names at y=104. Add a sub-line beneath each when present:

```typescript
  if (m.usSquad) head.push(T(W * 0.27, 118, m.usSquad, 10, "#9fc2b3", { a: "middle" }));
  if (m.oppSquad) head.push(T(W * 0.73, 118, m.oppSquad, 10, "#9fc2b3", { a: "middle" }));
```

(Move the names up to y=100 if the sub-line feels cramped against the jersey/score; verify visually.)

- [ ] **Step 2: Feed the squads from the editor export**

In `components/MatchTracker.tsx` `doExport` model object, add `usSquad, oppSquad,` (from record state). (`PublicMatch`'s image already passes the full `m`, which now has the squads via Task 15's Model change.)

- [ ] **Step 3: Build + commit**

```bash
git add lib/infographic.ts components/MatchTracker.tsx
git commit -m "feat(teams): squad sub-line on the share-image poster"
```

### Task 17: TeamsList / LinkTeams / public team page sub-lines

**Files:**
- Modify: `components/TeamsList.tsx`, `components/LinkTeams.tsx`, `app/t/[id]/page.tsx` (+ its renderer)

- [ ] **Step 1: TeamsList rows**

In `components/TeamsList.tsx`, in both the "Your teams" `tl-row` and the public-feed `tl-row`, add the squad under the name:

```tsx
<span className="tl-name">{t.name}{t.squad ? <span className="tl-squad">{t.squad}</span> : null}</span>
```

Add CSS: `.tl-squad{display:block; font-size:11px; color:var(--muted);}`.

- [ ] **Step 2: LinkTeams picker**

In `components/LinkTeams.tsx`, wherever a team name renders in the picker list, append `{t.squad ? <span className="tp-squad">{t.squad}</span> : null}` (reuse the `.tp-squad` class from Task 9). Read the file first to find the exact row markup.

- [ ] **Step 3: Public team page**

In `app/t/[id]/page.tsx` (and its renderer component if separate — read it first), show the squad as a sub-line under the team name in the header, and include it in the `<title>` / description: `${t.name}${t.squad ? " · " + t.squad : ""}`.

- [ ] **Step 4: Build + commit**

Run `npx next build` → compiled.

```bash
git add components/TeamsList.tsx components/LinkTeams.tsx app/t/[id]/page.tsx
git commit -m "feat(teams): squad sub-line in teams list, link picker, public team page"
```

---

## Finalisation (after all tasks)

- [ ] Bump `APP_VERSION` in `lib/constants.ts` (next: **v66**) and update CLAUDE.md "Current: vN".
- [ ] `npm test` (all pass, SAMPLE finals hold) + `npx next build` (compiled).
- [ ] `rm -rf .next` then `npm run dev` for a live review of: the 3-way control on a match and a team; create a team with a squad in the wizard; duplicate a team (→ "(2)", private); squad sub-lines on the landing rows, score header, public match page, poster, teams list, public team page; Unlisted vs Listed actually hides/shows in both feeds.
- [ ] Confirm the user has run `docs/teams-squad-migration.sql` in Supabase.
- [ ] Merge `team-squads` → `main`, push (Vercel auto-deploys), return to `team-squads`.

## Self-review notes

- **Spec coverage:** 3-way control (T2–T5) ✓; squad in identity (T6–T9) ✓; collision-safe + duplicate name "(2)" (T7, T11) ✓; squad snapshot on match (T1, T10) ✓; duplicate action (T11–T12) ✓; sub-line everywhere — rows (T14), score header editor+public (T15), poster (T16), teams list/link/public team page (T17) ✓; migration (T1) ✓.
- **Type consistency:** `teamStore.set` now returns `{id,name}|null` — callers updated in T7 Step 5; `findOrCreate` gains `squad`; `onCreate` is `(name, squad)`; `RowView`/`Model` gain `homeSquad/awaySquad`/`usSquad/oppSquad`; `PrivacyLevel`/`levelToColumns` used consistently in T4/T5.
- **Known follow-the-anchor tasks:** T9 Step 2, T15 Step 3, T17 Steps 2–3 require reading the exact current markup before editing (MatchTracker ScoreHeader/onCreate, LinkTeams, public team page) — the change and target are specified; the executor confirms the anchor.
