import { describe, it, expect } from "vitest";
import { TEAM_TEMPLATES, templateForSport } from "@/lib/team-templates";

describe("TEAM_TEMPLATES", () => {
  it("soccer: 11 starters + 1 sub, GK alone on the first row", () => {
    const t = TEAM_TEMPLATES.soccer;
    expect(t.players.filter((p) => p.role === "starting")).toHaveLength(11);
    expect(t.players.filter((p) => p.role === "sub")).toHaveLength(1);
    expect(t.formation[0]).toEqual([1]);
    expect(t.formation.flat()).toHaveLength(11);
  });
  it("gaa: 15 starters + 1 sub across 6 rows", () => {
    const t = TEAM_TEMPLATES.gaa;
    expect(t.players.filter((p) => p.role === "starting")).toHaveLength(15);
    expect(t.players.filter((p) => p.role === "sub")).toHaveLength(1);
    expect(t.formation).toHaveLength(6);
    expect(t.formation.flat()).toHaveLength(15);
  });
});

describe("templateForSport", () => {
  it("soccer → soccer template", () => {
    expect(templateForSport("soccer").players).toHaveLength(12);
  });
  it("hurling / camogie / gaelic → GAA template", () => {
    for (const s of ["hurling", "camogie", "gaelic"]) {
      expect(templateForSport(s).players).toHaveLength(16);
      expect(templateForSport(s).formation).toHaveLength(6);
    }
  });
  it("unknown / undefined → empty roster", () => {
    expect(templateForSport(undefined)).toEqual({ formation: [], players: [] });
    expect(templateForSport("rugby")).toEqual({ formation: [], players: [] });
  });
  it("returns a fresh deep copy (callers can mutate safely)", () => {
    const a = templateForSport("soccer");
    a.players[0].name = "X";
    expect(templateForSport("soccer").players[0].name).toBe("GK");
  });
});
