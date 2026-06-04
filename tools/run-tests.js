#!/usr/bin/env node
// Parser regression tests. Run: node tools/run-tests.js  (needs Node 18+)
const { parseMatch, SAMPLE, isPlaceholderLabel } = require("./parser-harness");

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

// ---- placeholder labels ----
t("placeholder set", ["New Match", " My Team ", "Match", "", undefined].map(isPlaceholderLabel), [true, true, true, true, true]);
t("real labels not placeholders", ["Racoons", "U14 League"].map(isPlaceholderLabel), [false, false]);

console.log(fail ? `\n${fail} FAILED` : "\nall passed");
process.exit(fail ? 1 : 0);
