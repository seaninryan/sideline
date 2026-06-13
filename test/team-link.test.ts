import { describe, it, expect } from "vitest";
import { rosterToNotationLines, teamLinkPatch, swapHomeAway, teamsToPublish } from "@/lib/team-link";
import { linkExistingMatchPatch, reconcileHomeAwayFromTeams } from "@/lib/team-link";
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

const home: TeamRecord = { id: "u1", name: "Racoons", color1: "#f5c518", color2: "#1f7a4d", sport: "hurling",
  roster: { formation: [[1], [2, 3]], players: [
    { num: 1, name: "Birdperson", role: "starting" }, { num: 2, name: "Jerry", role: "starting" }, { num: 3, name: "Beth", role: "starting" }, { num: 16, name: "Sub", role: "sub" }] } };
const away: TeamRecord = { id: "o1", name: "Wildebeests", color1: "#c0392b", color2: "#2c5fa8", sport: "hurling",
  roster: { formation: [[1]], players: [{ num: 1, name: "Keeper", role: "starting" }] } };

describe("rosterToNotationLines", () => {
  it("renders formation rows pipe-joined + a Subs section", () => {
    expect(rosterToNotationLines(home.roster)).toBe("1. Birdperson\n2. Jerry | 3. Beth\nSubs:\n16. Sub");
  });
  it("omits the Subs section when there are no subs", () => {
    expect(rosterToNotationLines(away.roster)).toBe("1. Keeper");
  });
});

describe("teamLinkPatch", () => {
  const rec: MatchRecord = { raw: "5 Birdperson", label: "U13A Hurling" } as any;
  it("sets ids, identity, names, awayRoster — leaves raw untouched", () => {
    const p = teamLinkPatch(rec, { homeTeam: home, awayTeam: away });
    expect(p.homeTeamId).toBe("u1");
    expect(p.awayTeamId).toBe("o1");
    expect(p.homeTeam).toBe("Racoons");
    expect(p.awayTeam).toBe("Wildebeests");
    expect(p.label).toBe("U13A Hurling");
    expect(p.colorHome).toBe("#f5c518");
    expect(p.colorAway).toBe("#c0392b");
    expect(p.awayRoster).toEqual(away.roster);
    expect(p.awayRoster).not.toBe(away.roster);
    expect((p as any).raw).toBeUndefined();
  });
  it("seeds homeRoster from the home team when the record has none", () => {
    const p = teamLinkPatch(rec, { homeTeam: home, awayTeam: away });
    expect(p.homeRoster).toEqual(home.roster);
    expect(p.homeRoster).not.toBe(home.roster);
  });
  it("keeps an existing record roster intact (no reseed)", () => {
    const existing = { formation: [[10, 11]], players: [
      { num: 10, name: "Morty", role: "starting" as const }, { num: 11, name: "Rick", role: "starting" as const }] };
    const withRoster: MatchRecord = { raw: "5 Morty", homeRoster: existing } as any;
    const p = teamLinkPatch(withRoster, { homeTeam: home, awayTeam: away });
    expect(p.homeRoster).toEqual(existing);
    expect(p.homeRoster!.players.some((pl) => pl.name === "Birdperson")).toBe(false);
  });
});

describe("swapHomeAway (④a us/them shim)", () => {
  it("toggles homeAway and swaps the team ids on the editor's us/them payload", () => {
    const p = swapHomeAway({ homeAway: "home", homeTeamId: "u1", awayTeamId: "o1" });
    expect(p.homeAway).toBe("away");
    expect(p.homeTeamId).toBe("o1");
    expect(p.awayTeamId).toBe("u1");
  });

  it("toggles away → home", () => {
    const p = swapHomeAway({ homeAway: "away", homeTeamId: "u1", awayTeamId: "o1" });
    expect(p.homeAway).toBe("home");
  });

  it("defaults missing ids to null", () => {
    const p = swapHomeAway({ homeAway: "home" });
    expect(p.homeTeamId).toBeNull();
    expect(p.awayTeamId).toBeNull();
  });
});

describe("linkExistingMatchPatch", () => {
  it("sets team ids and seeds both rosters when absent", () => {
    const rec = { raw: "" } as MatchRecord;
    const patch = linkExistingMatchPatch(rec, { homeTeam: home, awayTeam: away });
    expect(patch.homeTeamId).toBe(home.id);
    expect(patch.awayTeamId).toBe(away.id);
    expect(patch.homeRoster).toEqual(home.roster);
    expect(patch.awayRoster).toEqual(away.roster);
  });

  it("never clobbers existing rosters or names", () => {
    const rec = {
      raw: "", homeTeam: "Custom Home", awayTeam: "Custom Away",
      colorHome: "#111", colorAway: "#222",
      homeRoster: { formation: [[9]], players: [{ num: 9, name: "Mine", role: "starting" }] },
      awayRoster: { formation: [[7]], players: [{ num: 7, name: "Theirs", role: "starting" }] },
    } as MatchRecord;
    const patch = linkExistingMatchPatch(rec, { homeTeam: home, awayTeam: away });
    expect(patch.homeRoster).toBeUndefined();   // present already → not in patch
    expect(patch.awayRoster).toBeUndefined();
    expect((patch as any).homeTeam).toBeUndefined();
    expect((patch as any).awayTeam).toBeUndefined();
    expect((patch as any).colorHome).toBeUndefined();
  });

  it("seeds squads only when blank", () => {
    const withSquad = { ...home, squad: "Senior" };
    const patch = linkExistingMatchPatch({ raw: "" } as MatchRecord, { homeTeam: withSquad, awayTeam: away });
    expect(patch.homeSquad).toBe("Senior");
  });
});

describe("teamLinkPatch squad snapshot", () => {
  it("snapshots each team's squad onto the match", () => {
    const rec: any = { raw: "", homeRoster: { formation: [], players: [] } };
    const homeTeam: any = { id: "u", name: "Racoons", squad: "U12 Boys", roster: { formation: [], players: [] } };
    const awayTeam: any = { id: "o", name: "Wildebeests", squad: "Senior", roster: { formation: [], players: [] } };
    const patch = teamLinkPatch(rec, { homeTeam, awayTeam });
    expect(patch.homeSquad).toBe("U12 Boys");
    expect(patch.awaySquad).toBe("Senior");
  });
});

describe("reconcileHomeAwayFromTeams", () => {
  const homeTeam: TeamRecord = { id: "H", name: "Wildebeests", squad: "Senior", color1: "#c0392b", color2: "#2c5fa8",
    sport: "hurling", roster: { formation: [], players: [] } };
  const awayTeam: TeamRecord = { id: "A", name: "Racoons", squad: "U13A", color1: "#f5c518", color2: "#1f7a4d",
    sport: "hurling", roster: { formation: [], players: [] } };
  const byId = { H: homeTeam, A: awayTeam };

  it("a v2 us/them record + linked teams → reconciled home/away name/squad/colours", () => {
    // ③.1 already populated home/away fields; reconcile prefers the linked teams.
    const rec: MatchRecord = { raw: "", sport: "hurling", homeTeamId: "H", awayTeamId: "A",
      homeTeam: "Stale Home", awayTeam: "Stale Away", homeSquad: "", awaySquad: "" } as any;
    const patch = reconcileHomeAwayFromTeams(rec, byId);
    expect(patch.homeTeam).toBe("Wildebeests");
    expect(patch.awayTeam).toBe("Racoons");
    expect(patch.homeSquad).toBe("Senior");
    expect(patch.awaySquad).toBe("U13A");
    expect(patch.colorHome).toBe("#c0392b");
    expect(patch.colorAway).toBe("#f5c518");
  });

  it("an unlinked record → empty patch (falls back to record's own home/away fields)", () => {
    const rec: MatchRecord = { raw: "", sport: "hurling", homeTeam: "Wildebeests", awayTeam: "Racoons" } as any;
    expect(reconcileHomeAwayFromTeams(rec, byId)).toEqual({});
  });

  it("idempotent on an already-reconciled v3 record", () => {
    const rec: MatchRecord = { raw: "", sport: "hurling", notationV: 3, homeTeamId: "H", awayTeamId: "A",
      homeTeam: "Wildebeests", awayTeam: "Racoons", homeSquad: "Senior", awaySquad: "U13A",
      colorHome: "#c0392b", colorHome2: "#2c5fa8", colorAway: "#f5c518", colorAway2: "#1f7a4d" } as any;
    const patch = reconcileHomeAwayFromTeams(rec, byId);
    const merged = { ...rec, ...patch };
    // every reconciled field equals what's already there → no observable change
    for (const k of Object.keys(patch)) expect((merged as any)[k]).toBe((rec as any)[k]);
  });
});
