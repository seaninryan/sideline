import { resolveWho } from "@/lib/parse-events";
import type { TeamRoster } from "@/lib/types";

export interface WhoCtx {
  homeName: string;
  awayName: string;
  homeRoster?: TeamRoster | null;
  awayRoster?: TeamRoster | null;
}
export type WhoPlayer = { name?: string; num?: number } | "unknown" | null | undefined;

const EMPTY = { players: [], formation: [] } as unknown as TeamRoster;

export interface SubEvent { onNum?: number | null; offNum?: number | null }

// Shirt numbers currently on the pitch: the starters (formation if present, else every
// non-sub player), then each substitution in order swaps the off number for the on one.
// Lets the live sub picker offer only on-pitch players to come off and only off-pitch
// players to come on — so the same sub can't be brought on twice.
export function onPitchNums(roster: TeamRoster | null | undefined, subs: SubEvent[] = []): Set<number> {
  const players = roster?.players || [];
  const formation = roster?.formation || [];
  const start = formation.length ? formation.flat() : players.filter((p) => p.role !== "sub").map((p) => p.num);
  const on = new Set<number>(start);
  for (const s of subs) {
    if (s.offNum != null) on.delete(s.offNum);
    if (s.onNum != null) on.add(s.onNum);
  }
  return on;
}

// The notation token for `player` on `team` ("home"|"away"). A bare player name is
// qualified with the team name ("Racoons FF") whenever the same name would also resolve
// on the opposing roster — otherwise the parser sees it as ambiguous and silently drops
// the event. Mirrors the parser's own resolution (resolveWho) so what we write is what it
// counts. home = team A in the parser feed.
export function whoToken(player: WhoPlayer, team: "home" | "away", ctx: WhoCtx): string {
  const homeTok = (ctx.homeName || "").trim() || "Home";
  const awayTok = (ctx.awayName || "").trim() || "Away";
  if (!player || player === "unknown") return team === "away" ? awayTok : homeTok;
  const { name, num } = player as { name?: string; num?: number };
  const teamTok = team === "away" ? awayTok : homeTok;
  if (!name) return num ? `${teamTok} ${num}` : teamTok;
  const r = resolveWho(name, { name: homeTok, roster: ctx.homeRoster || EMPTY }, { name: awayTok, roster: ctx.awayRoster || EMPTY });
  // keep the bare name only when it resolves cleanly to this side; otherwise qualify it
  const wanted = team === "home" ? "A" : "B";
  return r.side === wanted && !r.ambiguous ? name : `${teamTok} ${name}`;
}
