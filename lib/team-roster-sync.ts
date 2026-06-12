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

// For the just-saved match, the team-roster pushes to make: the us side
// (teamId = homeAway==="home" ? homeTeamId : awayTeamId, roster = usRoster) and the
// opp side (the other id, oppRoster) — each only when this match is that team's
// latest and the roster is non-empty.
export function teamRosterPushes(
  record: MatchRecord & { id: string },
  matches: MatchLite[],
): { teamId: string; side: "us" | "opp"; roster: TeamRoster }[] {
  const usTeamId = record.homeAway === "home" ? record.homeTeamId : record.awayTeamId;
  const oppTeamId = record.homeAway === "home" ? record.awayTeamId : record.homeTeamId;
  const out: { teamId: string; side: "us" | "opp"; roster: TeamRoster }[] = [];
  const consider = (teamId: string | null | undefined, side: "us" | "opp", roster?: TeamRoster) => {
    if (!teamId || !roster || !roster.formation || !roster.formation.length) return;
    if (latestMatchForTeam(matches, teamId) === record.id) out.push({ teamId, side, roster });
  };
  consider(usTeamId, "us", record.usRoster);
  consider(oppTeamId, "opp", record.oppRoster);
  return out;
}
