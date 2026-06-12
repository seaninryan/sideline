# Admin Screen, Profiles Table & Self-Deciding Header Menu — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an admin role + admin screen (user list → a user's matches), backed by a new `profiles` table, and centralise the top-bar `⋯` menu into a single self-deciding helper — folding in the editor cleanups (editor realtime retires Resync, a one-time migration retires Link teams, Delete moves into the body) that this centralisation makes possible.

**Architecture:** Pure, unit-tested seams first (`buildHeaderMenu`, `aggregateUserStats`, `resolveMatchView` +isAdmin, `reconcileIncoming`, `linkExistingMatchPatch`), then wiring. The app talks to Supabase only via the anon key under RLS; a `profiles` table (populated by a signup trigger) plus a `security definer is_admin()` function gives admins read-all without RLS recursion. The menu becomes 100% helper-driven, so `AppHeader`'s `menuItems` injection prop is removed entirely.

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase (`@supabase/ssr`), Vitest. Node 20 (`nvm use 20`).

**Source spec:** `docs/superpowers/specs/2026-06-12-admin-screen-design.md`

---

## File Structure

**New:**
- `docs/admin-profiles-migration.sql` — one-time Supabase SQL (run manually).
- `lib/header-menu.ts` — `buildHeaderMenu` (pure nav decider) + `HeaderScreen`/`HeaderNavItem` types.
- `lib/admin.ts` — `aggregateUserStats` (pure) + `UserStat` type.
- `lib/viewer.client.ts` — `fetchIsAdmin` (thin client helper).
- `app/admin/page.tsx` — admin-gated server page → `<AdminUsers>`.
- `app/admin/users/[id]/page.tsx` — admin-gated server page → `<AdminUserMatches>`.
- `components/AdminUsers.tsx` — user list (client).
- `components/AdminUserMatches.tsx` — one user's matches via `<MatchRow>` (client).
- `test/header-menu.test.ts`, `test/admin.test.ts` — new suites.

**Modified:**
- `lib/types.ts` — add `Profile` type.
- `lib/match-view.ts` — `resolveMatchView` gains `isAdmin`.
- `lib/live-update.ts` — add `reconcileIncoming`.
- `lib/team-link.ts` — add `linkExistingMatchPatch`.
- `lib/store.ts` — add `linkUnlinkedMatches()`; call it in `loadAll()`.
- `components/AppHeader.tsx` — `screen`/`isAdmin` props; helper-driven menu; remove `menuItems`/`AhMenuItem`.
- `components/Landing.tsx`, `components/PublicMatch.tsx`, `components/TeamsList.tsx`, `components/TeamPage.tsx` — new header props; drop hand-rolled New/Teams.
- `components/MatchTracker.tsx` — Delete→body danger zone; editor realtime; remove Resync + Link-teams panel/nudge/state; header props.
- `app/page.tsx`, `app/teams/page.tsx` — fetch + pass `isAdmin`.
- `app/m/[id]/page.tsx` — admin lookup + override.
- `test/match-view.test.ts`, `test/live-update.test.ts`, `test/team-link.test.ts` — extend.
- `lib/constants.ts` — bump `APP_VERSION`.

Tasks are ordered so the app builds and `npm test` passes at **every commit**. Editor menu items are removed (Tasks 8–10) *before* the `menuItems` prop is deleted (Task 11).

---

## Task 1: Profile type + DB migration SQL

**Files:**
- Modify: `lib/types.ts`
- Create: `docs/admin-profiles-migration.sql`

- [ ] **Step 1: Add the `Profile` type**

In `lib/types.ts`, add after the `MatchRecord` interface (after line 39, the `}` closing `savedAt`):

```ts
export interface Profile {
  id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  is_admin: boolean;
  created_at: string;
}
```

- [ ] **Step 2: Write the migration SQL**

Create `docs/admin-profiles-migration.sql`:

```sql
-- Admin / profiles migration. Run ONCE in the Supabase SQL editor.

-- 1. profiles table (one row per signed-up user)
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  avatar_url text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

-- 2. signup trigger: copy email + Google metadata on each new auth user
create or replace function public.handle_new_user()
  returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (new.id, new.email,
          new.raw_user_meta_data->>'full_name',
          new.raw_user_meta_data->>'avatar_url')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 3. backfill existing users
insert into public.profiles (id, email, full_name, avatar_url, created_at)
select id, email,
       raw_user_meta_data->>'full_name',
       raw_user_meta_data->>'avatar_url',
       created_at
from auth.users
on conflict (id) do nothing;

-- 4. is_admin() helper (security definer → reads profiles bypassing RLS, no recursion)
create or replace function public.is_admin()
  returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and is_admin);
$$;

-- 5. RLS
alter table profiles enable row level security;
create policy profiles_self_read  on profiles for select using (id = auth.uid());
create policy profiles_admin_read on profiles for select using (public.is_admin());

-- admins can read every match (counts + opening another user's match)
create policy matches_admin_read on matches for select using (public.is_admin());

-- 6. make yourself admin (run once, after the table exists)
update profiles set is_admin = true where email = 'sean.r@edgescan.com';
```

- [ ] **Step 3: Commit**

```bash
git add lib/types.ts docs/admin-profiles-migration.sql
git commit -m "feat(admin): Profile type + profiles/is_admin Supabase migration SQL"
```

> **Note for the human (not a code step):** run `docs/admin-profiles-migration.sql` in the Supabase SQL editor before deploying. Until it runs, `fetchIsAdmin` returns `false` (graceful) and the Admin menu item simply never appears.

---

## Task 2: `buildHeaderMenu` (pure)

**Files:**
- Create: `lib/header-menu.ts`
- Test: `test/header-menu.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/header-menu.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildHeaderMenu } from "@/lib/header-menu";

const signedIn = { email: "a@b.com", isAdmin: false };

describe("buildHeaderMenu", () => {
  it("signed-out → no items", () => {
    expect(buildHeaderMenu({ screen: "landing", email: null, isAdmin: false })).toEqual([]);
  });

  it("landing (signed in) → Teams only (New is the primary there)", () => {
    expect(buildHeaderMenu({ screen: "landing", ...signedIn }).map((i) => i.label))
      .toEqual(["👥 Teams"]);
  });

  it("editor → New + Teams", () => {
    expect(buildHeaderMenu({ screen: "editor", ...signedIn }).map((i) => i.label))
      .toEqual(["＋ New", "👥 Teams"]);
  });

  it("teams screen → New only (Teams suppressed — already there)", () => {
    expect(buildHeaderMenu({ screen: "teams", ...signedIn }).map((i) => i.label))
      .toEqual([]);
  });

  it("admin sees Admin appended when isAdmin", () => {
    expect(buildHeaderMenu({ screen: "editor", email: "a@b.com", isAdmin: true }).map((i) => i.label))
      .toEqual(["＋ New", "👥 Teams", "🛠 Admin"]);
  });

  it("non-admin never sees Admin", () => {
    expect(buildHeaderMenu({ screen: "public", ...signedIn }).some((i) => i.label.includes("Admin")))
      .toBe(false);
  });

  it("admin screens suppress the Admin item (already there) but keep New/Teams", () => {
    expect(buildHeaderMenu({ screen: "admin", email: "a@b.com", isAdmin: true }).map((i) => i.label))
      .toEqual(["＋ New", "👥 Teams"]);
    expect(buildHeaderMenu({ screen: "admin-user", email: "a@b.com", isAdmin: true }).map((i) => i.label))
      .toEqual(["＋ New", "👥 Teams"]);
  });

  it("hrefs are correct", () => {
    const items = buildHeaderMenu({ screen: "editor", email: "a@b.com", isAdmin: true });
    expect(items).toEqual([
      { label: "＋ New", href: "/m/new" },
      { label: "👥 Teams", href: "/teams" },
      { label: "🛠 Admin", href: "/admin" },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/header-menu.test.ts`
Expected: FAIL — "Failed to resolve import @/lib/header-menu".

- [ ] **Step 3: Implement `lib/header-menu.ts`**

```ts
export type HeaderScreen =
  | "landing" | "editor" | "public" | "teams" | "team" | "admin" | "admin-user";

export type HeaderNavItem = { label: string; href: string };

// The common ⋯-menu navigation items, decided from the current screen + viewer.
// Screen-specific primary buttons (New on landing/teams, editor Share, etc.) are
// NOT here — they stay as the `primary` prop. Signed-out viewers get nothing.
export function buildHeaderMenu(args: {
  screen: HeaderScreen;
  email: string | null;
  isAdmin: boolean;
}): HeaderNavItem[] {
  const { screen, email, isAdmin } = args;
  if (!email) return [];
  const items: HeaderNavItem[] = [];

  // New — everywhere except where it's already the primary button.
  if (screen !== "landing" && screen !== "teams") items.push({ label: "＋ New", href: "/m/new" });

  // Teams — everywhere except the teams list itself.
  if (screen !== "teams") items.push({ label: "👥 Teams", href: "/teams" });

  // Admin — admins only, and not while already on an admin screen.
  if (isAdmin && screen !== "admin" && screen !== "admin-user") {
    items.push({ label: "🛠 Admin", href: "/admin" });
  }
  return items;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/header-menu.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add lib/header-menu.ts test/header-menu.test.ts
git commit -m "feat(header): buildHeaderMenu pure nav decider"
```

---

## Task 3: `aggregateUserStats` (pure)

**Files:**
- Create: `lib/admin.ts`
- Test: `test/admin.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/admin.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { aggregateUserStats } from "@/lib/admin";
import type { Profile } from "@/lib/types";

const p = (id: string, created_at: string): Profile =>
  ({ id, email: `${id}@x.com`, full_name: id, avatar_url: null, is_admin: false, created_at });

describe("aggregateUserStats", () => {
  const profiles = [p("alice", "2026-01-01"), p("bob", "2026-02-01")];
  const matches = [
    { owner: "alice", is_public: true, listed: true },
    { owner: "alice", is_public: true, listed: false },
    { owner: "alice", is_public: false, listed: true },
    { owner: "bob", is_public: false, listed: true },
  ];

  it("groups counts by owner", () => {
    const stats = aggregateUserStats(profiles, matches);
    const alice = stats.find((s) => s.profile.id === "alice")!;
    expect(alice.total).toBe(3);
    expect(alice.public).toBe(2);          // is_public
    expect(alice.listed).toBe(1);          // is_public && listed
  });

  it("profiles with no matches get zeros", () => {
    const stats = aggregateUserStats([p("carol", "2026-03-01")], []);
    expect(stats[0]).toMatchObject({ total: 0, public: 0, listed: 0 });
  });

  it("sorts newest signup first", () => {
    expect(aggregateUserStats(profiles, matches).map((s) => s.profile.id))
      .toEqual(["bob", "alice"]);
  });

  it("ignores match rows whose owner has no profile", () => {
    const stats = aggregateUserStats([p("alice", "2026-01-01")],
      [{ owner: "ghost", is_public: true, listed: true }]);
    expect(stats).toHaveLength(1);
    expect(stats[0].total).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/admin.test.ts`
Expected: FAIL — cannot resolve `@/lib/admin`.

- [ ] **Step 3: Implement `lib/admin.ts`**

```ts
import type { Profile } from "@/lib/types";

export type UserStat = {
  profile: Profile;
  total: number;
  public: number;   // is_public
  listed: number;   // is_public && listed
};

type MatchLite = { owner: string; is_public: boolean; listed: boolean };

// Per-user match counts, joined onto each profile. Match rows whose owner has no
// profile are ignored. Result is sorted newest-signup-first (created_at desc).
export function aggregateUserStats(profiles: Profile[], matches: MatchLite[]): UserStat[] {
  const byOwner = new Map<string, { total: number; public: number; listed: number }>();
  for (const p of profiles) byOwner.set(p.id, { total: 0, public: 0, listed: 0 });
  for (const m of matches) {
    const agg = byOwner.get(m.owner);
    if (!agg) continue;
    agg.total += 1;
    if (m.is_public) agg.public += 1;
    if (m.is_public && m.listed) agg.listed += 1;
  }
  return profiles
    .map((profile) => ({ profile, ...byOwner.get(profile.id)! }))
    .sort((a, b) => (a.profile.created_at < b.profile.created_at ? 1 : -1));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/admin.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/admin.ts test/admin.test.ts
git commit -m "feat(admin): aggregateUserStats pure per-user counts"
```

---

## Task 4: `resolveMatchView` gains `isAdmin`

**Files:**
- Modify: `lib/match-view.ts`
- Test: `test/match-view.test.ts`

- [ ] **Step 1: Update the existing tests + add admin cases**

In `test/match-view.test.ts`, every existing `resolveMatchView({...})` call is missing the new `isAdmin` field. Add `isAdmin: false` to each of the 5 existing calls, then add these two cases inside the `describe` block:

```ts
  it("admin non-owner of a private match → read-only public view", () => {
    expect(resolveMatchView({ found: true, isOwner: false, isPublic: false, isAdmin: true })).toBe("public");
  });
  it("owner branch still wins over admin", () => {
    expect(resolveMatchView({ found: true, isOwner: true, isPublic: false, isAdmin: true })).toBe("editor");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/match-view.test.ts`
Expected: FAIL — TS error (missing `isAdmin`) and/or the new admin case returns `notfound`.

- [ ] **Step 3: Update `lib/match-view.ts`**

Replace the function body (lines 7–12) with:

```ts
export function resolveMatchView(args: { found: boolean; isOwner: boolean; isPublic: boolean; isAdmin: boolean }): MatchViewKind {
  if (!args.found) return "notfound";
  if (args.isOwner) return "editor";
  if (args.isPublic) return "public";
  if (args.isAdmin) return "public";   // admin override: read-only view of a private match
  return "notfound";
}
```

Also update the doc comment above it to note the admin override returns a read-only public view.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/match-view.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/match-view.ts test/match-view.test.ts
git commit -m "feat(admin): resolveMatchView isAdmin override (read-only view of any match)"
```

---

## Task 5: `reconcileIncoming` (pure)

**Files:**
- Modify: `lib/live-update.ts`
- Test: `test/live-update.test.ts`

- [ ] **Step 1: Write the failing test**

Create or extend `test/live-update.test.ts`. Add:

```ts
import { describe, it, expect } from "vitest";
import { reconcileIncoming } from "@/lib/live-update";

describe("reconcileIncoming", () => {
  const base = { dirty: false, localSavedAt: 100, incomingSavedAt: 200 } as const;

  it("DELETE → deleted", () => {
    expect(reconcileIncoming({ ...base, event: "DELETE" })).toBe("deleted");
  });
  it("our own echo (incoming <= local) → ignore", () => {
    expect(reconcileIncoming({ event: "UPDATE", dirty: false, localSavedAt: 200, incomingSavedAt: 200 })).toBe("ignore");
    expect(reconcileIncoming({ event: "UPDATE", dirty: false, localSavedAt: 200, incomingSavedAt: 150 })).toBe("ignore");
  });
  it("newer remote update, no local edits → apply", () => {
    expect(reconcileIncoming({ event: "UPDATE", dirty: false, localSavedAt: 100, incomingSavedAt: 200 })).toBe("apply");
  });
  it("newer remote update with unsaved local edits → conflict", () => {
    expect(reconcileIncoming({ event: "UPDATE", dirty: true, localSavedAt: 100, incomingSavedAt: 200 })).toBe("conflict");
  });
  it("DELETE wins even when dirty", () => {
    expect(reconcileIncoming({ event: "DELETE", dirty: true, localSavedAt: 100, incomingSavedAt: 0 })).toBe("deleted");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/live-update.test.ts`
Expected: FAIL — `reconcileIncoming` is not exported.

- [ ] **Step 3: Implement in `lib/live-update.ts`**

Append to `lib/live-update.ts` (keep the existing `scoreChanged`):

```ts
// What the editor should do with a Realtime payload for the open match. The
// editor both reads and writes the row, so it must ignore the echo of its own
// saves (incoming savedAt <= the savedAt it last wrote) and never silently
// clobber unsaved local edits (→ "conflict", surfaced as a Load-latest banner).
export type Incoming = "ignore" | "apply" | "conflict" | "deleted";
export function reconcileIncoming(args: {
  event: "UPDATE" | "DELETE";
  dirty: boolean;
  localSavedAt: number;
  incomingSavedAt: number;
}): Incoming {
  if (args.event === "DELETE") return "deleted";
  if (args.incomingSavedAt <= args.localSavedAt) return "ignore"; // our own echo / stale
  return args.dirty ? "conflict" : "apply";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/live-update.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/live-update.ts test/live-update.test.ts
git commit -m "feat(editor): reconcileIncoming pure realtime decision"
```

---

## Task 6: `linkExistingMatchPatch` (pure)

**Files:**
- Modify: `lib/team-link.ts`
- Test: `test/team-link.test.ts`

- [ ] **Step 1: Write the failing test**

In `test/team-link.test.ts`, add a new describe block (reuse the existing `us`/`opp` `TeamRecord` fixtures already defined in that file):

```ts
import { linkExistingMatchPatch } from "@/lib/team-link";

describe("linkExistingMatchPatch", () => {
  it("sets team ids by homeAway and seeds both rosters when absent", () => {
    const rec = { raw: "" } as MatchRecord;
    const patch = linkExistingMatchPatch(rec, { usTeam: us, oppTeam: opp, homeAway: "home" });
    expect(patch.homeTeamId).toBe(us.id);
    expect(patch.awayTeamId).toBe(opp.id);
    expect(patch.usRoster).toEqual(us.roster);
    expect(patch.oppRoster).toEqual(opp.roster);
  });

  it("away: us is the away id", () => {
    const patch = linkExistingMatchPatch({ raw: "" } as MatchRecord, { usTeam: us, oppTeam: opp, homeAway: "away" });
    expect(patch.homeTeamId).toBe(opp.id);
    expect(patch.awayTeamId).toBe(us.id);
  });

  it("never clobbers existing rosters, names, or colours", () => {
    const rec = {
      raw: "", myTeam: "Custom Us", opponent: "Custom Them",
      colorUs: "#111", colorThem: "#222",
      usRoster: { formation: [[9]], players: [{ num: 9, name: "Mine", role: "starting" }] },
      oppRoster: { formation: [[7]], players: [{ num: 7, name: "Theirs", role: "starting" }] },
    } as MatchRecord;
    const patch = linkExistingMatchPatch(rec, { usTeam: us, oppTeam: opp, homeAway: "home" });
    expect(patch.usRoster).toBeUndefined();   // present already → not in patch
    expect(patch.oppRoster).toBeUndefined();
    expect((patch as any).myTeam).toBeUndefined();
    expect((patch as any).opponent).toBeUndefined();
    expect((patch as any).colorUs).toBeUndefined();
  });

  it("seeds squads only when blank", () => {
    const withSquad = { ...us, squad: "Senior" };
    const patch = linkExistingMatchPatch({ raw: "" } as MatchRecord, { usTeam: withSquad, oppTeam: opp, homeAway: "home" });
    expect(patch.usSquad).toBe("Senior");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/team-link.test.ts`
Expected: FAIL — `linkExistingMatchPatch` not exported.

- [ ] **Step 3: Implement in `lib/team-link.ts`**

Add after `teamLinkPatch` (after line 42). Reuse the existing `clone` helper at the top of the file:

```ts
// Conservative patch for migrating an EXISTING unlinked match: set the team ids
// and seed any MISSING rosters/squads, but never overwrite names, colours, or
// rosters the user already has. (teamLinkPatch is the new-match variant and DOES
// overwrite those — don't use it for migration.) Only defined keys are returned,
// so absent fields stay untouched on store.set merge.
export function linkExistingMatchPatch(
  record: MatchRecord,
  { usTeam, oppTeam, homeAway }: { usTeam: TeamRecord; oppTeam: TeamRecord; homeAway: "home" | "away" },
): Partial<MatchRecord> {
  const patch: Partial<MatchRecord> = {
    homeTeamId: homeAway === "home" ? usTeam.id : oppTeam.id,
    awayTeamId: homeAway === "home" ? oppTeam.id : usTeam.id,
  };
  if (!(record.usRoster && record.usRoster.formation.length)) patch.usRoster = clone(usTeam.roster);
  if (!(record.oppRoster && record.oppRoster.formation.length)) patch.oppRoster = clone(oppTeam.roster);
  if (!record.usSquad && usTeam.squad) patch.usSquad = usTeam.squad;
  if (!record.oppSquad && oppTeam.squad) patch.oppSquad = oppTeam.squad;
  return patch;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/team-link.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/team-link.ts test/team-link.test.ts
git commit -m "feat(editor): linkExistingMatchPatch — conservative link patch for migration"
```

---

## Task 7: `fetchIsAdmin` client helper

**Files:**
- Create: `lib/viewer.client.ts`

No unit test (it's a thin Supabase I/O wrapper; verified via build + the screens that use it).

- [ ] **Step 1: Implement `lib/viewer.client.ts`**

```ts
import type { SupabaseClient } from "@supabase/supabase-js";

// Whether the signed-in user is an admin. Reads their own profile row (RLS
// self-read). Swallows any error (table/column absent before the migration runs,
// or signed out) → false, so the menu degrades gracefully.
export async function fetchIsAdmin(sb: SupabaseClient, userId: string | null): Promise<boolean> {
  if (!userId) return false;
  try {
    const { data } = await sb.from("profiles").select("is_admin").eq("id", userId).maybeSingle();
    return !!data?.is_admin;
  } catch {
    return false;
  }
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no new errors from `lib/viewer.client.ts`.

- [ ] **Step 3: Commit**

```bash
git add lib/viewer.client.ts
git commit -m "feat(admin): fetchIsAdmin client helper (graceful when profiles absent)"
```

---

## Task 8: Editor — move Delete into a body Danger zone

**Files:**
- Modify: `components/MatchTracker.tsx`

`MatchTracker` carries `// @ts-nocheck`; verification is `npm test` (existing suite stays green) + `npm run build` + a manual check.

- [ ] **Step 1: Remove the Delete entry from the editor menu**

In `components/MatchTracker.tsx`, in the `menuItems={[...]}` array (around lines 792–806), delete the entire Delete object (the last entry, from `{ label: confirmDel ? ... ` through its closing `},`). Leave New, Teams, Link teams, Resync in place for now.

- [ ] **Step 2: Add a Danger zone at the bottom of the editor body**

Find where the editor body (the non-game, non-wizard view) ends — the closing of the main content just before the trailing modals/`</div>`. Add, rendered only in the normal editor view (guard with the same `!gm && !nw` condition the body uses; `curId` ensures a saved match):

```tsx
{!gm && !nw && curId && (
  <section className="mt-danger">
    <h3 className="mt-h">Danger</h3>
    <button
      className={"mt-add" + (confirmDel ? " danger" : "")}
      onClick={() => {
        if (!confirmDel) { setConfirmDel(true); setTimeout(() => setConfirmDel(false), 3500); return; }
        setConfirmDel(false); doDelete();
      }}
    >{confirmDel ? "Tap again to delete this match" : "🗑 Delete match"}</button>
  </section>
)}
```

(`confirmDel`, `setConfirmDel`, and `doDelete` already exist — only their call site moves.)

- [ ] **Step 3: Add minimal styling**

In `app/globals.css`, add:

```css
.mt-danger { margin-top: 32px; padding-top: 16px; border-top: 1px solid #3a2222; }
.mt-danger .mt-add.danger { background: #c0392b; color: #fff; }
```

- [ ] **Step 4: Verify**

Run: `npm test` → expected: all existing tests pass (count unchanged from before this plan + the new suites).
Run: `npm run build` → expected: success.
Manual: open a saved match → Delete is gone from `⋯`, a Danger section sits at the bottom; first tap arms ("Tap again…"), second tap deletes and routes to `/`; arming auto-clears after 3.5s.

- [ ] **Step 5: Commit**

```bash
git add components/MatchTracker.tsx app/globals.css
git commit -m "feat(editor): move Delete from menu to a body Danger zone"
```

---

## Task 9: Editor — realtime subscription, remove Resync

**Files:**
- Modify: `components/MatchTracker.tsx`

- [ ] **Step 1: Extract record-application from `doLoad`**

`doLoad` (lines 310–323) fetches `store.get(id)` then sets state from the record. Refactor so the field-setting body is reusable by the realtime path. Add an `applyRecord` function and call it from `doLoad`:

```tsx
const applyRecord = (d) => {
  setRaw(d.raw); setMyTeam(d.myTeam || "My Team"); setScoringMode(d.scoringMode || "gaa");
  setAutoMode(d.autoMode !== undefined ? d.autoMode : true);
  setSport(d.sport || "");
  setColorUs(d.colorUs || "#f5c518"); setColorUs2(d.colorUs2 || "#1f7a4d");
  setColorThem(d.colorThem || "#c0392b"); setColorThem2(d.colorThem2 || "#2c5fa8");
  setNameDisplay(d.nameDisplay || "full");
  setLabel(d.label || ""); setHomeAway(d.homeAway || "away"); setOpponent(d.opponent || "");
  setUsRoster(d.usRoster || null); setLegacyRaw(d.legacyRaw);
  setHomeTeamId(d.homeTeamId || null); setAwayTeamId(d.awayTeamId || null); setOppRoster(d.oppRoster || null);
  setUsSquad(d.usSquad || ""); setOppSquad(d.oppSquad || "");
  setMatchDate(d.date || d.matchDate || toLocalInput(new Date()));
};
const doLoad = async (key) => {
  const id = key.replace(/^match:/, "");
  const d = await store.get(id);
  if (!d) return;
  applyRecord(d); setCurId(id);
};
```

- [ ] **Step 2: Add the realtime subscription + conflict banner state**

Near the other `useState`s, add:

```tsx
const [remoteConflict, setRemoteConflict] = useState(false);
```

`dirty` is React state that changes on every edit. Reading it directly in the
subscription effect would force a teardown+resubscribe per keystroke, so mirror
it into a ref the effect reads live, and depend the effect only on `curId`. Add
the ref (it updates every render):

```tsx
const dirtyRef = useRef(dirty);
dirtyRef.current = dirty;
```

Add a `useEffect` (place it after `doLoad`/`applyRecord` are defined). Import `reconcileIncoming` at the top: `import { reconcileIncoming } from "@/lib/live-update";`

```tsx
// Live-sync the open match across devices. Replaces the old manual Resync.
useEffect(() => {
  if (!curId) return;
  const apply = (row, event) => {
    const incoming = row?.data;
    const verdict = reconcileIncoming({
      event,
      dirty: dirtyRef.current,
      localSavedAt: (cache[curId]?.savedAt) || 0,
      incomingSavedAt: (incoming?.savedAt) || 0,
    });
    if (verdict === "deleted") { router.push("/"); return; }
    if (verdict === "ignore") return;
    if (verdict === "conflict") { setRemoteConflict(true); return; }
    // "apply": adopt the remote record (also refresh the cache mirror)
    if (incoming) { cache[curId] = incoming; setBlkEdit(null); setBlkIns(null); setLineupEdit(null); applyRecord(incoming); }
  };
  const ch = sb
    .channel(`editor:${curId}`)
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "matches", filter: `id=eq.${curId}` },
        (payload) => apply(payload.new, "UPDATE"))
    .on("postgres_changes", { event: "DELETE", schema: "public", table: "matches", filter: `id=eq.${curId}` },
        () => apply(null, "DELETE"))
    .subscribe();
  return () => { sb.removeChannel(ch); };
}, [curId]);
```

- [ ] **Step 3: Render the conflict banner**

Just below the `<AppHeader>` in the editor view, add:

```tsx
{remoteConflict && (
  <div className="mt-warn">
    Updated on another device.
    <button className="mt-add alt" style={{ marginLeft: 8 }} onClick={doResyncLatest}>Load latest</button>
  </div>
)}
```

Add the small loader it calls (re-pulls just this row, bypassing the dirty guard, and adopts it):

```tsx
const doResyncLatest = async () => {
  const { data } = await sb.from("matches").select("data").eq("id", curId).maybeSingle();
  if (data?.data) { cache[curId] = data.data; setBlkEdit(null); setBlkIns(null); setLineupEdit(null); applyRecord(data.data); }
  setRemoteConflict(false);
};
```

- [ ] **Step 4: Remove Resync**

Delete the `doResync` function (lines 298–309) and the `{ label: "🔄 Resync", onClick: doResync },` entry from `menuItems`.

- [ ] **Step 5: Verify**

Run: `npm test` → all pass.
Run: `npm run build` → success.
Manual (two browsers, same account, same match open): edit + let it auto-save in window A → window B (no local edits) updates within a few seconds; make an unsaved edit in window B first, then save in A → window B shows "Updated on another device · Load latest" and only updates when clicked. Delete in A → B routes to `/`. No echo loop (your own saves don't re-trigger an apply).

- [ ] **Step 6: Commit**

```bash
git add components/MatchTracker.tsx
git commit -m "feat(editor): realtime cross-device sync; remove manual Resync"
```

---

## Task 10: Editor — link migration, remove Link teams

**Files:**
- Modify: `lib/store.ts`, `components/MatchTracker.tsx`

- [ ] **Step 1: Add `linkUnlinkedMatches` to `lib/store.ts`**

At the top of `lib/store.ts`, add imports:

```ts
import { teamStore } from "@/lib/team-store";
import { linkExistingMatchPatch } from "@/lib/team-link";
```

Add this exported function (after `loadAll`):

```ts
// One-time, idempotent: link every cached match that has no team links yet to
// its (sport, name) teams (find-or-create), seeding only missing rosters. Skips
// already-linked matches and those with no derivable opponent, so it's a no-op
// once complete. Resilient: one failure must not abort the rest.
export async function linkUnlinkedMatches(userId: string | null) {
  if (!userId) return;
  const ids = Object.keys(cache).filter((id) => {
    const d = cache[id];
    return d && !d.homeTeamId && !d.awayTeamId && (d.opponent || "").trim() && (d.myTeam || "").trim();
  });
  await Promise.allSettled(ids.map(async (id) => {
    const d = cache[id];
    const sport = d.sport || "";
    const usTeam = await teamStore.findOrCreate(userId, { name: d.myTeam!, sport });
    const oppTeam = await teamStore.findOrCreate(userId, { name: d.opponent!, sport });
    if (!usTeam || !oppTeam) return;
    const patch = linkExistingMatchPatch(d, { usTeam, oppTeam, homeAway: d.homeAway || "away" });
    await store.set(id, { ...d, ...patch });
  }));
}
```

- [ ] **Step 2: Run the migration after load**

In `components/EditorApp.tsx`, import it and run it after `loadAll()` resolves (non-blocking is fine, but awaiting keeps it simple):

```tsx
import { loadAll, linkUnlinkedMatches } from "@/lib/store";
import { createClient } from "@/lib/supabase/client";
// ...
useEffect(() => {
  loadAll()
    .then(async () => {
      try {
        const { data } = await createClient().auth.getUser();
        await linkUnlinkedMatches(data.user?.id ?? null);
      } catch {}
      setPhase("ready");
    })
    .catch(() => setPhase("error"));
}, []);
```

- [ ] **Step 3: Remove the Link-teams affordances from `MatchTracker`**

- Delete the `{ label: "🤝 Link teams", onClick: () => { setShare(false); setLink((o) => !o); } },` menu entry.
- Delete the "Link teams?" nudge effect (lines 287–296, the `linkNudged` ref + its two `useEffect`s).
- Delete the `const [link, setLink] = useState(false);` state (line 195).
- Find and delete the Link-teams panel render block (search for `onClose={() => setLink(false)}` near line 852 — remove that whole `{link && (...)}` JSX block and any now-unused `<LinkTeams …>`/import).

- [ ] **Step 4: Verify**

Run: `npm test` → all pass.
Run: `npm run build` → success (watch for unused-import errors; remove any orphaned import for the link panel component).
Manual: with the migration run once, open a previously-unlinked match → no "Link teams?" tip appears, `⋯` has no Link teams item, and the match now shows its opponent lineup (teams were linked). A second app load does nothing further (idempotent).

- [ ] **Step 5: Commit**

```bash
git add lib/store.ts components/EditorApp.tsx components/MatchTracker.tsx
git commit -m "feat(editor): one-time link migration; remove legacy Link-teams panel/nudge"
```

---

## Task 11: `AppHeader` self-deciding menu + all callers + server isAdmin

**Files:**
- Modify: `components/AppHeader.tsx`, `components/Landing.tsx`, `components/PublicMatch.tsx`, `components/TeamsList.tsx`, `components/TeamPage.tsx`, `components/MatchTracker.tsx`, `app/page.tsx`, `app/teams/page.tsx`

This task changes the `AppHeader` signature, so all callers update in the same commit to keep the build green.

- [ ] **Step 1: Rewrite `AppHeader` to be helper-driven**

In `components/AppHeader.tsx`:
- Add imports: `import { useRouter } from "next/navigation";` and `import { buildHeaderMenu, type HeaderScreen } from "@/lib/header-menu";`
- Remove the `AhMenuItem` type export and the `menuItems` prop.
- New props: add `screen: HeaderScreen;` (required) and `isAdmin?: boolean;` (default `false`); keep `email`, `onSignIn`, `onSignOut`, `backHref`, `primary`.
- Inside the component: `const router = useRouter();` and `const navItems = buildHeaderMenu({ screen, email, isAdmin });`
- `const hasMenu = navItems.length > 0 || !!email;`
- Replace the menu `<div className="ah-menu" role="menu">` contents: render nav items, then the account block:

```tsx
<div className="ah-menu" role="menu">
  {navItems.map((it) => (
    <button key={it.href} role="menuitem" className="ah-menu-item"
      onClick={() => { setOpen(false); router.push(it.href); }}>{it.label}</button>
  ))}
  {email && (
    <>
      {navItems.length > 0 && <div className="ah-menu-div" />}
      <div className="ah-menu-acct">{email}</div>
      <button role="menuitem" className="ah-menu-item"
        onClick={() => { setOpen(false); onSignOut && onSignOut(); }}>Sign out</button>
    </>
  )}
</div>
```

Update the prop destructuring + type block at the top of the function accordingly (drop `menuItems`, add `screen`, `isAdmin = false`).

- [ ] **Step 2: Update `Landing`**

`components/Landing.tsx` currently: `menuItems={email ? [{ label: "👥 Teams", ... }] : []}`. The `Landing` component receives `userId`/`email` from `app/page.tsx`; add an `isAdmin` prop to `Landing`'s props and thread it. Replace the `<AppHeader …>` props:

```tsx
<AppHeader
  email={email}
  onSignIn={onSignIn}
  onSignOut={onSignOut}
  screen="landing"
  isAdmin={isAdmin}
  primary={email ? <button className="mt-btn solid" onClick={() => router.push("/m/new")}>＋ New</button> : null}
/>
```

Add `isAdmin = false` to `Landing`'s destructured props and its type.

- [ ] **Step 3: Update `app/page.tsx` to fetch + pass `isAdmin`**

```tsx
import { createClient } from "@/lib/supabase/server";
import Landing from "@/components/Landing";

export default async function Home() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  let isAdmin = false;
  if (user) {
    const { data: me } = await supabase.from("profiles").select("is_admin").eq("id", user.id).maybeSingle();
    isAdmin = !!me?.is_admin;
  }
  return <Landing userId={user?.id ?? null} email={user?.email ?? null} isAdmin={isAdmin} />;
}
```

- [ ] **Step 4: Update `TeamsList` + `app/teams/page.tsx`**

`app/teams/page.tsx`: after the `redirect` guard, fetch `is_admin` and pass it:

```tsx
  if (!data.user) redirect("/");
  const { data: me } = await supabase.from("profiles").select("is_admin").eq("id", data.user.id).maybeSingle();
  return <TeamsList userId={data.user.id} email={data.user.email ?? null} isAdmin={!!me?.is_admin} />;
```

`components/TeamsList.tsx`: add `isAdmin = false` to props + type; on its `<AppHeader>` add `screen="teams"` and `isAdmin={isAdmin}` (it has no `menuItems` today, so nothing to remove; keep the `primary` New button).

- [ ] **Step 5: Update `PublicMatch`**

`components/PublicMatch.tsx` fetches `email` client-side (line 62). Add `isAdmin` state + fetch, and update the header. Import: `import { fetchIsAdmin } from "@/lib/viewer.client";`

```tsx
const [isAdmin, setIsAdmin] = useState(false);
React.useEffect(() => {
  sb.auth.getUser().then(({ data }) => {
    setEmail(data.user?.email ?? null);
    fetchIsAdmin(sb, data.user?.id ?? null).then(setIsAdmin);
  });
}, []);
```

On the `<AppHeader>`: remove `menuItems={…}`, add `screen="public"` and `isAdmin={isAdmin}`.

- [ ] **Step 6: Update `TeamPage`**

`components/TeamPage.tsx` (line 20 fetches email): add the same `isAdmin` state + `fetchIsAdmin`. On its `<AppHeader>`: remove `menuItems={…}`, add `screen="team"` and `isAdmin={isAdmin}`.

- [ ] **Step 7: Update `MatchTracker`**

`components/MatchTracker.tsx`:
- Line 164 already fetches `userEmail`/`userUid`. Add `isAdmin` state and fetch it: `import { fetchIsAdmin } from "@/lib/viewer.client";` then in that effect, after setting uid, `fetchIsAdmin(sb, data.user?.id ?? null).then(setUserIsAdmin)` with `const [userIsAdmin, setUserIsAdmin] = useState(false);`.
- On the main `<AppHeader>` (the `!nw` one, ~line 780): remove the entire `menuItems={[…]}` array (now just New + Teams remain after Tasks 8–10 — both are nav, so the helper supplies them). Add `screen="editor"` and `isAdmin={userIsAdmin}`.
- On the wizard `<AppHeader>` (the `nw` one, ~line 810): add `screen="editor"` (no `isAdmin` needed, defaults false; menu stays minimal).

- [ ] **Step 8: Verify**

Run: `npm test` → all pass.
Run: `npm run build` → success. Grep to confirm the prop is fully gone: `grep -rn "menuItems\|AhMenuItem" components app` → expected: no matches.
Manual: on every screen (landing, editor, public match, teams, team, while signed in) the `⋯` menu shows the right nav (New where applicable, Teams except on /teams) + account block; as an admin, "🛠 Admin" appears everywhere except admin screens; signed out, no nav items.

- [ ] **Step 9: Commit**

```bash
git add components/AppHeader.tsx components/Landing.tsx components/PublicMatch.tsx components/TeamsList.tsx components/TeamPage.tsx components/MatchTracker.tsx app/page.tsx app/teams/page.tsx
git commit -m "feat(header): self-deciding ⋯ menu via buildHeaderMenu; remove menuItems prop; thread isAdmin"
```

---

## Task 12: Admin pages

**Files:**
- Create: `app/admin/page.tsx`, `components/AdminUsers.tsx`, `app/admin/users/[id]/page.tsx`, `components/AdminUserMatches.tsx`
- Modify: `app/globals.css` (small list styling)

- [ ] **Step 1: `app/admin/page.tsx` (server, gated)**

```tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { aggregateUserStats } from "@/lib/admin";
import type { Profile } from "@/lib/types";
import AdminUsers from "@/components/AdminUsers";

export default async function AdminPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/");
  const { data: me } = await supabase.from("profiles").select("is_admin").eq("id", auth.user.id).maybeSingle();
  if (!me?.is_admin) redirect("/");

  const { data: profiles } = await supabase
    .from("profiles").select("id,email,full_name,avatar_url,is_admin,created_at");
  const { data: matches } = await supabase.from("matches").select("owner,is_public,listed");
  const stats = aggregateUserStats((profiles as Profile[]) ?? [], (matches as any[]) ?? []);
  return <AdminUsers stats={stats} email={auth.user.email ?? null} />;
}
```

- [ ] **Step 2: `components/AdminUsers.tsx` (client)**

```tsx
"use client";
import React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import AppHeader from "@/components/AppHeader";
import { relativeDate } from "@/lib/match-list";
import type { UserStat } from "@/lib/admin";

export default function AdminUsers({ stats, email }: { stats: UserStat[]; email: string | null }) {
  const sb = React.useMemo(() => createClient(), []);
  const router = useRouter();
  const now = Date.now();
  return (
    <div className="mt-root">
      <AppHeader email={email} screen="admin" isAdmin backHref="/"
        onSignOut={async () => { await sb.auth.signOut(); router.push("/"); }} />
      <div className="ml-page">
        <h2 className="mt-h">Users ({stats.length})</h2>
        <div className="adm-list">
          {stats.map((s) => (
            <Link key={s.profile.id} className="adm-row" href={`/admin/users/${s.profile.id}`}>
              {s.profile.avatar_url
                ? <img className="adm-av" src={s.profile.avatar_url} alt="" />
                : <span className="adm-av adm-av-ph">{(s.profile.full_name || s.profile.email || "?").slice(0, 1).toUpperCase()}</span>}
              <span className="adm-id">
                <strong>{s.profile.full_name || "—"}</strong>
                <span className="adm-email">{s.profile.email}</span>
              </span>
              <span className="adm-meta">
                <span>{relativeDate(s.profile.created_at, now)}</span>
                <span>{s.total} matches · {s.public} public · {s.listed} listed</span>
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: `app/admin/users/[id]/page.tsx` (server, gated)**

```tsx
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile, MatchRow } from "@/lib/types";
import AdminUserMatches from "@/components/AdminUserMatches";

export default async function AdminUserPage({ params }: { params: { id: string } }) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/");
  const { data: me } = await supabase.from("profiles").select("is_admin").eq("id", auth.user.id).maybeSingle();
  if (!me?.is_admin) redirect("/");

  const { data: profile } = await supabase
    .from("profiles").select("id,email,full_name,avatar_url,is_admin,created_at").eq("id", params.id).maybeSingle();
  if (!profile) notFound();
  const { data: rows } = await supabase
    .from("matches").select("id,data,is_public,short_code").eq("owner", params.id).order("updated_at", { ascending: false });

  return <AdminUserMatches profile={profile as Profile} matches={(rows as MatchRow[]) ?? []} email={auth.user.email ?? null} />;
}
```

- [ ] **Step 4: `components/AdminUserMatches.tsx` (client, reuses `<MatchRow>`)**

```tsx
"use client";
import React from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import AppHeader from "@/components/AppHeader";
import MatchRow from "@/components/MatchRow";
import { relativeDate } from "@/lib/match-list";
import type { Profile, MatchRow as Row } from "@/lib/types";

export default function AdminUserMatches({ profile, matches, email }: { profile: Profile; matches: Row[]; email: string | null }) {
  const sb = React.useMemo(() => createClient(), []);
  const router = useRouter();
  const now = Date.now();
  return (
    <div className="mt-root">
      <AppHeader email={email} screen="admin-user" isAdmin backHref="/admin"
        onSignOut={async () => { await sb.auth.signOut(); router.push("/"); }} />
      <div className="ml-page">
        <h2 className="mt-h">{profile.full_name || profile.email} · {matches.length} matches</h2>
        {matches.map((r) => (
          <MatchRow key={r.id} record={r.data}
            href={`/m/${r.short_code || r.id}`}
            date={relativeDate(r.data.matchDate || r.data.date, now)}
            privacy={r.is_public ? "public" : "private"} />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Add list styling to `app/globals.css`**

```css
.adm-list { display: flex; flex-direction: column; gap: 8px; margin-top: 12px; }
.adm-row { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 10px;
  background: rgba(255,255,255,.04); text-decoration: none; color: inherit; }
.adm-av { width: 36px; height: 36px; border-radius: 50%; object-fit: cover; flex: none; }
.adm-av-ph { display: grid; place-items: center; background: #1f7a4d; color: #fff; font-weight: 700; }
.adm-id { display: flex; flex-direction: column; min-width: 0; flex: 1; }
.adm-email { color: #b8b0a0; font-size: 13px; overflow: hidden; text-overflow: ellipsis; }
.adm-meta { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; font-size: 12px; color: #b8b0a0; text-align: right; }
```

- [ ] **Step 6: Verify**

Run: `npm test` → all pass.
Run: `npm run build` → success.
Manual (as the admin, after running the SQL migration): open `⋯ → Admin`. The user list shows avatar/name/email/signup-date and "N matches · N public · N listed". Click a user → their matches render as standard rows. As a non-admin or signed out, visiting `/admin` redirects to `/`.

- [ ] **Step 7: Commit**

```bash
git add app/admin components/AdminUsers.tsx components/AdminUserMatches.tsx app/globals.css
git commit -m "feat(admin): /admin user list + /admin/users/[id] matches (reuses MatchRow)"
```

---

## Task 13: `/m/[id]` admin override

**Files:**
- Modify: `app/m/[id]/page.tsx`

- [ ] **Step 1: Look up admin + pass to `resolveMatchView`**

In `app/m/[id]/page.tsx`, in `MatchPage` (after `const viewerId = …`, before/after `fetchRow`), add the admin lookup and pass it through:

```tsx
  const row = await fetchRow(params.id);

  let isAdmin = false;
  if (viewerId && row && row.owner !== viewerId && !row.is_public) {
    const { data: me } = await supabase.from("profiles").select("is_admin").eq("id", viewerId).maybeSingle();
    isAdmin = !!me?.is_admin;
  }

  const kind = resolveMatchView({
    found: !!row,
    isOwner: !!row && !!viewerId && row.owner === viewerId,
    isPublic: !!row && !!row.is_public,
    isAdmin,
  });
```

(The lookup is skipped unless it could matter — a non-owner viewing a private row — so normal public/owner views cost no extra query. With the `matches_admin_read` RLS policy, `fetchRow` already returns the private row for an admin.)

The existing `if (kind === "editor")` / `<PublicMatch>` branches are unchanged — an admin override yields `"public"`, rendering the read-only page with `applyNameDisplay`.

- [ ] **Step 2: Verify**

Run: `npm test` → all pass.
Run: `npm run build` → success.
Manual: as the admin, open another user's **private** match URL (e.g. from `/admin/users/[id]`) → it renders read-only (not 404). As a non-admin, the same private URL still 404s.

- [ ] **Step 3: Commit**

```bash
git add app/m/[id]/page.tsx
git commit -m "feat(admin): admins can open any match read-only via /m/[id]"
```

---

## Task 14: Bump version + final verification

**Files:**
- Modify: `lib/constants.ts`

- [ ] **Step 1: Bump `APP_VERSION`**

In `lib/constants.ts`, bump `APP_VERSION` from its current value (`v71`) to `v72`.

- [ ] **Step 2: Full verification**

Run: `npm test`
Expected: all suites pass (the prior total + the new `header-menu` and `admin` suites + the added `match-view`/`live-update`/`team-link` cases).

Run: `npm run build`
Expected: success, no type errors outside the `// @ts-nocheck` editor.

Run: `grep -rnE "menuItems|AhMenuItem|\bdoResync\b|\bsetLink\b" components app`
Expected: no matches (all removed; the new `doResyncLatest` is intentionally not matched by `\bdoResync\b`).

- [ ] **Step 3: Commit**

```bash
git add lib/constants.ts
git commit -m "chore: bump APP_VERSION to v72 (admin screen, profiles, self-deciding menu)"
```

> **Tell the user:** deploy and look for **v72** in the footer. Reminder: run `docs/admin-profiles-migration.sql` in Supabase first (creates `profiles`, the trigger, `is_admin()`, RLS, and marks you admin) — without it the Admin item won't appear and admin pages redirect home.

---

## Self-Review notes (addressed)

- **Spec coverage:** profiles/trigger/backfill/is_admin/RLS (T1), buildHeaderMenu (T2), aggregateUserStats (T3), resolveMatchView+isAdmin (T4), reconcileIncoming (T5), linkExistingMatchPatch (T6), fetchIsAdmin (T7), Delete→body (T8), editor realtime/remove Resync (T9), link migration/remove Link teams (T10), AppHeader+callers+isAdmin (T11), admin pages (T12), /m/[id] override (T13), version (T14). All spec sections map to a task.
- **Ordering:** editor menu items removed (T8–T10) before the `menuItems` prop is deleted (T11); pure helpers precede their consumers; `matches_admin_read` (T1 SQL) precedes the admin reads (T12/T13).
- **Type consistency:** `Profile`, `UserStat`, `HeaderScreen`/`HeaderNavItem`, `Incoming`, `linkExistingMatchPatch → Partial<MatchRecord>` are defined once and used consistently. `relativeDate(iso, now)` signature matches `lib/match-list.ts`. `MatchRow` props (`record`/`href`/`date`/`privacy`) match `components/MatchRow.tsx`.
