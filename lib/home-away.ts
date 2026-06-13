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

// ④a→④b SHIM (deleted in ④b): load the editor's us/them state from a record. The
// canonical record is now home/away (v3), but the editor's state is still us/them, so
// map home→us (us = the home team), falling back to legacy us/them fields for any
// record not yet migrated. Removed in ④b when the editor state becomes home/away.
export function editorStateFromRecord(d: any): {
  myTeam: string; opponent: string;
  colorUs: string; colorUs2: string; colorThem: string; colorThem2: string;
  usRoster: TeamRoster | null; oppRoster: TeamRoster | null;
  usSquad: string; oppSquad: string; homeAway: "home" | "away";
} {
  const v3 = d && d.homeTeam !== undefined; // a home/away record → home is "us"
  return {
    myTeam: (v3 ? d.homeTeam : d.myTeam) ?? "My Team",
    opponent: (v3 ? d.awayTeam : d.opponent) ?? "",
    colorUs: (v3 ? d.colorHome : d.colorUs) ?? "#f5c518",
    colorUs2: (v3 ? d.colorHome2 : d.colorUs2) ?? "#1f7a4d",
    colorThem: (v3 ? d.colorAway : d.colorThem) ?? "#c0392b",
    colorThem2: (v3 ? d.colorAway2 : d.colorThem2) ?? "#2c5fa8",
    usRoster: (v3 ? d.homeRoster : d.usRoster) ?? null,
    oppRoster: (v3 ? d.awayRoster : d.oppRoster) ?? null,
    usSquad: (v3 ? d.homeSquad : d.usSquad) ?? "",
    oppSquad: (v3 ? d.awaySquad : d.oppSquad) ?? "",
    homeAway: v3 ? "home" : (d.homeAway || "away"),
  };
}

// ④a SHIMS (deleted in ④b with recordHomeAway): the editor still consumes us/them-shaped
// parser output (via parseMatchLegacy) and maps it to home/away for its read-only display.

// "us" is the home side iff the match's homeAway is "home".
export function sideToVenue(
  side: "us" | "them" | null | undefined,
  homeAway: "home" | "away" | string | undefined,
): "home" | "away" | null {
  if (side !== "us" && side !== "them") return null;
  const usIsHome = homeAway === "home";
  return side === "us" ? (usIsHome ? "home" : "away") : (usIsHome ? "away" : "home");
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
