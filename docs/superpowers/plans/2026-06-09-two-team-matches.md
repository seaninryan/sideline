# Two-Team Matches + Neutral Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Link matches to home/away team entities (frozen opponent-lineup snapshot, home/away swap, both lineups), surface real fixtures on team pages, and order all match lists by start time — without changing the scoring engine.

**Architecture:** Matches gain `home_team_id`/`away_team_id` promoted columns (derived in `store.set`) plus `data.homeTeamId/awayTeamId/oppRoster`. A pure `lib/team-link.ts` produces the match patch when linking teams (header + seeded roster + identity + oppRoster snapshot) and swaps home/away. A `LinkTeams` inline panel (mirroring `ShareSheet`) drives it from the editor for new and legacy matches. The opponent lineup renders from the frozen `oppRoster`. Team pages query fixtures by team id. List ordering moves from `updated_at` to `match_date`.

**Tech Stack:** Next.js 14, React 18, TypeScript, `@supabase/ssr`, Vitest. Node 20 — prefix test/build with `bash -lc 'source ~/.nvm/nvm.sh; nvm use 20 >/dev/null; cd /home/sean/workspace/sideline && <cmd>'`.

**Design doc:** `docs/superpowers/specs/2026-06-09-two-team-matches-design.md`. Branch: `two-team-matches`.

**⚠️ Requires a one-time Supabase migration (Task 7) before linking works.**

---

## File Structure

**Create:**
- `lib/team-link.ts` — `rosterToNotationLines`, `teamLinkPatch`, `swapHomeAway`. Pure.
- `test/team-link.test.ts`.
- `components/LinkTeams.tsx` — inline panel: pick us/opponent team + home/away → apply patch.

**Modify:**
- `lib/types.ts` — `MatchRecord` += `homeTeamId?`, `awayTeamId?`, `oppRoster?`.
- `lib/store.ts` — `matchCols` derives `home_team_id`/`away_team_id`.
- `components/Landing.tsx` — order own + feed by `match_date`; feed row date from `match_date`.
- `components/MatchTracker.tsx` — link state plumbing (load/save), `LinkTeams` panel + Link button + link-on-edit prompt, home/away swap control, opponent lineup on the Lineup tab.
- `components/PublicMatch.tsx` — opponent lineup section.
- `components/TeamPage.tsx` + `app/t/[id]/page.tsx` — Fixtures query + render.
- `docs/teams-migration.sql` — append the matches-columns migration.
- `lib/constants.ts` — `APP_VERSION` → `v49`.

**Untouched:** parser, model, scoring; the new-match wizard (→ ④).

---

## Task 1: Types + promoted columns

**Files:** Modify `lib/types.ts`, `lib/store.ts`.

- [ ] **Step 1: Extend `MatchRecord`** — in `lib/types.ts`, inside `interface MatchRecord { … }`, after the `nameDisplay?: NameDisplay;` line add:

```ts
  homeTeamId?: string | null;
  awayTeamId?: string | null;
  oppRoster?: TeamRoster;
```

(`TeamRoster` is already defined in this file from ③a.)

- [ ] **Step 2: Derive the promoted columns** — in `lib/store.ts`, replace:

```ts
  return {
    match_date: data.matchDate || data.date || null,
    my_team: data.myTeam || null,
    opponent: opp,
    sport: data.sport || null,
    name_display: data.nameDisplay || "full",
  };
```

with:

```ts
  return {
    match_date: data.matchDate || data.date || null,
    my_team: data.myTeam || null,
    opponent: opp,
    sport: data.sport || null,
    name_display: data.nameDisplay || "full",
    home_team_id: data.homeTeamId || null,
    away_team_id: data.awayTeamId || null,
  };
```

- [ ] **Step 3: Typecheck + commit**

Run: `bash -lc 'source ~/.nvm/nvm.sh; nvm use 20 >/dev/null; cd /home/sean/workspace/sideline && npx tsc --noEmit'` (clean).

```bash
git add lib/types.ts lib/store.ts
git commit -m "feat: match record team links + promoted home/away_team_id columns"
```

> The promoted columns only persist once the Task 7 migration is run; until then Supabase ignores unknown columns? No — it errors on unknown columns. So Task 7's migration must be run before saving a linked match in a real environment. The build/tests don't hit Supabase, so this is fine for CI; flagged in Task 7.

---

## Task 2: Pure team-link helpers

**Files:** Create `lib/team-link.ts`, `test/team-link.test.ts`.

- [ ] **Step 1: Write the failing test** — `test/team-link.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { rosterToNotationLines, teamLinkPatch, swapHomeAway } from "@/lib/team-link";
import type { MatchRecord, TeamRecord } from "@/lib/types";

const us: TeamRecord = { id: "u1", name: "Racoons", color1: "#f5c518", color2: "#1f7a4d", sport: "hurling",
  roster: { formation: [[1], [2, 3]], players: [
    { num: 1, name: "Birdperson", role: "starting" }, { num: 2, name: "Jerry", role: "starting" }, { num: 3, name: "Beth", role: "starting" }, { num: 16, name: "Sub", role: "sub" }] } };
const opp: TeamRecord = { id: "o1", name: "Wildebeests", color1: "#c0392b", color2: "#2c5fa8", sport: "hurling",
  roster: { formation: [[1]], players: [{ num: 1, name: "Keeper", role: "starting" }] } };

describe("rosterToNotationLines", () => {
  it("renders formation rows pipe-joined + a Subs section", () => {
    const out = rosterToNotationLines(us.roster);
    expect(out).toBe("1. Birdperson\n2. Jerry | 3. Beth\nSubs:\n16. Sub");
  });
  it("omits the Subs section when there are no subs", () => {
    expect(rosterToNotationLines(opp.roster)).toBe("1. Keeper");
  });
});

describe("teamLinkPatch", () => {
  const rec: MatchRecord = { raw: "U13A Hurling @ Old\n12:00\n5 Birdperson", myTeam: "Old", homeAway: undefined } as any;
  it("sets ids by home/away, identity, oppRoster, keeps the grade label", () => {
    const p = teamLinkPatch(rec, { usTeam: us, oppTeam: opp, homeAway: "home" });
    expect(p.homeTeamId).toBe("u1");      // us is home
    expect(p.awayTeamId).toBe("o1");
    expect(p.myTeam).toBe("Racoons");
    expect(p.colorUs).toBe("#f5c518");
    expect(p.colorThem).toBe("#c0392b");
    expect(p.oppRoster).toEqual(opp.roster);
    expect(p.oppRoster).not.toBe(opp.roster); // deep copy
    expect(p.raw.split("\n")[0]).toBe("U13A Hurling v Wildebeests"); // label kept, home symbol, opp name
  });
  it("away mapping swaps the ids", () => {
    const p = teamLinkPatch(rec, { usTeam: us, oppTeam: opp, homeAway: "away" });
    expect(p.homeTeamId).toBe("o1");
    expect(p.awayTeamId).toBe("u1");
    expect(p.raw.split("\n")[0]).toBe("U13A Hurling @ Wildebeests");
  });
  it("seeds the roster when the notation has none", () => {
    const p = teamLinkPatch(rec, { usTeam: us, oppTeam: opp, homeAway: "home" });
    // rec has a scoring line but NO roster lines → the us roster is seeded
    expect(p.raw).toContain("1. Birdperson");
    expect(p.raw).toContain("Subs:");
  });
  it("keeps an existing hand-entered roster intact (no reseed)", () => {
    const withRoster: MatchRecord = { raw: "U13A @ Old\n10. Morty | 11. Rick\n12:00\n5 Morty", myTeam: "Old" } as any;
    const p = teamLinkPatch(withRoster, { usTeam: us, oppTeam: opp, homeAway: "home" });
    expect(p.raw).toContain("10. Morty | 11. Rick"); // preserved
    expect(p.raw).not.toContain("Birdperson");        // not reseeded
  });
});

describe("swapHomeAway", () => {
  it("flips the header symbol and swaps the team ids", () => {
    const rec: MatchRecord = { raw: "U13A Hurling @ Wildebeests\n12:00", homeTeamId: "o1", awayTeamId: "u1" } as any;
    const p = swapHomeAway(rec);
    expect(p.raw.split("\n")[0]).toBe("U13A Hurling v Wildebeests");
    expect(p.homeTeamId).toBe("u1");
    expect(p.awayTeamId).toBe("o1");
  });
});
```

- [ ] **Step 2: Run it, confirm fail**

Run: `npm test -- team-link` → FAIL (module not found).

- [ ] **Step 3: Implement** — `lib/team-link.ts`:

```ts
import { parseMatch } from "@/lib/parser";
import { rosterEnd } from "@/lib/raw-edit";
import type { MatchRecord, TeamRecord, TeamRoster } from "@/lib/types";

// A team roster → the app's roster-notation block (formation rows pipe-joined, then a Subs section).
export function rosterToNotationLines(roster: TeamRoster): string {
  const byNum = (n: number) => roster.players.find((p) => p.num === n);
  const rows = roster.formation.map((row) =>
    row.map((n) => { const p = byNum(n); return `${n}. ${p ? p.name : ""}`.trim(); }).join(" | "));
  const subs = roster.players.filter((p) => p.role === "sub");
  if (subs.length) rows.push("Subs:", ...subs.map((p) => `${p.num}. ${p.name}`.trim()));
  return rows.join("\n");
}

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

// Rebuild the header's first non-empty line as "<label> <v|@> <opp>", keeping the existing grade label.
function setHeader(raw: string, oppName: string, homeAway: "home" | "away"): string {
  const label = (parseMatch(raw, {}).header.label || "Match").trim();
  const sym = homeAway === "home" ? "v" : "@";
  const line = `${label} ${sym} ${oppName}`.replace(/\s+/g, " ").trim();
  const lines = raw.split("\n");
  const hi = lines.findIndex((l) => l.trim() !== "");
  if (hi === -1) return line + "\n" + raw;
  lines[hi] = line;
  return lines.join("\n");
}

// Build the patch to apply when linking a match to two teams.
// us = the notated side; homeAway places us as home or away. Seeds the notation roster
// from the us team ONLY when the match has no roster yet (never clobbers a hand-entered lineup).
export function teamLinkPatch(
  record: MatchRecord,
  { usTeam, oppTeam, homeAway }: { usTeam: TeamRecord; oppTeam: TeamRecord; homeAway: "home" | "away" },
) {
  let raw = setHeader(record.raw, oppTeam.name, homeAway);
  const hasRoster = (() => { try { return parseMatch(record.raw, { myTeam: usTeam.name }).roster.length > 0; } catch { return false; } })();
  if (!hasRoster && usTeam.roster.formation.length) {
    const lines = raw.split("\n");
    const hi = lines.findIndex((l) => l.trim() !== "");
    lines.splice(hi + 1, 0, rosterToNotationLines(usTeam.roster));
    raw = lines.join("\n");
  }
  return {
    raw,
    myTeam: usTeam.name,
    colorUs: usTeam.color1 || record.colorUs,
    colorUs2: usTeam.color2 || record.colorUs2,
    colorThem: oppTeam.color1 || record.colorThem,
    colorThem2: oppTeam.color2 || record.colorThem2,
    homeTeamId: homeAway === "home" ? usTeam.id : oppTeam.id,
    awayTeamId: homeAway === "home" ? oppTeam.id : usTeam.id,
    oppRoster: clone(oppTeam.roster),
  };
}

// Swap which side is home: flip the header symbol (v↔@) and swap the team ids.
export function swapHomeAway(record: MatchRecord) {
  const ha = parseMatch(record.raw, {}).header.homeAway;
  const lines = record.raw.split("\n");
  const hi = lines.findIndex((l) => l.trim() !== "");
  if (hi !== -1) {
    lines[hi] = ha === "home"
      ? lines[hi].replace(/\s+v(?:s|\.)?\s+/i, " @ ")
      : lines[hi].replace(/\s+@\s+/, " v ");
  }
  return { raw: lines.join("\n"), homeTeamId: record.awayTeamId ?? null, awayTeamId: record.homeTeamId ?? null };
}
```

> `rosterEnd` import may be unused — remove it if your linter flags it (kept only if you choose to use it for roster detection; the implementation above uses `parseMatch(...).roster.length` instead). Confirm before committing.

- [ ] **Step 4: Run it, confirm PASS**

Run: `npm test -- team-link` → all pass.

- [ ] **Step 5: Commit**

```bash
git add lib/team-link.ts test/team-link.test.ts
git commit -m "feat: pure team-link helpers (roster→notation, link patch, swap)"
```

---

## Task 3: Match lists ordered by start time

**Files:** Modify `components/Landing.tsx`.

- [ ] **Step 1: Own-matches query → order by `match_date`**

Replace:
```tsx
    sb.from("matches").select("id,short_code,is_public,data,updated_at").eq("owner", userId)
      .order("updated_at", { ascending: false })
```
with:
```tsx
    sb.from("matches").select("id,short_code,is_public,data,updated_at").eq("owner", userId)
      .order("match_date", { ascending: false, nullsFirst: false })
```

- [ ] **Step 2: Feed query → order by `match_date`**

Replace:
```tsx
      .eq("is_public", true).order("updated_at", { ascending: false });
```
with:
```tsx
      .eq("is_public", true).order("match_date", { ascending: false, nullsFirst: false });
```

- [ ] **Step 3: Feed row date → start time**

Replace:
```tsx
          <MatchRow key={r.id} record={r.data} href={href(r)} date={relativeDate(r.updated_at, now)} />
```
with:
```tsx
          <MatchRow key={r.id} record={r.data} href={href(r)} date={relativeDate(r.data.matchDate || r.data.date, now)} />
```

- [ ] **Step 4: Build + commit**

Run: `npm run build` (Node 20) → success.
```bash
git add components/Landing.tsx
git commit -m "feat: order match lists by start time (match_date), not updated_at"
```

> `match_date` is an existing promoted column; ordering on it needs no migration. `nullsFirst:false` keeps undated matches at the bottom of a descending sort.

---

## Task 4: LinkTeams panel + editor wiring (link, swap, plumbing)

**Files:** Create `components/LinkTeams.tsx`. Modify `components/MatchTracker.tsx`.

This is the monolith-touching task. Apply MatchTracker edits by matching exact snippets; STOP + report BLOCKED on any mismatch.

- [ ] **Step 1: Create `components/LinkTeams.tsx`**

```tsx
"use client";
import React, { useEffect, useState } from "react";
import { teamStore } from "@/lib/team-store";
import { teamLinkPatch } from "@/lib/team-link";
import { SPORTS } from "@/lib/constants";
import type { MatchRecord, TeamRecord } from "@/lib/types";

// Inline panel to link a match to two team entities. `record` is the live match record and
// `currentHomeAway` its parsed venue; onApply receives the patch from teamLinkPatch
// (raw + identity + ids + oppRoster) to merge into editor state.
export default function LinkTeams({ userId, record, currentHomeAway, onApply, onClose }: {
  userId: string;
  record: MatchRecord;
  currentHomeAway: "home" | "away";
  onApply: (patch: ReturnType<typeof teamLinkPatch>) => void;
  onClose: () => void;
}) {
  const [teams, setTeams] = useState<TeamRecord[] | null>(null);
  const [usId, setUsId] = useState<string>(record.homeTeamId && record.awayTeamId
    ? (currentHomeAway === "home" ? record.homeTeamId : record.awayTeamId)! : "");
  const [oppId, setOppId] = useState<string>("");
  const [homeAway, setHomeAway] = useState<"home" | "away">(currentHomeAway);

  useEffect(() => { teamStore.list(userId).then(setTeams); }, [userId]);

  const apply = () => {
    const usTeam = (teams || []).find((t) => t.id === usId);
    const oppTeam = (teams || []).find((t) => t.id === oppId);
    if (!usTeam || !oppTeam) return;
    onApply(teamLinkPatch(record, { usTeam, oppTeam, homeAway }));
    onClose();
  };

  const opt = (t: TeamRecord) => <option key={t.id} value={t.id}>{t.sport && SPORTS[t.sport] ? SPORTS[t.sport].emoji + " " : ""}{t.name}</option>;

  return (
    <div className="mt-live" style={{ marginTop: 0 }}>
      <div className="mt-row"><span className="mt-h" style={{ margin: 0, flex: 1 }}>Link teams</span>
        <button className="mt-add alt" onClick={onClose}>✕ Close</button></div>
      {teams === null ? <p className="mt-note">Loading your teams…</p>
        : teams.length === 0 ? <p className="mt-note">No teams yet — create one in <b>Teams</b> first.</p>
        : <>
            <label className="te-field">Your team
              <select className="mt-sel" value={usId} onChange={(e) => setUsId(e.target.value)}><option value="">— pick —</option>{teams.map(opt)}</select></label>
            <label className="te-field">Opponent
              <select className="mt-sel" value={oppId} onChange={(e) => setOppId(e.target.value)}><option value="">— pick —</option>{teams.map(opt)}</select></label>
            <div className="mt-grid" style={{ marginBottom: 8 }}>
              <button className={"mt-big" + (homeAway === "home" ? " on" : " off")} onClick={() => setHomeAway("home")}>Home (v)</button>
              <button className={"mt-big" + (homeAway === "away" ? " on" : " off")} onClick={() => setHomeAway("away")}>Away (@)</button>
            </div>
            <p className="mt-note">Links the match for fixtures, seeds your lineup (if empty), and snapshots the opponent's lineup. Your scores aren't changed.</p>
            <button className="mt-add" disabled={!usId || !oppId || usId === oppId} onClick={apply}>Link</button>
          </>}
    </div>
  );
}
```

- [ ] **Step 2: MatchTracker — link state + load/save plumbing**

In `components/MatchTracker.tsx`, after the existing `const [share, setShare] = useState(false);` line add:

```tsx
  const [link, setLink] = useState(false);
  const [homeTeamId, setHomeTeamId] = useState(null);
  const [awayTeamId, setAwayTeamId] = useState(null);
  const [oppRoster, setOppRoster] = useState(null);
```

In `recordPayload`, add the three fields. Replace:
```tsx
  const recordPayload = () => ({ raw, matchDate, date: matchDate, myTeam, scoringMode: effMode, autoMode, sport: sport || undefined, colorUs, colorUs2, colorThem, colorThem2, nameDisplay });
```
with:
```tsx
  const recordPayload = () => ({ raw, matchDate, date: matchDate, myTeam, scoringMode: effMode, autoMode, sport: sport || undefined, colorUs, colorUs2, colorThem, colorThem2, nameDisplay, homeTeamId, awayTeamId, oppRoster });
```

In `doLoad`, after the `setNameDisplay(d.nameDisplay || "full");` line add:
```tsx
    setHomeTeamId(d.homeTeamId || null); setAwayTeamId(d.awayTeamId || null); setOppRoster(d.oppRoster || null);
```

In the `dirty` useMemo dependency array and the auto-save effect dependency array, append `homeTeamId, awayTeamId, oppRoster` so changes persist (both arrays currently end with `nameDisplay]`). Replace each occurrence of `colorThem, colorThem2, nameDisplay, saved]` → `colorThem, colorThem2, nameDisplay, homeTeamId, awayTeamId, oppRoster, saved]` (the dirty array) and `colorThem, colorThem2, nameDisplay]` → `colorThem, colorThem2, nameDisplay, homeTeamId, awayTeamId, oppRoster]` (the auto-save array). (There are two distinct arrays; the dirty one ends `…nameDisplay, saved]`, the auto-save one ends `…nameDisplay]`.)

- [ ] **Step 3: MatchTracker — Link button + apply handler + panels**

Add a Link button to the header children. Replace:
```tsx
          <button className="mt-btn" aria-label="Resync" title="Resync from server" onClick={doResync}>⟳</button>
```
with:
```tsx
          <button className="mt-btn" aria-label="Link teams" title="Link teams" onClick={() => { setShare(false); setLink((o) => !o); }}>🤝</button>
          <button className="mt-btn" aria-label="Resync" title="Resync from server" onClick={doResync}>⟳</button>
```

After the ShareSheet panel block (the `{!nw && share && curId && (…ShareSheet…)}` block, ending `)}`), add the LinkTeams panel:
```tsx
      {!nw && link && curId && (
        <LinkTeams
          userId={userEmailId}
          record={recordPayload()}
          currentHomeAway={header.homeAway === "home" ? "home" : "away"}
          onClose={() => setLink(false)}
          onApply={(p) => {
            setRaw(p.raw); setMyTeam(p.myTeam);
            setColorUs(p.colorUs); setColorUs2(p.colorUs2); setColorThem(p.colorThem); setColorThem2(p.colorThem2);
            setHomeTeamId(p.homeTeamId); setAwayTeamId(p.awayTeamId); setOppRoster(p.oppRoster);
            setSavedMsg("Teams linked ✓"); setTimeout(() => setSavedMsg(""), 2000);
          }}
        />
      )}
```

Add the import at the top (next to the ShareSheet import):
```tsx
import LinkTeams from "@/components/LinkTeams";
```

`LinkTeams` needs the user id. The component currently tracks `userEmail` (the email) via `sb.auth.getUser()`. Add an id alongside it: find:
```tsx
  useEffect(() => { sb.auth.getUser().then(({ data }) => setUserEmail((data && data.user && data.user.email) || "")); }, []);
```
and replace with:
```tsx
  const [userEmailId, setUserEmailId] = useState("");
  useEffect(() => { sb.auth.getUser().then(({ data }) => { setUserEmail((data && data.user && data.user.email) || ""); setUserEmailId((data && data.user && data.user.id) || ""); }); }, []);
```

> `currentHomeAway` is passed separately (parsed from the header) for the panel's initial guess — `MatchRecord` has no `homeAway` field, so we never stuff it into the record literal.

- [ ] **Step 4: MatchTracker — home/away swap control (settings)**

Add the import:
```tsx
import { swapHomeAway } from "@/lib/team-link";
```
In the settings block, the home/away `<select>` is inside a `<label>`. Immediately after that label's closing `</label>` (the one wrapping the `Away @ / Home v` select), add a swap button:
```tsx
        <button className="mt-btn" title="Swap home/away" onClick={() => {
          const p = swapHomeAway(recordPayload());
          setRaw(p.raw); setHomeTeamId(p.homeTeamId); setAwayTeamId(p.awayTeamId);
        }}>⇄ Swap</button>
```
(Find the block: the `<label>` containing `<option value="away">Away @</option>` … `</label>`, and insert the button right after its `</label>`.)

- [ ] **Step 5: MatchTracker — link-on-edit prompt for legacy matches**

After the auto-save `useEffect`, add a one-shot prompt effect:
```tsx
  // legacy matches (no team links) get a gentle one-time "Link teams?" nudge on open
  const linkNudged = useRef(false);
  useEffect(() => { linkNudged.current = false; }, [curId]);
  useEffect(() => {
    if (curId && !homeTeamId && !awayTeamId && !linkNudged.current && !nw) {
      linkNudged.current = true;
      setSavedMsg("Tip: link this match to teams (🤝) for fixtures + opponent lineup");
      setTimeout(() => setSavedMsg(""), 4000);
    }
  }, [curId, homeTeamId, awayTeamId, nw]);
```

- [ ] **Step 6: Typecheck + build + commit**

Run: `bash -lc 'source ~/.nvm/nvm.sh; nvm use 20 >/dev/null; cd /home/sean/workspace/sideline && npx tsc --noEmit && npm run build'` → clean + success.
```bash
git add components/LinkTeams.tsx components/MatchTracker.tsx
git commit -m "feat: LinkTeams panel + home/away swap + link-on-edit nudge"
```

---

## Task 5: Opponent lineup display

**Files:** Modify `components/MatchTracker.tsx`, `components/PublicMatch.tsx`.

- [ ] **Step 1: Editor Lineup tab — append the opponent pitch**

In `components/MatchTracker.tsx`, in the Lineup tab, replace the missing-list line + fragment close:
```tsx
            {missing.length > 0 && <><p className="mt-h" style={{ marginTop: 14 }}>Missing</p><div className="mt-bench">{missing.map((p) => <span className="b miss" key={p.num}>{p.num}. {p.name}</span>)}</div></>}
          </>
        )}
```
with:
```tsx
            {missing.length > 0 && <><p className="mt-h" style={{ marginTop: 14 }}>Missing</p><div className="mt-bench">{missing.map((p) => <span className="b miss" key={p.num}>{p.num}. {p.name}</span>)}</div></>}
            {oppRoster && oppRoster.formation && oppRoster.formation.length > 0 && (
              <>
                <p className="mt-h" style={{ marginTop: 18 }}>Opponent — {themName}</p>
                <div className="mt-pitch" style={{ background: `linear-gradient(${colorThem2}22, #0c3b2a 60%)` }}>
                  {oppRoster.formation.map((row, ri) => (
                    <div className="mt-line" key={ri}>
                      {row.map((n) => { const op = oppRoster.players.find((x) => x.num === n); return (
                        <div className="mt-jersey" key={n}>
                          <div className="j" style={{ background: colorThem, color: contrastOn(colorThem), borderBottom: `4px solid ${colorThem2}` }}>{n}</div>
                          <div className="nm">{op ? op.name : ""}</div>
                        </div>
                      ); })}
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
```

- [ ] **Step 2: PublicMatch — opponent lineup from the model**

`PublicMatch` receives `model` from `buildModel`. First expose `oppRoster` on the model: in `lib/model.ts`, in the returned object add `oppRoster: r.oppRoster || null,` (after the `nameDisplay:` line). Then in `components/PublicMatch.tsx`, after the existing lineup `</section>` (the `Team · {usName}` section), add:

```tsx
      {m.oppRoster && m.oppRoster.formation && m.oppRoster.formation.length > 0 && (
        <section className="pm-sec">
          <p className="pm-label">Team · {(m.themName || "").toUpperCase()}</p>
          <div className="pm-pitch">
            {m.oppRoster.formation.map((row: number[], ri: number) => (
              <div className="pm-pitch-row" key={ri}>
                {row.map((n, ci) => { const op = m.oppRoster.players.find((x: any) => x.num === n); return (
                  <div className="pm-jersey" key={ci}>
                    <div className="sq" style={{ background: m.colorThem, color: contrastOn(m.colorThem) }}>{n}</div>
                    <div className="nm">{op ? op.name : ""}</div>
                  </div>
                ); })}
              </div>
            ))}
          </div>
        </section>
      )}
```

- [ ] **Step 3: Typecheck + build + commit**

Run: `bash -lc 'source ~/.nvm/nvm.sh; nvm use 20 >/dev/null; cd /home/sean/workspace/sideline && npx tsc --noEmit && npm run build'` → clean + success.
```bash
git add components/MatchTracker.tsx components/PublicMatch.tsx lib/model.ts
git commit -m "feat: opponent lineup (editor Lineup tab + public page) from oppRoster snapshot"
```

---

## Task 6: Team-page Fixtures

**Files:** Modify `app/t/[id]/page.tsx`, `components/TeamPage.tsx`.

- [ ] **Step 1: Server route — fetch fixtures and pass them**

In `app/t/[id]/page.tsx`, change `TeamRoutePage` to fetch public fixtures for the team and pass them. Replace:
```tsx
export default async function TeamRoutePage({ params }: { params: { id: string } }) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const team = await fetchTeam(params.id);
  if (!team) notFound();
  return <TeamPage team={team} isOwner={!!auth.user && auth.user.id === team.owner} />;
}
```
with:
```tsx
export default async function TeamRoutePage({ params }: { params: { id: string } }) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const team = await fetchTeam(params.id);
  if (!team) notFound();
  const isOwner = !!auth.user && auth.user.id === team.owner;
  const { data: fx } = await supabase
    .from("matches")
    .select("id,short_code,data,match_date,home_team_id,away_team_id")
    .or(`home_team_id.eq.${team.id},away_team_id.eq.${team.id}`)
    .eq("is_public", true)
    .order("match_date", { ascending: false, nullsFirst: false })
    .limit(50);
  const fixtures = (fx || []).map((r: any) => ({ id: r.id, href: `/m/${r.short_code || r.id}`, data: r.data, date: r.match_date || r.data?.matchDate || r.data?.date || null }));
  delete (team as any).owner;
  return <TeamPage team={team} isOwner={isOwner} fixtures={fixtures} />;
}
```

- [ ] **Step 2: TeamPage — render fixtures**

In `components/TeamPage.tsx`, add imports:
```tsx
import MatchRow from "@/components/MatchRow";
import { relativeDate } from "@/lib/match-list";
import type { MatchRecord } from "@/lib/types";
```
Change the component signature to accept `fixtures`:
```tsx
export default function TeamPage({ team, isOwner }: { team: TeamRecord; isOwner: boolean }) {
```
→
```tsx
export default function TeamPage({ team, isOwner, fixtures = [] }: { team: TeamRecord; isOwner: boolean; fixtures?: { id: string; href: string; data: MatchRecord; date: string | null }[] }) {
```
Replace the fixtures placeholder:
```tsx
      <p className="mt-h" style={{ margin: "18px 14px 6px" }}>Fixtures</p>
      <div className="tp-fixtures">Fixtures involving this team will appear here.</div>
```
with:
```tsx
      <p className="mt-h" style={{ margin: "18px 14px 6px" }}>Fixtures</p>
      <div className="ml-page" style={{ paddingTop: 0 }}>
        {fixtures.length === 0
          ? <div className="tp-fixtures">No public fixtures involving this team yet.</div>
          : fixtures.map((f) => <MatchRow key={f.id} record={f.data} href={f.href} date={relativeDate(f.date || undefined, now)} />)}
      </div>
```
Add a `now` near the top of the component body (after the `const sb = ...` line):
```tsx
  const now = Date.now();
```

- [ ] **Step 3: Build + commit**

Run: `npm run build` (Node 20) → success.
```bash
git add app/t/[id]/page.tsx components/TeamPage.tsx
git commit -m "feat: team-page Fixtures (public matches by team id, newest first)"
```

---

## Task 7: Migration SQL + version + verify

**Files:** Modify `docs/teams-migration.sql`, `lib/constants.ts`.

- [ ] **Step 1: Append the matches migration** to `docs/teams-migration.sql`:

```sql

-- ③b: link matches to teams (run once).
alter table matches add column if not exists home_team_id uuid;
alter table matches add column if not exists away_team_id uuid;
create index if not exists matches_home_team_idx on matches (home_team_id);
create index if not exists matches_away_team_idx on matches (away_team_id);
```

- [ ] **Step 2: Bump version** — `lib/constants.ts`: `export const APP_VERSION = "v48";` → `"v49"`.

- [ ] **Step 3: Full test + build**

Run: `bash -lc 'source ~/.nvm/nvm.sh; nvm use 20 >/dev/null; cd /home/sean/workspace/sideline && npm test 2>&1 | tail -4 && npm run build 2>&1 | tail -8'`
Expected: all tests pass (187 + the new `team-link` suite), build success.

- [ ] **Step 4: Commit**

```bash
git add docs/teams-migration.sql lib/constants.ts
git commit -m "chore: matches team-link migration + bump APP_VERSION to v49"
```

- [ ] **Step 5: Manual verification (after running the new migration)**

Run the appended SQL in Supabase, then `npm run dev` (signed in, with at least two teams created in /teams):
- Open a match → 🤝 Link teams → pick your team + opponent + home/away → Link. Confirm: your lineup seeds (if it was empty), opponent name/colours update, and the Lineup tab shows an **Opponent — <name>** pitch.
- ⇄ Swap (settings) flips the header `v`/`@` and the home/away order in the score header; scores unchanged.
- Open the opponent's `/t/<code>` → the match now appears under **Fixtures** (newest first).
- Landing + feed list newest-by-start-time; legacy match opening shows the "link teams" tip and still works unlinked.

---

## Self-review notes (reconciled)

- **Spec coverage:** home/away_team_id columns + derivation (T1, T7); pure link patch + roster→notation + swap (T2); one Link-teams flow for new+legacy incl. link-on-edit nudge + reseed guard (T4); frozen oppRoster snapshot + both lineups (T2 snapshot, T5 display); home/away swap (T4); team-page Fixtures by team id newest-first (T6); all lists by start time (T3); no scoring change; v49 (T7).
- **Type/name consistency:** `homeTeamId`/`awayTeamId`/`oppRoster` on `MatchRecord` (T1) flow through `recordPayload`/`doLoad`/dirty/auto-save (T4), `teamLinkPatch` return (T2) consumed by `LinkTeams.onApply` (T4), and `oppRoster` rendered (T5) + exposed on the model (T5). `home_team_id`/`away_team_id` promoted columns (T1) drive the Fixtures query (T6) + list ordering uses `match_date` (T3).
- **Deviations/notes:** the `rosterEnd` import in T2 may be unused (impl uses `parseMatch(...).roster.length`) — drop it if flagged. T4's MatchTracker dirty/auto-save dep-array edits must hit both arrays (different tails). Migration must be run before linked saves work (T1 note, T7).
- **Out of scope:** new-match wizard team-picking + lineup-from-last-game (④); structured us-roster + event-only notation + unified both-side snapshots (③c).
```
