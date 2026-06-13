import type { TeamRoster } from "@/lib/types";

// Neutral result from the two sides' point totals. winner = the higher total
// (null when level); margin = absolute difference. No "Win/Loss".
export function matchOutcome(
  homePts: number,
  awayPts: number,
): { winner: "home" | "away" | null; margin: number } {
  if (homePts === awayPts) return { winner: null, margin: 0 };
  return homePts > awayPts
    ? { winner: "home", margin: homePts - awayPts }
    : { winner: "away", margin: awayPts - homePts };
}

// The 10 home/away record fields derived from a record's us/them values + homeAway.
// "us" is home iff homeAway === "home" (missing/anything-else → us is away). Returns a
// partial to spread onto the record. ④a shim — operates on the editor's still-us/them
// payload (deleted in ④b). Typed `any` since the MatchRecord type is now home/away.
export function recordHomeAway(r: any): {
  homeTeam: string; awayTeam: string;
  colorHome?: string; colorHome2?: string; colorAway?: string; colorAway2?: string;
  homeRoster?: TeamRoster; awayRoster?: TeamRoster;
  homeSquad: string; awaySquad: string;
} {
  const usIsHome = r.homeAway === "home";
  return {
    homeTeam: (usIsHome ? r.myTeam : r.opponent) || "",
    awayTeam: (usIsHome ? r.opponent : r.myTeam) || "",
    colorHome: usIsHome ? r.colorUs : r.colorThem,
    colorHome2: usIsHome ? r.colorUs2 : r.colorThem2,
    colorAway: usIsHome ? r.colorThem : r.colorUs,
    colorAway2: usIsHome ? r.colorThem2 : r.colorUs2,
    homeRoster: usIsHome ? r.usRoster : r.oppRoster,
    awayRoster: usIsHome ? r.oppRoster : r.usRoster,
    homeSquad: (usIsHome ? r.usSquad : r.oppSquad) || "",
    awaySquad: (usIsHome ? r.oppSquad : r.usSquad) || "",
  };
}

