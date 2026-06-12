# Admin screen, `profiles` table & self-deciding header menu

**Date:** 2026-06-12
**Status:** Approved (brainstorm) — pending implementation plan

## Goal

Give the owner (Sean) an admin role and an admin screen reachable from the `⋯`
menu in the top bar. v1 shows a **list of users** with per-user stats, and each
row links to that user's matches (read-only, admin can open private matches).
Establish a `profiles` table as the foundation for future admin functions.

While doing this, **centralise the top-bar menu**: the navigation items (New,
Teams, Admin, account) are currently hand-rolled in four files and have started
to drift. A self-deciding header menu kills that duplication and makes "Admin
appears on every screen" a one-line change.

## Decisions (from brainstorm)

- **Admin identity:** an `is_admin` boolean on a new `profiles` table (not an
  env-var allowlist). Flip your own row once via SQL; future admins need no
  redeploy.
- **User list shows:** avatar, full name, email, signed-up date, and
  match / public / listed counts.
- **Actions in v1:** read-only **plus** "view a user's matches" — each user row
  links to that user's matches; admin can open any match including private ones.
  No moderation/delete actions. No `last_sign_in` tracking (needs a per-session
  write — deferred).
- **Match listing reuse:** the admin user-detail page renders the existing
  `<MatchRow>` component (the same row the main screen uses).
- **Menu architecture:** a pure `buildHeaderMenu` owns the duplicated nav +
  account items; the editor's unique actions stay in a per-screen prop.

## 1. Database (one-time migrations in Supabase)

Migration SQL lives in `docs/admin-profiles-migration.sql` (run once, like the
other `docs/*-migration.sql` files).

### `profiles` table — mirrors every signup

```sql
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  avatar_url text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);
```

### Signup trigger (copies Google metadata)

```sql
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
```

### Backfill existing users

```sql
insert into public.profiles (id, email, full_name, avatar_url, created_at)
select id, email,
       raw_user_meta_data->>'full_name',
       raw_user_meta_data->>'avatar_url',
       created_at
from auth.users
on conflict (id) do nothing;
```

### `is_admin()` helper (avoids RLS recursion)

A `security definer` function reads `profiles` bypassing RLS, so an
"admins can read all profiles" policy doesn't recurse into itself.

```sql
create or replace function public.is_admin()
  returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and is_admin);
$$;
```

### RLS

```sql
alter table profiles enable row level security;

-- self OR admin can read; admins thus see everyone, users see only themselves
create policy profiles_self_read  on profiles for select using (id = auth.uid());
create policy profiles_admin_read on profiles for select using (public.is_admin());
-- no client insert/update/delete: the security-definer trigger owns writes.

-- admins can read every match (for counts + opening another user's match)
create policy matches_admin_read on matches for select using (public.is_admin());
```

(`matches` already has `own_all` + `public_read`; select policies are OR'd, so
adding `matches_admin_read` only widens admin reads and leaves others unchanged.)

### Make yourself admin (run once)

```sql
update profiles set is_admin = true where email = 'sean.r@edgescan.com';
```

## 2. Self-deciding header menu

### Pure helper — `lib/header-menu.ts`

```ts
export type HeaderScreen =
  | "landing" | "editor" | "public" | "teams" | "team" | "admin" | "admin-user";

export type HeaderNavItem = { label: string; href: string };

// Common navigation items for the ⋯ menu, decided from screen + viewer.
// Signed-out users get none (signed-out callers pass email=null).
export function buildHeaderMenu(args: {
  screen: HeaderScreen;
  email: string | null;
  isAdmin: boolean;
}): HeaderNavItem[];
```

Rules (unit-tested in `test/header-menu.test.ts`):

- Signed-out (`email == null`) → `[]`.
- **New** (`/m/new`) — on every signed-in screen **except** screens where New is
  already the primary button (`landing`, `teams`). i.e. shown on
  `editor`, `public`, `team`, `admin`, `admin-user`.
- **Teams** (`/teams`) — on every signed-in screen **except** `teams` (you're
  already there).
- **Admin** (`/admin`) — only when `isAdmin`, and not on `admin`/`admin-user`
  (you're already there).
- Order: New, Teams, Admin.

The account block (email + Sign out) stays rendered by `AppHeader` itself, as
today — it is not part of `buildHeaderMenu` (it needs the live sign-out
callback).

### `AppHeader` changes — `components/AppHeader.tsx`

New props:

- `screen: HeaderScreen` (required) — which screen is rendering.
- `isAdmin?: boolean` (default `false`).
- Rename `menuItems` → `pageItems` (page-specific action items; same
  `AhMenuItem[]` shape — danger/keepOpen still supported). Only the editor
  passes any.

Render order inside the `⋯` menu:

1. `pageItems` (editor's Link teams / Resync / Delete), if any.
2. divider (if both `pageItems` and nav items exist).
3. nav items from `buildHeaderMenu`, rendered as router navigations
   (`AppHeader` already a client component; use `useRouter().push(item.href)`).
4. divider + account block (email + Sign out), as today.

`hasMenu` becomes: `pageItems.length || navItems.length || email`.

### Caller updates

Every `AppHeader` usage passes `screen` and (where known) `isAdmin`, and stops
hand-rolling New/Teams:

| Caller | screen | isAdmin source | pageItems |
|---|---|---|---|
| `Landing` | `landing` | prop from `app/page.tsx` | — |
| `MatchTracker` editor | `editor` | client `is_admin` fetch | Link teams, Resync, Delete |
| `MatchTracker` wizard (`nw`) | `editor` | — | — |
| `PublicMatch` | `public` | client `is_admin` fetch | — |
| `TeamsList` | `teams` | prop from `app/teams/page.tsx` | — |
| `TeamPage` | `team` | client `is_admin` fetch | — |
| `AdminUsers` | `admin` | true (gated) | — |
| `AdminUserMatches` | `admin-user` | true (gated) | — |

Screen-specific **primary** buttons (Landing/TeamsList New, editor Share,
TeamPage Edit) stay exactly as they are via the existing `primary` prop — they
are deliberate per-screen emphasis, not duplicated nav.

### Client-side `is_admin` for client-rendered headers

`MatchTracker`, `PublicMatch`, `TeamPage` learn the viewer client-side via
`getUser`. Add a small shared client helper:

```ts
// lib/viewer.client.ts
export async function fetchIsAdmin(sb, userId: string | null): Promise<boolean>;
//   select is_admin from profiles where id = userId  (own row; RLS self-read)
```

Each of these components calls it alongside its existing `getUser` and stores
`isAdmin` in state (default `false`, so the menu degrades gracefully before the
fetch resolves). Server-rendered screens (`Landing`, `TeamsList`) get `isAdmin`
from their page's server `getUser` + a `profiles` lookup and pass it down.

## 3. Admin pages

### `app/admin/page.tsx` (server)

- `getUser`; if signed out → `redirect("/")`.
- Look up the viewer's `profiles.is_admin`; if not admin → `redirect("/")`.
- Fetch all `profiles` (RLS admin-read) and light `matches` columns
  (`id, owner, is_public, listed`) — admin-readable.
- Run `aggregateUserStats(profiles, matchRows)` and render `<AdminUsers stats>`.

### `lib/admin.ts` (pure, unit-tested)

```ts
export type UserStat = {
  profile: Profile;            // id, email, full_name, avatar_url, created_at
  total: number;
  public: number;              // is_public
  listed: number;              // is_public && listed
};
export function aggregateUserStats(
  profiles: Profile[],
  matches: { owner: string; is_public: boolean; listed: boolean }[],
): UserStat[];   // keyed/grouped by owner; profiles with no matches → zeros; sorted by created_at desc
```

Unit-tested in `test/admin.test.ts` (grouping, zero-match users, public-vs-listed
counting, ordering).

### `components/AdminUsers.tsx` (client)

The user list: each row shows avatar (or initials fallback), full name, email,
relative signed-up date (reuse `relativeDate` from `lib/match-list.ts`), and the
total / public / listed counts. Row links to `/admin/users/[id]`. Wrapped in
`<AppHeader screen="admin" isAdmin email={...} />`.

### `app/admin/users/[id]/page.tsx` (server)

- Same admin gate (signed in + `is_admin`), else `redirect("/")`.
- Fetch the target `profiles` row (for the header name) + that user's matches
  (`.eq("owner", id)`, admin-read) selecting the list columns.
- Render `<AdminUserMatches profile matches />`.

### `components/AdminUserMatches.tsx` (client)

Renders a simple list of `<MatchRow>` (the existing main-screen row component),
one per match, each linking to `/m/[id]`. Header
`<AppHeader screen="admin-user" backHref="/admin" isAdmin email={...} />`.

## 4. Admin can open any match — `lib/match-view.ts` + `app/m/[id]/page.tsx`

Extend `resolveMatchView` with an `isAdmin` flag:

```ts
export function resolveMatchView(args: {
  found: boolean; isOwner: boolean; isPublic: boolean; isAdmin: boolean;
}): MatchViewKind {
  if (!args.found) return "notfound";
  if (args.isOwner) return "editor";
  if (args.isPublic) return "public";
  if (args.isAdmin) return "public";   // admin override: read-only view of a private match
  return "notfound";
}
```

`app/m/[id]/page.tsx`: after `getUser`, look up the viewer's `is_admin` (one
`profiles` query) and pass it to `resolveMatchView`. With the `matches_admin_read`
RLS policy, `fetchRow` already returns private rows for admins, so the admin
branch renders `<PublicMatch>` (read-only, with `applyNameDisplay`). Existing
tests get the new `isAdmin: false` field; add cases for the admin override.

## Testing

- `test/header-menu.test.ts` — `buildHeaderMenu` per screen × signed-in/out ×
  admin/non-admin; suppression rules; ordering.
- `test/admin.test.ts` — `aggregateUserStats` grouping/zeros/counts/ordering.
- `test/match-view.test.ts` — extend for the `isAdmin` override branch.

## Scope / YAGNI

- No moderation or delete actions in v1.
- No `last_sign_in` (needs per-session writes).
- Counts aggregated client-side from admin-readable rows — fine at this scale;
  can become a DB view if user count grows.
- Admin menu item appears on every screen via the centralised helper (the
  drift-prone New/Teams duplication is removed in the same change).

## Files touched

**New:** `docs/admin-profiles-migration.sql`, `lib/header-menu.ts`,
`lib/admin.ts`, `lib/viewer.client.ts`, `app/admin/page.tsx`,
`app/admin/users/[id]/page.tsx`, `components/AdminUsers.tsx`,
`components/AdminUserMatches.tsx`, plus the three new test files.

**Changed:** `components/AppHeader.tsx` (props + self-deciding menu),
`lib/match-view.ts` (+`isAdmin`), `app/m/[id]/page.tsx` (admin lookup + override),
`app/page.tsx` & `app/teams/page.tsx` (pass `isAdmin`), `components/Landing.tsx`,
`components/MatchTracker.tsx`, `components/PublicMatch.tsx`,
`components/TeamsList.tsx`, `components/TeamPage.tsx` (new header props),
`lib/types.ts` (a `Profile` type), `lib/constants.ts` (bump `APP_VERSION`).
