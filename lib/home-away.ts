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
