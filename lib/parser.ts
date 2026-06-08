import { squash, gpTotal, fmtScore, titleCase } from "@/lib/util";
import type { ParsedMatch, Settings } from "@/lib/types";

// Header labels that are just template placeholders, not something the user typed.
export const isPlaceholderLabel = (s: string | undefined): boolean =>
  ["", "new match", "my team", "match"].includes((s || "").trim().toLowerCase());

export function parseMatch(raw: string, settings: Settings = {}): ParsedMatch {
  const lines = raw.split("\n").map((l) => l.replace(/\s+$/, ""));
  const warnings: any[] = [];
  const timeRe = /^\s*(\d{1,2}):(\d{2})\s*$/;

  let firstTimeIdx = lines.findIndex((l) => timeRe.test(l));
  if (firstTimeIdx === -1) firstTimeIdx = lines.length;
  const preamble = lines.slice(0, firstTimeIdx).filter((l) => l.trim() !== "");
  const eventLines = lines.slice(firstTimeIdx);
  const headerRaw = preamble[0] || "";

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

  // Detect sport: an explicit sport in the header wins; then score shape — a line
  // carrying two score tokens (one per team, e.g. "0-2 1-3") is Gaelic goals+points,
  // while hyphen scores that only ever appear one-per-line (e.g. "2-1") read as a
  // soccer running scoreboard; else any internal hyphen => Gaelic; else goals.
  let pairLines = 0, soloHyphens = 0;
  for (const l of eventLines) {
    const lead = l.trim().match(/^(\d{1,2})\b\s*(.*)$/);
    if (!lead || timeRe.test(l)) continue;
    const { scoreToks } = peelScore(lead[2]);
    if (scoreToks.length >= 2) pairLines++;
    else if (scoreToks.length === 1 && scoreToks[0].includes("-")) soloHyphens++;
  }
  const evText = eventLines.join("\n");
  const detectedMode =
    /soccer/i.test(headerRaw) ? "goals"
    : /hurl|camog|gaelic|gaa|football/i.test(headerRaw) ? "gaa"
    : pairLines > 0 ? "gaa"
    : soloHyphens > 0 && !/\bpoints?\b|\bpts?\b/i.test(evText) ? "goals"
    : /\d+-\d+/.test(evText) ? "gaa"
    : "goals";
  const mode = (settings.scoringMode || detectedMode) as "gaa" | "goals";

  // --- header ---
  const header: any = { raw: headerRaw, sport: "", opposition: "", homeAway: "", label: "" };
  if (preamble[0]) {
    const h = preamble[0];
    let m;
    if ((m = h.match(/^(.*?)\s+@\s*(.*)$/))) { header.homeAway = "away"; header.opposition = m[2].trim(); header.label = m[1].trim(); }
    else if ((m = h.match(/^(.*?)\s+v(?:s|\.)?\s*(.*)$/i))) { header.homeAway = "home"; header.opposition = m[2].trim(); header.label = m[1].trim(); }
    else { header.label = h.trim(); }
    if (/hurl/i.test(h)) header.sport = "Hurling";
    else if (/camog/i.test(h)) header.sport = "Camogie";
    else if (/gaelic|football|gaa/i.test(h)) header.sport = "Gaelic Football";
    else if (/soccer/i.test(h)) header.sport = "Soccer";
  }

  // --- roster (preserve the formation exactly as written, row by row) ---
  const roster: any[] = [];
  const formationRows: any[][] = [];
  let section = "starting";
  for (let i = 1; i < preamble.length; i++) {
    const line = preamble[i].trim();
    if (/^subs?\b/i.test(line)) { section = "sub"; continue; }
    if (/^missing/i.test(line)) { section = "missing"; continue; }
    const rowNums: number[] = [];
    for (const chunk of line.split("|")) {
      const m = chunk.trim().match(/^(\d{1,2})\s*[.)]?\s*(.*)$/);
      if (m && m[2].trim()) { const num = parseInt(m[1], 10); roster.push({ num, name: m[2].trim(), role: section }); if (section === "starting") rowNums.push(num); }
    }
    if (section === "starting" && rowNums.length) formationRows.push(rowNums);
  }
  const matchPlayer = (txt: string) => {
    const c = squash(txt);
    if (!c) return null;
    // exact full-name match beats any fuzzy match anywhere in the roster —
    // with "Cathal" and "Cathal N" both rostered, "Cathal" must not resolve
    // to "Cathal N" just because he appears first
    for (const p of roster) if (squash(p.name) === c) return p;
    for (const p of roster) {
      const first = squash(p.name.split(" ")[0]);
      if (first === c || squash(p.name) === squash(txt.split(" ")[0])) return p;
    }
    return null;
  };

  // resolve a sub line's "12 Rick" / "Rick" / "12" to a roster number (or null)
  const subRef = (txt: string) => {
    const t = (txt || "").trim();
    const numOnly = t.match(/^(\d{1,2})$/);
    if (numOnly) { const p = roster.find((r) => r.num === parseInt(numOnly[1], 10)); return p ? p.num : parseInt(numOnly[1], 10); }
    const p = matchPlayer(t.replace(/^\d+\s*[.)]?\s*/, ""));
    return p ? p.num : null;
  };

  // --- walk events ---
  const scoring: any[] = [];
  const notes: any[] = [];
  let half = 0, startMin = 0, seq = 0, lastElapsed = 0;
  const halfMarks: any[] = [];
  const addedOverride: Record<number, number> = {}; // half -> added time written as a "+N" line (overrides the deduced value)

  for (let evIdx = 0; evIdx < eventLines.length; evIdx++) {
    const rawLine = eventLines[evIdx];
    const srcLine = firstTimeIdx + evIdx; // index into raw.split("\n")
    const line = rawLine.trim();
    if (line === "") continue;
    const tm = line.match(timeRe);
    if (tm) { half += 1; startMin = parseInt(tm[2], 10); halfMarks.push({ half, clock: `${tm[1]}:${tm[2]}`, srcLine }); continue; }

    const lead = line.match(/^(\d{1,2})\b\s*(.*)$/);
    if (lead) {
      const minute = parseInt(lead[1], 10);
      let elapsed = minute - startMin; if (elapsed < 0) elapsed += 60;
      const restFull = lead[2];
      if (/^(ht|ft|half ?time|full ?time|end)\b/i.test(restFull.trim())) {
        halfMarks.push({ half, marker: /^f/i.test(restFull.trim()) ? "FT" : "HT", minute, elapsed, srcLine });
        const am = restFull.match(/\+(\d{1,2})/); // "32 HT +6" sets the added time directly
        if (am) addedOverride[half || 1] = parseInt(am[1], 10);
        continue;
      }
      const { text, scoreToks } = peelScore(restFull);
      // cards: "23 Morty yellow card" / "70 T red" — a sided note, not a score
      const cardM = scoreToks.length === 0 ? restFull.match(/\b(yellow|red)\b(?:\s*card)?/i) : null;
      if (cardM) {
        const who = restFull.replace(/\b(yellow|red)\b(?:\s*card)?/i, "").replace(/\?/g, "").trim();
        const cp = matchPlayer(who);
        const side = cp ? "us" : (/^t\d*$/i.test(squash(who)) || /^t\b/i.test(who)) ? "them"
          : settings.myTeam && squash(who) && squash(who) === squash(settings.myTeam) ? "us" : who ? "them" : "us";
        notes.push({ seq: seq++, half: half || 1, minute, elapsed, type: "card", card: cardM[1].toLowerCase(), who: cp ? cp.name : who, side, num: cp ? cp.num : null, text: line, srcLine });
        continue;
      }
      // corners: "31 corner" (us) / "44 T corner" (them)
      if (scoreToks.length === 0 && /\bcorner\b/i.test(restFull)) {
        const who = restFull.replace(/\bcorner\b/i, "").trim();
        const side = (/^t\d*$/i.test(squash(who)) || /^t\b/i.test(who)) ? "them" : "us";
        notes.push({ seq: seq++, half: half || 1, minute, elapsed, type: "corner", side, text: line, srcLine });
        continue;
      }
      // a missed chance ("10 Jack miss pen", "wide", "saved") or a stoppage
      // ("46 Water Break") is a note, not a score
      if (scoreToks.length === 0 && /\b(miss(ed|es)?|wide|saved|blocked|short|water)\b/i.test(restFull)) {
        notes.push({ seq: seq++, half: half || 1, minute, elapsed, type: "note", text: restFull.trim(), srcLine });
        continue;
      }
      // "43 Rick for Morty" — a substitution with the minute in front
      if (scoreToks.length === 0 && /\bfor\b/i.test(restFull)) {
        const sm = restFull.match(/(.+?)\s+for\s+(.+)/i)!;
        const on = sm[1].trim(), off = sm[2].trim();
        notes.push({ seq: seq++, half: half || 1, minute, elapsed, type: "sub", on, off, onNum: subRef(on), offNum: subRef(off), text: line, srcLine });
        continue;
      }
      const isGoal = /goal/i.test(restFull);
      const isFree = /\bfree\b/i.test(restFull) || /\bf\b/i.test(restFull);
      const isOg = /\bown goal\b|\bog\b/i.test(restFull);
      // a point from a placed ball: "'65" (hurling) / "'45" (football); bare "65" works
      // mid-line too, but the apostrophe form can't be mistaken for a written score
      const setPiece = ((text.match(/(?:^|\s)['']?(45|65)(?=\s|$)/) || [])[1]) || null;
      const scorerText = text.replace(/['']?\b(goal|free|point|pts?|pen|penalty|own|og|45|65)\b/gi, "").replace(/\?/g, "").trim();
      // a bare minute on its own line marks the start of a half (e.g. "51" for the 2nd half)
      if (!scorerText && scoreToks.length === 0 && !isGoal && !isFree) {
        half += 1; startMin = minute; halfMarks.push({ half, startMin: minute, srcLine }); continue;
      }

      let side: string, scorer: string, player: any = null, sure = true;
      const player0 = matchPlayer(scorerText);
      if (player0) { side = "us"; scorer = player0.name; player = player0; }
      else if (/^t\d*$/i.test(squash(scorerText)) || /^t\b/i.test(scorerText)) { side = "them"; scorer = "Opposition"; }
      else if (settings.myTeam && squash(scorerText) && squash(scorerText) === squash(settings.myTeam)) { side = "us"; scorer = "Unknown"; }
      else if (scorerText) { side = "them"; scorer = scorerText; sure = false; } // a name we don't recognise — could be either side
      else { side = "them"; scorer = ""; sure = false; } // no scorer at all — deduce the team from the score change

      if (isOg) { // an own goal scores for the other side; credit reads "Own goal (name)"
        side = side === "us" ? "them" : "us"; sure = true;
        scorer = `own goal${player ? ` (${player.name})` : ""}`;
      }
      lastElapsed = elapsed;
      scoring.push({ seq: seq++, minute, half: half || 1, elapsed, side, sure, type: isGoal ? "goal" : "point", fromFree: isFree && !isGoal, setPiece, scorer, desc: text, og: isOg, ogNum: isOg && player ? player.num : null, playerNum: !isOg && player ? player.num : null, scoreToks, srcLine });
    } else if (/^(ht|ft|half ?time|full ?time)$/i.test(line)) {
      halfMarks.push({ half: half || 1, marker: /^f/i.test(line) ? "FT" : "HT", minute: null, elapsed: lastElapsed, srcLine });
    } else if (/^\+\d{1,2}(\s+added)?$/i.test(line)) {
      addedOverride[half || 1] = parseInt(line.slice(1), 10); // "+6" after a HT/FT line corrects the added time
    } else if (/\bfor\b/i.test(line)) {
      const m = line.match(/(.+?)\s+for\s+(.+)/i);
      const on = m ? m[1].trim() : "", off = m ? m[2].trim() : "";
      notes.push({ seq: seq++, half: half || 1, type: "sub", on, off, onNum: subRef(on), offNum: subRef(off), text: line, srcLine });
    } else {
      notes.push({ seq: seq++, half: half || 1, type: "note", text: line, srcLine });
    }
  }

  // --- added time: halves run in multiples of 5, so "28 HT" reads as 25 +3.
  // A "+N" line (or "32 HT +6") in the notation overrides the deduction. ---
  for (const m of halfMarks) {
    if (!m.marker) continue;
    const ov = addedOverride[m.half];
    if (ov != null) { if (ov > 0) m.added = ov; }
    else if (m.minute != null && m.elapsed != null && m.elapsed % 5 > 0) m.added = m.elapsed % 5;
  }

  // --- decide whether the written running score drives the totals ---
  const parseCol = (tok: string | null | undefined) => {
    if (tok == null) return { g: 0, p: 0 };
    if (tok.includes("-")) { const a = tok.split("-"); return { g: parseInt(a[0], 10) || 0, p: parseInt(a[1], 10) || 0 }; }
    const n = parseInt(tok, 10) || 0; return mode === "goals" ? { g: n, p: 0 } : { g: 0, p: n }; // bare number: "3" = 0-3, "0" = 0-0
  };
  // the written running score on a line, as the two scoreboard columns:
  // two tokens = GAA (one per team); in goals mode a single "2-1" token is the
  // whole home-away scoreboard.
  const writtenCols = (s: any) => {
    if (!s.scoreToks || s.scoreToks.length === 0) return null;
    if (s.scoreToks.length === 2) return [parseCol(s.scoreToks[0]), parseCol(s.scoreToks[1])];
    if (mode === "goals" && s.scoreToks.length === 1 && s.scoreToks[0].includes("-")) {
      const a = s.scoreToks[0].split("-");
      return [{ g: parseInt(a[0], 10) || 0, p: 0 }, { g: parseInt(a[1], 10) || 0, p: 0 }];
    }
    return null;
  };

  const writtenCount = scoring.filter((s) => writtenCols(s)).length;
  const scoreFromWritten = scoring.length > 0 && writtenCount >= scoring.length / 2;

  // work out which written column is "us" (auto-handles team order and home/away)
  let usCol = header.homeAway === "home" ? 0 : 1;
  if (scoreFromWritten) {
    const vote = [0, 0]; let prev = [{ g: 0, p: 0 }, { g: 0, p: 0 }];
    for (const s of scoring) {
      const cols = writtenCols(s);
      if (!cols) continue;
      const ch0 = cols[0].g !== prev[0].g || cols[0].p !== prev[0].p;
      const ch1 = cols[1].g !== prev[1].g || cols[1].p !== prev[1].p;
      if (ch0 !== ch1 && s.sure) { const changed = ch0 ? 0 : 1; if (s.side === "us") vote[changed]++; else vote[1 - changed]++; }
      prev = cols;
    }
    if (vote[0] + vote[1] > 0) usCol = vote[0] >= vote[1] ? 0 : 1;
  }
  const themCol = 1 - usCol;

  // --- running totals + series ---
  let ug = 0, up = 0, tg = 0, tp = 0;
  const h1max = Math.max(0, ...scoring.filter((s) => s.half === 1).map((s) => s.elapsed),
    ...halfMarks.filter((m) => m.half === 1 && m.elapsed != null).map((m) => m.elapsed));

  // match-minute labels: elapsed within the game rather than wall clock; halves
  // continue ("34'" in the 2nd half of 30-min halves) and stoppage shows as "30+2"
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

  const GAP = 4;
  const xOf = (s: any) => (s.half === 1 ? s.elapsed : h1max + GAP + s.elapsed);
  const series: any[] = [{ x: 0, us: 0, them: 0, label: "Throw-in", half: 1 }];
  const goalDots: any[] = [];
  const scorers: Record<string, any> = {};
  const bump = (name: string, side: string, type: string, free: boolean, num: number | null) => {
    const k = side + ":" + squash(name);
    if (!scorers[k]) scorers[k] = { name: titleCase(name), side, g: 0, p: 0, frees: 0, num: num || null };
    if (/[A-Z]/.test(name) && !/[A-Z]/.test(scorers[k].name)) scorers[k].name = name;
    if (type === "goal") scorers[k].g++; else scorers[k].p++;
    if (free) scorers[k].frees++;
  };

  let leadChanges = 0, prevLeader = 0, maxLead = 0, maxLeadSide: string | null = null, timesLevel = 0, prevEqual = true;
  for (const s of scoring) {
    const pUg = ug, pUp = up, pTg = tg, pTp = tp;
    const cols = scoreFromWritten ? writtenCols(s) : null;
    if (cols) {
      ug = cols[usCol].g; up = cols[usCol].p; tg = cols[themCol].g; tp = cols[themCol].p; // take the score as written
    } else {
      const effType = mode === "goals" ? "goal" : s.type;
      if (s.side === "us") { if (effType === "goal") ug++; else up++; }
      else { if (effType === "goal") tg++; else tp++; }
    }
    // see what changed, to attribute the score and classify goal vs point
    const dUsG = ug - pUg, dUsP = up - pUp, dThemG = tg - pTg, dThemP = tp - pTp;
    let aSide: string, dg: number, dp: number;
    if (s.side === "us" && (dUsG || dUsP)) { aSide = "us"; dg = dUsG; dp = dUsP; }
    else if (s.side === "them" && (dThemG || dThemP)) { aSide = "them"; dg = dThemG; dp = dThemP; }
    else if (dUsG || dUsP) { aSide = "us"; dg = dUsG; dp = dUsP; }
    else if (dThemG || dThemP) { aSide = "them"; dg = dThemG; dp = dThemP; }
    else { aSide = s.side; dg = 0; dp = 0; }
    if (dUsG < 0 || dUsP < 0 || dThemG < 0 || dThemP < 0)
      warnings.push({ minute: s.minute, half: s.half, msg: `score seems to drop here (you wrote "${s.scoreToks ? s.scoreToks.join(" ") : "?"}")` });
    s.side = aSide; s.type = dg > 0 ? "goal" : "point";
    if (!s.scorer) s.scorer = aSide === "us" ? "Unknown" : "Opposition"; // deduced from which score changed
    for (let i = 0; i < dg; i++) bump(s.scorer, aSide, "goal", false, s.playerNum);
    for (let i = 0; i < dp; i++) bump(s.scorer, aSide, "point", s.fromFree && i === 0, s.playerNum);

    const usT = gpTotal(ug, up, mode), themT = gpTotal(tg, tp, mode);
    const leader = Math.sign(usT - themT);
    if (leader !== 0 && prevLeader !== 0 && leader !== prevLeader) leadChanges++;
    if (leader !== 0) prevLeader = leader;
    const eq = usT === themT;
    if (eq && !prevEqual) timesLevel++;
    prevEqual = eq;
    const lead = Math.abs(usT - themT);
    if (lead > maxLead) { maxLead = lead; maxLeadSide = usT > themT ? "us" : "them"; }
    const x = xOf(s);
    s.usScore = fmtScore(ug, up, mode);
    s.themScore = fmtScore(tg, tp, mode);
    series.push({
      x, half: s.half, minute: s.minute, us: usT, them: themT,
      usScore: fmtScore(ug, up, mode), themScore: fmtScore(tg, tp, mode),
      label: `${s.scorer}${dg > 0 ? " GOAL" : s.fromFree ? " (free)" : s.setPiece ? ` ('${s.setPiece})` : ""}`,
      side: aSide, type: s.type,
    });
    if (dg > 0) goalDots.push({ x, y: aSide === "us" ? usT : themT, side: aSide });
  }

  const totals = {
    us: { g: ug, p: up, total: gpTotal(ug, up, mode), str: fmtScore(ug, up, mode) },
    them: { g: tg, p: tp, total: gpTotal(tg, tp, mode), str: fmtScore(tg, tp, mode) },
  };
  let result = "Draw";
  if (totals.us.total > totals.them.total) result = "Win";
  else if (totals.us.total < totals.them.total) result = "Loss";

  const htX = halfMarks.find((m) => m.marker === "HT");
  const htLine = htX ? xOf({ half: 1, elapsed: htX.elapsed }) : (scoring.some((s) => s.half === 2) ? h1max + GAP / 2 : null);

  return { header, roster, formationRows, scoring, notes, halfMarks, series, goalDots, scorers: Object.values(scorers), totals, result, leadChanges, timesLevel, maxLead, maxLeadSide, warnings, mode, detectedMode, htLine, opp: header.opposition || null };
}
