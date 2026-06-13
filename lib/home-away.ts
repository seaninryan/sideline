import type { MatchRecord, TeamRoster } from "@/lib/types";

// "us" is the home side iff the match's homeAway is "home".
export function sideToVenue(
  side: "us" | "them" | null | undefined,
  homeAway: "home" | "away" | string | undefined,
): "home" | "away" | null {
  if (side !== "us" && side !== "them") return null;
  const usIsHome = homeAway === "home";
  return side === "us" ? (usIsHome ? "home" : "away") : (usIsHome ? "away" : "home");
}

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

export function venueSeries(
  series: { x: number; us: number; them: number; usScore: string; themScore: string; [k: string]: any }[],
  usIsHome: boolean,
): { x: number; home: number; away: number; homeScore: string; awayScore: string; [k: string]: any }[] {
  return series.map((p) => ({
    ...p,
    home: usIsHome ? p.us : p.them,
    away: usIsHome ? p.them : p.us,
    homeScore: usIsHome ? p.usScore : p.themScore,
    awayScore: usIsHome ? p.themScore : p.usScore,
  }));
}

// Re-key side-tagged items ("us"/"them" → "home"/"away") preserving other fields;
// when an item carries usScore/themScore, also add home/awayScore.
export function venueItems<T extends { side?: "us" | "them" | null; usScore?: string; themScore?: string }>(
  items: T[],
  usIsHome: boolean,
): (T & { side: "home" | "away" | null; homeScore?: string; awayScore?: string })[] {
  return items.map((it) => ({
    ...it,
    side: sideToVenue(it.side, usIsHome ? "home" : "away"),
    homeScore: usIsHome ? it.usScore : it.themScore,
    awayScore: usIsHome ? it.themScore : it.usScore,
  }));
}

// The 10 home/away record fields derived from a record's us/them values + homeAway.
// "us" is home iff homeAway === "home" (missing/anything-else → us is away). Returns a
// partial to spread onto the record. ③.1 scaffold — removed in ③.4 with us/them.
export function recordHomeAway(r: MatchRecord): {
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
