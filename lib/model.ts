import { parseMatch } from "@/lib/parser";
import { fmtDateDow, gpTotal } from "@/lib/util";
import { htScore } from "@/lib/half-time";
import { SPORTS, scoringModeForSport } from "@/lib/constants";
import { matchOutcome, venueSeries, venueItems, sideToVenue, recordHomeAway } from "@/lib/home-away";
import type { MatchRecord, Model } from "@/lib/types";

export function buildModel(record: MatchRecord): Model {
  const r = record;
  const sportKey = r.sport || "";
  const sp = (SPORTS as Record<string, { label: string; mode: string }>)[sportKey];
  const settings = {
    myTeam: r.myTeam,
    scoringMode: scoringModeForSport(r.sport),
    label: r.label,
    homeAway: r.homeAway,
    opponent: r.opponent,
    usRoster: r.usRoster,
    oppRoster: r.oppRoster,
  };
  const parsed = parseMatch(r.raw, settings);
  const { header, roster, totals, result, series, goalDots, chartMarkers, scorers, scoring, notes, halfMarks, htLine } = parsed;
  const effMode = parsed.mode;
  const sportLabel = sp ? sp.label : header.sport;
  const usName = r.myTeam || "My Team";
  const themName = r.opponent || header.opposition || "Opposition";

  const timeline: any[] = [];
  scoring.forEach((s: any) => timeline.push({ kind: "score", ...s }));
  notes.forEach((n: any) => timeline.push({ kind: n.type, ...n }));
  timeline.sort((a, b) => (a.half - b.half) || (a.seq - b.seq));

  const usScorers = scorers
    .filter((s: any) => s.side === "us")
    .sort((a: any, b: any) => gpTotal(b.g, b.p, effMode) - gpTotal(a.g, a.p, effMode));
  const themScorers = scorers
    .filter((s: any) => s.side === "them")
    .sort((a: any, b: any) => gpTotal(b.g, b.p, effMode) - gpTotal(a.g, a.p, effMode));
  const starters = roster.filter((p: any) => p.role === "starting");
  const subs = roster.filter((p: any) => p.role === "sub");
  const missing = roster.filter((p: any) => p.role === "missing");
  // formationRows drives the public pitch view; when a match has no formation
  // notation this is empty and PublicMatch falls back to a flat starters list
  // (it does the fallback itself, so the model stays a faithful echo of the notation).
  const formationRows = parsed.formationRows && parsed.formationRows.length ? parsed.formationRows : [];

  const ht = htScore(series, effMode);

  const usIsHome = header.homeAway === "home";
  const ha = recordHomeAway(r);
  const homeSeries = venueSeries(series as any, usIsHome);
  const timelineHA = venueItems(timeline as any, usIsHome);
  const cUs = r.colorUs || "#f5c518", cUs2 = r.colorUs2 || "#1f7a4d";
  const cThem = r.colorThem || "#c0392b", cThem2 = r.colorThem2 || "#2c5fa8";
  const sqUs = r.usSquad || "", sqOpp = r.oppSquad || "";
  const homeTotals = usIsHome ? totals.us : totals.them;
  const awayTotals = usIsHome ? totals.them : totals.us;
  const outcome = matchOutcome(
    gpTotal(homeTotals.g, homeTotals.p, effMode),
    gpTotal(awayTotals.g, awayTotals.p, effMode),
  );

  return {
    grade: header.label || "", sport: sportLabel || "", homeAway: header.homeAway,
    usName, themName, dateStr: r.matchDate ? fmtDateDow(r.matchDate) : "",
    totals, result, effMode, ht,
    leadChanges: parsed.leadChanges, timesLevel: parsed.timesLevel,
    maxLead: parsed.maxLead, maxLeadSide: parsed.maxLeadSide,
    series, goalDots, chartMarkers, htLine, halfMarks,
    usScorers, themScorers, formationRows, starters, subs, missing, timeline,
    colorUs: cUs, colorUs2: cUs2, colorThem: cThem, colorThem2: cThem2,
    nameDisplay: r.nameDisplay || "full",
    oppRoster: r.oppRoster || null,
    usSquad: sqUs, oppSquad: sqOpp,
    // neutral home/away view (additive — sub-project ①)
    homeName: usIsHome ? usName : themName,
    awayName: usIsHome ? themName : usName,
    homeColors: usIsHome ? [cUs, cUs2] : [cThem, cThem2],
    awayColors: usIsHome ? [cThem, cThem2] : [cUs, cUs2],
    homeTotals, awayTotals,
    homeScorers: usIsHome ? usScorers : themScorers,
    awayScorers: usIsHome ? themScorers : usScorers,
    homeSquad: usIsHome ? sqUs : sqOpp,
    awaySquad: usIsHome ? sqOpp : sqUs,
    homeSeries, timelineHA,
    homeRoster: ha.homeRoster || null,
    awayRoster: ha.awayRoster || null,
    maxLeadVenue: sideToVenue(parsed.maxLeadSide as "us" | "them" | null, r.homeAway),
    outcome,
    parsed,
  };
}
