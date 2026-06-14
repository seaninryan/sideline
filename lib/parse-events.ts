import { squash, gpTotal, fmtScore, titleCase } from "@/lib/util";
import type { TeamRoster } from "@/lib/types";

export interface TeamArg { name: string; roster: TeamRoster }
export interface WhoResult { side: "A" | "B" | null; num: number | null; name: string; teamLevel: boolean; ambiguous: boolean }

const findPlayer = (roster: TeamRoster, txt: string) => {
  const c = squash(txt); if (!c) return null;
  for (const p of roster.players) if (squash(p.name) === c) return p;          // exact full-name beats fuzzy
  for (const p of roster.players) { const f = squash(p.name.split(" ")[0]); if (f === c) return p; }
  return null;
};
const teamMatches = (name: string, txt: string) => {
  const c = squash(txt); const n = squash(name);
  return !!c && (c === n || c === squash(name.split(" ")[0]));
};

// Resolve "who" against both teams: player-name (either) → "Team number"/"Team name" → "Team".
export function resolveWho(token: string, a: TeamArg, b: TeamArg): WhoResult {
  const none: WhoResult = { side: null, num: null, name: "", teamLevel: false, ambiguous: false };
  const t = (token || "").trim(); if (!t) return none;

  const pa = findPlayer(a.roster, t), pb = findPlayer(b.roster, t);
  if (pa && pb) return { ...none, ambiguous: true };
  if (pa) return { side: "A", num: pa.num, name: pa.name, teamLevel: false, ambiguous: false };
  if (pb) return { side: "B", num: pb.num, name: pb.name, teamLevel: false, ambiguous: false };

  // "<Team> <rest>" — longest team-name prefix first (handles multi-word names)
  for (const [side, team] of [["A", a] as const, ["B", b] as const]) {
    const words = t.split(/\s+/);
    for (let take = words.length - 1; take >= 1; take--) {
      if (!teamMatches(team.name, words.slice(0, take).join(" "))) continue;
      const rest = words.slice(take).join(" ").trim();
      const numOnly = rest.match(/^(\d{1,2})$/);
      if (numOnly) { const p = team.roster.players.find((x) => x.num === +numOnly[1]); return { side, num: +numOnly[1], name: p ? p.name : "", teamLevel: false, ambiguous: false }; }
      const p = findPlayer(team.roster, rest);
      if (p) return { side, num: p.num, name: p.name, teamLevel: false, ambiguous: false };
    }
  }

  if (teamMatches(a.name, t)) return { side: "A", num: null, name: "", teamLevel: true, ambiguous: false };
  if (teamMatches(b.name, t)) return { side: "B", num: null, name: "", teamLevel: true, ambiguous: false };

  return none;
}

type Side = "A" | "B";
const other = (s: Side): Side => (s === "A" ? "B" : "A");

export interface EventSettings { teamA: TeamArg; teamB: TeamArg; scoringMode: "gaa" | "goals" }

export interface TeamTotals { g: number; p: number; total: number; str: string }
export interface ParsedEvents {
  mode: "gaa" | "goals";
  totals: { A: TeamTotals; B: TeamTotals };
  result: "A" | "B" | "draw";
  scoring: any[];
  notes: any[];
  halfMarks: any[];
  series: any[];
  goalDots: any[];
  twoPtDots: any[];
  chartMarkers: any[];
  scorers: any[];
  leadChanges: number;
  timesLevel: number;
  maxLead: number;
  maxLeadSide: "A" | "B" | null;
  htLine: number | null;
  warnings: any[];
}

// Two-team, event-only parser. No roster block in the notation — rosters come from
// settings.teamA / settings.teamB. Totals are COUNTED from the events themselves
// (no written-score vote machinery). Ported from the legacy parseMatch event walk,
// with us/them → A/B via resolveWho.
export function parseEvents(raw: string, settings: EventSettings): ParsedEvents {
  const teamA = settings.teamA, teamB = settings.teamB;
  const lines = raw.split("\n").map((l) => l.replace(/\s+$/, ""));
  const warnings: any[] = [];
  const timeRe = /^\s*(\d{1,2}):(\d{2})\s*$/;

  // events-only: there's no preamble/header. Walk every line.
  const eventLines = lines;

  const peelScore = (rest: string) => {
    const toks = rest.trim().split(/\s+/);
    const score: string[] = [];
    while (toks.length) {
      const t = toks[toks.length - 1];
      if (t === "-" || /^\d+(-\d+)?$/.test(t)) score.unshift(toks.pop()!);
      else break;
    }
    return { text: toks.join(" ").trim(), scoreToks: score.filter((t) => t !== "-") };
  };

  const mode = settings.scoringMode;

  // resolve a "who" token against both teams
  const who = (txt: string) => resolveWho(txt, teamA, teamB);
  // resolve a sub ref ("12", "Rick", "12 Rick", "Wildebeests 9") to {side,num}
  const subRef = (txt: string): { side: Side | null; num: number | null } => {
    const t = (txt || "").trim();
    const r = who(t);
    if (r.side) return { side: r.side, num: r.num };
    // "12 Rick" / "17 Pencilvester" — peel a leading shirt number and resolve the
    // name; prefer the roster number, fall back to the written one (the design's
    // "onNum/offNum resolved against the roster").
    const numName = t.match(/^(\d{1,2})\s+(.+)$/);
    if (numName) {
      const r2 = who(numName[2].trim());
      if (r2.side) return { side: r2.side, num: r2.num ?? parseInt(numName[1], 10) };
      return { side: null, num: parseInt(numName[1], 10) };
    }
    const numOnly = t.match(/^(\d{1,2})$/);
    if (numOnly) return { side: null, num: parseInt(numOnly[1], 10) };
    return { side: null, num: null };
  };

  // --- walk events ---
  const scoring: any[] = [];
  const notes: any[] = [];
  let half = 0, startMin = 0, seq = 0, lastElapsed = 0, halfMaxElapsed = -1;
  const halfMarks: any[] = [];
  const addedOverride: Record<number, number> = {};

  for (let evIdx = 0; evIdx < eventLines.length; evIdx++) {
    const rawLine = eventLines[evIdx];
    const srcLine = evIdx; // index into raw.split("\n")
    const line = rawLine.trim();
    if (line === "") continue;
    const tm = line.match(timeRe);
    if (tm) { half += 1; startMin = parseInt(tm[2], 10); halfMaxElapsed = -1; halfMarks.push({ half, clock: `${tm[1]}:${tm[2]}`, srcLine }); continue; }

    const lead = line.match(/^(\d{1,2})\b\s*(.*)$/);
    if (lead) {
      const minute = parseInt(lead[1], 10);
      // elapsed since the half's clock; wrap forward when the clock crosses an
      // hour mid-half (e.g. a half starting 23:00 and running past 00:00).
      let elapsed = minute - startMin; if (elapsed < 0) elapsed += 60;
      while (elapsed < halfMaxElapsed) elapsed += 60;
      halfMaxElapsed = Math.max(halfMaxElapsed, elapsed);
      const restFull = lead[2];
      if (/^(ht|ft|half ?time|full ?time|end)\b/i.test(restFull.trim())) {
        halfMarks.push({ half, marker: /^f/i.test(restFull.trim()) ? "FT" : "HT", minute, elapsed, srcLine });
        const am = restFull.match(/\+(\d{1,2})/);
        if (am) addedOverride[half || 1] = parseInt(am[1], 10);
        continue;
      }
      const { text, scoreToks } = peelScore(restFull);
      // cards: "23 Wildebeests 9 yellow card" — a sided note, not a score
      const cardM = scoreToks.length === 0 ? restFull.match(/\b(yellow|red)\b(?:\s*card)?/i) : null;
      if (cardM) {
        const whoTxt = restFull.replace(/\b(yellow|red)\b(?:\s*card)?/i, "").replace(/\?/g, "").trim();
        const r = who(whoTxt);
        notes.push({ seq: seq++, half: half || 1, minute, elapsed, type: "card", card: cardM[1].toLowerCase(), who: r.name || whoTxt, side: r.side, num: r.num, text: line, srcLine });
        continue;
      }
      // corners: "31 Racoons corner" — side from resolveWho; bare "corner" → plain note
      if (scoreToks.length === 0 && /\bcorner\b/i.test(restFull)) {
        const whoTxt = restFull.replace(/\bcorner\b/i, "").trim();
        const r = who(whoTxt);
        if (r.side) notes.push({ seq: seq++, half: half || 1, minute, elapsed, type: "corner", side: r.side, text: line, srcLine });
        else notes.push({ seq: seq++, half: half || 1, minute, elapsed, type: "note", text: restFull.trim(), srcLine });
        continue;
      }
      // a missed chance or stoppage is a note, not a score
      if (scoreToks.length === 0 && /\b(miss(ed|es)?|wide|saved|blocked|short|water)\b/i.test(restFull)) {
        notes.push({ seq: seq++, half: half || 1, minute, elapsed, type: "note", text: restFull.trim(), srcLine });
        continue;
      }
      // "40 11 for 10" / "43 12 Rick for 6 Morty" — a substitution with a minute in
      // front. A bare-number sub ("11 for 10") peels "10" as a score token, so don't
      // gate the sub on scoreToks here — the " for " is the discriminator.
      const sm = restFull.match(/(.+?)\s+for\s+(.+)/i);
      if (sm) { // a real "X for Y" substitution (not just any line containing "for")
        const on = sm[1].trim(), off = sm[2].trim();
        const onR = subRef(on), offR = subRef(off);
        const side = onR.side || offR.side || null;
        notes.push({ seq: seq++, half: half || 1, minute, elapsed, type: "sub", on, off, side, onNum: onR.num, offNum: offR.num, text: line, srcLine });
        continue;
      }
      const isGoal = /goal/i.test(restFull);
      const isFree = /\bfree\b/i.test(restFull) || /\bf\b/i.test(restFull);
      const isOg = /\bown goal\b|\bog\b/i.test(restFull);
      // Gaelic football "2-pointer" (a point from outside the 40m arc, worth two
      // points). Forms: 2pt / 2-pt / 2 pt / 2point / 2-pointer / two-pointer. It's a
      // point, never a goal — so a "goal" keyword wins.
      const twoPtRe = /\b(?:2\s*-?\s*p(?:oin)?t(?:er|s)?|two[\s-]?point(?:er)?)\b/i;
      const isTwoPt = twoPtRe.test(restFull) && !isGoal;
      const setPiece = ((text.match(/(?:^|\s)['']?(45|65)(?=\s|$)/) || [])[1]) || null;
      const scorerText = text.replace(twoPtRe, "").replace(/['']?\b(goal|free|point|pts?|pen|penalty|own|og|45|65)\b/gi, "").replace(/\?/g, "").trim();
      // a bare minute on its own line marks the start of a half
      if (!scorerText && scoreToks.length === 0 && !isGoal && !isFree && !isTwoPt) {
        half += 1; startMin = minute; halfMaxElapsed = -1; halfMarks.push({ half, startMin: minute, srcLine }); continue;
      }

      const r = who(scorerText);
      let side: Side | null, scorer: string, num: number | null = null, sure = true;
      if (r.side && !r.teamLevel) { side = r.side; scorer = r.name; num = r.num; }
      else if (r.side && r.teamLevel) { side = r.side; scorer = ""; } // unattributed team event
      else { // ambiguous / unresolved — keep the item but attribute to neither side
        side = null; scorer = scorerText; sure = false;
        warnings.push({ minute, half: half || 1, msg: r.ambiguous ? `"${scorerText}" matches a player on both teams — add a team/number to disambiguate` : `couldn't tell whose score "${scorerText}" is` });
      }

      if (isOg && side) { // an own goal scores for the other side
        side = other(side); sure = true;
        scorer = `own goal${r.name ? ` (${r.name})` : ""}`;
      }
      lastElapsed = elapsed;
      scoring.push({ seq: seq++, minute, half: half || 1, elapsed, side, sure, type: isGoal ? "goal" : "point", fromFree: isFree && !isGoal, twoPointer: isTwoPt, setPiece, scorer, desc: text, og: isOg, ogNum: isOg && r.num ? r.num : null, playerNum: !isOg && num ? num : null, scoreToks, srcLine });
    } else if (/^(ht|ft|half ?time|full ?time)$/i.test(line)) {
      halfMarks.push({ half: half || 1, marker: /^f/i.test(line) ? "FT" : "HT", minute: null, elapsed: lastElapsed, srcLine });
    } else if (/^\+\d{1,2}(\s+added)?$/i.test(line)) {
      addedOverride[half || 1] = parseInt(line.slice(1), 10);
    } else if (/\bfor\b/i.test(line)) {
      const m = line.match(/(.+?)\s+for\s+(.+)/i);
      const on = m ? m[1].trim() : "", off = m ? m[2].trim() : "";
      const onR = subRef(on), offR = subRef(off);
      const side = onR.side || offR.side || null;
      notes.push({ seq: seq++, half: half || 1, type: "sub", on, off, side, onNum: onR.num, offNum: offR.num, text: line, srcLine });
    } else {
      notes.push({ seq: seq++, half: half || 1, type: "note", text: line, srcLine });
    }
  }

  // --- added time: halves run in multiples of 5, so "28 HT" reads as 25 +3. ---
  for (const m of halfMarks) {
    if (!m.marker) continue;
    const ov = addedOverride[m.half];
    if (ov != null) { if (ov > 0) m.added = ov; }
    else if (m.minute != null && m.elapsed != null && m.elapsed % 5 > 0) m.added = m.elapsed % 5;
  }

  // --- match-minute labels ---
  const h1max = Math.max(0, ...scoring.filter((s) => s.half === 1).map((s) => s.elapsed),
    ...halfMarks.filter((m) => m.half === 1 && m.elapsed != null).map((m) => m.elapsed));
  const htMark = halfMarks.find((x) => x.half === 1 && x.marker === "HT" && x.elapsed != null && x.minute != null);
  const h1Len = htMark ? htMark.elapsed - (htMark.elapsed % 5) : Math.ceil(h1max / 5) * 5;
  const matchMin = (it: any) => {
    if (it.elapsed == null) return it.minute != null ? String(it.minute) : "";
    const h = it.half || 1;
    const base = h > 1 ? h1Len * (h - 1) : 0;
    const em = halfMarks.find((x: any) => x.half === h && x.marker && x.elapsed != null && x.minute != null);
    const hEnd = em ? em.elapsed - (em.elapsed % 5) : null;
    return hEnd != null && it.elapsed > hEnd ? `${base + hEnd}+${it.elapsed - hEnd}` : String(base + Math.max(it.elapsed, 1));
  };
  scoring.forEach((s) => { s.mmin = matchMin(s); });
  notes.forEach((n) => { if (n.minute != null) n.mmin = matchMin(n); });

  // --- running totals (COUNTED from events) + series ---
  let ag = 0, ap = 0, bg = 0, bp = 0;
  const GAP = 4;
  const xOf = (s: any) => (s.half === 1 ? s.elapsed : h1max + GAP + s.elapsed);
  const series: any[] = [{ x: 0, half: 1, a: 0, b: 0, mmin: "0", aScore: fmtScore(0, 0, mode), bScore: fmtScore(0, 0, mode), label: "Throw-in" }];
  const goalDots: any[] = [];
  const twoPtDots: any[] = [];
  const scorers: Record<string, any> = {};
  const bump = (name: string, side: Side, type: string, free: boolean, num: number | null, twoPt = false) => {
    const k = side + ":" + squash(name);
    if (!scorers[k]) scorers[k] = { name: titleCase(name), side, g: 0, p: 0, frees: 0, tp: 0, num: num || null };
    if (/[A-Z]/.test(name) && !/[A-Z]/.test(scorers[k].name)) scorers[k].name = name;
    if (type === "goal") scorers[k].g++; else scorers[k].p += twoPt ? 2 : 1; // a 2-pointer is two points
    if (free) scorers[k].frees++;
    if (twoPt) scorers[k].tp++;
  };

  let leadChanges = 0, prevLeader = 0, maxLead = 0, maxLeadSide: Side | null = null, timesLevel = 0, prevEqual = true;
  for (const s of scoring) {
    const effType = mode === "goals" ? "goal" : s.type;
    const ptVal = s.twoPointer ? 2 : 1; // a 2-pointer counts for two points
    if (s.side === "A") { if (effType === "goal") ag++; else ap += ptVal; }
    else if (s.side === "B") { if (effType === "goal") bg++; else bp += ptVal; }
    // (side null → unattributed: keep the item but don't count it for either team)

    if (s.side && s.scorer) {
      if (effType === "goal") bump(s.scorer, s.side, "goal", false, s.playerNum);
      else bump(s.scorer, s.side, "point", s.fromFree, s.playerNum, s.twoPointer);
    }

    const aT = gpTotal(ag, ap, mode), bT = gpTotal(bg, bp, mode);
    const leader = Math.sign(aT - bT);
    if (leader !== 0 && prevLeader !== 0 && leader !== prevLeader) leadChanges++;
    if (leader !== 0) prevLeader = leader;
    const eq = aT === bT;
    if (eq && !prevEqual) timesLevel++;
    prevEqual = eq;
    const lead = Math.abs(aT - bT);
    if (lead > maxLead) { maxLead = lead; maxLeadSide = aT > bT ? "A" : "B"; }

    const x = xOf(s);
    s.aScore = fmtScore(ag, ap, mode); s.bScore = fmtScore(bg, bp, mode);
    series.push({
      x, half: s.half, minute: s.minute, mmin: s.mmin, a: aT, b: bT,
      aScore: fmtScore(ag, ap, mode), bScore: fmtScore(bg, bp, mode),
      label: `${s.scorer || (s.side === "A" ? teamA.name : s.side === "B" ? teamB.name : "")}${effType === "goal" ? " GOAL" : s.twoPointer ? " (2-pointer)" : s.fromFree ? " (free)" : s.setPiece ? ` ('${s.setPiece})` : ""}`,
      side: s.side, type: effType,
    });
    if (effType === "goal" && s.side) goalDots.push({ x, y: s.side === "A" ? aT : bT, side: s.side, label: `${s.mmin}' Goal — ${s.scorer || (s.side === "A" ? teamA.name : teamB.name)}${s.fromFree ? " (free)" : ""}` });
    else if (s.twoPointer && s.side) twoPtDots.push({ x, y: s.side === "A" ? aT : bT, side: s.side, label: `${s.mmin}' 2-pointer — ${s.scorer || (s.side === "A" ? teamA.name : teamB.name)}${s.fromFree ? " (free)" : ""}` });
  }

  const totals = {
    A: { g: ag, p: ap, total: gpTotal(ag, ap, mode), str: fmtScore(ag, ap, mode) },
    B: { g: bg, p: bp, total: gpTotal(bg, bp, mode), str: fmtScore(bg, bp, mode) },
  };
  let result: Side | "draw" = "draw";
  if (totals.A.total > totals.B.total) result = "A";
  else if (totals.A.total < totals.B.total) result = "B";

  const htX = halfMarks.find((m) => m.marker === "HT");
  const htLine = htX ? xOf({ half: 1, elapsed: htX.elapsed }) : (scoring.some((s) => s.half === 2) ? h1max + GAP / 2 : null);

  // chart event markers (extensible): subs + cards on the time axis. `kind` ∈
  // "sub" | "yellow" | "red" today; future kinds (e.g. pen-miss) slot in here.
  // Minute-less events (e.g. a half-time sub) have no `elapsed`, so they're
  // placed at their half's boundary rather than dropped.
  const maxX = Math.max(0, ...series.map((p: any) => p.x));
  const markerX = (n: any) => (n.elapsed != null ? xOf(n) : ((n.half || 1) === 1 ? h1max : maxX));
  const chartMarkers = notes
    .filter((n: any) => n.type === "sub" || n.type === "card")
    .map((n: any) => {
      const min = n.mmin ? `${n.mmin}'` : "HT";
      const label = n.type === "sub"
        ? `${min} Sub — ${n.on} for ${n.off}`
        : `${min} ${n.card === "red" ? "Red" : "Yellow"} card${n.who ? ` — ${n.who}` : ""}`;
      return { x: markerX(n), kind: n.type === "card" ? (n.card === "red" ? "red" : "yellow") : "sub", side: n.side ?? null, label };
    })
    .sort((a, b) => a.x - b.x);

  return { mode, totals, result, scoring, notes, halfMarks, series, goalDots, twoPtDots, chartMarkers, scorers: Object.values(scorers), leadChanges, timesLevel, maxLead, maxLeadSide, htLine, warnings };
}
