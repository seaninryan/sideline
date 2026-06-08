# Supabase Backend Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Sideline's Google Identity Services auth + Google Drive storage with Supabase (Auth + Postgres), migrate the owner's existing matches, and record the owning user of each match.

**Architecture:** Drop-in replacement behind the existing `store` API (`list/get/set/del`) and `App`/`SignIn` bootstrap. Auth becomes Supabase Google OAuth (full-page redirect, auto-refreshed session in `localStorage`); storage becomes one `matches` table (row-per-match, promoted columns + `data jsonb`) with owner-keyed RLS. `MatchTracker`/`ScoreChart`/infographic are untouched because they only ever read the `cache` map and call `store`.

**Tech Stack:** Supabase (Postgres + Auth + RLS), `@supabase/supabase-js` v2 UMD CDN build, React 18 via CDN + Babel standalone (no build step), single-file `index.html`.

**Spec:** `docs/superpowers/specs/2026-06-07-supabase-migration-design.md`

---

## Notes for the implementer

- **No build step.** All app code lives in the one `<script type="text/babel">` block in `index.html`. Edit it directly.
- **Two verification commands** are used throughout:
  - Parser regression: `node tools/run-tests.js` (needs Node 18+; `nvm use 18`).
  - JSX syntax check:
    ```bash
    sed -n '/<script type="text\/babel"/,/<\/script>/p' index.html | sed '1d;$d' > /tmp/sideline-app.jsx
    npx esbuild /tmp/sideline-app.jsx --loader:.jsx=jsx --outfile=/dev/null
    ```
- **TDD applies to pure logic only.** OAuth redirect + live-DB integration cannot be unit-tested in a buildless single-file app, so those tasks are verified by the syntax check, the parser regression, and concrete manual browser checks against the real Supabase project (local testing is enabled by the localhost redirect URL configured in Task 1).
- **Coherence between tasks:** Task 3 is purely additive (app still runs on Drive). Task 4 is the atomic cutover (auth + storage swap together) — the app is non-functional only *during* Task 4's steps and fully working again at its end. Each task ends in a commit (syntax-checked) so rollback is cheap.
- **Branch:** work continues on the existing `supabase-migration` branch.

---

## Task 1: Stand up Supabase (project, schema, RLS, Google OAuth)

This task is dashboard/console work (human-in-the-loop). Its output — `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and the project ref — is required by Task 2.

**Files:** none (external configuration).

- [ ] **Step 1: Create the Supabase project**

Go to https://supabase.com → sign in → New project. Pick an org, name (e.g. `sideline`), a strong DB password (store it in a password manager — not needed by the app), and a region near you. Wait for provisioning (~2 min).

- [ ] **Step 2: Create the `matches` table + RLS**

Dashboard → SQL Editor → New query → paste and Run:

```sql
create table matches (
  id          uuid primary key,
  owner       uuid not null references auth.users(id) default auth.uid(),
  is_public   boolean not null default false,
  hide_names  boolean not null default false,
  match_date  timestamptz,
  my_team     text,
  opponent    text,
  sport       text,
  data        jsonb not null,
  updated_at  timestamptz not null default now()
);
alter table matches enable row level security;

create policy "own_all" on matches for all
  using (owner = auth.uid()) with check (owner = auth.uid());

create policy "public_read" on matches for select
  using (is_public = true);
```

- [ ] **Step 3: Verify RLS is actually enabled (the classic footgun)**

In the SQL Editor, Run:

```sql
select relname, relrowsecurity from pg_class where relname = 'matches';
```

Expected: one row, `relrowsecurity = true`. If `false`, re-run `alter table matches enable row level security;`.

- [ ] **Step 4: Configure Google as an auth provider**

You need a Google OAuth client. In Google Cloud Console (the project that holds the current OAuth client, or a new one): APIs & Services → Credentials → create/edit an **OAuth client ID** of type "Web application". Add an **Authorized redirect URI**:

```
https://<PROJECT_REF>.supabase.co/auth/v1/callback
```

(`<PROJECT_REF>` is in Supabase → Project Settings → General, and is the subdomain of your project URL.) Copy the client's **Client ID** and **Client secret**.

Then in Supabase → Authentication → Providers → Google: enable it, paste the Client ID and Client secret, Save.

- [ ] **Step 5: Set Site URL + redirect allowlist**

Supabase → Authentication → URL Configuration:
- **Site URL:** `https://seaninryan.github.io/sideline/`
- **Redirect URLs** (add both): `https://seaninryan.github.io/sideline/` and `http://localhost:8000/` (or whatever local port you serve on — used for local testing in later tasks).

- [ ] **Step 6: Capture the public config values**

Supabase → Project Settings → API. Copy:
- **Project URL** (e.g. `https://abcd.supabase.co`) → this is `SUPABASE_URL`.
- **anon public** key → this is `SUPABASE_ANON_KEY`.

Both are public values (safe in client code behind RLS). Keep them for Task 2.

- [ ] **Step 7: Verify the table is reachable with the anon key and RLS blocks anonymous reads**

From a terminal (substitute your values):

```bash
curl -s "https://<PROJECT_REF>.supabase.co/rest/v1/matches?select=id" \
  -H "apikey: <SUPABASE_ANON_KEY>" \
  -H "Authorization: Bearer <SUPABASE_ANON_KEY>"
```

Expected: `[]` (an empty array — endpoint reachable, and an unauthenticated caller sees zero rows because none are `is_public = true`). A `401`/error about the key means the values are wrong; a non-empty array or a permissions-disabled message means RLS isn't set correctly — revisit Steps 2–3.

- [ ] **Step 8: No commit** — this task changes no files. Proceed to Task 2.

---

## Task 2: Pure helpers — UUID id generation + import remap (TDD)

Introduce two pure helpers in the harness-extractable region and switch all match-id generation to UUIDs. This is safe while the app is still on Drive (Drive keys are arbitrary strings) and is the one genuinely unit-testable piece.

**Files:**
- Modify: `index.html` (add helpers in the pure region after `gpTotal`; replace id-gen sites at `:1340`, `:1556`; rewrite `doImport` at `:1765-1778`)
- Modify: `tools/parser-harness.js:18` (export the new helpers)
- Test: `tools/run-tests.js` (add assertions)

- [ ] **Step 1: Write the failing test**

In `tools/run-tests.js`, add `mkId` and `remapImport` to the destructured import on line 3:

```js
const { parseMatch, SAMPLE, isPlaceholderLabel, buildInfographicSVG, swapRosterNums, renumRoster, eventLineMinute, deleteEventLine, insertEventLine, replaceEventLine, mkId, remapImport } = require("./parser-harness");
```

Then append, just before the final `process.exit(fail ? 1 : 0)` (or end-of-file failure summary):

```js
// ---- import remap: fresh UUIDs, incoming ids dropped, records preserved ----
{
  let seq = 0;
  const gen = () => "uuid-" + (++seq);
  const exp = { v: 1, matches: [
    { id: "m1718000000001", raw: "A @ B", myTeam: "A" },
    { id: "m1718000000002", raw: "C @ D", myTeam: "C" },
  ] };
  const out = remapImport(exp, gen);
  t("remap count", out.length, 2);
  t("remap fresh ids", out.map((x) => x.id), ["uuid-1", "uuid-2"]);
  t("remap drops old id", out[0].rec.id, undefined);
  t("remap keeps record", [out[0].rec.raw, out[0].rec.myTeam], ["A @ B", "A"]);
  t("remap bare array", remapImport([{ id: "x", raw: "E @ F" }], gen).length, 1);
  t("remap empty/garbage", remapImport(null, gen).length, 0);
  t("mkId is uuid-shaped", /^[0-9a-f-]{36}$/.test(mkId()), true);
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node tools/run-tests.js`
Expected: FAIL — `remapImport is not a function` / `mkId is not a function` (and likely a thrown TypeError ending the run).

- [ ] **Step 3: Add the helpers to `index.html`**

In `index.html`, immediately after the `function gpTotal(...)` line (currently `:147`), insert:

```js
// crypto.randomUUID() — available in modern browsers and Node 18+ (the test harness).
function mkId() { return crypto.randomUUID(); }
// Normalise a Backup export ({matches:[{id,...rec}]} or a bare array) into [{id, rec}]
// with FRESH uuids, dropping any incoming id so old non-uuid ids never reach Postgres.
// `gen` is injectable for deterministic tests.
function remapImport(obj, gen) {
  gen = gen || mkId;
  const arr = (obj && obj.matches) || (Array.isArray(obj) ? obj : []);
  return arr.map((mm) => { const { id: _drop, ...rec } = mm; return { id: gen(), rec }; });
}
```

- [ ] **Step 4: Export the helpers from the harness**

In `tools/parser-harness.js`, edit the `module.exports` line (`:18`) to add `mkId, remapImport` to the returned object:

```js
module.exports = new Function(chunk + "\n; return { parseMatch, SAMPLE, isPlaceholderLabel, buildInfographicSVG, swapRosterNums, renumRoster, eventLineMinute, deleteEventLine, insertEventLine, replaceEventLine, mkId, remapImport };")();
```

Note: `mkId`/`remapImport` are in the pure region (after `gpTotal`, before `const CSS`), so the existing `start`/`end` slice already includes them — no slice change needed.

- [ ] **Step 5: Run the test to verify it passes**

Run: `node tools/run-tests.js`
Expected: all `ok`, including the new `remap *` and `mkId is uuid-shaped` lines; final exit 0. The canonical sample assertions must still pass unchanged.

- [ ] **Step 6: Switch the two in-app id-gen sites to `mkId()`**

In `index.html`:
- `:1340` change `const id = curId || ("m" + Date.now());` → `const id = curId || mkId();`
- `:1556` change `const id = "m" + Date.now();` → `const id = mkId();`

- [ ] **Step 7: Rewrite `doImport` to use `remapImport` (`:1765-1778`)**

Replace the body of `doImport` with:

```js
  const doImport = async () => {
    try {
      const obj = JSON.parse(importText.trim());
      const items = remapImport(obj);
      let n = 0;
      for (const { id, rec } of items) { if (await store.set(id, rec)) n++; }
      await refreshList();
      setModal(null); setSavedMsg(`Imported ${n} match${n === 1 ? "" : "es"} ✓`); setTimeout(() => setSavedMsg(""), 2500);
    } catch (e) { setSavedMsg("Import failed — check the text"); setTimeout(() => setSavedMsg(""), 2500); }
  };
```

- [ ] **Step 8: JSX syntax check**

Run:
```bash
sed -n '/<script type="text\/babel"/,/<\/script>/p' index.html | sed '1d;$d' > /tmp/sideline-app.jsx
npx esbuild /tmp/sideline-app.jsx --loader:.jsx=jsx --outfile=/dev/null
```
Expected: no output (exit 0).

- [ ] **Step 9: Commit**

```bash
git add index.html tools/parser-harness.js tools/run-tests.js
git commit -m "Use UUID match ids + pure import-remap helper (TDD)"
```

---

## Task 3: Add the Supabase client (additive — app still on Drive)

Load supabase-js and create the client without removing anything yet, so this commit still runs on Drive.

**Files:**
- Modify: `index.html` (head `<script>` tags near `:28-31`; config near `:42-44`)

- [ ] **Step 1: Add the supabase-js UMD script tag**

In `index.html`, after the Babel standalone script (`:30`) and before the GIS script (`:31`), add:

```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
```

Leave the GIS `<script src="https://accounts.google.com/gsi/client" async defer></script>` line in place for now (removed in Task 4).

- [ ] **Step 2: Add the Supabase config + client (do NOT remove the GIS config yet)**

In `index.html`, immediately after `const SCOPES = ...` (`:44`), add (substituting the Task 1 values):

```js
const SUPABASE_URL = "https://<PROJECT_REF>.supabase.co";
const SUPABASE_ANON_KEY = "<SUPABASE_ANON_KEY>";
// The page holds only the public anon key; per-user isolation is enforced by RLS on `matches`.
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
```

- [ ] **Step 3: JSX syntax check**

Run:
```bash
sed -n '/<script type="text\/babel"/,/<\/script>/p' index.html | sed '1d;$d' > /tmp/sideline-app.jsx
npx esbuild /tmp/sideline-app.jsx --loader:.jsx=jsx --outfile=/dev/null
```
Expected: no output (exit 0).

- [ ] **Step 4: Manual smoke check that the client loads**

Serve locally and open the page:
```bash
python3 -m http.server 8000
```
Open `http://localhost:8000/`, then in the browser devtools console run `typeof supabase.createClient` → `"function"` and `sb` → a client object. (Sign-in still uses the old Drive flow here — that's expected; this step only confirms supabase-js loaded.)

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "Load supabase-js + create client (additive, app still on Drive)"
```

---

## Task 4: Cutover — replace auth + storage with Supabase

The atomic swap. Replace the storage/auth preamble, the `App`/`SignIn` bootstrap, and remove the token-lifecycle machinery from `MatchTracker`. The app is mid-swap (non-runnable) between steps and fully working again at the end.

**Files:**
- Modify: `index.html` — preamble `:45-145`; `MatchTracker` state `:1191-1192`, effects/handlers `:1298-1382`, save-message wording `:1344/:1354/:1560`, menu `:1812`, banners `:1822-1833`; `App`/`SignIn` `:2513-2570`; GIS script tag `:31`

- [ ] **Step 1: Replace the entire storage/auth preamble (`:45-145`)**

Select from `let accessToken = null, ...` (`:45`) through the end of the `const store = {...};` block (`:145`) and replace the whole span with:

```js
let cache = {}; // { id: record } — in-memory mirror; same shape MatchTracker has always read.

// Pull every match the signed-in user owns into `cache`. RLS scopes the query to auth.uid().
async function loadAll() {
  const { data, error } = await sb.from("matches").select("id,data");
  if (error) throw error;
  cache = {};
  (data || []).forEach((r) => { if (r && r.id) cache[r.id] = r.data; });
}

// Derive the promoted columns from a record. `data` (jsonb) stays the source of truth;
// opponent isn't stored in the record, so parse it from the header.
function matchCols(data) {
  let opp = null;
  try { opp = (parseMatch(data.raw, { myTeam: data.myTeam }).opp) || null; } catch (e) {}
  return {
    match_date: data.matchDate || data.date || null,
    my_team: data.myTeam || null,
    opponent: opp,
    sport: data.sport || null,
  };
}

const store = {
  ok: true,
  async list() { return Object.keys(cache).map((id) => "match:" + id); },
  async get(id) { return cache[id] || null; },
  async set(id, data) { // single-row upsert; owner defaults to auth.uid() on insert (RLS-checked)
    cache[id] = data;
    const { error } = await sb.from("matches").upsert(Object.assign(
      { id, data, updated_at: new Date().toISOString() }, matchCols(data),
    ));
    if (error) console.warn("save failed", error.message);
    return !error;
  },
  async del(id) {
    delete cache[id];
    const { error } = await sb.from("matches").delete().eq("id", id);
    return !error;
  },
};
```

This deletes `accessToken`/`fileId`/`tokenClient`/`tokenExp`/`tokenCallback`/`onAuthExpired`, the `TOK_KEY` token helpers, `requestToken`/`reauth`/`ensureFreshToken`, `dfetch`/`ensureFile`/`driveLoad`/`driveSave`/`saveWithRetry`, and the old `store`. (`matchCols` calls `parseMatch`, defined later in the file — fine, since it only runs at save time.)

- [ ] **Step 2: Remove the dead auth state in `MatchTracker` (`:1191-1192`)**

Delete these two lines:

```js
  const [authLost, setAuthLost] = useState(false);
  const [authSoon, setAuthSoon] = useState(false); // token near expiry, silent renew blocked
```

- [ ] **Step 3: Add a sign-out / identity state in their place**

Where the two deleted lines were, add:

```js
  const [userEmail, setUserEmail] = useState("");
```

And add an effect to populate it — place it right after the `useEffect(() => { setBlkEdit(null); ... }, [curId]);` line (`:1203`):

```js
  useEffect(() => { sb.auth.getUser().then(({ data }) => setUserEmail((data && data.user && data.user.email) || "")); }, []);
```

- [ ] **Step 4: Delete the `onAuthExpired` effect, keep-alive effect, and `doStayConnected` (`:1298-1324`)**

Delete the entire span from `useEffect(() => {\n    onAuthExpired = () => setAuthLost(true);` through the closing `};` of `doStayConnected` (the block at `:1298-1324`, ending at the line `  };` that closes `doStayConnected`). The next surviving line is the `// sport is undefined ...` comment (`:1326`).

- [ ] **Step 5: Drop `ensureFreshToken()` from `doSave` and fix its wording (`:1338-1346`)**

Replace the `doSave` function with:

```js
  const doSave = async () => {
    const id = curId || mkId();
    const ok = await store.set(id, { ...recordPayload(), savedAt: Date.now() });
    setCurId(id);
    await refreshList();
    setSavedMsg(ok ? "Saved ✓" : "NOT saved — check connection");
    setTimeout(() => setSavedMsg(""), ok ? 2000 : 6000);
  };
```

- [ ] **Step 6: Fix the auto-save wording (`:1354`)**

In the auto-save effect, change the failure message line from:

```js
      else { setSavedMsg("NOT saved to Drive!"); setTimeout(() => setSavedMsg(""), 6000); }
```
to:
```js
      else { setSavedMsg("NOT saved — check connection"); setTimeout(() => setSavedMsg(""), 6000); }
```

- [ ] **Step 7: Simplify `doResync` and delete `doReconnect` (`:1360-1382`)**

Replace the span from the `// Pull the Drive copy ...` comment (`:1360`) through the end of `doReconnect` (`:1382`) with:

```js
  // Re-pull the server copy (e.g. edits made on another device) on demand.
  const doResync = async () => {
    if (dirty && curId && !window.confirm("This match has unsaved changes here — load the server copy over them?")) return;
    setBlkEdit(null); setBlkIns(null); setLineupEdit(null);
    setSavedMsg("Syncing…");
    try {
      await loadAll();
      await refreshList();
      if (curId && cache[curId]) doLoad(curId);
      else if (curId) setCurId(null); // deleted on the other device
      setSavedMsg("Synced ✓"); setTimeout(() => setSavedMsg(""), 2000);
    } catch (e) { setSavedMsg("Sync failed — try again"); setTimeout(() => setSavedMsg(""), 4000); }
  };
```

- [ ] **Step 8: Fix the `finishNew` save (remove `ensureFreshToken`, fix wording) (`:1557/:1560`)**

In `finishNew`, delete the line `      await ensureFreshToken();` (`:1557`), and change the failure message (`:1560`) from `"NOT saved to Drive!"` to `"NOT saved — check connection"`.

- [ ] **Step 9: Add a Sign-out button to the overflow menu (`:1812`)**

In the `menuOpen` sub-bar, after the Backup button (`:1813`), add:

```js
          <button className="mt-btn" onClick={() => { setMenuOpen(false); sb.auth.signOut(); }}>{userEmail ? "Sign out (" + userEmail + ")" : "Sign out"}</button>
```

- [ ] **Step 10: Delete the two auth banners (`:1822-1833`)**

Delete the `{authLost && (...)}` block and the `{authSoon && !authLost && (...)}` block in full. (The `{savedMsg && ...}` toast above them stays.)

- [ ] **Step 11: Rewrite `App`/`SignIn` and remove the GIS script tag (`:2513-2570`, `:31`)**

Replace the `SignIn` and `App` functions (the span from `function SignIn(...)` at `:2514` through the `ReactDOM.createRoot(...)` line at `:2570`) with:

```js
/* ---- sign-in + Supabase bootstrap ---- */
function SignIn({ phase, err, onSignIn }) {
  const busy = phase === "wait" || phase === "load";
  const label = phase === "load" ? "Loading your matches…" : "Sign in with Google";
  return (
    <div className="si-wrap"><div className="si-card">
      <h1>SIDELINE</h1>
      <p>Match data is saved privately to your account and synced across your devices.</p>
      <button className="si-btn" onClick={onSignIn} disabled={busy}>{label}</button>
      <div className="si-status">{err || (phase === "load" ? "Syncing…" : "")}</div>
    </div></div>
  );
}
function App() {
  const [phase, setPhase] = useState("wait");
  const [err, setErr] = useState("");
  useEffect(() => {
    // getSession() also resolves the OAuth redirect return: supabase-js parses the URL
    // hash and persists the session before this promise settles.
    sb.auth.getSession().then(async ({ data }) => {
      if (data && data.session) {
        setPhase("load");
        try { await loadAll(); setPhase("ready"); }
        catch (e) { setErr("Couldn't load your matches — check the Supabase config and that the matches table exists."); setPhase("out"); }
      } else { setPhase("out"); }
    });
    // Reflect later sign-out (here or on another tab) back to the sign-in screen.
    const { data: listener } = sb.auth.onAuthStateChange((_event, session) => { if (!session) setPhase("out"); });
    return () => { if (listener && listener.subscription) listener.subscription.unsubscribe(); };
  }, []);
  const signIn = async () => {
    setErr("");
    const { error } = await sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: location.href } });
    if (error) setErr("Sign-in failed: " + error.message);
    // on success the browser redirects to Google; nothing more to do here.
  };
  if (phase === "ready") return <MatchTracker />;
  return <SignIn phase={phase} err={err} onSignIn={signIn} />;
}
ReactDOM.createRoot(document.getElementById("root")).render(<App />);
```

Then delete the GIS script tag at `:31`:

```html
<script src="https://accounts.google.com/gsi/client" async defer></script>
```

- [ ] **Step 12: Parser regression + JSX syntax check**

Run:
```bash
node tools/run-tests.js
sed -n '/<script type="text\/babel"/,/<\/script>/p' index.html | sed '1d;$d' > /tmp/sideline-app.jsx
npx esbuild /tmp/sideline-app.jsx --loader:.jsx=jsx --outfile=/dev/null
```
Expected: parser tests all `ok`; esbuild no output (exit 0).

- [ ] **Step 13: Verify no GIS/Drive/token references remain**

Run:
```bash
grep -n "accessToken\|tokenClient\|driveLoad\|driveSave\|dfetch\|ensureFreshToken\|reauth\|authLost\|authSoon\|onAuthExpired\|gsi/client\|CLIENT_ID\b\|appDataFolder" index.html
```
Expected: no matches (empty output). If `CLIENT_ID`/`SCOPES` consts still linger at `:42-44`, delete them now.

- [ ] **Step 14: Manual end-to-end check against the real project (local)**

Serve and exercise the live flow (localhost is allowlisted from Task 1):
```bash
python3 -m http.server 8000
```
At `http://localhost:8000/`: click Sign in with Google → complete the Google redirect → land back signed in with an empty match list. Create a new match (⋯ → New), add an event, confirm "Saved ✓"/"Auto-saved ✓". Reload the page → it resumes signed in (no re-sign-in) and the match is still there. Open ⋯ → Resync → "Synced ✓". Open ⋯ → "Sign out (…)" → returns to the sign-in screen. In the Supabase dashboard → Table Editor → `matches`: confirm a row exists with your `owner` uuid and populated `match_date`/`my_team`/`sport` columns.

- [ ] **Step 15: Commit**

```bash
git add index.html
git commit -m "Cutover auth + storage from Drive/GIS to Supabase"
```

---

## Task 5: Update docs + version bump

**Files:**
- Modify: `index.html:40` (`APP_VERSION`)
- Modify: `CLAUDE.md` (the "Auth + storage (no server)" section + known-limitations)
- Modify: `SETUP.md` (replace the Google Cloud OAuth + Drive setup with Supabase setup)

- [ ] **Step 1: Bump `APP_VERSION` (`:40`)**

Change `const APP_VERSION = "v36";` → `const APP_VERSION = "v37";`.

- [ ] **Step 2: Rewrite the CLAUDE.md backend section**

In `CLAUDE.md`, replace the **"### Auth + storage (no server)"** block with a Supabase description covering: GitHub Pages still serves the static page; the backend is now a Supabase project (Postgres + Auth); auth is Supabase Google OAuth via `signInWithOAuth` (full-page redirect, session persisted in `localStorage` and auto-refreshed — so the old token-lifecycle/keep-alive/banner machinery is gone); storage is the `matches` table (row-per-match, promoted columns + `data jsonb`) with owner-keyed RLS; `SUPABASE_URL`/`SUPABASE_ANON_KEY` are public (safe behind RLS); the `store` API surface (`list/get/set/del`) and in-memory `cache` are unchanged so `MatchTracker` is untouched; per-match `is_public`/`hide_names` columns exist but are dormant (future public sharing + youth name redaction). Update the **"Known limitations / next steps"** list: remove the "sign-in needed after ~1h / tab close" item (auto-refresh fixes it) and the "Drive flow can only be exercised on the deployed page" note (localhost redirect enables local testing); the `store` API description ("same shapes the original artifact's `window.storage` wrapper had") still holds.

- [ ] **Step 3: Rewrite SETUP.md**

Replace the Google Cloud OAuth + GitHub Pages content of `SETUP.md` with the Supabase setup, mirroring Task 1: create a Supabase project; run the `matches` schema + RLS SQL; enable the Google auth provider (with the Google Cloud OAuth client + the `…supabase.co/auth/v1/callback` redirect URI); set Site URL + redirect allowlist (Pages origin + localhost); copy `SUPABASE_URL` + anon key into `index.html`; deploy to GitHub Pages. Keep the GitHub Pages deploy steps.

- [ ] **Step 4: JSX syntax check (version line lives in the babel block)**

Run:
```bash
sed -n '/<script type="text\/babel"/,/<\/script>/p' index.html | sed '1d;$d' > /tmp/sideline-app.jsx
npx esbuild /tmp/sideline-app.jsx --loader:.jsx=jsx --outfile=/dev/null
```
Expected: no output (exit 0).

- [ ] **Step 5: Commit**

```bash
git add index.html CLAUDE.md SETUP.md
git commit -m "Docs + v37: describe Supabase backend, drop fixed limitations"
```

---

## Task 6: Cutover deploy + data migration (human, on `main`)

Performed by the owner once the branch is reviewed and merged. No code changes — execution + verification.

**Files:** none (operational).

- [ ] **Step 1: Confirm the safety-net export exists**

Confirm `backup.json` (the v36 Backup export, already captured and gitignored) is present locally. If not, on the still-live v36 page open ⋯ → Backup, copy the export JSON, and save it as `backup.json` before deploying.

- [ ] **Step 2: Merge + deploy**

Merge `supabase-migration` → `main` and push. GitHub Pages serves with `max-age=600`, so allow ~10 min + a hard refresh. Confirm the version beside the SIDELINE logo reads **v37**.

- [ ] **Step 3: Sign in on the deployed page**

Open https://seaninryan.github.io/sideline/ → Sign in with Google → land signed in with an empty match list.

- [ ] **Step 4: Import the existing matches**

Open ⋯ → Backup → paste the contents of `backup.json` into the import box → Import. Expect "Imported N matches ✓" (N = your match count). Each match gets a fresh UUID and writes to Supabase under your `owner`.

- [ ] **Step 5: Verify the migration**

Confirm every match appears in the dropdown. Open the canonical/known match and spot-check totals against the pre-migration data (e.g. the sample GAA match should read Racoons 2-6, Wildebeests 2-7, Loss). In the Supabase dashboard → Table Editor → `matches`, confirm N rows, each with your `owner` uuid and populated `match_date`/`my_team`/`opponent`/`sport`.

- [ ] **Step 6: Decommission Drive (optional)**

The old Drive `appDataFolder/sideline.json` is now orphaned and harmless. Delete it manually from Google Drive if desired. No action needed in the app.

---

## Self-review notes

- **Spec coverage:** Auth layer (Task 4 §3,§11), Google OAuth config (Task 1 §4-5), data model + RLS (Task 1 §2-3), isolation guarantee (Task 1 §7 verifies anon sees nothing; RLS enforced server-side), storage layer + per-row writes (Task 4 §1), promoted columns incl. opponent via parser (Task 4 §1 `matchCols`), `cache` mirror preserved (Task 4 §1), `doResync` simplified (Task 4 §7), token machinery + banners deleted (Task 4 §1,§2,§4,§7,§10,§11), sign-out affordance (Task 4 §3,§9), UUID remap on import (Task 2), dormant `is_public`/`hide_names` (Task 1 §2), migration/cutover sequence (Task 6), config values (Task 3 §2), docs + version (Task 5), `backup.json` gitignored (already done on the branch). All spec sections map to a task.
- **Type/name consistency:** `mkId`/`remapImport`/`matchCols`/`loadAll`/`store`/`cache` are defined once and referenced consistently; `remapImport` returns `[{id, rec}]` and `doImport` destructures `{ id, rec }` accordingly.
- **No placeholders:** the only `<…>` tokens are real per-environment secrets/refs (`<PROJECT_REF>`, `<SUPABASE_ANON_KEY>`) the owner fills from Task 1 — intentional, not TODOs.
