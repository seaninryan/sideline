import type { MatchRecord, TeamRoster } from "@/lib/types";

type MatchLite = {
  id: string;
  homeTeamId?: string | null;
  awayTeamId?: string | null;
  matchDate?: string;
  date?: string;
  savedAt?: number;
};

// id of the team's chronologically-latest linked match (max date, tie-broken by
// savedAt desc then id), or null if the team has no linked matches.
export function latestMatchForTeam(matches: MatchLite[], teamId: string): string | null {
  const linked = matches.filter((m) => m.homeTeamId === teamId || m.awayTeamId === teamId);
  if (!linked.length) return null;
  const key = (m: MatchLite) => m.matchDate || m.date || "";
  let best = linked[0];
  for (const m of linked.slice(1)) {
    const a = key(m), b = key(best);
    if (a > b) { best = m; continue; }
    if (a === b) {
      const sa = m.savedAt ?? 0, sb = best.savedAt ?? 0;
      if (sa > sb || (sa === sb && m.id > best.id)) best = m;
    }
  }
  return best.id;
}

// For the just-saved match, the team-roster pushes to make: the home side
// (teamId = homeTeamId, roster = homeRoster) and the away side (awayTeamId, awayRoster) —
// each only when this match is that team's latest and the roster is non-empty.
export function teamRosterPushes(
  record: any,
  matches: MatchLite[],
): { teamId: string; side: "home" | "away"; roster: TeamRoster }[] {
  const out: { teamId: string; side: "home" | "away"; roster: TeamRoster }[] = [];
  const consider = (teamId: string | null | undefined, side: "home" | "away", roster?: TeamRoster) => {
    if (!teamId || !roster || !roster.formation || !roster.formation.length) return;
    if (latestMatchForTeam(matches, teamId) === record.id) out.push({ teamId, side, roster });
  };
  consider(record.homeTeamId, "home", record.homeRoster);
  consider(record.awayTeamId, "away", record.awayRoster);
  return out;
}
