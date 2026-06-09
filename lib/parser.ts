import { parseEvents, TeamArg } from "@/lib/parse-events";
import { migrateLegacyNotation } from "@/lib/migrate-notation";
import type { ParsedMatch, Settings } from "@/lib/types";

export const isPlaceholderLabel = (s?: string): boolean =>
  ["", "new match", "my team", "match"].includes((s || "").trim().toLowerCase());

const isClock = (l: string) => /^\s*\d{1,2}:\d{2}\s*$/.test(l);
const isMinuteLead = (l: string) => /^\s*\d{1,2}\b/.test(l);
// legacy = has a `T<n>` scorer OR a first non-empty line that is neither a clock nor a minute-leading event (i.e. a header line)
const isLegacy = (raw: string) => {
  if (/\bT\d/.test(raw)) return true;
  const f = raw.split("\n").find((l) => l.trim());
  return !!f && !isClock(f) && !isMinuteLead(f);
};

export function parseMatch(raw: string, settings: Settings = {}): ParsedMatch {
  let { label, homeAway, opponent, usRoster, oppRoster } = settings;
  let events = raw;
  if (isLegacy(raw)) {
    const m = migrateLegacyNotation({ raw } as any, { teamAName: settings.myTeam || "My Team", teamBName: settings.opponent || "Opponent" });
    events = m.raw;
    usRoster = usRoster || m.usRoster;
    label = label ?? m.label;
    homeAway = homeAway ?? m.homeAway;
    opponent = opponent ?? m.opponent;
  }
  const usName = settings.myTeam || "My Team";
  const oppName = opponent || "Opposition";
  const teamA: TeamArg = { name: usName, roster: usRoster || { formation: [], players: [] } };
  const teamB: TeamArg = { name: oppName, roster: oppRoster || { formation: [], players: [] } };
  const pe = parseEvents(events, { teamA, teamB, scoringMode: settings.scoringMode });

  const mapSide = (s: "A" | "B" | null) => (s === "A" ? "us" : "them"); // us = the myTeam side
  const scoring = pe.scoring.map((s: any) => ({ ...s, side: mapSide(s.side), usScore: s.aScore, themScore: s.bScore }));
  const notes = pe.notes.map((n: any) => (n.side ? { ...n, side: mapSide(n.side) } : n));
  const series = pe.series.map((p: any) => ({ ...p, us: p.a, them: p.b, usScore: p.aScore, themScore: p.bScore }));
  const scorers = pe.scorers.map((sc: any) => ({ ...sc, side: mapSide(sc.side) }));
  const goalDots = pe.goalDots.map((d: any) => ({ ...d, side: mapSide(d.side) }));
  const result = pe.result === "A" ? "Win" : pe.result === "B" ? "Loss" : "Draw";
  const header = { raw: "", sport: "", opposition: opponent || "", homeAway: homeAway || "", label: label || "" };

  return {
    header,
    roster: usRoster ? usRoster.players : [],
    formationRows: usRoster ? usRoster.formation : [],
    scoring, notes, halfMarks: pe.halfMarks, series, goalDots, scorers,
    totals: { us: pe.totals.A, them: pe.totals.B },
    result,
    leadChanges: pe.leadChanges, timesLevel: pe.timesLevel, maxLead: pe.maxLead,
    maxLeadSide: pe.maxLeadSide == null ? null : mapSide(pe.maxLeadSide),
    warnings: pe.warnings, mode: pe.mode, detectedMode: pe.detectedMode,
    htLine: pe.htLine, opp: opponent || null,
  } as ParsedMatch;
}
