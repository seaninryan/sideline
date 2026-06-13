import { parseEvents, TeamArg } from "@/lib/parse-events";
import { migrateLegacyNotation, isLegacy } from "@/lib/migrate-notation";
import type { ParsedMatch, Settings, TeamRoster } from "@/lib/types";

export const isPlaceholderLabel = (s?: string): boolean =>
  ["", "new match", "my team", "match"].includes((s || "").trim().toLowerCase());

export function parseMatch(raw: string, settings: Settings = {}): ParsedMatch {
  let { label, homeTeam, awayTeam, homeRoster, awayRoster } = settings;
  let events = raw;
  if (isLegacy(raw)) {
    const m: any = migrateLegacyNotation({ raw } as any, { teamAName: homeTeam || "Home", teamBName: awayTeam || "" });
    events = m.raw;
    homeRoster = homeRoster || m.usRoster;            // lifted roster is the home side by default
    label = label ?? m.label;
    awayTeam = awayTeam ?? m.opponent;
  }
  const homeName = homeTeam || "Home";
  const awayName = awayTeam || "Away";
  const teamA: TeamArg = { name: homeName, roster: homeRoster || { formation: [], players: [] } };
  const teamB: TeamArg = { name: awayName, roster: awayRoster || { formation: [], players: [] } };
  const pe = parseEvents(events, { teamA, teamB, scoringMode: settings.scoringMode ?? "goals" });

  const mapSide = (s: "A" | "B" | null) => (s === "A" ? "home" : "away"); // home = team A
  const scoring = pe.scoring.map((s: any) => ({ ...s, side: mapSide(s.side), homeScore: s.aScore, awayScore: s.bScore }));
  const notes = pe.notes.map((n: any) => (n.side ? { ...n, side: mapSide(n.side) } : n));
  const series = pe.series.map((p: any) => ({ ...p, home: p.a, away: p.b, homeScore: p.aScore, awayScore: p.bScore }));
  const scorers = pe.scorers.map((sc: any) => ({ ...sc, side: mapSide(sc.side) }));
  const goalDots = pe.goalDots.map((d: any) => ({ ...d, side: mapSide(d.side) }));
  const chartMarkers = (pe.chartMarkers || []).map((mk: any) => ({ ...mk, side: mk.side ? mapSide(mk.side) : null }));
  const header = { raw: "", sport: "", away: awayName, label: label || "" };

  return {
    header,
    roster: homeRoster ? homeRoster.players : [],
    formationRows: homeRoster ? homeRoster.formation : [],
    scoring, notes, halfMarks: pe.halfMarks, series, goalDots, chartMarkers, scorers,
    totals: { home: pe.totals.A, away: pe.totals.B },
    leadChanges: pe.leadChanges, timesLevel: pe.timesLevel, maxLead: pe.maxLead,
    maxLeadSide: pe.maxLeadSide == null ? null : mapSide(pe.maxLeadSide),
    warnings: pe.warnings, mode: pe.mode,
    htLine: pe.htLine, away: awayName || null,
  } as ParsedMatch;
}

// ④a SHIM (deleted in ④b): lets the still-us/them editor keep its existing reads.
// Maps the editor's us/them inputs → home/away, parses, then converts the home/away
// ParsedMatch back to a us/them-shaped one. home = us-side iff homeAway === "home".
type UsThemSettings = { myTeam?: string; opponent?: string; usRoster?: TeamRoster; oppRoster?: TeamRoster; homeAway?: "home" | "away"; scoringMode?: "gaa" | "goals"; label?: string };
export function parseMatchLegacy(raw: string, s: UsThemSettings = {}): any {
  const usIsHome = s.homeAway === "home";
  const p = parseMatch(raw, {
    homeTeam: usIsHome ? s.myTeam : s.opponent,
    awayTeam: usIsHome ? s.opponent : s.myTeam,
    homeRoster: usIsHome ? s.usRoster : s.oppRoster,
    awayRoster: usIsHome ? s.oppRoster : s.usRoster,
    scoringMode: s.scoringMode, label: s.label,
  });
  const v = (side: "home" | "away" | null) => side == null ? null : ((side === "home") === usIsHome ? "us" : "them");
  const reside = (x: any) => (x && x.side !== undefined ? { ...x, side: v(x.side) } : x);
  const usScore = (homeScore: string, awayScore: string) => usIsHome ? homeScore : awayScore;
  const homeTot = p.totals.home as any, awayTot = p.totals.away as any;
  return {
    ...p,
    opp: usIsHome ? (p.away || null) : (s.opponent || null),
    totals: { us: usIsHome ? p.totals.home : p.totals.away, them: usIsHome ? p.totals.away : p.totals.home },
    result: homeTot.total === awayTot.total ? "Draw"
      : (homeTot.total > awayTot.total) === usIsHome ? "Win" : "Loss",
    maxLeadSide: v(p.maxLeadSide),
    scoring: p.scoring.map((x: any) => ({ ...x, side: v(x.side), usScore: usScore(x.homeScore, x.awayScore), themScore: usScore(x.awayScore, x.homeScore) })),
    notes: p.notes.map(reside),
    scorers: p.scorers.map(reside),
    goalDots: p.goalDots.map(reside),
    chartMarkers: p.chartMarkers.map(reside),
    series: p.series.map((x: any) => ({ ...x, us: usIsHome ? x.home : x.away, them: usIsHome ? x.away : x.home, usScore: usScore(x.homeScore, x.awayScore), themScore: usScore(x.awayScore, x.homeScore) })),
    header: { raw: "", sport: "", opposition: s.opponent || "", homeAway: s.homeAway || "", label: s.label || "" },
    roster: (usIsHome ? s.usRoster : s.usRoster) ? (s.usRoster?.players || []) : [],
    formationRows: s.usRoster?.formation || [],
  };
}
