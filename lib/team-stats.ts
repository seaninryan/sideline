type MatchLink = { home_team_id?: string | null; away_team_id?: string | null };

// Number of matches each team is involved in, keyed by team id. Each match
// increments BOTH its home and away team (both are the owner's team records).
// Null/absent ids are ignored.
export function countMatchesByTeam(rows: MatchLink[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const r of rows) {
    if (r.home_team_id) counts[r.home_team_id] = (counts[r.home_team_id] || 0) + 1;
    if (r.away_team_id) counts[r.away_team_id] = (counts[r.away_team_id] || 0) + 1;
  }
  return counts;
}
