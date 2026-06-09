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
    expect(r.scorers.find((s) => s.name === "Morty")).toMatchObject({ side: "A", g: 1, p: 2, frees: 1 });
    expect(r.scorers.find((s) => s.name === "Gerald")).toMatchObject({ side: "B", g: 1 });
  });
  it("own goal scores for the other side", () => {
    const r = parseEvents("18:00\n20 Morty own goal", teamsGaa);          // Morty is side A → counts for B
    expect(r.totals.B.g).toBe(1); expect(r.totals.A.g).toBe(0);
    expect(r.scoring.find((s) => s.og)).toMatchObject({ side: "B", og: true });
  });
  it("'65 setPiece, cards, corners, subs, miss-note, team-level point", () => {
    const r = parseEvents("18:00\n9 Morty '65\n23 Wildebeests 9 yellow card\n31 Racoons corner\n40 11 for 10\n12 Morty miss wide\n52 Wildebeests", teamsGaa);
    expect(r.scoring.find((s) => s.setPiece)).toMatchObject({ setPiece: "65", side: "A" });
    expect(r.notes.find((n) => n.type === "card")).toMatchObject({ side: "B", card: "yellow" });
    expect(r.notes.find((n) => n.type === "corner")).toMatchObject({ side: "A" });
    expect(r.notes.find((n) => n.type === "sub")).toBeTruthy();
    expect(r.notes.find((n) => n.type === "note")?.text).toMatch(/miss/i);
    expect(r.totals.B.p).toBe(1);                                          // team-level Wildebeests point
  });
  it("added time deduced (28 HT → +3) and +N override", () => {
    const r = parseEvents("18:00\n28 HT\n18:30\n63 FT +4", teamsGaa);
    expect(r.halfMarks.find((m) => m.marker === "HT")?.added).toBe(3);
    expect(r.halfMarks.find((m) => m.marker === "FT")?.added).toBe(4);
  });
  it("result + stats from the counted series", () => {
    const r = parseEvents("18:00\n5 Morty goal\n10 Wildebeests 9 goal\n12 Wildebeests 9", teamsGaa);
    // A: 1-0 (=3), B: 1-1 (=4) → B ahead
    expect(r.result).toBe("B");
    expect(r.totals.A.total).toBe(3); expect(r.totals.B.total).toBe(4);
    expect(typeof r.leadChanges).toBe("number");
  });
});
