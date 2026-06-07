# Supabase backend migration — design

**Date:** 2026-06-07
**Status:** Approved (pending spec review)

## Goal

Replace Sideline's current backend — Google Identity Services (GIS) auth + Google Drive
`appDataFolder` storage — with **Supabase** (Auth + Postgres). Migrate the owner's existing
matches, and start recording the **owning user** of each match so the app can later be opened
to other users and support public read-only sharing.

Out of scope now (door kept open, not built): public share links, name redaction rendering,
admin/user-management UI, extra OAuth providers, realtime multi-device sync.

## Constraints (unchanged)

- **Single file, no build step.** All app code stays in the one `<script type="text/babel">`
  block in `index.html`. Supabase is loaded as a UMD `<script>` from CDN (like the `google`
  global today), exposing `window.supabase.createClient`.
- **Static hosting.** GitHub Pages serves `index.html`; no server. `SUPABASE_URL` and
  `SUPABASE_ANON_KEY` are public values (safe behind RLS), hardcoded near `APP_VERSION` just
  as `CLIENT_ID` was.
- **Parser untouched.** `parseMatch` remains the single source of truth; `node tools/run-tests.js`
  must still pass with the canonical sample expectations.
- **Sample data stays fictional** (Racoons v Wildebeests / Rick & Morty) — the repo "no real
  names" rule applies only to the hard-coded sample, not to user data.

## Chosen approach: drop-in replacement (Approach A)

Everything in the app funnels through a tiny `store` API (`list/get/set/del`) over an in-memory
`cache` map, plus the `App`/`SignIn` auth bootstrap. Re-implement **only** those internals
against Supabase while preserving their exact surface, so `MatchTracker` / `ScoreChart` /
infographic (~1400 lines) are untouched. Blast radius ≈ 150 lines.

Rejected:
- **B — realtime subscriptions rewrite:** rewires data flow throughout `MatchTracker`; the
  existing manual Resync already covers multi-device. YAGNI.
- **C — dual Drive+Supabase backend:** pure overhead for a personal app. No.

### Side effect: large deletion

Supabase persists the session in `localStorage` and **auto-refreshes** the access token. This
removes the entire token-lifecycle apparatus the current app needs, and fixes two CLAUDE.md
known-limitations (re-sign-in after ~1h / tab close; can't test locally).

Delete:
- `index.html` lines ~50–91: `rememberToken`/`recallToken`/`forgetToken`/`tokenTimeLeft`/
  `ensureFreshToken`/`requestToken`/`reauth`, `TOK_KEY`, `tokenExp`/`tokenCallback`/`onAuthExpired`.
- `saveWithRetry`'s 401 dance (replaced by a plain error return).
- GIS `initTokenClient` polling in `App` (~2529–2555).
- In `MatchTracker`: `authLost`/`authSoon` state, keep-alive `useEffect` (~1308–1319),
  `doStayConnected`, `doReconnect`, and both auth banners (~1822–1831).
- The GIS `<script src="accounts.google.com/gsi/client">` tag.

## Section 1 — Auth layer

- Load `@supabase/supabase-js` v2 UMD build via CDN `<script>`. Create one client:
  `const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)`.
- **Sign in:** `sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.href } })`
  — full-page redirect to Google and back. Works on GitHub Pages; also enables **localhost
  testing** once localhost is on Supabase's redirect allowlist.
- **`App` bootstrap:** on mount, `await sb.auth.getSession()` and subscribe to
  `sb.auth.onAuthStateChange`. Session present → `loadAll()` → render `<MatchTracker/>`;
  absent → `<SignIn/>` (button calls `signInWithOAuth`). Handle the post-redirect return
  (session arrives via `getSession`/`onAuthStateChange`).
- **Add:** a "Signed in as `<email>` · Sign out" affordance (none today; `sb.auth.signOut()`),
  and a generic save-failure toast (replaces the removed reconnect banner).

## Section 2 — Data model & RLS

One table; promoted columns + `jsonb`, with `id` as real UUIDs (remap on import).

```sql
create table matches (
  id          uuid primary key,
  owner       uuid not null references auth.users(id) default auth.uid(),
  is_public   boolean not null default false,   -- dormant: public read-only sharing (future)
  hide_names  boolean not null default false,   -- dormant: redact names on public share (youth privacy)
  match_date  timestamptz,
  my_team     text,
  opponent    text,
  sport       text,
  data        jsonb not null,                   -- full match record: raw, myTeam, colours, scoringMode, etc.
  updated_at  timestamptz not null default now()
);
alter table matches enable row level security;

-- owner can do everything to their own rows
create policy "own_all" on matches for all
  using (owner = auth.uid()) with check (owner = auth.uid());

-- anyone (even anon) can read rows explicitly marked public — dormant until is_public is used
create policy "public_read" on matches for select
  using (is_public = true);
```

- **`id`:** new matches use `crypto.randomUUID()` (replacing `"m"+Date.now()+rand`). Existing
  matches are remapped to fresh UUIDs on import (old ids are internal-only; nothing references
  them externally).
- **Promoted columns** derived on every `store.set`: `match_date`/`my_team`/`sport` from the
  record; `opponent` via `parseMatch(data.raw, {myTeam}).opp`. `data` holds the full record
  unchanged, so `cache[id]` keeps returning today's exact object shape and the parser stays
  authoritative.
- **`is_public` / `hide_names`** ship dormant (default false); their policies/render paths are
  wired for the future but unused now.
- **RLS footgun:** the plan must verify `enable row level security` actually took effect (a
  forgotten enable silently exposes all rows under the public anon key).

### Data isolation guarantee

Enforcement is server-side, not client-side. The anon key is public, so anyone can hit the REST
API — but `own_all` (`using (owner = auth.uid())`) makes any read return zero rows for matches
the signed-in user doesn't own. `store.get(id)` only reads the local `cache`, which `loadAll()`
populates exclusively from the owner's rows, so other users' ids aren't present (returns `null`).
The only cross-user-readable rows are `is_public = true` (opt-in, default false).

## Section 3 — Storage layer & save flow

Keep the `store` surface and `cache` map identical; swap internals to per-row Supabase ops.

```js
let cache = {};                              // { id: record } — shape unchanged; still read by MatchTracker
async function loadAll() {                   // replaces driveLoad()
  const { data, error } = await sb.from('matches').select('id,data'); // RLS scopes to owner
  if (error) throw error;
  cache = {}; (data || []).forEach(r => { cache[r.id] = r.data; });
}
const store = {
  ok: true,
  async list() { return Object.keys(cache).map(id => "match:" + id); },
  async get(id) { return cache[id] || null; },
  async set(id, data) {                       // single-row upsert (not whole-blob rewrite)
    cache[id] = data;
    let opp = null;
    try { opp = parseMatch(data.raw, { myTeam: data.myTeam }).opp || null; } catch (e) {}
    const { error } = await sb.from('matches').upsert({
      id, data,
      match_date: data.matchDate || data.date || null,
      my_team:    data.myTeam || null,
      opponent:   opp,
      sport:      data.sport || null,
      updated_at: new Date().toISOString(),
      // owner defaults to auth.uid() on insert; RLS with-check enforces it
    });
    return !error;
  },
  async del(id) {
    delete cache[id];
    const { error } = await sb.from('matches').delete().eq('id', id);
    return !error;
  },
};
```

- **Per-row writes** replace "rewrite the whole file every change" — more efficient, no
  cross-match clobbering.
- **`cache` stays the in-memory mirror**, so `MatchTracker`'s direct reads
  (`cache[curId]` dirty-check ~1331; all-matches scans ~1236/1249; new-match wizard local build)
  are untouched.
- **Auto-save** (2.5s debounce), dirty `*` markers, `recordPayload()` unchanged — they call
  `store.set`.
- **`doResync`** simplifies to `await loadAll(); reload open match` — no token refresh / 401 retry.
- **Save failures** surface as a toast.

## Section 4 — Migration & cutover sequence

Same GitHub Pages URL, so ordering matters:

1. **DONE — data saved.** Owner exported current v36 Backup JSON to `backup.json` (gitignored).
2. **Stand up Supabase:** create project; run schema+RLS SQL; enable Google provider; set
   redirect allowlist (`https://seaninryan.github.io/sideline/` + `http://localhost:<port>/`).
3. **Build** the Supabase version behind the same `store` surface; test locally against the real
   project (localhost redirect now allowed).
4. **Adapt import** (`doImport`, ~1765–1778): assign each incoming match a fresh
   `crypto.randomUUID()` (remap), write via the new `store.set`. Export format unchanged, so the
   saved JSON pastes straight in.
5. **Deploy:** bump `APP_VERSION`, update `SETUP.md` + CLAUDE.md. Hard-refresh, sign in → empty
   account.
6. **Import** `backup.json` via Backup → rows land under `owner` with promoted columns populated.
   Verify counts/totals against canonical sample expectations.
7. Old Drive `sideline.json` left orphaned (harmless; delete manually later).

## Section 5 — Config & setup

- **`index.html` config:** replace `CLIENT_ID`/`SCOPES` with `SUPABASE_URL` + `SUPABASE_ANON_KEY`;
  add supabase-js UMD `<script>`, remove GIS `<script>`.
- **Supabase dashboard (guided):** project → SQL editor (schema+RLS) → Auth → Providers →
  Google (needs a Google OAuth client id+secret) → URL config (Site URL + redirect allowlist).
- **Google Cloud:** Supabase's flow needs an **authorized redirect URI** =
  `https://<project>.supabase.co/auth/v1/callback` (add to the existing OAuth client or make a
  new one); paste id+secret into Supabase. The "External/Testing + test users" lock can be
  relaxed (RLS isolates per user) or kept during testing.
- **Sign-up policy:** open — anyone with Google can sign in; RLS isolates each user's matches.
- **Docs:** rewrite the "Auth + storage (no server)" sections of CLAUDE.md and SETUP.md for
  Supabase; remove the two fixed known-limitations (multi-day persistence; local testing).
- **`backup.json`** added to `.gitignore`.

## Verification

- `node tools/run-tests.js` (parser unchanged) — must pass with canonical sample expectations.
- JSX syntax check: extract the babel block → `npx esbuild --loader:.jsx=jsx --outfile=/dev/null`.
- RLS enabled check (e.g. attempt a read as a second/anon identity returns no private rows).
- Manual: local sign-in → import `backup.json` → match counts + a spot-checked total match the
  pre-migration data.

## Future doors kept open (not built now)

- **Admin/user management:** Supabase dashboard already lists/ bans/deletes users; everything
  keyed on `owner`/`auth.uid()` makes per-user queries trivial. A future `profiles` table
  (keyed to `auth.users.id`) can hold display name / role / `disabled` without touching `matches`.
- **More providers** (Apple/Facebook/email magic-link): dashboard toggle + a button; no schema change.
- **Public share links + youth name redaction:** `is_public` + `hide_names` columns already
  present; redaction happens in the public render path (names → numbers/placeholders across
  scoreboard, scorers, lineup, timeline, infographic), never by storing fewer names.
