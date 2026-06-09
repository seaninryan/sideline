import { squash } from "@/lib/util";
import type { TeamRoster } from "@/lib/types";

export interface TeamArg { name: string; roster: TeamRoster }
export interface WhoResult { side: "A" | "B" | null; num: number | null; name: string; teamLevel: boolean; ambiguous: boolean }

const findPlayer = (roster: TeamRoster, txt: string) => {
  const c = squash(txt); if (!c) return null;
  for (const p of roster.players) if (squash(p.name) === c) return p;          // exact full-name beats fuzzy
  for (const p of roster.players) { const f = squash(p.name.split(" ")[0]); if (f === c) return p; }
  return null;
};
const teamMatches = (name: string, txt: string) => {
  const c = squash(txt); const n = squash(name);
  return !!c && (c === n || c === squash(name.split(" ")[0]));
};

// Resolve "who" against both teams: player-name (either) → "Team number"/"Team name" → "Team".
export function resolveWho(token: string, a: TeamArg, b: TeamArg): WhoResult {
  const none: WhoResult = { side: null, num: null, name: "", teamLevel: false, ambiguous: false };
  const t = (token || "").trim(); if (!t) return none;

  const pa = findPlayer(a.roster, t), pb = findPlayer(b.roster, t);
  if (pa && pb) return { ...none, ambiguous: true };
  if (pa) return { side: "A", num: pa.num, name: pa.name, teamLevel: false, ambiguous: false };
  if (pb) return { side: "B", num: pb.num, name: pb.name, teamLevel: false, ambiguous: false };

  // "<Team> <rest>" — longest team-name prefix first (handles multi-word names)
  for (const [side, team] of [["A", a] as const, ["B", b] as const]) {
    const words = t.split(/\s+/);
    for (let take = words.length - 1; take >= 1; take--) {
      if (!teamMatches(team.name, words.slice(0, take).join(" "))) continue;
      const rest = words.slice(take).join(" ").trim();
      const numOnly = rest.match(/^(\d{1,2})$/);
      if (numOnly) { const p = team.roster.players.find((x) => x.num === +numOnly[1]); return { side, num: +numOnly[1], name: p ? p.name : "", teamLevel: false, ambiguous: false }; }
      const p = findPlayer(team.roster, rest);
      if (p) return { side, num: p.num, name: p.name, teamLevel: false, ambiguous: false };
    }
  }

  if (teamMatches(a.name, t)) return { side: "A", num: null, name: "", teamLevel: true, ambiguous: false };
  if (teamMatches(b.name, t)) return { side: "B", num: null, name: "", teamLevel: true, ambiguous: false };

  return none;
}
