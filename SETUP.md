# Sideline — standalone app setup (Supabase + GitHub Pages)

You'll do three things: create a Supabase project with the right schema and Google OAuth, paste the connection details into the app, and host the file on GitHub Pages. ~25 minutes, all free tiers.

**How it works:** the page is a static file with no server. All match data lives in a Supabase Postgres database behind your Google login, protected by Row-Level Security — only your account can read or write your rows. The anon key embedded in the file is intentionally public; RLS is the security boundary.

---

## A. Supabase project (~10 min)

1. Go to **supabase.com**, sign in, and create a new project. Note your **Project URL** and **anon public key** (both visible in *Project Settings → API*).

2. In the Supabase SQL editor run the following to create the schema and policies:

```sql
create table matches (
  id          uuid primary key,
  owner       uuid not null default auth.uid(),
  is_public   bool not null default false,
  hide_names  bool not null default false,
  match_date  timestamptz,
  my_team     text,
  opponent    text,
  sport       text,
  data        jsonb not null,
  updated_at  timestamptz not null default now()
);

alter table matches enable row level security;

create policy own_all on matches
  for all
  using  (owner = auth.uid())
  with check (owner = auth.uid());

create policy public_read on matches
  for select
  using (is_public = true);
```

## B. Google OAuth (~10 min)

3. **Create a Google OAuth client:** go to **console.cloud.google.com**, create (or reuse) a project, and navigate to *APIs & Services → Credentials → Create credentials → OAuth client ID*.
   - Application type: **Web application**.
   - Under **Authorised redirect URIs** add exactly:
     `https://<YOUR_PROJECT_REF>.supabase.co/auth/v1/callback`
     (Replace `<YOUR_PROJECT_REF>` with your Supabase project reference, visible in the Project URL.)
   - Create. **Copy the Client ID and Client Secret.**

4. **Wire it into Supabase:** in your Supabase project go to *Authentication → Providers → Google*. Enable it, paste the Client ID and Client Secret from step 3, and save.

5. **Set redirect URLs:** in Supabase *Authentication → URL Configuration*:
   - **Site URL:** `https://YOURUSERNAME.github.io/REPONAME/`
   - **Redirect URLs:** add both:
     - `https://YOURUSERNAME.github.io/REPONAME/`
     - `http://localhost:8000/` (for local testing)

## C. Paste the connection details into the app

6. Open **index.html** in any text editor. Near the top of the `<script type="text/babel">` block find:

```js
const SUPABASE_URL  = "...";
const SUPABASE_ANON_KEY = "...";
```

Replace the placeholders with your Project URL and anon public key from step 1. Save.

## D. Host it on GitHub Pages (~5 min)

7. Create a new GitHub repository. **Make it public** — free GitHub Pages only serves public repos. Your match data is protected by Supabase RLS regardless of whether the source file is visible.
8. Add **index.html** (and the icon files) to the repo (web UI: *Add file → Upload files*, or `git push`).
9. Repo **Settings → Pages** → Source: *Deploy from a branch* → Branch **main**, folder **/ (root)** → Save. After a minute it shows your URL: `https://YOURUSERNAME.github.io/REPONAME/`.

## E. Use it

10. Open your Pages URL. Tap **Sign in with Google** and choose your account. You'll be redirected to Google and back — the session persists in the browser and auto-refreshes, so you won't need to sign in again until you explicitly sign out.
11. Sign in on your phone at the **same URL with the same account** and your matches are already there. Add it to your home screen for a full-screen app:
    - iPhone/Safari: Share → **Add to Home Screen**.
    - Android/Chrome: ⋮ → **Add to Home screen**.

## Local testing

Open a terminal in the repo folder and run `python3 -m http.server 8000`, then visit `http://localhost:8000/`. Google OAuth redirects back to `localhost:8000` which is in the allowlist from step 5, so the full sign-in flow works locally.

## Bringing your existing matches over

If you have matches from an older version of the app, use Backup export/import: in the old version tap **⋯ → Backup → Copy**, then in the new app tap **⋯ → Backup**, paste into **Import**, and tap Import. IDs are remapped to UUIDs automatically.

## Good to know

- Want it truly private at the hosting level too? Private GitHub Pages needs a paid GitHub plan; with a free public repo, the *code* is visible but your *data* never is (Supabase RLS).
- If sign-in throws a redirect-mismatch error, check that the redirect URL in step 5 exactly matches your Pages URL (https, correct username and repo name, trailing slash).
- The app version is shown beside the SIDELINE logo. Pages serves with `max-age=600`, so a new deploy can take ~10 min + a hard refresh to appear.
