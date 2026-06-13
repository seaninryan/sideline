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
