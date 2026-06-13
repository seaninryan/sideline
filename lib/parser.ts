import { parseEvents, TeamArg } from "@/lib/parse-events";
import { migrateLegacyNotation, isLegacy } from "@/lib/migrate-notation";
import type { ParsedMatch, Settings } from "@/lib/types";

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
