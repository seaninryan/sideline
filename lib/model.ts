import { parseMatch } from "@/lib/parser";
import { fmtDateDow, gpTotal } from "@/lib/util";
import { htScore } from "@/lib/half-time";
import { SPORTS } from "@/lib/constants";
import type { MatchRecord, Model } from "@/lib/types";

export function buildModel(record: MatchRecord): Model {
  const r = record;
  const sportKey = r.sport || "";
  const sp = (SPORTS as Record<string, { label: string; mode: string }>)[sportKey];
  const settings = {
    myTeam: r.myTeam,
    scoringMode: (sp ? sp.mode : (r.autoMode ? undefined : r.scoringMode)) as "gaa" | "goals" | undefined,
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

  return {
    grade: header.label || "", sport: sportLabel || "", homeAway: header.homeAway,
    usName, themName, dateStr: r.matchDate ? fmtDateDow(r.matchDate) : "",
    totals, result, effMode, ht,
    leadChanges: parsed.leadChanges, timesLevel: parsed.timesLevel,
    maxLead: parsed.maxLead, maxLeadSide: parsed.maxLeadSide,
    series, goalDots, chartMarkers, htLine, halfMarks,
    usScorers, themScorers, formationRows, starters, subs, missing, timeline,
    colorUs: r.colorUs || "#f5c518", colorUs2: r.colorUs2 || "#1f7a4d",
    colorThem: r.colorThem || "#c0392b", colorThem2: r.colorThem2 || "#2c5fa8",
    nameDisplay: r.nameDisplay || "full",
    oppRoster: r.oppRoster || null,
    usSquad: r.usSquad || "", oppSquad: r.oppSquad || "",
    parsed,
  };
}
