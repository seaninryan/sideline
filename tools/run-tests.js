#!/usr/bin/env node
// Parser regression tests. Run: node tools/run-tests.js  (needs Node 18+)
const { parseMatch, SAMPLE, isPlaceholderLabel, buildInfographicSVG, swapRosterNums, renumRoster, eventLineMinute, deleteEventLine, insertEventLine, replaceEventLine, mkId, remapImport } = require("./parser-harness");

let fail = 0;
const t = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { fail++; console.log("FAIL", name, "got", JSON.stringify(got), "want", JSON.stringify(want)); }
  else console.log("ok  ", name);
};

// ---- canonical GAA sample (expected results in CLAUDE.md) ----
{
  const p = parseMatch(SAMPLE, { myTeam: "Racoons" });
  t("sample mode", p.mode, "gaa");
  t("sample us total", p.totals.us.str, "2-6");
  t("sample them total", p.totals.them.str, "2-7");
  t("sample result", p.result, "Loss");
  const rick = p.scorers.find((s) => s.name === "Rick");
  t("sample Rick 2-4 (4 frees)", [rick.g, rick.p, rick.frees], [2, 4, 4]);
  const morty = p.scorers.find((s) => s.name === "Morty");
  t("sample Morty 0-1", [morty.g, morty.p], [0, 1]);
  t("sample leadChanges", p.leadChanges, 1);
  t("sample timesLevel", p.timesLevel, 3);
  t("sample maxLead", [p.maxLead, p.maxLeadSide], [6, "us"]);
  t("sample warnings", p.warnings.length, 0);
}

// ---- soccer running-score match (real bug: was counted 3-4; truth is 2-4 away loss) ----
const SOCCER = `19:02
10 Jack miss pen
14 dkb Jack cross from right 0-1
23 long free 1-1


38
42 long range dropped 2-1
Alfie 50?
01 dkb 2-2
01 3-2
07 4-2`;
{
  const p = parseMatch(SOCCER, {});
  t("soccer detected as goals", p.mode, "goals");
  t("soccer totals", [p.totals.us.str, p.totals.them.str], ["2", "4"]);
  t("soccer result", p.result, "Loss");
  t("soccer warnings", p.warnings.length, 0);
  t("soccer miss pen is a note", p.notes.some((n) => n.type === "note" && /miss pen/.test(n.text)), true);
  t("miss note has no duplicated minute", p.notes.find((n) => /miss pen/.test(n.text)).text, "Jack miss pen");
  t("descriptive scorer keeps full desc", p.scoring.find((s) => s.minute === 23).desc, "long free");
  t("soccer miss not in scoring", p.scoring.some((s) => /miss/i.test(s.scorer || "")), false);
  t("soccer scoring count", p.scoring.length, 6);
}
{
  // forcing goals mode (autoMode off) must work the same
  const p = parseMatch(SOCCER, { scoringMode: "goals" });
  t("soccer forced-goals totals", [p.totals.us.str, p.totals.them.str], ["2", "4"]);
}
{
  // home side: written columns flip via the header
  const p = parseMatch("Soccer v Rovers\n19:02\n14 dkb 0-1\n23 1-1\n42 2-1\n", {});
  t("soccer home usCol", [p.totals.us.str, p.totals.them.str], ["2", "1"]);
  t("soccer header keyword wins", p.mode, "goals");
}

// ---- misses ----
{
  const p = parseMatch("U13 Hurling @ Tribesmen\n10. Rick\n18:21\n5 Rick wide\n7 Rick free 0-1 0-0\n", {});
  t("gaa wide is a note", p.notes.some((n) => /wide/.test(n.text)), true);
  t("gaa wide not scored", p.totals.us.str, "0-1");
}
{
  // a "dropped"/"saved" wording WITH a written score still counts via the score
  const p = parseMatch("19:02\n42 long range dropped 2-1\n44 2-2\n", { scoringMode: "goals" });
  t("score-bearing line with risky word still counts", [p.totals.us.str, p.totals.them.str], ["2", "2"]);
}
{
  // "'65" / "'45" set-piece points: flagged, stripped from the scorer name,
  // and the apostrophe form never collides with a written running score
  const p = parseMatch("U13 Hurling @ Tribesmen\n10. Rick\n18:21\n5 Rick '65 0-1 0-0\n7 Rick free 0-2 0-0\n9 T '65 0-2 0-1\n", {});
  t("'65 scorer clean", p.scoring[0].scorer, "Rick");
  t("'65 flagged", p.scoring[0].setPiece, "65");
  t("'65 not a free", p.scoring[0].fromFree, false);
  t("free not flagged as set piece", p.scoring[1].setPiece, null);
  t("'65 by them sided right", p.scoring[2].side, "them");
  t("'65 written score intact", [p.totals.us.str, p.totals.them.str], ["0-2", "0-1"]);
  t("'65 no warnings", p.warnings.length, 0);
}
{
  // live-entry style (no written score), football's '45
  const p = parseMatch("U13 Football @ Tribesmen\n10. Rick\n18:21\n5 Rick '45\n", {});
  t("'45 flagged", p.scoring[0].setPiece, "45");
  t("'45 scores a point", p.totals.us.str, "0-1");
  t("'45 scorer clean", p.scoring[0].scorer, "Rick");
}
{
  // "NN Water Break" is a note, not an opposition score — a phantom point here
  // forced the next written score's points column down (fake "score drops" warning)
  // and credited "Water Break" in the scorers table
  const p = parseMatch("U12 Hurling @ Wildebeests\n1. Rick\n2. Morty\n\n7:00\n05 Rick 0-1 0-0\n10 Water Break\n15 T 0-1 1-0\n", {});
  t("water break is a note", p.notes.some((n) => n.type === "note" && /water break/i.test(n.text)), true);
  t("water break not a score", p.scoring.length, 2);
  t("water break no drop warning", p.warnings.length, 0);
  t("water break totals", [p.totals.us.str, p.totals.them.str], ["0-1", "1-0"]);
  t("water break not a scorer", p.scorers.some((s) => /water/i.test(s.name)), false);
}

// ---- match-minute labels ----
{
  const p = parseMatch("19:02\n14 dkb 0-1\n23 long 1-1\n32 HT\n\n38\n42 long range 2-1\n01 dkb 2-2\n", { scoringMode: "goals" });
  t("H1 match minutes", p.scoring.filter((s) => s.half === 1).map((s) => s.mmin), ["12", "21"]);
  t("H2 continues from half length", p.scoring.filter((s) => s.half === 2).map((s) => s.mmin), ["34", "53"]);
  const q = parseMatch("19:02\n34 dkb 0-1\n35 HT\n", { scoringMode: "goals" }); // 32' elapsed, 30-min half
  t("stoppage shows base+N", q.scoring[0].mmin, "30+2");
  const r = parseMatch("U13 Hurling @ Tribesmen\n10. Morty\n18:21\n21 Morty 0-1 0-0\n43 Rick for Morty\n", {});
  t("opening-minute score shows 1'", r.scoring[0].mmin, "1");
  t("sub gets a match minute", r.notes.find((n) => n.type === "sub").mmin, "22");
}

// ---- added time at HT/FT ----
{
  const ht = (raw) => parseMatch(raw, { scoringMode: "goals" }).halfMarks.find((m) => m.marker);
  t("28' half deduces +3", ht("19:02\n14 dkb 0-1\n30 HT\n").added, 3); // 19:02 -> 30 is 28 elapsed
  t("exact multiple no added", ht("19:02\n14 dkb 0-1\n32 HT\n").added, undefined);
  t("inline override 'HT +6'", ht("19:02\n14 dkb 0-1\n30 HT +6\n").added, 6);
  t("standalone '+6' line overrides", ht("19:02\n14 dkb 0-1\n30 HT\n+6\n").added, 6);
  t("'+0' suppresses deduction", ht("19:02\n14 dkb 0-1\n30 HT\n+0\n").added, undefined);
}

// ---- minute-prefixed subs ----
{
  const p = parseMatch("U13 Hurling @ Tribesmen\n10. Morty\nSubs\n17. Pencilvester\n18:21\n7 Morty 0-1 0-0\n43 Pencilvester for Morty\n", {});
  const sub = p.notes.find((n) => n.type === "sub");
  t("minute sub parsed", [sub && sub.on, sub && sub.off, sub && sub.minute], ["Pencilvester", "Morty", 43]);
  t("minute sub not a score", p.scoring.length, 1);
  t("numbered sub", (() => {
    const q = parseMatch("U13 Hurling @ Tribesmen\n10. Morty\n18:21\n43 12 Rick for 6 Morty\n", {});
    const s = q.notes.find((n) => n.type === "sub");
    return [s && s.on, s && s.off];
  })(), ["12 Rick", "6 Morty"]);
  t("sub on/off resolved to roster numbers", [sub && sub.onNum, sub && sub.offNum], [17, 10]);
  t("numbered sub resolves by number", (() => {
    const q = parseMatch("U13 Hurling @ Tribesmen\n10. Morty\nSubs\n12. Rick\n18:21\n43 12 Rick for 10 Morty\n", {});
    const s = q.notes.find((n) => n.type === "sub");
    return [s && s.onNum, s && s.offNum];
  })(), [12, 10]);
  t("minute-less sub still works", (() => {
    const q = parseMatch("U13 Hurling @ Tribesmen\n10. Morty\n18:21\nRick for Morty\n", {});
    const s = q.notes.find((n) => n.type === "sub");
    return [s && s.on, s && s.off];
  })(), ["Rick", "Morty"]);
}

// ---- infographic smoke test (subs arrows, added time, opponent name, dark-kit contrast) ----
{
  const p = parseMatch("U13 Hurling @ Tribesmen\n10. Morty | 11. Rick\nSubs\n17. Pencilvester\n18:21\n23 Rick free 0-2 0-1\n43 Pencilvester for Morty\n28 HT\n", { myTeam: "Racoons" });
  const timeline = [...p.scoring.map((s) => ({ kind: "score", ...s })), ...p.notes.map((n) => ({ kind: n.type, ...n }))]
    .sort((a, b) => (a.half - b.half) || (a.seq - b.seq));
  const model = {
    grade: "U13", sport: p.header.sport, homeAway: p.header.homeAway, usName: "Racoons", themName: "Tribesmen",
    dateStr: "", totals: p.totals, result: p.result, effMode: p.mode, ht: "0-0",
    leadChanges: p.leadChanges, timesLevel: p.timesLevel, maxLead: p.maxLead, maxLeadSide: p.maxLeadSide,
    series: p.series, goalDots: p.goalDots, htLine: p.htLine, halfMarks: p.halfMarks,
    usScorers: p.scorers.filter((s) => s.side === "us"), formationRows: p.formationRows,
    starters: p.roster.filter((r) => r.role === "starting"), subs: p.roster.filter((r) => r.role === "sub"), missing: [],
    timeline, colorUs: "#111111", colorUs2: "#1f7a4d", colorThem: "#c0392b", colorThem2: "#2c5fa8",
  };
  const { svg } = buildInfographicSVG(model);
  t("infographic builds", typeof svg === "string" && svg.includes("</svg>"), true);
  t("infographic sub arrows", svg.includes("▲ Pencilvester") && svg.includes("▼ Morty"), true);
  t("infographic added time", svg.includes("+2 added"), true); // 18:21 -> 28 HT is 7' elapsed = 5 +2
  t("infographic opponent name on their score", svg.includes("Tribesmen  (free)") || svg.includes("Tribesmen "), true);
  t("infographic dark kit gets white numbers", svg.includes('fill="#ffffff"'), true);
  t("infographic GAA scorer keeps g-p", />0-2(\s|<| )/.test(svg) || svg.includes(">0-2 "), true);
}
{
  // soccer: scorer totals in goals, not g-p
  const p = parseMatch("Soccer @ Rovers\n10. Jack\n19:02\n14 Jack 0-1\n23 Jack 0-2\n", {});
  const timeline = p.scoring.map((s) => ({ kind: "score", ...s }));
  const model = {
    grade: "", sport: "Soccer", homeAway: "away", usName: "Racoons", themName: "Rovers", dateStr: "",
    totals: p.totals, result: p.result, effMode: p.mode, ht: "0 – 0",
    leadChanges: p.leadChanges, timesLevel: p.timesLevel, maxLead: p.maxLead, maxLeadSide: p.maxLeadSide,
    series: p.series, goalDots: p.goalDots, htLine: p.htLine, halfMarks: p.halfMarks,
    usScorers: p.scorers.filter((s) => s.side === "us"), formationRows: [[10]],
    starters: p.roster, subs: [], missing: [], timeline,
    colorUs: "#f5c518", colorUs2: "#1f7a4d", colorThem: "#c0392b", colorThem2: "#2c5fa8",
  };
  const { svg } = buildInfographicSVG(model);
  t("soccer infographic scorer in goals", svg.includes(">2</text>") && !svg.includes(">2-0"), true);
}

// ---- cards, corners, own goals ----
{
  const p = parseMatch("U13 Hurling @ Tribesmen\n10. Morty | 11. Rick\n18:21\n23 Morty yellow card\n25 T red\n27 corner\n29 T corner\n31 Rick own goal 0-0 1-0\n", { myTeam: "Racoons" });
  const y = p.notes.find((n) => n.type === "card" && n.card === "yellow");
  t("yellow card resolved to player", [y.side, y.num, y.who], ["us", 10, "Morty"]);
  t("red card to them", p.notes.find((n) => n.type === "card" && n.card === "red").side, "them");
  t("corner sides", p.notes.filter((n) => n.type === "corner").map((n) => n.side), ["us", "them"]);
  t("own goal scores for them", [p.totals.us.str, p.totals.them.str], ["0-0", "1-0"]);
  t("own goal credit label", p.scorers.find((s) => s.side === "them").name, "Own Goal (Rick)");
  t("own goal carries ogNum for lineup", [p.scoring[0].og, p.scoring[0].ogNum, p.scoring[0].playerNum], [true, 11, null]);
  t("cards/corners are not scores", p.scoring.length, 1);
}
{
  // unattributed own goal via team name, keyword (live) mode, soccer
  const p = parseMatch("Soccer @ Rovers\n19:02\n10 Racoons own goal\n12 T own goal\n", { myTeam: "Racoons", scoringMode: "goals" });
  t("og by us -> them goal; og by them -> our goal", [p.totals.us.str, p.totals.them.str], ["1", "1"]);
}

// ---- name matching with shared first names ("Cathal" and "Cathal N") ----
{
  // exact full-name match must beat an earlier fuzzy first-name match
  const RAW = "U13 Hurling @ Tribesmen\n5. Cathal N | 12. Cathal\nSubs\n17. Pencilvester\n18:21\n7 Cathal N 0-1 0-0\n9 Cathal 0-2 0-0\n43 Pencilvester for Cathal\n23 Cathal yellow card\n";
  const p = parseMatch(RAW, {});
  const sub = p.notes.find((n) => n.type === "sub");
  t("sub off exact name, not first-name twin", sub.offNum, 12);
  t("scorer Cathal N keeps his number", p.scoring[0].playerNum, 5);
  t("scorer Cathal keeps his number", p.scoring[1].playerNum, 12);
  t("card lands on exact-name player", p.notes.find((n) => n.type === "card").num, 12);
  t("scorers not merged", p.scorers.filter((s) => s.side === "us").map((s) => s.name).sort(), ["Cathal", "Cathal N"]);
}
{
  // reverse roster order: full name "Cathal N" must not resolve to "Cathal"
  const p = parseMatch("U13 Hurling @ Tribesmen\n5. Cathal | 12. Cathal N\n18:21\n7 Cathal N 0-1 0-0\n", {});
  t("reverse order scorer", [p.scoring[0].scorer, p.scoring[0].playerNum], ["Cathal N", 12]);
}
{
  // first-name shorthand still works when it's unambiguous
  const p = parseMatch("U13 Hurling @ Tribesmen\n10. Morty Smith\n18:21\n7 Morty 0-1 0-0\n", {});
  t("unambiguous first name still matches", [p.scoring[0].scorer, p.scoring[0].playerNum], ["Morty Smith", 10]);
}

// ---- srcLine: every event entry knows its raw line index ----
{
  const RAW = "U13 Hurling @ Tribesmen\n10. Morty | 11. Rick\nSubs\n17. Pencilvester\n18:21\n23 Rick free 0-1 0-0\n\n27 Jack miss pen\n31 Pencilvester for Morty\n35 Rick yellow card\n39 corner\n51 HT\n18:55\n58 T goal 0-1 1-1\nFT\n+2\nlegacy note no minute\n";
  const lines = RAW.split("\n");
  const p = parseMatch(RAW, {});
  const lineOf = (e) => lines[e.srcLine];
  t("srcLine on scoring", p.scoring.map(lineOf), ["23 Rick free 0-1 0-0", "58 T goal 0-1 1-1"]);
  t("srcLine on notes", p.notes.map((n) => [n.type, lineOf(n)]),
    [["note", "27 Jack miss pen"], ["sub", "31 Pencilvester for Morty"], ["card", "35 Rick yellow card"],
     ["corner", "39 corner"], ["note", "legacy note no minute"]]);
  t("srcLine on halfMarks", p.halfMarks.map((m) => [m.marker || "start", lineOf(m)]),
    [["start", "18:21"], ["HT", "51 HT"], ["start", "18:55"], ["FT", "FT"]]);

  // bare-minute half start (no clock line) also carries srcLine
  const q = parseMatch("19:02\n14 dkb 0-1\n32 HT\n\n38\n42 long 2-1\n", { scoringMode: "goals" });
  const qlines = "19:02\n14 dkb 0-1\n32 HT\n\n38\n42 long 2-1\n".split("\n");
  t("srcLine on bare-minute half start", qlines[q.halfMarks.find((m) => m.startMin === 38).srcLine], "38");
}

// ---- roster edits (reshuffle / change number) ----
{
  const RAW = "U13 Hurling @ Tribesmen\n10.Morty | 11. Rick\n  12. Summer | 13. Jerry\nSubs\n17. Pencilvester\n18:21\n23 Rick free 0-1 0-0\n";
  const swapped = swapRosterNums(RAW, 10, 11);
  t("swap same row", parseMatch(swapped, {}).formationRows[0], [11, 10]);
  t("swap keeps names with numbers", /11\. Rick\s*\|\s*10\.Morty/.test(swapped.split("\n")[1]), true);
  const cross = swapRosterNums(RAW, 10, 17);
  const pc = parseMatch(cross, {});
  t("swap pitch<->sub: sub starts", pc.formationRows[0], [17, 11]);
  t("swap pitch<->sub: starter benched", pc.roster.find((r) => r.num === 10).role, "sub");
  t("swap preserves other rows", cross.split("\n")[2], "  12. Summer | 13. Jerry");
  t("swap unknown num is a no-op", swapRosterNums(RAW, 10, 99), RAW);
  const renum = renumRoster(RAW, 11, 21);
  const pr = parseMatch(renum, {});
  t("renum changes the number", pr.roster.find((r) => r.name === "Rick").num, 21);
  t("renum updates formation row", pr.formationRows[0], [10, 21]);
  t("renum leaves scoring lines alone", pr.scoring[0].scorer, "Rick");
  t("renum unknown num is a no-op", renumRoster(RAW, 99, 5), RAW);
}

// ---- placeholder labels ----
t("placeholder set", ["New Match", " My Team ", "Match", "", undefined].map(isPlaceholderLabel), [true, true, true, true, true]);
t("real labels not placeholders", ["Racoons", "U14 League"].map(isPlaceholderLabel), [false, false]);

// ---- notation-block helpers ----
{
  t("eventLineMinute ordinary line", eventLineMinute("23 Rick free 0-1 0-0"), 23);
  t("eventLineMinute clock line", eventLineMinute("18:21"), null);
  t("eventLineMinute bare minute", eventLineMinute("38"), null);
  t("eventLineMinute bare HT", eventLineMinute("HT"), null);
  t("eventLineMinute minuted FT", eventLineMinute("51 FT"), null);
  t("eventLineMinute +N", eventLineMinute("+6"), null);
  t("eventLineMinute minute-less note", eventLineMinute("Rick for Morty"), null);
  t("eventLineMinute numbered sub", eventLineMinute("43 12 Rick for 6 Morty"), 43);
}
{
  const RAW = "a\nb\nc";
  t("deleteEventLine", deleteEventLine(RAW, 1), "a\nc");
  t("deleteEventLine out of range", deleteEventLine(RAW, 9), RAW);
}

// ---- insertEventLine: anchor picks the half, minute places the line ----
const BLK = [
  "U13 Hurling @ Tribesmen",            // 0
  "10. Morty | 11. Rick",               // 1
  "Subs",                               // 2
  "17. Pencilvester",                   // 3
  "18:21",                              // 4  half 1 start (startMin 21)
  "23 Rick free 0-1 0-0",               // 5  elapsed 2
  "27 Jack miss pen",                   // 6  elapsed 6 (note)
  "31 T 0-1 0-1",                       // 7  elapsed 10
  "51 HT",                              // 8
  "18:55",                              // 9  half 2 start (startMin 55)
  "58 T goal 0-1 1-1",                  // 10 elapsed 3
  "2 Rick 0-2 1-1",                     // 11 elapsed 7 (wrapped past the hour)
].join("\n");
{
  const at = (r, i) => r.split("\n")[i];
  const a = insertEventLine(BLK, 5, "29 Morty 0-2 0-1");
  t("insert places by minute", at(a, 7), "29 Morty 0-2 0-1"); // between the 27' and 31' lines
  const b = insertEventLine(BLK, 5, "27 Morty 0-2 0-1");
  t("insert tie lands after existing", at(b, 7), "27 Morty 0-2 0-1"); // after the existing 27' line
  const c = insertEventLine(BLK, 5, "49 Morty 0-2 0-1");
  t("insert never crosses HT", [at(c, 8), at(c, 9)], ["49 Morty 0-2 0-1", "51 HT"]);
  const d = insertEventLine(BLK, 10, "5 Morty 1-1 1-1"); // half 2, elapsed 10 — wraps
  t("insert wraps past the hour", at(d, 12), "5 Morty 1-1 1-1"); // after the 2' line
  const e = insertEventLine(BLK, 7, "switched Rick to midfield");
  t("insert minute-less goes right after anchor", at(e, 8), "switched Rick to midfield");
  const f = insertEventLine(BLK, 9, "57 Morty 1-1 1-1"); // anchor = half-2 clock line, elapsed 2
  t("insert after half-start block", at(f, 10), "57 Morty 1-1 1-1");
}

// ---- replaceEventLine ----
{
  const at = (r, i) => r.split("\n")[i];
  const a = replaceEventLine(BLK, 7, "25 T 0-1 0-1"); // 31' -> 25' (elapsed 4): moves before the 27' note
  t("replace re-sorts on minute change", [at(a, 6), at(a, 7)], ["25 T 0-1 0-1", "27 Jack miss pen"]);
  const b = replaceEventLine(BLK, 5, "23 Rick 0-1 0-0"); // text-only edit, same minute
  t("replace same minute stays put", at(b, 5), "23 Rick 0-1 0-0");
  const c = replaceEventLine(BLK, 8, "51 HT +3"); // marker: edited in place, never re-sorted
  t("replace marker stays put", at(c, 8), "51 HT +3");
  const d = replaceEventLine(BLK, 6, "27 Jack miss pen saved"); // still minuted, same minute
  t("replace note same minute stays put", at(d, 6), "27 Jack miss pen saved");
  t("replace out of range is a no-op", replaceEventLine(BLK, 99, "x"), BLK);
}

// ---- insertEventLine contract-pinning (Task-3 review) ----
{
  const at = (r, i) => r.split("\n")[i];
  // extra time: a third half started by a bare minute line; insert respects its startMin
  const ET = BLK + "\n70 FT\n75\n78 Rick 1-2 1-1";
  const g = insertEventLine(ET, 14, "76 Morty 0-3 1-1"); // anchor = the bare "75" half start
  t("insert into bare-minute extra-time half", at(g, 14), "76 Morty 0-3 1-1");
  // anchoring past FT still keeps the line inside the half (before the FT marker)
  const h = insertEventLine(BLK + "\n70 FT\nafter-match note", 13, "65 Morty 0-3 1-1");
  t("insert with post-FT anchor lands before FT", at(h, 12), "65 Morty 0-3 1-1");
}

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

console.log(fail ? `\n${fail} FAILED` : "\nall passed");
process.exit(fail ? 1 : 0);
