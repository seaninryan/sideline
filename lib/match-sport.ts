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
