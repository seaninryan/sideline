# New-Match Wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A full-screen big-button wizard for "New": Date (default now) → Your team → Opponent, with previous-team lookup that carries colours and sport, saving to Drive on finish.

**Architecture:** A `nw` state object in `MatchTracker`, rendered exactly like game mode — conditional render in normal flow (never a fixed overlay; they don't get taps in mobile webviews). The existing `!gm` chrome wraps become `!(gm || nw)`; the scoreboard additionally hides during the wizard. Previous teams are mined from `cache` by parsing each record's header line. Nothing mutates editor state until the final step.

**Tech Stack:** Single-file React 18 + Babel standalone (`index.html` is the source of truth). No build step.

**Spec:** `docs/superpowers/specs/2026-06-07-new-match-wizard-design.md`

**Testing reality:** Automated tests cover only the pure parser/raw-edit helpers (`node tools/run-tests.js`) — they must stay green; this feature doesn't touch the parser. UI verification = esbuild JSX syntax check + manual walkthrough on the deployed page. Do not invent a UI test harness.

**Verification commands (every task):**

```bash
# JSX syntax check (Node 18+; nvm use 18)
sed -n '/<script type="text\/babel"/,/<\/script>/p' index.html | sed '1d;$d' > /tmp/sideline-app.jsx
npx esbuild /tmp/sideline-app.jsx --loader:.jsx=jsx --outfile=/dev/null

# Parser regression tests
node tools/run-tests.js
```

Expected: esbuild exits 0 silently; run-tests ends `all passed`.

**Existing symbols you'll use (all already in `index.html`):** `cache` (id → saved record `{raw, myTeam, sport, colorUs, colorUs2, colorThem, colorThem2, date, savedAt, …}`), `saved` (match list state), `dateKey(s, fb)`, `toLocalInput(d)`, `squash(s)`, `isPlaceholderLabel(s)`, `parseMatch(raw, settings)`, `SPORTS` (key → `{label, emoji, mode}`), `contrastOn(hex)`, `store.set(id, data)`, `ensureFreshToken()`, `refreshList()`, `effMode`, state setters `setRaw/setMyTeam/setSport/setAutoMode/setScoringMode/setColorUs/setColorUs2/setColorThem/setColorThem2/setMatchDate/setCurId/setTab/setSavedMsg`, plus the game-mode pieces `gm`, `setGm`, `view`, `.mt-game` CSS.

---

### Task 1: `nw` state, takeover plumbing, previous-team lookup

**Files:**
- Modify: `index.html` (line numbers are pre-change, from v35)

- [ ] **Step 1: Add the `nw` state**

Directly after the `gm` state (line ~1202):

```jsx
  // new-match wizard: null when off, else {stage:"date"|"us"|"opp", date, team, label,
  // sport (null = none supplied yet), homeAway, colors:[c,c2]|null, oppName}
  const [nw, setNw] = useState(null);
```

- [ ] **Step 2: Widen the chrome wraps**

The six game-mode wraps hide chrome for the wizard too. At lines ~1728, 1747, 1774, 1804, 1831, 1884 change each `!gm` to `!(gm || nw)`:

- `{!gm && (` → `{!(gm || nw) && (`  (top bar, line ~1728)
- `{!gm && menuOpen && (` → `{!(gm || nw) && menuOpen && (`
- `{!gm && modal && (` → `{!(gm || nw) && modal && (`
- `{!gm && (` → `{!(gm || nw) && (`  (settings strip, line ~1804)
- `{!gm && colorPick && (() => {` → `{!(gm || nw) && colorPick && (() => {`
- `{!gm && (` → `{!(gm || nw) && (`  (tabs row, line ~1884)

- [ ] **Step 3: Hide the scoreboard during the wizard only**

Wrap the scoreboard div (opens line ~1860 `<div className="mt-board">`, closes line ~1881 — the `</div>` after `.mt-resbar`) in `{!nw && (` … `)}`. It stays visible in game mode (`gm`) — only `nw` hides it, because it would show the previous match's score.

- [ ] **Step 4: Extend the `view` switch**

Line ~1721:

```jsx
  const view = gm ? "game" : nw ? "new" : tab; // game mode / new-match wizard replace the tab body
```

- [ ] **Step 5: Add the previous-team lookup**

Directly after the `usedColors` useMemo (ends line ~1232, `}, [saved]);`):

```jsx
  // previous teams for the new-match wizard, most recent fixture first.
  // Parsing just the header line is cheap and reuses the canonical header logic.
  const prevTeams = useMemo(() => {
    const recs = Object.keys(cache).map((id) => cache[id] || {})
      .sort((a, b) => dateKey(b.date, b.savedAt || 0) - dateKey(a.date, a.savedAt || 0));
    const us = [], opps = [], usSeen = new Set(), oppSeen = new Set();
    for (const d of recs) {
      let h = {};
      try { h = parseMatch((d.raw || "").split("\n")[0], {}).header; } catch (e) {}
      const team = (d.myTeam || "").trim();
      const label = isPlaceholderLabel(h.label) ? "" : (h.label || "").trim();
      const uk = squash(team) + "|" + squash(label);
      if (team && !usSeen.has(uk)) { usSeen.add(uk); us.push({ team, label, colorUs: d.colorUs, colorUs2: d.colorUs2, sport: d.sport || "" }); }
      const opp = (h.opposition || "").trim();
      if (opp && !isPlaceholderLabel(opp) && opp.toLowerCase() !== "opponent" && !oppSeen.has(squash(opp))) {
        oppSeen.add(squash(opp));
        opps.push({ name: opp, colorThem: d.colorThem, colorThem2: d.colorThem2, sport: d.sport || "" });
      }
    }
    return { us, opps };
  }, [saved]);
```

- [ ] **Step 6: Add `enterNew` and rewire the New button**

Directly after `exitGame` (line ~1512):

```jsx
  // the wizard touches nothing until its final step, so Cancel is just setNw(null)
  const enterNew = () => { setMenuOpen(false); setModal(null); setColorPick(null); setBlkEdit(null); setBlkIns(null); setLineupEdit(null); setGm(null); setNw({ stage: "date", date: toLocalInput(new Date()), team: "", label: "", sport: null, homeAway: "away", colors: null, oppName: "" }); };
```

In the overflow menu (line ~1749), change the New button:

```jsx
          <button className="mt-btn" onClick={enterNew}>New</button>
```

(was `onClick={() => { setMenuOpen(false); doNew(); }}` — `enterNew` closes the menu itself).

- [ ] **Step 7: Verify**

Run both verification commands. Expected: esbuild clean; parser tests `all passed`.

- [ ] **Step 8: Commit**

```bash
git add index.html
git commit -m "New-match wizard: state, takeover plumbing, previous-team lookup"
```

(Intermediate state: New opens a blank full-screen body with no way out — Task 2 adds the wizard. Don't deploy.)

---

### Task 2: `doNew` clock-line drop, `finishNew`, wizard body

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Drop the auto clock line from `doNew`**

Replace `doNew` (line ~1374) with:

```jsx
  const doNew = () => {
    // header + roster stub only — the half starts when Start half is tapped at throw-in
    setRaw(`${myTeam.trim() || "My Team"} @ Opponent\n1 \n`);
    setMatchDate(toLocalInput(new Date())); setCurId(null); setNw(null); setTab("notation");
  };
```

(Changes: no `HH:MM` line in the template; `setNw(null)` so the wizard's Skip button closes the wizard.)

- [ ] **Step 2: Add `finishNew`**

Directly after `enterNew`:

```jsx
  // build + save the wizard's match directly — recordPayload() would read pre-update state.
  // Sport precedence: your team's pick wins; the opponent's only fills a gap; else keep current.
  const finishNew = async (opp, oppColors, oppSport) => {
    const team = nw.team.trim() || "My Team";
    const label = nw.label.trim() || team;
    const newRaw = `${label} ${nw.homeAway === "home" ? "v" : "@"} ${opp.trim()}\n1 \n`;
    const newSport = nw.sport || oppSport || sport || "";
    const cu = nw.colors ? nw.colors[0] : colorUs, cu2 = nw.colors ? nw.colors[1] : colorUs2;
    const ct = oppColors ? oppColors[0] : colorThem, ct2 = oppColors ? oppColors[1] : colorThem2;
    const mode = SPORTS[newSport] ? SPORTS[newSport].mode : effMode;
    setRaw(newRaw); setMyTeam(team); setSport(newSport); setAutoMode(true); setScoringMode(mode);
    setColorUs(cu); setColorUs2(cu2); setColorThem(ct); setColorThem2(ct2);
    setMatchDate(nw.date); setNw(null); setTab("notation");
    const id = "m" + Date.now();
    await ensureFreshToken();
    const ok = await store.set(id, { raw: newRaw, matchDate: nw.date, date: nw.date, myTeam: team, scoringMode: mode, autoMode: true, sport: newSport || undefined, colorUs: cu, colorUs2: cu2, colorThem: ct, colorThem2: ct2, savedAt: Date.now() });
    if (ok) { setCurId(id); await refreshList(); setSavedMsg("Match created ✓"); setTimeout(() => setSavedMsg(""), 2000); }
    else { setCurId(null); setSavedMsg("NOT saved to Drive!"); setTimeout(() => setSavedMsg(""), 6000); }
  };
```

- [ ] **Step 3: Add the wizard body**

Inside `<div className="mt-body">`, directly before `{view === "game" && (` (line ~1893):

```jsx
        {view === "new" && (
          <div className="mt-game">
            <div className="mt-row" style={{ marginBottom: 12 }}>
              <span className="mt-h" style={{ margin: 0, flex: 1 }}>New match{nw.stage === "us" ? " — your team" : nw.stage === "opp" ? " — opposition" : ""}</span>
              <button className="mt-add alt" onClick={() => setNw(null)}>✕ Cancel</button>
            </div>

            {/* stage 1 — when? */}
            {nw.stage === "date" && (
              <>
                <p className="mt-note" style={{ marginTop: 0, marginBottom: 8 }}>When? — defaults to now</p>
                <div className="mt-row nw-date">
                  <input type="date" value={nw.date.slice(0, 10)} onChange={(e) => e.target.value && setNw({ ...nw, date: `${e.target.value}T${nw.date.slice(11, 16)}` })} />
                  <input type="time" value={nw.date.slice(11, 16)} onChange={(e) => e.target.value && setNw({ ...nw, date: `${nw.date.slice(0, 10)}T${e.target.value}` })} />
                </div>
                <div className="mt-grid" style={{ marginTop: 12 }}>
                  <button className="mt-big gm-team" onClick={() => setNw({ ...nw, stage: "us" })}>Next →</button>
                </div>
                <button className="mt-add alt" style={{ marginTop: 14 }} onClick={doNew}>Skip — blank match</button>
              </>
            )}

            {/* stage 2 — your team? */}
            {nw.stage === "us" && (
              <>
                <p className="mt-note" style={{ marginTop: 0, marginBottom: 8 }}>Your team? — picking applies name, colours and sport</p>
                <div className="mt-grid">
                  {prevTeams.us.map((t) => (
                    <button key={t.team + "|" + t.label} className="mt-big nw-team" style={{ background: t.colorUs || "#f5c518", color: contrastOn(t.colorUs || "#f5c518"), borderColor: t.colorUs2 || "var(--line)" }}
                      onClick={() => setNw({ ...nw, stage: "opp", team: t.team, label: t.label || t.team, sport: t.sport || null, colors: [t.colorUs || colorUs, t.colorUs2 || colorUs2] })}>
                      {SPORTS[t.sport] ? SPORTS[t.sport].emoji + " " : ""}{t.team}{t.label && squash(t.label) !== squash(t.team) ? <span className="sub"> · {t.label}</span> : null}
                    </button>
                  ))}
                </div>
                <p className="mt-note" style={{ margin: "12px 0 4px" }}>…or a new team</p>
                <div className="mt-row">
                  <input className="nw-in" placeholder="team name" value={nw.team} onChange={(e) => setNw({ ...nw, team: e.target.value })} />
                  <input className="nw-in" placeholder="grade/label (optional)" value={nw.label} onChange={(e) => setNw({ ...nw, label: e.target.value })} />
                  <button className="mt-add" disabled={!nw.team.trim()} onClick={() => setNw({ ...nw, stage: "opp", sport: null, colors: null })}>Next →</button>
                </div>
                <button className="mt-add alt" style={{ marginTop: 12 }} onClick={() => setNw({ ...nw, stage: "date" })}>← Back</button>
              </>
            )}

            {/* stage 3 — against? (picking an opponent finishes the wizard) */}
            {nw.stage === "opp" && (
              <>
                <div className="mt-grid" style={{ marginBottom: 10 }}>
                  <button className={"mt-big" + (nw.homeAway === "home" ? " on" : " off")} onClick={() => setNw({ ...nw, homeAway: "home" })}>Home v</button>
                  <button className={"mt-big" + (nw.homeAway === "away" ? " on" : " off")} onClick={() => setNw({ ...nw, homeAway: "away" })}>Away @</button>
                </div>
                <p className="mt-note" style={{ marginTop: 0, marginBottom: 8 }}>Against? — picking applies their colours</p>
                <div className="mt-grid">
                  {prevTeams.opps.map((o) => (
                    <button key={o.name} className="mt-big nw-team" style={{ background: o.colorThem || "#c0392b", color: contrastOn(o.colorThem || "#c0392b"), borderColor: o.colorThem2 || "var(--line)" }}
                      onClick={() => finishNew(o.name, [o.colorThem || colorThem, o.colorThem2 || colorThem2], o.sport || null)}>
                      {o.name}
                    </button>
                  ))}
                </div>
                <p className="mt-note" style={{ margin: "12px 0 4px" }}>…or a new opponent</p>
                <div className="mt-row">
                  <input className="nw-in" placeholder="opponent" value={nw.oppName} onChange={(e) => setNw({ ...nw, oppName: e.target.value })} />
                  <button className="mt-add" disabled={!nw.oppName.trim()} onClick={() => finishNew(nw.oppName, null, null)}>Create →</button>
                </div>
                <button className="mt-add alt" style={{ marginTop: 12 }} onClick={() => setNw({ ...nw, stage: "us" })}>← Back</button>
              </>
            )}
          </div>
        )}
```

- [ ] **Step 4: Verify**

Run both verification commands. Expected: esbuild clean; parser tests `all passed`.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "New-match wizard: date → your team → opponent, saves on create"
```

---

### Task 3: CSS + version bump

**Files:**
- Modify: `index.html` (CSS template string; `APP_VERSION` line 40)

- [ ] **Step 1: Add wizard CSS**

In the CSS template string, directly after the `.mt-game .gm-undo .t` rule (the last game-mode rule, line ~1092), add:

```css
/* new-match wizard: shares the .mt-game sizing; team buttons wear their kit */
.mt-game .nw-team{border-width:3px; font-size:17px;}
.mt-game .nw-team .sub{font-weight:400; opacity:.85; text-transform:none;}
.mt-game .nw-date input{font-size:18px; padding:12px 10px; border:1px solid var(--line); border-radius:10px; font-family:'Oswald'; background:#fffdf6;}
.mt-game .nw-in{flex:1 1 140px; font-size:16px; padding:11px 10px; border:1px solid var(--line); border-radius:10px; font-family:'Oswald'; background:#fffdf6;}
```

- [ ] **Step 2: Bump the version**

Line 40: `const APP_VERSION = "v35";` → `const APP_VERSION = "v36";`

- [ ] **Step 3: Verify**

Run both verification commands. Expected: esbuild clean; parser tests `all passed`.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "New-match wizard: CSS; bump to v36"
```

---

### Task 4: Document + deploy

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Document the wizard in CLAUDE.md**

In `CLAUDE.md`, after the "### Game mode (full-screen live entry, v34)" section, add:

```markdown
### New-match wizard (v36)

- "New" (⋯ menu) opens a full-screen wizard in the same takeover slot as game mode (`nw` state; chrome wraps are `!(gm || nw)`; the scoreboard also hides — it would show the previous match): **Date (default now) → Your team → Opponent**. Both team steps offer big kit-coloured buttons mined from `cache` (`prevTeams`: distinct myTeam+label combos / opposition names, header line parsed via `parseMatch`, most recent first); picking applies name, colours, and sport (your team's sport wins; an opponent's only fills a gap). Skip gives the blank template; Cancel touches nothing (state only mutates in `finishNew`).
- `finishNew` builds the record locally (not `recordPayload()` — stale state) and saves to Drive immediately, so auto-save is live from creation.
- New matches (wizard and blank) no longer seed a clock line — every match starts at phase "pre" and Start half opens H1 at throw-in.
```

- [ ] **Step 2: Final verify**

Run both verification commands one last time. Expected: esbuild clean; parser tests `all passed`.

- [ ] **Step 3: Commit and push**

```bash
git add CLAUDE.md
git commit -m "CLAUDE.md: document the new-match wizard (v36)"
git push
```

- [ ] **Step 4: Tell the user**

GitHub Pages caches ~10 min. Tell Sean: **look for v36**, then try ⋯ → New on the phone — date defaults to now, previous teams appear with their colours/sport, opponents likewise; finishing lands on Notation already saved ("Match created ✓"); Skip still gives the blank match; note that new matches no longer pre-start the half — tap Start half at throw-in.
