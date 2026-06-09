# Teams Foundation — Design

**Date:** 2026-06-09
**Status:** Approved (design)
**Sub-project:** ③a — first phase of ③ (Home/Away model), itself part of a 5+ part restructure.

## Context

③ (the neutral two-team / home-away model) grew into a ground-up rearchitecture once the decisions settled: fully neutral two teams, a globally-shared `teams` table, event-only notation, and migration of existing matches. That's too large and too risky for one spec, so ③ is decomposed into a sequence:

- **③a — Teams foundation** *(this doc)*: the `teams` table + RLS, a create/edit-team UI seeded by sport templates, and public team pages. **Purely additive — no parser or match change.**
- **③b — Two-team matches + neutral display**: matches reference a home + away team (per-match roster snapshots); score header / list / public page render from the two teams; home/away swap; both lineups; migrate existing matches. Keeps today's scoring engine. Team pages then show real fixtures.
- **③c — Event-only notation**: the deep parser rewrite (roster leaves the notation; events tagged home/away, resolved against the structured rosters; both-side scorers; test-suite rebuild). Highest risk, last.

Locked model decisions (apply across ③): fully neutral (no "my team"); teams **owned but publicly referenceable** (creator-edits, anyone reads/references; duplicates allowed, no merge/moderation); team rosters are **structured** (live on the team); matches will hold **per-match roster snapshots** seeded from teams.

## Goal

Add **teams as a first-class, reusable, publicly-shareable entity**: create/edit a team (name, colours, sport-seeded roster) and view a public team page — without touching the parser, the match data model, or any existing match.

## Non-goals (③a)

- No change to `parseMatch`, `MatchRecord`, the matches table, or any existing match/editor behaviour. ③a does not make matches reference teams (that's ③b).
- Team pages show a **Fixtures placeholder** only; real fixtures arrive in ③b.
- No teams *list/discovery/search* beyond the owner's own `/teams` list (global browse can come later).
- No merge/dedup/moderation (per the owned-but-referenceable model).

---

## 1. Schema — `teams` table

```sql
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
-- owner does anything to their own rows:
create policy teams_own_all on teams for all using (owner = auth.uid()) with check (owner = auth.uid());
-- anyone (incl. anon) may read any team (teams are inherently referenceable / shareable):
create policy teams_public_read on teams for select using (true);
```

This is a **manual one-time migration** the user runs in Supabase (the plan includes the SQL and flags it), same workflow as ①'s `short_code` migration. `gen_random_uuid()` requires `pgcrypto`/`pgcrypto`-provided function (already available on Supabase).

**RLS rationale:** `teams_public_read using (true)` makes every team readable by anyone — that's the "publicly referenceable" model (others can view a team page and, in ③b, reference it). Writes are owner-only. There is intentionally **no `is_public` flag** for teams in ③a.

## 2. `roster` jsonb shape + templates

```ts
// lib/types.ts — additions
export interface TeamRoster {
  formation: number[][];                 // rows of shirt numbers, e.g. [[1],[2,4,5,3],...]
  players: { num: number; name: string; role: "starting" | "sub" }[];
}
export interface TeamRecord {            // the teams.* row (camelCase mirror, like MatchRow/MatchRecord)
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

This mirrors the match parser's existing `formationRows` (`number[][]`) + roster (`{num,name,role}`), so ③b can seed a match snapshot from a team's roster with no shape translation, and the team page can reuse the lineup-pitch render.

**Templates** — new `lib/team-templates.ts` exporting a `TEAM_TEMPLATES: Record<string, TeamRoster>` for the two sports the user supplied, with position labels as placeholder `name`s:

- **soccer:** `1 GK / 2 RB · 4 RCB · 5 LCB · 3 LB / 7 RW · 6 CDM · 8 CAM · 11 LW / 10 SS · 9 S / Subs: 12 Sub`
- **gaa:** `1 GK / 2 RCB · 3 FB · 4 LCB / 5 RWB · 6 CB · 7 LWB / 8 MID · 9 MID / 10 RWF · 11 CF · 12 LWF / 13 RCF · 14 FF · 15 LCF / Subs: 16 Sub`

A pure `templateForSport(sport)` returns the GAA template for `hurling|camogie|gaelic`, the soccer template for `soccer`, and an empty roster otherwise.

## 3. Routes + header

- **`AppHeader`** gains an optional **Teams** link (rendered on logged-in screens), routing to `/teams`. (Add a `showTeams`/link prop or include it in the existing children slot pattern; keep the header lean.)
- **`/teams`** (`app/teams/page.tsx` → client `TeamsList`): the signed-in user's teams (owner-scoped query `select … where owner = userId order by updated_at desc`), each row showing name, two-tone colour flag, sport icon, and player count; a **New team** button. Clicking a team opens the editor. Logged-out visitors to `/teams` are redirected to `/` (it's an owner surface).
- **`/t/[code]`** (`app/t/[id]/page.tsx`, SSR like `/m/[id]`): the public team page. Resolves `[id]` by `short_code` (or UUID fallback) via the server client (RLS `public_read` allows anon). 404 if not found.
- **`TeamEditor`** (client component) handles both create and edit; reached from `/teams`.

## 4. Team editor (tap-to-name grid)

A client `TeamEditor` with:
- **Name** text input; **two colour swatches** reusing the existing colour-picker pattern (PALETTE swatches + exact-colour input).
- **Sport** dropdown (the `SPORTS` keys). Picking a sport **seeds** `roster` from `templateForSport` (replacing the current roster; confirm if non-empty).
- **Tap-to-name grid**: renders `roster.formation` rows as tappable slots (number + current name); tapping a slot opens an inline editor to set the player's **name** and **number**; a subs row with the sub players + an **add player** affordance (to a row or to subs); remove-player on a slot. All edits mutate the `roster` structure via pure helpers (§6). Sport optional → start from an empty roster and add players.
- **Save** → `store`-style upsert to `teams` (mint `short_code` once via the existing `genShortCode`, idempotent is-null guard like ①'s `ShareSheet.ensureShortCode`), then route to `/teams` (or the team page).

## 5. Team page `/t/[code]`

SSR public page: `<AppHeader>` (visitor variant) → team identity (name, two-tone colour flag, sport label/emoji) → the **roster on the lineup pitch** (reuse the pitch-render approach used by `PublicMatch`'s lineup) → a **Fixtures** section rendering a placeholder ("Fixtures will appear here" — wired in ③b). If the viewer is the owner, show an **Edit** affordance linking to the editor. No player-name redaction in ③a (teams are public; redaction is a per-match `name_display` concern, revisited if needed in ③b).

## 6. Data access + pure, tested seams

- **`lib/team-store.ts`** (browser): `teamStore.list(userId)` / `.get(id)` / `.set(record)` / `.del(id)` over the `teams` table via the browser Supabase client — a small, focused mirror of `lib/store.ts` (do **not** overload `store.ts`, which is match-specific).
- **Pure, unit-tested helpers** in `lib/team-roster.ts`: `templateForSport(sport): TeamRoster`; `setPlayer(roster, num, {name, role})`; `addPlayer(roster, role): TeamRoster` (next free number); `removePlayer(roster, num): TeamRoster`; `renumberPlayer(roster, oldNum, newNum): TeamRoster`. These keep the editor's mutations out of the component and testable. Plus `lib/team-templates.ts`.
- The team page SSR resolver (short_code vs UUID) reuses `isUuid`.

## 7. Testing

- Existing suite untouched (no parser/match change) — all current tests still pass.
- New unit tests: `test/team-templates.test.ts` (the two templates parse to the expected formation/player counts) and `test/team-roster.test.ts` (template-by-sport mapping; add/set/remove/renumber helpers). UI (`TeamEditor`, `TeamsList`, team page) is build-verified (`tsc` + `next build`), consistent with the repo's "logic tested, UI build-verified" pattern.
- `APP_VERSION` → **v48**.

## 8. Risks / watch-items

- **Manual schema migration** must be run before the feature works; the team-store/upsert should degrade gracefully if the table is absent (surface a clear error, don't crash the app) — same defensive posture as ①'s `short_code` fallback.
- **Forward-compatibility for ③b/③c:** the `roster` shape deliberately matches the match parser's `formationRows`+roster so ③b can snapshot it directly. Keep `TeamRoster` the single source of that shape.
- **Header growth:** adding "Teams" is one more header item; keep it from crowding the action cluster on the match-edit header (Teams is a left-side/nav link, distinct from the right-side actions).
- **Public-read-all teams** means any team (and its roster of names) is world-readable by `short_code`. That's the chosen model; note it (a team page is as public as a published match).
