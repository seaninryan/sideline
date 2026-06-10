import { describe, it, expect } from "vitest";
import { rosterToNotationLines, teamLinkPatch, swapHomeAway, teamsToPublish } from "@/lib/team-link";
import type { MatchRecord, TeamRecord } from "@/lib/types";

describe("teamsToPublish", () => {
  const base = { raw: "" } as MatchRecord;
  it("returns both linked team ids", () =>
    expect(teamsToPublish({ ...base, homeTeamId: "a", awayTeamId: "b" })).toEqual(["a", "b"]));
  it("drops nulls/missing", () =>
    expect(teamsToPublish({ ...base, homeTeamId: "a", awayTeamId: null })).toEqual(["a"]));
  it("de-dupes when both ids match", () =>
    expect(teamsToPublish({ ...base, homeTeamId: "a", awayTeamId: "a" })).toEqual(["a"]));
  it("empty when no teams linked", () => expect(teamsToPublish(base)).toEqual([]));
});

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
  const rec: MatchRecord = { raw: "5 Birdperson", myTeam: "Old", label: "U13A Hurling" } as any;
  it("sets ids by home/away, identity, opponent, oppRoster — leaves raw untouched", () => {
    const p = teamLinkPatch(rec, { usTeam: us, oppTeam: opp, homeAway: "home" });
    expect(p.homeTeamId).toBe("u1");
    expect(p.awayTeamId).toBe("o1");
    expect(p.myTeam).toBe("Racoons");
    expect(p.opponent).toBe("Wildebeests");
    expect(p.homeAway).toBe("home");
    expect(p.label).toBe("U13A Hurling");
    expect(p.colorUs).toBe("#f5c518");
    expect(p.colorThem).toBe("#c0392b");
    expect(p.oppRoster).toEqual(opp.roster);
    expect(p.oppRoster).not.toBe(opp.roster);
    expect((p as any).raw).toBeUndefined();
  });
  it("away mapping swaps the ids and sets homeAway", () => {
    const p = teamLinkPatch(rec, { usTeam: us, oppTeam: opp, homeAway: "away" });
    expect(p.homeTeamId).toBe("o1");
    expect(p.awayTeamId).toBe("u1");
    expect(p.homeAway).toBe("away");
  });
  it("seeds usRoster from the us team when the record has none", () => {
    const p = teamLinkPatch(rec, { usTeam: us, oppTeam: opp, homeAway: "home" });
    expect(p.usRoster).toEqual(us.roster);
    expect(p.usRoster).not.toBe(us.roster);
  });
  it("keeps an existing record roster intact (no reseed)", () => {
    const existing = { formation: [[10, 11]], players: [
      { num: 10, name: "Morty", role: "starting" as const }, { num: 11, name: "Rick", role: "starting" as const }] };
    const withRoster: MatchRecord = { raw: "5 Morty", myTeam: "Old", usRoster: existing } as any;
    const p = teamLinkPatch(withRoster, { usTeam: us, oppTeam: opp, homeAway: "home" });
    expect(p.usRoster).toEqual(existing);
    expect(p.usRoster!.players.some((pl) => pl.name === "Birdperson")).toBe(false);
  });
});

describe("swapHomeAway", () => {
  it("flips the homeAway field and swaps the team ids", () => {
    const rec: MatchRecord = { raw: "5 Birdperson", homeAway: "away", homeTeamId: "o1", awayTeamId: "u1" } as any;
    const p = swapHomeAway(rec);
    expect(p.homeAway).toBe("home");
    expect(p.homeTeamId).toBe("u1");
    expect(p.awayTeamId).toBe("o1");
    expect((p as any).raw).toBeUndefined();
  });
});
