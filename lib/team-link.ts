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

// Build the patch to apply when linking a match to two teams (home/away picked directly).
// Both rosters are RECORD fields now — the notation (raw) is event-only and is never
// touched here. Seeds homeRoster from the home team ONLY when the match has no roster yet
// (never clobbers a hand-entered lineup).
export function teamLinkPatch(
  record: MatchRecord,
  { homeTeam, awayTeam }: { homeTeam: TeamRecord; awayTeam: TeamRecord },
) {
  const hasHome = !!(record.homeRoster && record.homeRoster.formation.length);
  const homeRoster = hasHome ? clone(record.homeRoster!) : clone(homeTeam.roster);
  return {
    label: record.label,
    homeTeam: homeTeam.name,
    awayTeam: awayTeam.name,
    colorHome: homeTeam.color1 || record.colorHome,
    colorHome2: homeTeam.color2 || record.colorHome2,
    colorAway: awayTeam.color1 || record.colorAway,
    colorAway2: awayTeam.color2 || record.colorAway2,
    homeTeamId: homeTeam.id,
    awayTeamId: awayTeam.id,
    homeRoster,
    awayRoster: clone(awayTeam.roster),
    homeSquad: homeTeam.squad || "",
    awaySquad: awayTeam.squad || "",
  };
}

// Conservative patch for migrating an EXISTING unlinked match: set the team ids
// and seed any MISSING rosters/squads, but never overwrite names, colours, or
// rosters the user already has. (teamLinkPatch is the new-match variant and DOES
// overwrite those — don't use it for migration.) Only defined keys are returned,
// so absent fields stay untouched on store.set merge.
export function linkExistingMatchPatch(
  record: MatchRecord,
  { homeTeam, awayTeam }: { homeTeam: TeamRecord; awayTeam: TeamRecord },
): Partial<MatchRecord> {
  const patch: Partial<MatchRecord> = { homeTeamId: homeTeam.id, awayTeamId: awayTeam.id };
  if (!(record.homeRoster && record.homeRoster.formation.length)) patch.homeRoster = clone(homeTeam.roster);
  if (!(record.awayRoster && record.awayRoster.formation.length)) patch.awayRoster = clone(awayTeam.roster);
  if (!record.homeSquad && homeTeam.squad) patch.homeSquad = homeTeam.squad;
  if (!record.awaySquad && awayTeam.squad) patch.awaySquad = awayTeam.squad;
  return patch;
}

// ④a: derive a record's home/away identity, preferring the linked teams (the durable
// source). teamsById = a map of teamId → TeamRecord. Falls back to whatever the record
// already carries (post-③.1 home/away fields). Returns a Partial to merge.
export function reconcileHomeAwayFromTeams(
  record: MatchRecord,
  teamsById: Record<string, TeamRecord>,
): Partial<MatchRecord> {
  const home = record.homeTeamId ? teamsById[record.homeTeamId] : undefined;
  const away = record.awayTeamId ? teamsById[record.awayTeamId] : undefined;
  const patch: Partial<MatchRecord> = {};
  if (home) {
    patch.homeTeam = home.name; patch.homeSquad = home.squad || "";
    patch.colorHome = home.color1 || record.colorHome; patch.colorHome2 = home.color2 || record.colorHome2;
  }
  if (away) {
    patch.awayTeam = away.name; patch.awaySquad = away.squad || "";
    patch.colorAway = away.color1 || record.colorAway; patch.colorAway2 = away.color2 || record.colorAway2;
  }
  return patch;
}

// The team ids a match publish should also flip public (both sides — the
// opponent team is one of the owner's records too). De-duped, nulls dropped.
export function teamsToPublish(record: MatchRecord): string[] {
  const ids = [record.homeTeamId, record.awayTeamId].filter((x): x is string => !!x);
  return Array.from(new Set(ids));
}

// ④a SHIM (rewritten to a home/away field-swap in ④b): the editor still holds us/them
// state, so swap toggles homeAway + swaps the team ids on the editor's us/them payload.
export function swapHomeAway(record: any) {
  const flipped: "home" | "away" = (record.homeAway === "home") ? "away" : "home";
  return { homeAway: flipped, homeTeamId: record.awayTeamId ?? null, awayTeamId: record.homeTeamId ?? null };
}
