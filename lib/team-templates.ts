import type { TeamRoster } from "@/lib/types";

const clone = (r: TeamRoster): TeamRoster => JSON.parse(JSON.stringify(r));

const SOCCER: TeamRoster = {
  formation: [[1], [2, 4, 5, 3], [7, 6, 8, 11], [10, 9]],
  players: [
    { num: 1, name: "GK", role: "starting" },
    { num: 2, name: "RB", role: "starting" }, { num: 4, name: "RCB", role: "starting" }, { num: 5, name: "LCB", role: "starting" }, { num: 3, name: "LB", role: "starting" },
    { num: 7, name: "RW", role: "starting" }, { num: 6, name: "CDM", role: "starting" }, { num: 8, name: "CAM", role: "starting" }, { num: 11, name: "LW", role: "starting" },
    { num: 10, name: "SS", role: "starting" }, { num: 9, name: "S", role: "starting" },
    { num: 12, name: "Sub", role: "sub" },
  ],
};

const GAA: TeamRoster = {
  formation: [[1], [2, 3, 4], [5, 6, 7], [8, 9], [10, 11, 12], [13, 14, 15]],
  players: [
    { num: 1, name: "GK", role: "starting" },
    { num: 2, name: "RCB", role: "starting" }, { num: 3, name: "FB", role: "starting" }, { num: 4, name: "LCB", role: "starting" },
    { num: 5, name: "RWB", role: "starting" }, { num: 6, name: "CB", role: "starting" }, { num: 7, name: "LWB", role: "starting" },
    { num: 8, name: "MID", role: "starting" }, { num: 9, name: "MID", role: "starting" },
    { num: 10, name: "RWF", role: "starting" }, { num: 11, name: "CF", role: "starting" }, { num: 12, name: "LWF", role: "starting" },
    { num: 13, name: "RCF", role: "starting" }, { num: 14, name: "FF", role: "starting" }, { num: 15, name: "LCF", role: "starting" },
    { num: 16, name: "Sub", role: "sub" },
  ],
};

export const TEAM_TEMPLATES: Record<string, TeamRoster> = { soccer: SOCCER, gaa: GAA };

// Map a SPORTS key to a starting template (a fresh deep copy each call). GAA sports share one.
export function templateForSport(sport?: string): TeamRoster {
  if (sport === "soccer") return clone(SOCCER);
  if (sport === "hurling" || sport === "camogie" || sport === "gaelic") return clone(GAA);
  return { formation: [], players: [] };
}
