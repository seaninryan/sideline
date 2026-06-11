import { squash } from "@/lib/util";
import type { TeamRecord } from "@/lib/types";

// Identity of a team for find-or-create: normalised sport + name + squad.
// (sport, name, squad) is unique — U11/Spuds and Senior/Spuds are different teams.
export function teamMatchKey(name: string, sport?: string, squad?: string): string {
  return squash(sport || "") + "::" + squash(name) + "::" + squash(squad || "");
}

// Create-time guard: null when the pairing is valid (or a side is unresolved),
// else a user-facing message. With the opponent picker scoped to the working
// sport this is rarely hit, but it is the final gate before Create.
export function pairingError(usSport?: string, oppSport?: string): string | null {
  if (!usSport || !oppSport) return null;
  return usSport === oppSport ? null : "Both teams must play the same sport";
}

// Type-ahead filter for the picker: optional sport scope + name or squad substring.
export function filterTeams(teams: TeamRecord[], query: string, sport?: string): TeamRecord[] {
  const q = squash(query);
  return teams.filter((t) => (!sport || (t.sport || "") === sport)
    && (!q || squash(t.name).includes(q) || squash(t.squad || "").includes(q)));
}

// Make (sport, name, squad) unique against `existingKeys` (a set of teamMatchKey
// values) by appending " (2)" to the NAME, repeating if needed. Used by team save +
// duplicate so a clash never hard-fails.
export function dedupeTeamName(existingKeys: Set<string>, name: string, sport?: string, squad?: string): string {
  let n = name.trim();
  while (existingKeys.has(teamMatchKey(n, sport, squad))) n = `${n} (2)`;
  return n;
}

// Build a private copy of a team for the "duplicate" action: same roster/colours/
// sport/squad, name suffixed " (2)" so the (sport, name, squad) identity is unique,
// a fresh id, never public. The caller persists it via the collision-safe set().
export function duplicateTeamRecord(src: TeamRecord, newId: string): TeamRecord {
  return {
    id: newId,
    owner: src.owner,
    name: `${src.name} (2)`,
    squad: src.squad || "",
    sport: src.sport,
    color1: src.color1,
    color2: src.color2,
    roster: JSON.parse(JSON.stringify(src.roster)),
    is_public: false,
    listed: true,
  };
}
