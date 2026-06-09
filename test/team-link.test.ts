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
    expect(rosterToNotationLines(us.roster)).toBe("1. Birdperson\n2. Jerry | 3. Beth\nSubs:\n16. Sub");
  });
  it("omits the Subs section when there are no subs", () => {
    expect(rosterToNotationLines(opp.roster)).toBe("1. Keeper");
  });
});

describe("teamLinkPatch", () => {
  const rec: MatchRecord = { raw: "U13A Hurling @ Old\n12:00\n5 Birdperson", myTeam: "Old" } as any;
  it("sets ids by home/away, identity, oppRoster, keeps the grade label", () => {
    const p = teamLinkPatch(rec, { usTeam: us, oppTeam: opp, homeAway: "home" });
    expect(p.homeTeamId).toBe("u1");
    expect(p.awayTeamId).toBe("o1");
    expect(p.myTeam).toBe("Racoons");
    expect(p.colorUs).toBe("#f5c518");
    expect(p.colorThem).toBe("#c0392b");
    expect(p.oppRoster).toEqual(opp.roster);
    expect(p.oppRoster).not.toBe(opp.roster);
    expect(p.raw.split("\n")[0]).toBe("U13A Hurling v Wildebeests");
  });
  it("away mapping swaps the ids", () => {
    const p = teamLinkPatch(rec, { usTeam: us, oppTeam: opp, homeAway: "away" });
    expect(p.homeTeamId).toBe("o1");
    expect(p.awayTeamId).toBe("u1");
    expect(p.raw.split("\n")[0]).toBe("U13A Hurling @ Wildebeests");
  });
  it("seeds the roster when the notation has none", () => {
    const p = teamLinkPatch(rec, { usTeam: us, oppTeam: opp, homeAway: "home" });
    expect(p.raw).toContain("1. Birdperson");
    expect(p.raw).toContain("Subs:");
  });
  it("keeps an existing hand-entered roster intact (no reseed)", () => {
    const withRoster: MatchRecord = { raw: "U13A @ Old\n10. Morty | 11. Rick\n12:00\n5 Morty", myTeam: "Old" } as any;
    const p = teamLinkPatch(withRoster, { usTeam: us, oppTeam: opp, homeAway: "home" });
    expect(p.raw).toContain("10. Morty | 11. Rick");
    expect(p.raw).not.toContain("Birdperson");
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
