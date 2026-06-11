import { describe, it, expect } from "vitest";
import { teamMatchKey, pairingError, filterTeams, dedupeTeamName } from "@/lib/match-sport";
import type { TeamRecord } from "@/lib/types";

const T = (name: string, sport?: string): TeamRecord => ({ id: name + (sport || ""), name, sport, roster: { formation: [], players: [] } });

describe("teamMatchKey", () => {
  it("normalises name (case/space/punct) and includes sport", () => {
    expect(teamMatchKey("The Spuds", "hurling")).toBe(teamMatchKey("the  spuds!", "hurling"));
    expect(teamMatchKey("Spuds", "hurling")).not.toBe(teamMatchKey("Spuds", "soccer"));
  });
  it("treats missing sport as empty-sport, distinct from a set sport", () => {
    expect(teamMatchKey("Spuds")).toBe(teamMatchKey("spuds", ""));
    expect(teamMatchKey("Spuds")).not.toBe(teamMatchKey("Spuds", "soccer"));
  });
});

describe("pairingError", () => {
  it("null when sports match", () => expect(pairingError("hurling", "hurling")).toBeNull());
  it("null when a side is unresolved", () => {
    expect(pairingError("hurling", undefined)).toBeNull();
    expect(pairingError(undefined, undefined)).toBeNull();
  });
  it("message when both set and different", () => expect(pairingError("hurling", "soccer")).toMatch(/same sport/i));
});

describe("filterTeams", () => {
  const teams = [T("Spuds", "hurling"), T("Spuds", "soccer"), T("Wildebeests", "hurling")];
  it("scopes to sport when given", () => {
    expect(filterTeams(teams, "", "hurling").map((t) => t.name)).toEqual(["Spuds", "Wildebeests"]);
  });
  it("matches name substring (case-insensitive), unscoped when sport omitted", () => {
    expect(filterTeams(teams, "spud").length).toBe(2);
    expect(filterTeams(teams, "wild", "hurling").map((t) => t.name)).toEqual(["Wildebeests"]);
  });
  it("empty query returns all (within scope)", () => expect(filterTeams(teams, "").length).toBe(3));
});

describe("teamMatchKey with squad", () => {
  it("distinguishes squads of the same club", () => {
    expect(teamMatchKey("Racoons", "hurling", "U11 Boys"))
      .not.toBe(teamMatchKey("Racoons", "hurling", "Senior Men"));
  });
  it("blank squad matches blank squad", () => {
    expect(teamMatchKey("Racoons", "hurling", "")).toBe(teamMatchKey("racoons", "hurling"));
  });
});

describe("filterTeams matches name or squad", () => {
  const teams = [
    { id: "1", name: "Racoons", sport: "hurling", squad: "U11 Boys", roster: { formation: [], players: [] } },
    { id: "2", name: "Racoons", sport: "hurling", squad: "Senior Men", roster: { formation: [], players: [] } },
  ] as any[];
  it("filters by squad text too", () => {
    expect(filterTeams(teams, "u11", "hurling").map((t) => t.id)).toEqual(["1"]);
  });
});

describe("dedupeTeamName", () => {
  const keyset = (teams: any[]) => new Set(teams.map((t) => teamMatchKey(t.name, t.sport, t.squad)));
  it("returns the name unchanged when no clash", () => {
    expect(dedupeTeamName(new Set(), "Racoons", "hurling", "U11")).toBe("Racoons");
  });
  it("appends (2) on a clash", () => {
    const s = keyset([{ name: "Racoons", sport: "hurling", squad: "U11" }]);
    expect(dedupeTeamName(s, "Racoons", "hurling", "U11")).toBe("Racoons (2)");
  });
  it("appends (2) (2) when (2) also clashes", () => {
    const s = keyset([
      { name: "Racoons", sport: "hurling", squad: "U11" },
      { name: "Racoons (2)", sport: "hurling", squad: "U11" },
    ]);
    expect(dedupeTeamName(s, "Racoons", "hurling", "U11")).toBe("Racoons (2) (2)");
  });
});
