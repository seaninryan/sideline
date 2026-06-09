import { parseMatch } from "@/lib/parser";
import type { MatchRecord, TeamRecord, TeamRoster } from "@/lib/types";

// A team roster → the app's roster-notation block (formation rows pipe-joined, then a Subs section).
export function rosterToNotationLines(roster: TeamRoster): string {
  const byNum = (n: number) => roster.players.find((p) => p.num === n);
  const rows = roster.formation.map((row) =>
    row.map((n) => { const p = byNum(n); return `${n}. ${p ? p.name : ""}`.trim(); }).join(" | "));
  const subs = roster.players.filter((p) => p.role === "sub");
  if (subs.length) rows.push("Subs:", ...subs.map((p) => `${p.num}. ${p.name}`.trim()));
  return rows.join("\n");
}

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

// Rebuild the header's first non-empty line as "<label> <v|@> <opp>", keeping the existing grade label.
function setHeader(raw: string, oppName: string, homeAway: "home" | "away"): string {
  const label = (parseMatch(raw, {}).header.label || "Match").trim();
  const sym = homeAway === "home" ? "v" : "@";
  const line = `${label} ${sym} ${oppName}`.replace(/\s+/g, " ").trim();
  const lines = raw.split("\n");
  const hi = lines.findIndex((l) => l.trim() !== "");
  if (hi === -1) return line + "\n" + raw;
  lines[hi] = line;
  return lines.join("\n");
}

// Build the patch to apply when linking a match to two teams. us = the notated side; homeAway
// places us as home or away. Seeds the notation roster from the us team ONLY when the match has
// no roster yet (never clobbers a hand-entered lineup).
export function teamLinkPatch(
  record: MatchRecord,
  { usTeam, oppTeam, homeAway }: { usTeam: TeamRecord; oppTeam: TeamRecord; homeAway: "home" | "away" },
) {
  let raw = setHeader(record.raw, oppTeam.name, homeAway);
  const hasRoster = (() => { try { return parseMatch(record.raw, { myTeam: usTeam.name }).roster.length > 0; } catch { return false; } })();
  if (!hasRoster && usTeam.roster.formation.length) {
    const lines = raw.split("\n");
    const hi = lines.findIndex((l) => l.trim() !== "");
    lines.splice(hi + 1, 0, rosterToNotationLines(usTeam.roster));
    raw = lines.join("\n");
  }
  return {
    raw,
    myTeam: usTeam.name,
    colorUs: usTeam.color1 || record.colorUs,
    colorUs2: usTeam.color2 || record.colorUs2,
    colorThem: oppTeam.color1 || record.colorThem,
    colorThem2: oppTeam.color2 || record.colorThem2,
    homeTeamId: homeAway === "home" ? usTeam.id : oppTeam.id,
    awayTeamId: homeAway === "home" ? oppTeam.id : usTeam.id,
    oppRoster: clone(oppTeam.roster),
  };
}

// Swap which side is home: flip the header symbol (v↔@) and swap the team ids.
export function swapHomeAway(record: MatchRecord) {
  const ha = parseMatch(record.raw, {}).header.homeAway;
  const lines = record.raw.split("\n");
  const hi = lines.findIndex((l) => l.trim() !== "");
  if (hi !== -1) {
    lines[hi] = ha === "home"
      ? lines[hi].replace(/\s+v(?:s|\.)?\s+/i, " @ ")
      : lines[hi].replace(/\s+@\s+/, " v ");
  }
  return { raw: lines.join("\n"), homeTeamId: record.awayTeamId ?? null, awayTeamId: record.homeTeamId ?? null };
}
