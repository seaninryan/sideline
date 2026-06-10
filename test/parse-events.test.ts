import { describe, it, expect } from "vitest";
import { resolveWho, parseEvents } from "@/lib/parse-events";
import type { TeamRoster } from "@/lib/types";

const A = { name: "Racoons", roster: { formation: [[10],[11]], players: [
  { num: 10, name: "Morty", role: "starting" }, { num: 11, name: "Rick", role: "starting" }] } as TeamRoster };
const B = { name: "Wildebeests", roster: { formation: [[9]], players: [
  { num: 9, name: "Gerald", role: "starting" }, { num: 11, name: "Rick", role: "starting" }] } as TeamRoster };

describe("resolveWho", () => {
  it("player name unique across teams → that player + side", () => {
    expect(resolveWho("Morty", A, B)).toMatchObject({ side: "A", num: 10, name: "Morty", teamLevel: false });
  });
  it("Team + number → that team's player", () => {
    expect(resolveWho("Wildebeests 9", A, B)).toMatchObject({ side: "B", num: 9, name: "Gerald", teamLevel: false });
  });
  it("Team name alone → team-level (unattributed)", () => {
    expect(resolveWho("Wildebeests", A, B)).toMatchObject({ side: "B", teamLevel: true });
    expect(resolveWho("Racoons", A, B)).toMatchObject({ side: "A", teamLevel: true });
  });
  it("name on both teams → ambiguous (no side) unless qualified", () => {
    expect(resolveWho("Rick", A, B)).toMatchObject({ side: null, ambiguous: true });
    expect(resolveWho("Wildebeests Rick", A, B)).toMatchObject({ side: "B", num: 11, name: "Rick" });
  });
  it("unknown token → unresolved (no side)", () => {
    expect(resolveWho("Nobody", A, B)).toMatchObject({ side: null, ambiguous: false });
  });
  it("first-name shorthand resolves within a team", () => {
    expect(resolveWho("Gerald", A, B)).toMatchObject({ side: "B", num: 9 });
  });
});

const teamsGaa = { teamA: A, teamB: B, scoringMode: "gaa" as const };

describe("parseEvents — event walk + counted totals", () => {
  it("counts per-side goals/points; both-team scorers; no written score needed", () => {
    const r = parseEvents("18:00\n3 Morty\n10 Wildebeests 9 goal\n34 Morty goal\n40 Morty free", teamsGaa);
    expect(r.totals.A).toMatchObject({ g: 1, p: 2 });   // Morty: point, goal, free-point
    expect(r.totals.B).toMatchObject({ g: 1, p: 0 });   // Gerald goal
    expect(r.scorers.find((s: any) => s.name === "Morty")).toMatchObject({ side: "A", g: 1, p: 2, frees: 1 });
    expect(r.scorers.find((s: any) => s.name === "Gerald")).toMatchObject({ side: "B", g: 1 });
  });
  it("own goal scores for the other side", () => {
    const r = parseEvents("18:00\n20 Morty own goal", teamsGaa);          // Morty is side A → counts for B
    expect(r.totals.B.g).toBe(1); expect(r.totals.A.g).toBe(0);
    expect(r.scoring.find((s: any) => s.og)).toMatchObject({ side: "B", og: true });
  });
  it("'65 setPiece, cards, corners, subs, miss-note, team-level point", () => {
    const r = parseEvents("18:00\n9 Morty '65\n23 Wildebeests 9 yellow card\n31 Racoons corner\n40 11 for 10\n12 Morty miss wide\n52 Wildebeests", teamsGaa);
    expect(r.scoring.find((s: any) => s.setPiece)).toMatchObject({ setPiece: "65", side: "A" });
    expect(r.notes.find((n: any) => n.type === "card")).toMatchObject({ side: "B", card: "yellow" });
    expect(r.notes.find((n: any) => n.type === "corner")).toMatchObject({ side: "A" });
    expect(r.notes.find((n: any) => n.type === "sub")).toBeTruthy();
    expect(r.notes.find((n: any) => n.type === "note")?.text).toMatch(/miss/i);
    expect(r.totals.B.p).toBe(1);                                          // team-level Wildebeests point
  });
  it("added time deduced (28 HT → +3) and +N override", () => {
    const r = parseEvents("18:00\n28 HT\n18:30\n63 FT +4", teamsGaa);
    expect(r.halfMarks.find((m: any) => m.marker === "HT")?.added).toBe(3);
    expect(r.halfMarks.find((m: any) => m.marker === "FT")?.added).toBe(4);
  });
  it("result + stats from the counted series", () => {
    const r = parseEvents("18:00\n5 Morty goal\n10 Wildebeests 9 goal\n12 Wildebeests 9", teamsGaa);
    // A: 1-0 (=3), B: 1-1 (=4) → B ahead
    expect(r.result).toBe("B");
    expect(r.totals.A.total).toBe(3); expect(r.totals.B.total).toBe(4);
    expect(typeof r.leadChanges).toBe("number");
  });
});

// ── parity suites: translated from the retired parser.test.ts, restated in the
// event-only two-team grammar. Behaviours dropped (written-score-is-truth,
// column-vote, reconciliation-drop warning, sport-detection-from-score-shape,
// header/roster-block parsing) are deliberately NOT translated — they no longer
// exist in this engine (header/roster moved to the record; totals are counted).
// Distinct first names per team keep these fixtures unambiguous.
const T_A = { name: "Racoons", roster: { formation: [[10], [11]], players: [
  { num: 10, name: "Morty", role: "starting" }, { num: 11, name: "Rick", role: "starting" },
  { num: 17, name: "Pencilvester", role: "sub" }] } as TeamRoster };
const T_B = { name: "Wildebeests", roster: { formation: [[9]], players: [
  { num: 9, name: "Gerald", role: "starting" }, { num: 7, name: "Tariq", role: "starting" }] } as TeamRoster };
const gaa = { teamA: T_A, teamB: T_B, scoringMode: "gaa" as const };
const goals = { teamA: T_A, teamB: T_B, scoringMode: "goals" as const };

describe("goal-vs-point inference (no written score)", () => {
  it("bare scoring line is a point", () => {
    const r = parseEvents("18:00\n12 Morty", gaa);
    expect(r.scoring[0]).toMatchObject({ type: "point", side: "A" });
    expect(r.totals.A.str).toBe("0-1");
  });
  it("the goal keyword makes a goal", () => {
    const r = parseEvents("18:00\n12 Morty goal", gaa);
    expect(r.scoring[0]).toMatchObject({ type: "goal", side: "A" });
    expect(r.totals.A.str).toBe("1-0");
  });
  it("goals mode counts every score as a goal", () => {
    const r = parseEvents("18:00\n5 Morty\n8 Morty", goals);
    expect(r.totals.A.str).toBe("2");
    expect(r.scoring.every((s: any) => s.type === "goal" || s.type === "point")).toBe(true);
  });
});

describe("frees", () => {
  it("the free keyword flags a free-point and counts it per scorer", () => {
    const r = parseEvents("18:00\n7 Rick free\n9 Rick free\n11 Rick", gaa);
    expect(r.scoring[0]).toMatchObject({ type: "point", fromFree: true });
    const rick = r.scorers.find((s: any) => s.name === "Rick");
    expect(rick).toMatchObject({ side: "A", g: 0, p: 3, frees: 2 });
  });
  it("a goal from a free is not flagged fromFree", () => {
    const r = parseEvents("18:00\n12 Rick free goal", gaa);
    expect(r.scoring[0]).toMatchObject({ type: "goal", fromFree: false });
  });
});

describe("set-piece points", () => {
  it("'65 (hurling) sets setPiece and is NOT a free", () => {
    const r = parseEvents("18:00\n5 Rick '65", gaa);
    expect(r.scoring[0]).toMatchObject({ setPiece: "65", type: "point", fromFree: false, scorer: "Rick", side: "A" });
    expect(r.totals.A.str).toBe("0-1");
  });
  it("'45 (football) sets setPiece and scores a point", () => {
    const r = parseEvents("18:00\n5 Rick '45", gaa);
    expect(r.scoring[0]).toMatchObject({ setPiece: "45", type: "point", scorer: "Rick" });
    expect(r.totals.A.str).toBe("0-1");
  });
  it("a plain free is not flagged as a set piece", () => {
    const r = parseEvents("18:00\n5 Rick free", gaa);
    expect(r.scoring[0].setPiece).toBeNull();
  });
  it("a bare trailing 65 peels as a score token, not a set piece", () => {
    // documented: the apostrophe form is canonical; a bare trailing 65 is a written-score token
    const r = parseEvents("18:00\n12 Morty 65", gaa);
    expect(r.scoring[0].setPiece).toBeNull();
  });
  it("a bare 65 mid-line still flags", () => {
    const r = parseEvents("18:00\n10 Morty 65 goal", gaa);
    expect(r.scoring[0]).toMatchObject({ setPiece: "65", type: "goal" });
  });
});

describe("own goals", () => {
  it("an own goal scores for the OTHER side and reads 'own goal (name)'", () => {
    const r = parseEvents("18:00\n31 Rick own goal", gaa);   // Rick is side A → counts for B
    expect(r.totals.B.g).toBe(1); expect(r.totals.A.g).toBe(0);
    expect(r.scoring[0]).toMatchObject({ side: "B", og: true, ogNum: 11, scorer: "own goal (Rick)" });
  });
  it("the 'og' shorthand also flips the side (own point with no 'goal' word)", () => {
    const r = parseEvents("18:00\n33 Gerald og", gaa);        // Gerald is side B → counts for A
    expect(r.totals.A.str).toBe("0-1");                       // no 'goal' word → an own point
    expect(r.scoring[0]).toMatchObject({ side: "A", og: true, ogNum: 9 });
  });
  it("'own goal' (with the goal word) is a goal for the other side", () => {
    const r = parseEvents("18:00\n33 Gerald own goal", gaa);
    expect(r.totals.A.str).toBe("1-0");
    expect(r.scoring[0]).toMatchObject({ side: "A", og: true, type: "goal" });
  });
});

describe("subs", () => {
  it("a minuted sub parses with on/off + minute, resolves roster numbers, is not a score", () => {
    const r = parseEvents("18:00\n7 Morty\n43 Pencilvester for Morty", gaa);
    const sub = r.notes.find((n: any) => n.type === "sub");
    expect(sub).toMatchObject({ on: "Pencilvester", off: "Morty", minute: 43, onNum: 17, offNum: 10, side: "A" });
    expect(r.scoring.length).toBe(1);
  });
  it("a minute-less sub still parses", () => {
    const r = parseEvents("18:00\nPencilvester for Morty", gaa);
    expect(r.notes.find((n: any) => n.type === "sub")).toMatchObject({ on: "Pencilvester", off: "Morty", onNum: 17, offNum: 10 });
  });
  it("a numbered sub keeps the raw on/off text", () => {
    const r = parseEvents("18:00\n43 17 Pencilvester for 10 Morty", gaa);
    const sub = r.notes.find((n: any) => n.type === "sub");
    expect(sub).toMatchObject({ on: "17 Pencilvester", off: "10 Morty" });
  });
  it("a numbered sub resolves on/off by shirt number", () => {
    const r = parseEvents("18:00\n43 17 Pencilvester for 10 Morty", gaa);
    const sub = r.notes.find((n: any) => n.type === "sub");
    expect(sub).toMatchObject({ onNum: 17, offNum: 10 });
  });
  it("a bare-number sub does not become a score (the ' for ' discriminates)", () => {
    const r = parseEvents("18:00\n40 11 for 10", gaa);
    expect(r.scoring.length).toBe(0);
    expect(r.notes.find((n: any) => n.type === "sub")).toMatchObject({ onNum: 11, offNum: 10 });
  });
  it("a sub gets a match minute", () => {
    const r = parseEvents("18:21\n43 Pencilvester for Morty", gaa);
    expect(r.notes.find((n: any) => n.type === "sub").mmin).toBe("22");
  });
});

describe("cards", () => {
  it("a yellow card resolves to the player + side + roster number; not a score", () => {
    const r = parseEvents("18:00\n23 Morty yellow card", gaa);
    expect(r.notes.find((n: any) => n.type === "card")).toMatchObject({ card: "yellow", side: "A", num: 10, who: "Morty" });
    expect(r.scoring.length).toBe(0);
  });
  it("a red card on the opponent is sided to B", () => {
    const r = parseEvents("18:00\n70 Wildebeests 7 red card", gaa);
    expect(r.notes.find((n: any) => n.type === "card")).toMatchObject({ card: "red", side: "B", num: 7 });
  });
  it("the bare 'red' form (no 'card' word) still flags", () => {
    const r = parseEvents("18:00\n25 Wildebeests red", gaa);
    expect(r.notes.find((n: any) => n.type === "card")).toMatchObject({ card: "red", side: "B" });
  });
});

describe("corners", () => {
  it("a team-qualified corner is sided", () => {
    const r = parseEvents("18:00\n31 Racoons corner\n44 Wildebeests corner", gaa);
    expect(r.notes.filter((n: any) => n.type === "corner").map((n: any) => n.side)).toEqual(["A", "B"]);
  });
  it("a bare corner (no team) is a plain note, not a corner", () => {
    const r = parseEvents("18:00\n27 corner", gaa);
    expect(r.notes.find((n: any) => n.type === "corner")).toBeUndefined();
    expect(r.notes.find((n: any) => n.type === "note")?.text).toBe("corner");
  });
});

describe("misses & stoppages → notes", () => {
  it("a miss line with no score is a note, not a score, with the minute stripped", () => {
    const r = parseEvents("18:00\n10 Morty miss pen", gaa);
    expect(r.scoring.length).toBe(0);
    expect(r.notes.find((n: any) => n.type === "note")?.text).toBe("Morty miss pen");
  });
  it("a water break is a note and not a scorer", () => {
    const r = parseEvents("18:00\n46 Water Break", gaa);
    expect(r.scoring.length).toBe(0);
    expect(r.notes.find((n: any) => /water/i.test(n.text))).toBeTruthy();
    expect(r.scorers.some((s: any) => /water/i.test(s.name))).toBe(false);
  });
  it("wide / saved / blocked / short keywords all read as notes", () => {
    for (const kw of ["wide", "saved", "blocked", "short"]) {
      const r = parseEvents(`18:00\n5 Morty ${kw}`, gaa);
      expect(r.scoring.length).toBe(0);
      expect(r.notes.some((n: any) => n.type === "note")).toBe(true);
    }
  });
});

describe("halves & minutes", () => {
  it("an HH:MM clock line starts a half", () => {
    const r = parseEvents("18:21\n5 Morty\n18:50\n55 Morty", gaa);
    expect(r.scoring.map((s: any) => s.half)).toEqual([1, 2]);
    expect(r.halfMarks.filter((m: any) => m.clock).length).toBe(2);
  });
  it("a bare minute-only line starts a new half when HT is omitted", () => {
    const r = parseEvents("18:21\n14 Morty\n32 HT\n\n38\n42 Morty", gaa);
    const start2 = r.halfMarks.find((m: any) => m.startMin === 38);
    expect(start2).toMatchObject({ half: 2 });
    expect(r.scoring.find((s: any) => s.minute === 42)?.half).toBe(2);
  });
  it("HT/FT markers are recorded", () => {
    const r = parseEvents("18:00\n5 Morty\nHT\n18:50\n55 Morty\nFT", gaa);
    expect(r.halfMarks.filter((m: any) => m.marker).map((m: any) => m.marker)).toEqual(["HT", "FT"]);
  });
  it("wall-clock minutes wrap past the hour", () => {
    const r = parseEvents("18:55\n57 Morty\n02 Morty\n05 Morty", gaa);
    expect(r.scoring.map((s: any) => s.elapsed)).toEqual([2, 7, 10]);
  });
  it("a score in the opening minute shows a match minute of 1, not 0", () => {
    const r = parseEvents("18:21\n21 Morty", gaa);
    expect(r.scoring[0].mmin).toBe("1");
  });
  it("H2 match minutes continue from the half length; stoppage shows base+N", () => {
    const r = parseEvents("18:00\n14 Morty\n23 Morty\n32 HT\n18:30\n38 Morty", goals);
    expect(r.scoring.filter((s: any) => s.half === 1).map((s: any) => s.mmin)).toEqual(["14", "23"]);
    expect(r.scoring.filter((s: any) => s.half === 2).map((s: any) => s.mmin)).toEqual(["38"]);
    const q = parseEvents("18:00\n32 Morty\n32 HT", goals);     // 32' elapsed, HT at 32 → 30-min half +2
    expect(q.scoring[0].mmin).toBe("30+2");
  });
});

describe("added time", () => {
  const ht = (raw: string) => parseEvents(raw, goals).halfMarks.find((m: any) => m.marker === "HT");
  it("an off-multiple half deduces +N (elapsed % 5)", () => {
    expect(ht("18:00\n14 Morty\n28 HT")!.added).toBe(3);     // 28' elapsed → 25 +3
  });
  it("an exact multiple has no added time", () => {
    expect(ht("18:00\n14 Morty\n30 HT")!.added).toBeUndefined();
  });
  it("an inline '+6' overrides the deduction", () => {
    expect(ht("18:00\n14 Morty\n28 HT +6")!.added).toBe(6);
  });
  it("a standalone '+6' line after the marker overrides", () => {
    expect(ht("18:00\n14 Morty\n28 HT\n+6")!.added).toBe(6);
  });
  it("'+0' suppresses the deduction", () => {
    expect(ht("18:00\n14 Morty\n28 HT\n+0")!.added).toBeUndefined();
  });
});

describe("stats from the counted series", () => {
  it("leadChanges / timesLevel / maxLead / maxLeadSide track the lead", () => {
    // A goal (A 3-0) ; B goal (level 3-3) ; B point (B 3-4 ahead) ; A goal (A 6-4 ahead)
    const r = parseEvents("18:00\n5 Morty goal\n10 Wildebeests 9 goal\n12 Wildebeests 9\n55 Morty goal", gaa);
    expect(r.timesLevel).toBe(1);          // levelled at 3-3
    expect(r.leadChanges).toBe(2);         // B went ahead, then A
    expect(r.maxLead).toBe(3);             // A's opening 3-0 is the largest margin
    expect(r.maxLeadSide).toBe("A");
  });
  it("goalDots carry the scoring side", () => {
    const r = parseEvents("18:00\n5 Morty goal\n10 Wildebeests 9 goal", gaa);
    expect(r.goalDots.map((d: any) => d.side)).toEqual(["A", "B"]);
  });
  it("htLine is set once a second half exists", () => {
    const r = parseEvents("18:00\n5 Morty\n20 HT\n18:50\n55 Morty", gaa);
    expect(typeof r.htLine).toBe("number");
  });
});

describe("name matching — exact beats fuzzy", () => {
  // a roster where two players share a first name ("Cathal" and "Cathal N")
  const SHARED = { name: "Racoons", roster: { formation: [[5], [12]], players: [
    { num: 5, name: "Cathal N", role: "starting" }, { num: 12, name: "Cathal", role: "starting" },
    { num: 17, name: "Pencilvester", role: "sub" }] } as TeamRoster };
  const oppB = { name: "Wildebeests", roster: { formation: [[9]], players: [
    { num: 9, name: "Gerald", role: "starting" }] } as TeamRoster };
  const shared = { teamA: SHARED, teamB: oppB, scoringMode: "gaa" as const };

  it("an exact full-name match wins over the first-name twin", () => {
    expect(resolveWho("Cathal N", SHARED, oppB)).toMatchObject({ num: 5, name: "Cathal N" });
    expect(resolveWho("Cathal", SHARED, oppB)).toMatchObject({ num: 12, name: "Cathal" });
  });
  it("scorers are not merged across the shared first name", () => {
    const r = parseEvents("18:00\n7 Cathal N\n9 Cathal", shared);
    const byNum = r.scorers.map((s: any) => [s.name, s.num]).sort((a: any, b: any) => a[1] - b[1]);
    expect(byNum).toEqual([["Cathal N", 5], ["Cathal", 12]]);
  });
  it("a card lands on the exact-name player, not the twin", () => {
    const r = parseEvents("18:00\n23 Cathal yellow card", shared);
    expect(r.notes.find((n: any) => n.type === "card")).toMatchObject({ num: 12 });
  });
  it("unambiguous first-name shorthand still resolves", () => {
    const FULL = { name: "Racoons", roster: { formation: [[10]], players: [
      { num: 10, name: "Morty Smith", role: "starting" }] } as TeamRoster };
    expect(resolveWho("Morty", FULL, oppB)).toMatchObject({ num: 10, name: "Morty Smith", side: "A" });
  });
});

describe("resolution order across both rosters", () => {
  // Rick is on BOTH teams; Morty/Gerald are unique
  it("a player name unique to one roster sets that side", () => {
    expect(resolveWho("Morty", A, B)).toMatchObject({ side: "A", num: 10 });
    expect(resolveWho("Gerald", A, B)).toMatchObject({ side: "B", num: 9 });
  });
  it("'<Team> <number>' resolves to that team's player (name from its roster)", () => {
    expect(resolveWho("Wildebeests 9", A, B)).toMatchObject({ side: "B", num: 9, name: "Gerald" });
  });
  it("'<Team> <unknown-number>' keeps the side + number with an empty name", () => {
    expect(resolveWho("Wildebeests 99", A, B)).toMatchObject({ side: "B", num: 99, name: "", teamLevel: false });
  });
  it("'<Team>' alone is a team-level (unattributed) event", () => {
    expect(resolveWho("Wildebeests", A, B)).toMatchObject({ side: "B", teamLevel: true, num: null });
  });
  it("a team-level point counts but credits no named scorer", () => {
    const r = parseEvents("18:00\n52 Wildebeests", gaa);
    expect(r.totals.B.str).toBe("0-1");
    expect(r.scorers.length).toBe(0);
  });
  it("a bare name on BOTH teams is ambiguous (no side) and warns", () => {
    const r = parseEvents("18:00\n10 Rick goal", { teamA: A, teamB: B, scoringMode: "gaa" });
    expect(r.scoring[0]).toMatchObject({ side: null, sure: false });
    expect(r.totals.A.total).toBe(0); expect(r.totals.B.total).toBe(0);
    expect(r.warnings.some((w: any) => /both teams/i.test(w.msg))).toBe(true);
  });
  it("the ambiguity clears with a team qualifier", () => {
    const r = parseEvents("18:00\n10 Wildebeests Rick goal", { teamA: A, teamB: B, scoringMode: "gaa" });
    expect(r.scoring[0]).toMatchObject({ side: "B", scorer: "Rick" });
  });
  it("an unknown token is unresolved (no side) and warns", () => {
    const r = parseEvents("18:00\n10 Nobody goal", gaa);
    expect(r.scoring[0]).toMatchObject({ side: null });
    expect(r.warnings.some((w: any) => /couldn't tell/i.test(w.msg))).toBe(true);
  });
});
