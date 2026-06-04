#!/usr/bin/env node
// Parser regression tests. Run: node tools/run-tests.js  (needs Node 18+)
const { parseMatch, SAMPLE, isPlaceholderLabel, buildInfographicSVG } = require("./parser-harness");

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
}

// ---- placeholder labels ----
t("placeholder set", ["New Match", " My Team ", "Match", "", undefined].map(isPlaceholderLabel), [true, true, true, true, true]);
t("real labels not placeholders", ["Racoons", "U14 League"].map(isPlaceholderLabel), [false, false]);

console.log(fail ? `\n${fail} FAILED` : "\nall passed");
process.exit(fail ? 1 : 0);
