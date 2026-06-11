import type { MatchRecord, TeamRecord, TeamRoster } from "@/lib/types";

// A team roster → the app's roster-notation block (formation rows pipe-joined, then a Subs section).
// Retained for callers that still render a roster as text; rosters now live structured on the record.
export function rosterToNotationLines(roster: TeamRoster): string {
  const byNum = (n: number) => roster.players.find((p) => p.num === n);
  const rows = roster.formation.map((row) =>
    row.map((n) => { const p = byNum(n); return `${n}. ${p ? p.name : ""}`.trim(); }).join(" | "));
  const subs = roster.players.filter((p) => p.role === "sub");
  if (subs.length) rows.push("Subs:", ...subs.map((p) => `${p.num}. ${p.name}`.trim()));
  return rows.join("\n");
}

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

// Build the patch to apply when linking a match to two teams. us = our side; homeAway places us
// as home or away. The header (label/homeAway/opponent) and both rosters are RECORD fields now —
// the notation (raw) is event-only and is never touched here. Seeds usRoster from the us team
// ONLY when the match has no roster yet (never clobbers a hand-entered lineup).
export function teamLinkPatch(
  record: MatchRecord,
  { usTeam, oppTeam, homeAway }: { usTeam: TeamRecord; oppTeam: TeamRecord; homeAway: "home" | "away" },
) {
  const hasRoster = !!(record.usRoster && record.usRoster.formation.length);
  const usRoster = hasRoster ? clone(record.usRoster!) : clone(usTeam.roster);
  return {
    myTeam: usTeam.name,
    label: record.label,
    homeAway,
    opponent: oppTeam.name,
    colorUs: usTeam.color1 || record.colorUs,
    colorUs2: usTeam.color2 || record.colorUs2,
    colorThem: oppTeam.color1 || record.colorThem,
    colorThem2: oppTeam.color2 || record.colorThem2,
    homeTeamId: homeAway === "home" ? usTeam.id : oppTeam.id,
    awayTeamId: homeAway === "home" ? oppTeam.id : usTeam.id,
    usRoster,
    oppRoster: clone(oppTeam.roster),
    usSquad: usTeam.squad || "",
    oppSquad: oppTeam.squad || "",
  };
}

// The team ids a match publish should also flip public (both sides — the
// opponent team is one of the owner's records too). De-duped, nulls dropped.
export function teamsToPublish(record: MatchRecord): string[] {
  const ids = [record.homeTeamId, record.awayTeamId].filter((x): x is string => !!x);
  return Array.from(new Set(ids));
}

// Swap which side is home: flip the record's homeAway field and swap the team ids. No raw rewrite.
export function swapHomeAway(record: MatchRecord) {
  const flipped: "home" | "away" = (record.homeAway === "home") ? "away" : "home";
  return { homeAway: flipped, homeTeamId: record.awayTeamId ?? null, awayTeamId: record.homeTeamId ?? null };
}
