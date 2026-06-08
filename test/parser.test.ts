import { describe, it, expect } from "vitest";
import { parseMatch, isPlaceholderLabel } from "@/lib/parser";
import { buildInfographicSVG } from "@/lib/infographic";
import { SAMPLE } from "@/lib/sample";

// ---- canonical GAA sample (expected results in CLAUDE.md) ----
describe("canonical GAA sample", () => {
  const p = parseMatch(SAMPLE, { myTeam: "Racoons" });
  it("sample mode", () => expect(p.mode).toEqual("gaa"));
  it("sample us total", () => expect(p.totals.us.str).toEqual("2-6"));
  it("sample them total", () => expect(p.totals.them.str).toEqual("2-7"));
  it("sample result", () => expect(p.result).toEqual("Loss"));
  it("sample Rick 2-4 (4 frees)", () => {
    const rick = p.scorers.find((s: any) => s.name === "Rick");
    expect([rick.g, rick.p, rick.frees]).toEqual([2, 4, 4]);
  });
  it("sample Morty 0-1", () => {
    const morty = p.scorers.find((s: any) => s.name === "Morty");
    expect([morty.g, morty.p]).toEqual([0, 1]);
  });
  it("sample leadChanges", () => expect(p.leadChanges).toEqual(1));
  it("sample timesLevel", () => expect(p.timesLevel).toEqual(3));
  it("sample maxLead", () => expect([p.maxLead, p.maxLeadSide]).toEqual([6, "us"]));
  it("sample warnings", () => expect(p.warnings.length).toEqual(0));
});

// ---- soccer running-score match ----
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

describe("soccer running-score", () => {
  const p = parseMatch(SOCCER, {});
  it("soccer detected as goals", () => expect(p.mode).toEqual("goals"));
  it("soccer totals", () => expect([p.totals.us.str, p.totals.them.str]).toEqual(["2", "4"]));
  it("soccer result", () => expect(p.result).toEqual("Loss"));
  it("soccer warnings", () => expect(p.warnings.length).toEqual(0));
  it("soccer miss pen is a note", () => expect(p.notes.some((n: any) => n.type === "note" && /miss pen/.test(n.text))).toEqual(true));
  it("miss note has no duplicated minute", () => expect(p.notes.find((n: any) => /miss pen/.test(n.text)).text).toEqual("Jack miss pen"));
  it("descriptive scorer keeps full desc", () => expect(p.scoring.find((s: any) => s.minute === 23).desc).toEqual("long free"));
  it("soccer miss not in scoring", () => expect(p.scoring.some((s: any) => /miss/i.test(s.scorer || ""))).toEqual(false));
  it("soccer scoring count", () => expect(p.scoring.length).toEqual(6));
});

describe("soccer forced-goals", () => {
  it("soccer forced-goals totals", () => {
    const p = parseMatch(SOCCER, { scoringMode: "goals" });
    expect([p.totals.us.str, p.totals.them.str]).toEqual(["2", "4"]);
  });
});

describe("soccer home side", () => {
  it("soccer home usCol", () => {
    const p = parseMatch("Soccer v Rovers\n19:02\n14 dkb 0-1\n23 1-1\n42 2-1\n", {});
    expect([p.totals.us.str, p.totals.them.str]).toEqual(["2", "1"]);
  });
  it("soccer header keyword wins", () => {
    const p = parseMatch("Soccer v Rovers\n19:02\n14 dkb 0-1\n23 1-1\n42 2-1\n", {});
    expect(p.mode).toEqual("goals");
  });
});

// ---- misses ----
describe("misses", () => {
  it("gaa wide is a note", () => {
    const p = parseMatch("U13 Hurling @ Tribesmen\n10. Rick\n18:21\n5 Rick wide\n7 Rick free 0-1 0-0\n", {});
    expect(p.notes.some((n: any) => /wide/.test(n.text))).toEqual(true);
  });
  it("gaa wide not scored", () => {
    const p = parseMatch("U13 Hurling @ Tribesmen\n10. Rick\n18:21\n5 Rick wide\n7 Rick free 0-1 0-0\n", {});
    expect(p.totals.us.str).toEqual("0-1");
  });
  it("score-bearing line with risky word still counts", () => {
    const p = parseMatch("19:02\n42 long range dropped 2-1\n44 2-2\n", { scoringMode: "goals" });
    expect([p.totals.us.str, p.totals.them.str]).toEqual(["2", "2"]);
  });
});

// ---- set-piece points ----
describe("set-piece points", () => {
  const p = parseMatch("U13 Hurling @ Tribesmen\n10. Rick\n18:21\n5 Rick '65 0-1 0-0\n7 Rick free 0-2 0-0\n9 T '65 0-2 0-1\n", {});
  it("'65 scorer clean", () => expect(p.scoring[0].scorer).toEqual("Rick"));
  it("'65 flagged", () => expect(p.scoring[0].setPiece).toEqual("65"));
  it("'65 not a free", () => expect(p.scoring[0].fromFree).toEqual(false));
  it("free not flagged as set piece", () => expect(p.scoring[1].setPiece).toEqual(null));
  it("'65 by them sided right", () => expect(p.scoring[2].side).toEqual("them"));
  it("'65 written score intact", () => expect([p.totals.us.str, p.totals.them.str]).toEqual(["0-2", "0-1"]));
  it("'65 no warnings", () => expect(p.warnings.length).toEqual(0));
});

describe("set-piece '45", () => {
  const p = parseMatch("U13 Football @ Tribesmen\n10. Rick\n18:21\n5 Rick '45\n", {});
  it("'45 flagged", () => expect(p.scoring[0].setPiece).toEqual("45"));
  it("'45 scores a point", () => expect(p.totals.us.str).toEqual("0-1"));
  it("'45 scorer clean", () => expect(p.scoring[0].scorer).toEqual("Rick"));
});

// ---- water break / stoppages ----
describe("water break", () => {
  const p = parseMatch("U12 Hurling @ Wildebeests\n1. Rick\n2. Morty\n\n7:00\n05 Rick 0-1 0-0\n10 Water Break\n15 T 0-1 1-0\n", {});
  it("water break is a note", () => expect(p.notes.some((n: any) => n.type === "note" && /water break/i.test(n.text))).toEqual(true));
  it("water break not a score", () => expect(p.scoring.length).toEqual(2));
  it("water break no drop warning", () => expect(p.warnings.length).toEqual(0));
  it("water break totals", () => expect([p.totals.us.str, p.totals.them.str]).toEqual(["0-1", "1-0"]));
  it("water break not a scorer", () => expect(p.scorers.some((s: any) => /water/i.test(s.name))).toEqual(false));
});

// ---- match-minute labels ----
describe("match-minute labels", () => {
  const p = parseMatch("19:02\n14 dkb 0-1\n23 long 1-1\n32 HT\n\n38\n42 long range 2-1\n01 dkb 2-2\n", { scoringMode: "goals" });
  it("H1 match minutes", () => expect(p.scoring.filter((s: any) => s.half === 1).map((s: any) => s.mmin)).toEqual(["12", "21"]));
  it("H2 continues from half length", () => expect(p.scoring.filter((s: any) => s.half === 2).map((s: any) => s.mmin)).toEqual(["34", "53"]));
  it("stoppage shows base+N", () => {
    const q = parseMatch("19:02\n34 dkb 0-1\n35 HT\n", { scoringMode: "goals" }); // 32' elapsed, 30-min half
    expect(q.scoring[0].mmin).toEqual("30+2");
  });
  it("opening-minute score shows 1'", () => {
    const r = parseMatch("U13 Hurling @ Tribesmen\n10. Morty\n18:21\n21 Morty 0-1 0-0\n43 Rick for Morty\n", {});
    expect(r.scoring[0].mmin).toEqual("1");
  });
  it("sub gets a match minute", () => {
    const r = parseMatch("U13 Hurling @ Tribesmen\n10. Morty\n18:21\n21 Morty 0-1 0-0\n43 Rick for Morty\n", {});
    expect(r.notes.find((n: any) => n.type === "sub").mmin).toEqual("22");
  });
});

// ---- added time at HT/FT ----
describe("added time at HT/FT", () => {
  const ht = (raw: string) => parseMatch(raw, { scoringMode: "goals" }).halfMarks.find((m: any) => m.marker);
  it("28' half deduces +3", () => expect(ht("19:02\n14 dkb 0-1\n30 HT\n")!.added).toEqual(3)); // 19:02 -> 30 is 28 elapsed
  it("exact multiple no added", () => expect(ht("19:02\n14 dkb 0-1\n32 HT\n")!.added).toEqual(undefined));
  it("inline override 'HT +6'", () => expect(ht("19:02\n14 dkb 0-1\n30 HT +6\n")!.added).toEqual(6));
  it("standalone '+6' line overrides", () => expect(ht("19:02\n14 dkb 0-1\n30 HT\n+6\n")!.added).toEqual(6));
  it("'+0' suppresses deduction", () => expect(ht("19:02\n14 dkb 0-1\n30 HT\n+0\n")!.added).toEqual(undefined));
});

// ---- minute-prefixed subs ----
describe("minute-prefixed subs", () => {
  const p = parseMatch("U13 Hurling @ Tribesmen\n10. Morty\nSubs\n17. Pencilvester\n18:21\n7 Morty 0-1 0-0\n43 Pencilvester for Morty\n", {});
  const sub = p.notes.find((n: any) => n.type === "sub");
  it("minute sub parsed", () => expect([sub && sub.on, sub && sub.off, sub && sub.minute]).toEqual(["Pencilvester", "Morty", 43]));
  it("minute sub not a score", () => expect(p.scoring.length).toEqual(1));
  it("numbered sub", () => {
    const q = parseMatch("U13 Hurling @ Tribesmen\n10. Morty\n18:21\n43 12 Rick for 6 Morty\n", {});
    const s = q.notes.find((n: any) => n.type === "sub");
    expect([s && s.on, s && s.off]).toEqual(["12 Rick", "6 Morty"]);
  });
  it("sub on/off resolved to roster numbers", () => expect([sub && sub.onNum, sub && sub.offNum]).toEqual([17, 10]));
  it("numbered sub resolves by number", () => {
    const q = parseMatch("U13 Hurling @ Tribesmen\n10. Morty\nSubs\n12. Rick\n18:21\n43 12 Rick for 10 Morty\n", {});
    const s = q.notes.find((n: any) => n.type === "sub");
    expect([s && s.onNum, s && s.offNum]).toEqual([12, 10]);
  });
  it("minute-less sub still works", () => {
    const q = parseMatch("U13 Hurling @ Tribesmen\n10. Morty\n18:21\nRick for Morty\n", {});
    const s = q.notes.find((n: any) => n.type === "sub");
    expect([s && s.on, s && s.off]).toEqual(["Rick", "Morty"]);
  });
});

// ---- infographic smoke test ----
describe("infographic smoke test", () => {
  const p = parseMatch("U13 Hurling @ Tribesmen\n10. Morty | 11. Rick\nSubs\n17. Pencilvester\n18:21\n23 Rick free 0-2 0-1\n43 Pencilvester for Morty\n28 HT\n", { myTeam: "Racoons" });
  const timeline = [...p.scoring.map((s: any) => ({ kind: "score", ...s })), ...p.notes.map((n: any) => ({ kind: n.type, ...n }))]
    .sort((a: any, b: any) => (a.half - b.half) || (a.seq - b.seq));
  const model = {
    grade: "U13", sport: p.header.sport, homeAway: p.header.homeAway, usName: "Racoons", themName: "Tribesmen",
    dateStr: "", totals: p.totals, result: p.result, effMode: p.mode, ht: "0-0",
    leadChanges: p.leadChanges, timesLevel: p.timesLevel, maxLead: p.maxLead, maxLeadSide: p.maxLeadSide,
    series: p.series, goalDots: p.goalDots, htLine: p.htLine, halfMarks: p.halfMarks,
    usScorers: p.scorers.filter((s: any) => s.side === "us"), formationRows: p.formationRows,
    starters: p.roster.filter((r: any) => r.role === "starting"), subs: p.roster.filter((r: any) => r.role === "sub"), missing: [],
    timeline, colorUs: "#111111", colorUs2: "#1f7a4d", colorThem: "#c0392b", colorThem2: "#2c5fa8",
  };
  const { svg } = buildInfographicSVG(model);
  it("infographic builds", () => expect(typeof svg === "string" && svg.includes("</svg>")).toEqual(true));
  it("infographic sub arrows", () => expect(svg.includes("▲ Pencilvester") && svg.includes("▼ Morty")).toEqual(true));
  it("infographic added time", () => expect(svg.includes("+2 added")).toEqual(true)); // 18:21 -> 28 HT is 7' elapsed = 5 +2
  it("infographic opponent name on their score", () => expect(svg.includes("Tribesmen  (free)") || svg.includes("Tribesmen ")).toEqual(true));
  it("infographic dark kit gets white numbers", () => expect(svg.includes('fill="#ffffff"')).toEqual(true));
  it("infographic GAA scorer keeps g-p", () => expect(/>0-2(\s|<| )/.test(svg) || svg.includes(">0-2 ")).toEqual(true));
});

describe("soccer infographic scorer", () => {
  it("soccer infographic scorer in goals", () => {
    const p = parseMatch("Soccer @ Rovers\n10. Jack\n19:02\n14 Jack 0-1\n23 Jack 0-2\n", {});
    const timeline = p.scoring.map((s: any) => ({ kind: "score", ...s }));
    const model = {
      grade: "", sport: "Soccer", homeAway: "away", usName: "Racoons", themName: "Rovers", dateStr: "",
      totals: p.totals, result: p.result, effMode: p.mode, ht: "0 – 0",
      leadChanges: p.leadChanges, timesLevel: p.timesLevel, maxLead: p.maxLead, maxLeadSide: p.maxLeadSide,
      series: p.series, goalDots: p.goalDots, htLine: p.htLine, halfMarks: p.halfMarks,
      usScorers: p.scorers.filter((s: any) => s.side === "us"), formationRows: [[10]],
      starters: p.roster, subs: [], missing: [], timeline,
      colorUs: "#f5c518", colorUs2: "#1f7a4d", colorThem: "#c0392b", colorThem2: "#2c5fa8",
    };
    const { svg } = buildInfographicSVG(model);
    expect(svg.includes(">2</text>") && !svg.includes(">2-0")).toEqual(true);
  });
});

// ---- cards, corners, own goals ----
describe("cards, corners, own goals", () => {
  const p = parseMatch("U13 Hurling @ Tribesmen\n10. Morty | 11. Rick\n18:21\n23 Morty yellow card\n25 T red\n27 corner\n29 T corner\n31 Rick own goal 0-0 1-0\n", { myTeam: "Racoons" });
  const y = p.notes.find((n: any) => n.type === "card" && n.card === "yellow");
  it("yellow card resolved to player", () => expect([y.side, y.num, y.who]).toEqual(["us", 10, "Morty"]));
  it("red card to them", () => expect(p.notes.find((n: any) => n.type === "card" && n.card === "red").side).toEqual("them"));
  it("corner sides", () => expect(p.notes.filter((n: any) => n.type === "corner").map((n: any) => n.side)).toEqual(["us", "them"]));
  it("own goal scores for them", () => expect([p.totals.us.str, p.totals.them.str]).toEqual(["0-0", "1-0"]));
  it("own goal credit label", () => expect(p.scorers.find((s: any) => s.side === "them").name).toEqual("Own Goal (Rick)"));
  it("own goal carries ogNum for lineup", () => expect([p.scoring[0].og, p.scoring[0].ogNum, p.scoring[0].playerNum]).toEqual([true, 11, null]));
  it("cards/corners are not scores", () => expect(p.scoring.length).toEqual(1));
});

describe("unattributed own goal soccer", () => {
  it("og by us -> them goal; og by them -> our goal", () => {
    const p = parseMatch("Soccer @ Rovers\n19:02\n10 Racoons own goal\n12 T own goal\n", { myTeam: "Racoons", scoringMode: "goals" });
    expect([p.totals.us.str, p.totals.them.str]).toEqual(["1", "1"]);
  });
});

// ---- name matching with shared first names ("Cathal" and "Cathal N") ----
describe("name matching with shared first names", () => {
  const RAW = "U13 Hurling @ Tribesmen\n5. Cathal N | 12. Cathal\nSubs\n17. Pencilvester\n18:21\n7 Cathal N 0-1 0-0\n9 Cathal 0-2 0-0\n43 Pencilvester for Cathal\n23 Cathal yellow card\n";
  const p = parseMatch(RAW, {});
  const sub = p.notes.find((n: any) => n.type === "sub");
  it("sub off exact name, not first-name twin", () => expect(sub.offNum).toEqual(12));
  it("scorer Cathal N keeps his number", () => expect(p.scoring[0].playerNum).toEqual(5));
  it("scorer Cathal keeps his number", () => expect(p.scoring[1].playerNum).toEqual(12));
  it("card lands on exact-name player", () => expect(p.notes.find((n: any) => n.type === "card").num).toEqual(12));
  it("scorers not merged", () => expect(p.scorers.filter((s: any) => s.side === "us").map((s: any) => s.name).sort()).toEqual(["Cathal", "Cathal N"]));
});

describe("name matching reverse roster order", () => {
  it("reverse order scorer", () => {
    const p = parseMatch("U13 Hurling @ Tribesmen\n5. Cathal | 12. Cathal N\n18:21\n7 Cathal N 0-1 0-0\n", {});
    expect([p.scoring[0].scorer, p.scoring[0].playerNum]).toEqual(["Cathal N", 12]);
  });
});

describe("unambiguous first name shorthand", () => {
  it("unambiguous first name still matches", () => {
    const p = parseMatch("U13 Hurling @ Tribesmen\n10. Morty Smith\n18:21\n7 Morty 0-1 0-0\n", {});
    expect([p.scoring[0].scorer, p.scoring[0].playerNum]).toEqual(["Morty Smith", 10]);
  });
});

// ---- srcLine ----
describe("srcLine", () => {
  const RAW = "U13 Hurling @ Tribesmen\n10. Morty | 11. Rick\nSubs\n17. Pencilvester\n18:21\n23 Rick free 0-1 0-0\n\n27 Jack miss pen\n31 Pencilvester for Morty\n35 Rick yellow card\n39 corner\n51 HT\n18:55\n58 T goal 0-1 1-1\nFT\n+2\nlegacy note no minute\n";
  const lines = RAW.split("\n");
  const p = parseMatch(RAW, {});
  const lineOf = (e: any) => lines[e.srcLine];
  it("srcLine on scoring", () => expect(p.scoring.map(lineOf)).toEqual(["23 Rick free 0-1 0-0", "58 T goal 0-1 1-1"]));
  it("srcLine on notes", () => expect(p.notes.map((n: any) => [n.type, lineOf(n)])).toEqual(
    [["note", "27 Jack miss pen"], ["sub", "31 Pencilvester for Morty"], ["card", "35 Rick yellow card"],
     ["corner", "39 corner"], ["note", "legacy note no minute"]]));
  it("srcLine on halfMarks", () => expect(p.halfMarks.map((m: any) => [m.marker || "start", lineOf(m)])).toEqual(
    [["start", "18:21"], ["HT", "51 HT"], ["start", "18:55"], ["FT", "FT"]]));
  it("srcLine on bare-minute half start", () => {
    const q = parseMatch("19:02\n14 dkb 0-1\n32 HT\n\n38\n42 long 2-1\n", { scoringMode: "goals" });
    const qlines = "19:02\n14 dkb 0-1\n32 HT\n\n38\n42 long 2-1\n".split("\n");
    expect(qlines[q.halfMarks.find((m: any) => m.startMin === 38).srcLine]).toEqual("38");
  });
});

// ---- placeholder labels ----
describe("placeholder labels", () => {
  it("placeholder set", () => expect(["New Match", " My Team ", "Match", "", undefined].map(isPlaceholderLabel)).toEqual([true, true, true, true, true]));
  it("real labels not placeholders", () => expect(["Racoons", "U14 League"].map(isPlaceholderLabel)).toEqual([false, false]));
});
