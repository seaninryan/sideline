# Sideline — standalone app setup (GitHub Pages + Google Drive)

You'll do three things: set up a Google sign-in, paste its ID into the app, and host the file on GitHub Pages. ~20 minutes, all free.

**How "only me" works:** the page itself is just an empty shell (no data, no secrets), so it's fine that the URL is reachable. All your match data lives in a hidden folder in *your* Google Drive, behind your Google login — and you'll lock sign-in to your account only by keeping the consent screen in "Testing".

---

## A. Google side (~10 min)

1. Go to **console.cloud.google.com** and sign in with the Google account whose Drive you want to use.
2. Top bar → project dropdown → **New Project**. Name it `Sideline`, create it, then make sure it's selected.
3. **Enable the Drive API:** left menu → *APIs & Services → Library* → search **Google Drive API** → **Enable**.
4. **Consent screen:** *APIs & Services → OAuth consent screen*.
   - User type: **External** → Create.
   - App name `Sideline`; put your own email in the support + developer contact fields. Save and continue.
   - Scopes page: just **Save and continue** (the app asks for its scope at runtime).
   - Test users: **Add users** → enter **your own Google email** → Save.
   - Leave the publishing status as **Testing**. Do *not* publish. In Testing, only the test users you listed can ever sign in — that's your "only me" lock.
5. **Create the credential:** *APIs & Services → Credentials → Create credentials → OAuth client ID*.
   - Application type: **Web application**.
   - Under **Authorized JavaScript origins** → Add URI → enter exactly:
     `https://YOURUSERNAME.github.io`
     (just the origin — no repo name, no trailing slash. Replace YOURUSERNAME with your GitHub username.)
   - Create. **Copy the Client ID** (looks like `1234567-abcd.apps.googleusercontent.com`).

## B. Paste the Client ID into the app

6. Open **sideline.html** in any text editor. Near the top find:
   `const CLIENT_ID = "PASTE_YOUR_CLIENT_ID_HERE.apps.googleusercontent.com";`
   Replace the placeholder with your real Client ID. Save.

## C. Host it on GitHub Pages (~5 min)

7. Create a new GitHub repository. **Make it public** — the file contains no secrets (the Client ID is meant to be public), and free GitHub Pages only serves public repos. Your data stays private via Google regardless.
8. Rename **sideline.html → index.html** and add it to the repo (web UI: *Add file → Upload files*, or `git push`).
9. Repo **Settings → Pages** → Source: *Deploy from a branch* → Branch **main**, folder **/ (root)** → Save. After a minute it shows your URL: `https://YOURUSERNAME.github.io/REPONAME/`.

## D. Use it

10. Open your Pages URL. Tap **Sign in with Google**, choose your account.
    - You'll likely see a **"Google hasn't verified this app"** screen — that's normal for your own Testing app. Click **Advanced → Go to Sideline (unsafe)**. It's safe; it's yours.
    - Grant the one permission it asks for. The scope is `drive.appdata` — it can only touch its *own* hidden folder, never the rest of your Drive.
11. Sign in on your phone at the **same URL with the same account** and your matches are already there. Add it to your home screen for a full-screen app:
    - iPhone/Safari: Share → **Add to Home Screen**.
    - Android/Chrome: ⋮ → **Add to Home screen**.

## Bringing your existing matches over

Your matches from the chat version are stored in that interface, not in Drive. To move them: in the old version tap **Backup → Copy**, then in the new app tap **Backup**, paste into **Import**, and Import. From then on everything lives in Drive.

## Good to know

- A sign-in lasts about an hour. If a save ever fails after a long idle, just reload and sign in again.
- Want it truly private at the hosting level too? Private GitHub Pages needs a paid GitHub plan; with the free public repo, the *code* is visible but your *data* never is.
- If sign-in throws "origin mismatch", the Authorized JavaScript origin in step 5 doesn't exactly match your Pages origin (check https, no trailing slash, correct username).
