# Here We Go — setup guide (Supabase + Google OAuth + Vercel)

You'll do three things: create a Supabase project with the right schema and Google OAuth, deploy to Vercel, and wire the connection details together. ~25 minutes, all free tiers.

**How it works:** the app runs on Vercel (Next.js). All match data lives in a Supabase Postgres database behind your Google login, protected by Row-Level Security — only your account can read or write your rows. The anon key embedded in the app is intentionally public; RLS is the security boundary.

---

## A. Supabase project (~10 min)

1. Go to **supabase.com**, sign in, and create a new project. Note your **Project URL** and **anon public key** (both visible in *Project Settings → API*).

2. In the Supabase SQL editor run the following to create the schema and policies:

```sql
create table matches (
  id           uuid primary key,
  owner        uuid not null default auth.uid(),
  is_public    bool not null default false,
  name_display text not null default 'full',
  match_date   timestamptz,
  my_team      text,
  opponent     text,
  sport        text,
  data         jsonb not null,
  updated_at   timestamptz not null default now()
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

> **`name_display`** controls how player names appear on the public read-only page:
> `'full'` (default) — show names as written; `'initials'` — first initial of each word; `'none'` — shirt number only. The app sets this through the Share wizard.

## B. Google OAuth (~10 min)

3. **Create a Google OAuth client:** go to **console.cloud.google.com**, create (or reuse) a project, and navigate to *APIs & Services → Credentials → Create credentials → OAuth client ID*.
   - Application type: **Web application**.
   - Under **Authorised redirect URIs** add exactly:
     `https://<YOUR_PROJECT_REF>.supabase.co/auth/v1/callback`
     (Replace `<YOUR_PROJECT_REF>` with your Supabase project reference, visible in the Project URL.)
   - Create. **Copy the Client ID and Client Secret.**

4. **Wire it into Supabase:** in your Supabase project go to *Authentication → Providers → Google*. Enable it, paste the Client ID and Client Secret from step 3, and save.

5. **Set redirect URLs:** in Supabase *Authentication → URL Configuration*:
   - **Site URL:** your Vercel production URL (e.g. `https://your-app.vercel.app`)
   - **Redirect URLs:** add all the URLs you'll sign in from:
     - `https://your-app.vercel.app/auth/callback`
     - `http://localhost:3000/auth/callback` (for local development)

   The redirect URL must end with `/auth/callback` — this is the route handler that exchanges the OAuth code for a session.

## C. Deploy to Vercel (~5 min)

6. Push the repository to GitHub (or fork it). Make it public or private — your match data is in Supabase regardless.

7. Go to **vercel.com**, create a new project, and import the repository. Vercel detects Next.js automatically; `vercel.json` in the repo pins `framework: nextjs` to prevent mis-detection.

8. In the Vercel project settings under **Environment Variables**, add:

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase Project URL (from step 1) |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Your Supabase anon public key (from step 1) |

9. Deploy. Vercel gives you a URL like `https://your-app.vercel.app`.

10. Go back to step 5 and make sure this URL (with `/auth/callback`) is in Supabase's Redirect URLs list.

## D. Local development

11. Clone the repo and create `.env.local` in the project root:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

12. Run:

```bash
nvm use 20
npm install
npm run dev   # → http://localhost:3000
```

Ensure `http://localhost:3000/auth/callback` is in Supabase's Redirect URLs (step 5). The full sign-in flow works locally with the same credentials.

## E. Use it

13. Open the app URL. Tap **Sign in with Google** and choose your account. You'll be redirected to Google and back — the session is stored in a cookie and the browser client auto-refreshes it, so you won't need to sign in again until you explicitly sign out.

14. Sign in on your phone at the **same URL with the same Google account** and your matches are already there. Add it to your home screen for a full-screen experience:
    - iPhone/Safari: Share → **Add to Home Screen**.
    - Android/Chrome: ⋮ → **Add to Home screen**.

## Bringing your existing matches over

If you have matches from an older version of the app, use Backup export/import: in the old version tap **⋯ → Backup → Copy**, then in the new app tap **⋯ → Backup**, paste into **Import**, and tap Import. IDs are remapped to UUIDs automatically.

## Good to know

- If sign-in throws a redirect-mismatch error, check that the redirect URL in Supabase (step 5) exactly matches the URL being used, including `/auth/callback` and the correct scheme (`https` vs `http`).
- The app version is shown beside the HERE WE GO logo. A new Vercel deploy is usually live within a minute or two; hard-refresh if the version number doesn't update.
- The public share link (`/m/<id>`) is only accessible when you've published a match through the Share wizard. Unpublished matches are always private (RLS).
