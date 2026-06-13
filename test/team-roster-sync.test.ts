import { describe, it, expect } from "vitest";
import { latestMatchForTeam, teamRosterPushes } from "@/lib/team-roster-sync";
import type { MatchRecord, TeamRoster } from "@/lib/types";

const roster = (n: number): TeamRoster => ({ formation: [[n]], players: [{ num: n, name: `P${n}`, role: "starting" }] });
const empty: TeamRoster = { formation: [], players: [] };

const m = (id: string, opts: Partial<any> = {}) => ({
  id, homeTeamId: opts.homeTeamId ?? null, awayTeamId: opts.awayTeamId ?? null,
  matchDate: opts.matchDate, date: opts.date, savedAt: opts.savedAt,
});

describe("latestMatchForTeam", () => {
  const matches = [
    m("a", { homeTeamId: "T", matchDate: "2026-01-01" }),
    m("b", { awayTeamId: "T", matchDate: "2026-03-01" }),
    m("c", { homeTeamId: "OTHER", matchDate: "2026-09-01" }),
  ];
  it("picks the latest linked match by date", () => {
    expect(latestMatchForTeam(matches, "T")).toBe("b");
  });
  it("ignores matches not linked to the team", () => {
    expect(latestMatchForTeam(matches, "T")).not.toBe("c");
  });
  it("returns null when the team has no linked matches", () => {
    expect(latestMatchForTeam(matches, "NONE")).toBeNull();
  });
  it("breaks date ties by savedAt", () => {
    const tie = [
      m("x", { homeTeamId: "T", matchDate: "2026-05-01", savedAt: 100 }),
      m("y", { homeTeamId: "T", matchDate: "2026-05-01", savedAt: 200 }),
    ];
    expect(latestMatchForTeam(tie, "T")).toBe("y");
  });
});

describe("teamRosterPushes", () => {
  const base = {
    raw: "", sport: "hurling", homeTeamId: "H", awayTeamId: "A",
    homeRoster: roster(7), awayRoster: roster(9),
  } as unknown as MatchRecord & { id: string };

  it("pushes both sides when this match is each team's latest", () => {
    const rec = { ...base, id: "m1" };
    const matches = [m("m1", { homeTeamId: "H", awayTeamId: "A", matchDate: "2026-02-01" })];
    expect(teamRosterPushes(rec, matches)).toEqual([
      { teamId: "H", side: "home", roster: roster(7) },
      { teamId: "A", side: "away", roster: roster(9) },
    ]);
  });

  it("excludes a side when this match is NOT that team's latest", () => {
    const rec = { ...base, id: "m1" };
    const matches = [
      m("m1", { homeTeamId: "H", awayTeamId: "A", matchDate: "2026-02-01" }),
      m("m2", { homeTeamId: "H", matchDate: "2026-08-01" }),
    ];
    expect(teamRosterPushes(rec, matches)).toEqual([{ teamId: "A", side: "away", roster: roster(9) }]);
  });

  it("excludes unlinked sides and empty rosters", () => {
    const rec = { ...base, id: "m1", awayTeamId: null, awayRoster: empty };
    const matches = [m("m1", { homeTeamId: "H", matchDate: "2026-02-01" })];
    expect(teamRosterPushes(rec, matches)).toEqual([{ teamId: "H", side: "home", roster: roster(7) }]);
  });
});
