import { describe, it, expect } from "vitest";
import { countMatchesByTeam } from "@/lib/team-stats";

describe("countMatchesByTeam", () => {
  it("counts both the home and away team of each match", () => {
    const rows = [
      { home_team_id: "A", away_team_id: "B" },
      { home_team_id: "A", away_team_id: "C" },
    ];
    expect(countMatchesByTeam(rows)).toEqual({ A: 2, B: 1, C: 1 });
  });
  it("counts a team that appears on both sides across matches", () => {
    const rows = [
      { home_team_id: "A", away_team_id: "B" },
      { home_team_id: "B", away_team_id: "A" },
    ];
    expect(countMatchesByTeam(rows)).toEqual({ A: 2, B: 2 });
  });
  it("ignores null/absent ids", () => {
    const rows = [
      { home_team_id: "A", away_team_id: null },
      { home_team_id: null, away_team_id: undefined },
      { away_team_id: "A" },
    ];
    expect(countMatchesByTeam(rows)).toEqual({ A: 2 });
  });
  it("empty input → empty object", () => {
    expect(countMatchesByTeam([])).toEqual({});
  });
});
