import { parseMatch } from "@/lib/parser";
import { fmtDateDow, gpTotal } from "@/lib/util";
import { htScore } from "@/lib/half-time";
import { SPORTS, scoringModeForSport } from "@/lib/constants";
import { matchOutcome } from "@/lib/home-away";
import { recordHomeAway } from "@/lib/home-away"; // ④a shim path (deleted in ④b)
import type { MatchRecord, Model } from "@/lib/types";

export function buildModel(record: any): Model {
  // Normalize: a legacy/editor us/them payload (has myTeam) → home/away identity.
  const ha = record && record.myTeam !== undefined
    ? { ...record, ...recordHomeAway(record) }
    : record;
  const r = ha as MatchRecord;
  const sportKey = r.sport || "";
  const sp = (SPORTS as Record<string, { label: string; mode: string }>)[sportKey];
  const parsed = parseMatch(r.raw, {
    homeTeam: r.homeTeam, awayTeam: r.awayTeam,
    scoringMode: scoringModeForSport(r.sport),
    label: r.label, homeRoster: r.homeRoster, awayRoster: r.awayRoster,
  });
  const { roster, totals, series, goalDots, twoPtDots, chartMarkers, scorers, scoring, notes, halfMarks, htLine } = parsed;
  const effMode = parsed.mode;
  const sportLabel = sp ? sp.label : parsed.header.sport;
  const homeName = r.homeTeam || "Home";
  const awayName = r.awayTeam || parsed.away || "Away";

  const timeline: any[] = [];
  scoring.forEach((s: any) => timeline.push({ kind: "score", ...s }));
  notes.forEach((n: any) => timeline.push({ kind: n.type, ...n }));
  timeline.sort((a, b) => (a.half - b.half) || (a.seq - b.seq));

  const homeScorers = scorers.filter((s: any) => s.side === "home").sort((a: any, b: any) => gpTotal(b.g, b.p, effMode) - gpTotal(a.g, a.p, effMode));
  const awayScorers = scorers.filter((s: any) => s.side === "away").sort((a: any, b: any) => gpTotal(b.g, b.p, effMode) - gpTotal(a.g, a.p, effMode));
  const starters = roster.filter((p: any) => p.role === "starting");
  const subs = roster.filter((p: any) => p.role === "sub");
  const missing = roster.filter((p: any) => p.role === "missing");
  const formationRows = parsed.formationRows && parsed.formationRows.length ? parsed.formationRows : [];
  const ht = htScore(series, effMode);

  const cHome = r.colorHome || "#f5c518", cHome2 = r.colorHome2 || "#1f7a4d";
  const cAway = r.colorAway || "#c0392b", cAway2 = r.colorAway2 || "#2c5fa8";
  const outcome = matchOutcome(gpTotal(totals.home.g, totals.home.p, effMode), gpTotal(totals.away.g, totals.away.p, effMode));

  return {
    grade: r.label || "", sport: sportLabel || "",
    dateStr: r.matchDate ? fmtDateDow(r.matchDate) : "",
    effMode, ht,
    leadChanges: parsed.leadChanges, timesLevel: parsed.timesLevel,
    maxLead: parsed.maxLead, maxLeadVenue: parsed.maxLeadSide,
    series, goalDots, twoPtDots, chartMarkers, htLine, halfMarks, timeline,
    nameDisplay: r.nameDisplay || "full",
    homeName, awayName,
    homeColors: [cHome, cHome2], awayColors: [cAway, cAway2],
    homeTotals: totals.home, awayTotals: totals.away,
    homeScorers, awayScorers,
    homeSquad: r.homeSquad || "", awaySquad: r.awaySquad || "",
    homeRoster: r.homeRoster || null, awayRoster: r.awayRoster || null,
    starters, subs, missing, formationRows,
    homeSeries: series, timelineHA: timeline,   // parser already home/away
    outcome, parsed,
  };
}
