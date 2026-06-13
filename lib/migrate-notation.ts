import type { TeamRoster } from "@/lib/types";

const CLOCK_RE = /^\s*\d{1,2}:\d{2}\s*$/;

const isClock = (l: string) => /^\s*\d{1,2}:\d{2}\s*$/.test(l);
const isMinuteLead = (l: string) => /^\s*\d{1,2}\b/.test(l);
// legacy = has a `T<n>` scorer OR a first non-empty line that is neither a clock nor a minute-leading event (i.e. a header line)
export const isLegacy = (raw: string) => {
  if (/\bT\d/.test(raw)) return true;
  const f = raw.split("\n").find((l) => l.trim());
  return !!f && !isClock(f) && !isMinuteLead(f);
};

/**
 * Parse the legacy roster block (lines between the header and the first clock
 * line) into a TeamRoster snapshot.
 *
 * Lines look like:
 *   "10. Morty | 11. Rick"   — formation row (starting)
 *   "Subs:"                  — switch role to "sub"
 *   "Missing:"               — also treated as "sub" (TeamRoster has no "missing")
 *   "16. Sub"                — a sub player
 *
 * Returns { formation, players }.
 */
function parseRosterBlock(lines: string[]): TeamRoster {
  const formation: number[][] = [];
  const players: { num: number; name: string; role: "starting" | "sub" }[] = [];

  let role: "starting" | "sub" = "starting";

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Role-switch headers
    if (/^subs?\s*:?$/i.test(trimmed) || /^missing\s*:?$/i.test(trimmed)) {
      role = "sub";
      continue;
    }

    // Split on | for formation rows; each chunk is one player entry
    const chunks = trimmed.split("|").map((c) => c.trim()).filter(Boolean);
    const rowNums: number[] = [];

    for (const chunk of chunks) {
      // Match "10. Morty" / "10) Morty" / "10 Morty"
      const m = chunk.match(/^(\d{1,2})\s*[.):]?\s*(.*)$/);
      if (!m) continue;
      const num = parseInt(m[1], 10);
      const name = m[2].trim();
      players.push({ num, name, role });
      if (role === "starting") rowNums.push(num);
    }

    if (role === "starting" && rowNums.length > 0) {
      formation.push(rowNums);
    }
  }

  return { formation, players };
}

/**
 * Rewrite opponent references in a single event line:
 *   T<n>  → "<teamBName> <n>"
 *   bare T → "<teamBName>"
 *
 * We only rewrite the "who" portion (before any score tokens), so we do a
 * simple global regex replace — T<n> first (longer match), then bare \bT\b.
 */
function rewriteOpponentRefs(line: string, teamBName: string): string {
  // Replace T<n> (e.g. T11, T9) → "TeamB 11"
  let out = line.replace(/\bT(\d{1,2})\b/g, `${teamBName} $1`);
  // Replace bare T (word boundary) → "TeamB"
  out = out.replace(/\bT\b/g, teamBName);
  return out;
}

/**
 * Convert a legacy MatchRecord (header + roster block + event lines with T<n>
 * opposition refs) to the new event-only format (notationV 2).
 *
 * Non-destructive: the original raw is kept in `legacyRaw`.
 * Idempotent: records already at notationV 2 are returned unchanged (same ref).
 */
// `record` is typed `any` — this legacy lift reads/writes the old us/them shape
// (usRoster/opponent/homeAway), which the home/away MatchRecord no longer declares;
// the migrateHomeAway pass normalizes the result to v3 home/away afterwards.
export function migrateLegacyNotation(
  record: any,
  opts: { teamAName: string; teamBName: string }
): any {
  // Idempotent guard
  if (record.notationV === 2) return record;

  const lines: string[] = record.raw.split("\n");

  // Find the index of the first clock line (HH:MM)
  const clockIdx = lines.findIndex((l) => CLOCK_RE.test(l));

  let preambleLines: string[];
  let eventLines: string[];

  if (clockIdx === -1) {
    // No clock line: treat first line as header, rest as events
    preambleLines = lines.slice(0, 1);
    eventLines = lines.slice(1);
  } else {
    preambleLines = lines.slice(0, clockIdx);
    eventLines = lines.slice(clockIdx);
  }

  // The first non-empty preamble line is the legacy header — parse and drop it
  const rosterLines: string[] = [];
  let headerDropped = false;
  let headerLabel: string | undefined;
  let headerHomeAway: "home" | "away" | undefined;
  let headerOpponent: string | undefined;
  for (const l of preambleLines) {
    if (!headerDropped && l.trim() !== "") {
      headerDropped = true; // parse then skip this (the header line)
      const headerLine = l.trim();
      const awayMatch = headerLine.match(/^(.*?)\s+@\s*(.*)$/);
      if (awayMatch) {
        headerLabel = awayMatch[1].trim() || undefined;
        headerHomeAway = "away";
        headerOpponent = awayMatch[2].trim() || undefined;
      } else {
        const homeMatch = headerLine.match(/^(.*?)\s+v(?:s|\.)?\s+(.*)$/i);
        if (homeMatch) {
          headerLabel = homeMatch[1].trim() || undefined;
          headerHomeAway = "home";
          headerOpponent = homeMatch[2].trim() || undefined;
        } else {
          headerLabel = headerLine || undefined;
        }
      }
      continue;
    }
    rosterLines.push(l);
  }

  // Parse the roster block into a TeamRoster snapshot. Never let a parsed-empty
  // roster clobber an already-populated roster on the record (belt-and-suspenders
  // against an event-only record that slips past the backfill gate).
  const parsedRoster = parseRosterBlock(rosterLines);
  const usRoster = parsedRoster.players.length
    ? parsedRoster
    : (record.usRoster && record.usRoster.players && record.usRoster.players.length ? record.usRoster : parsedRoster);

  // Best available opponent name for rewriting T<n>/bare-T refs: an explicitly
  // passed teamBName wins, then the lifted header opponent, then the record's
  // existing opponent, finally a generic fallback (used only for the rewrite).
  const effectiveOpp =
    (opts.teamBName && opts.teamBName.trim()) || headerOpponent || record.opponent || "Opposition";

  // Rewrite opponent refs in every event line
  const newEventLines = eventLines.map((l) => rewriteOpponentRefs(l, effectiveOpp));

  const newRaw = newEventLines.join("\n");

  // Prefer the lifted header opponent, else the passed name, else the record's
  // existing opponent. Don't persist the generic placeholder.
  const resolvedOpponent =
    headerOpponent ?? (opts.teamBName && opts.teamBName.trim() ? opts.teamBName.trim() : record.opponent) ?? undefined;

  return {
    ...record,
    raw: newRaw,
    usRoster,
    legacyRaw: record.raw,
    notationV: 2,
    ...(headerLabel !== undefined && { label: headerLabel }),
    ...(headerHomeAway !== undefined && { homeAway: headerHomeAway }),
    ...(resolvedOpponent !== undefined && { opponent: resolvedOpponent }),
  };
}

// Backfill a single record loaded from storage: migrate legacy → event-only,
// deriving team names from the record itself. Idempotent (notationV===2 → same ref).
export function backfillNotation(rec: any): any {
  if (rec.notationV === 2) return rec;
  // event-only raw that just lacks the stamp → mark it, never migrate (avoids wiping a seeded roster)
  if (!isLegacy(rec.raw || "")) return { ...rec, notationV: 2 };
  return migrateLegacyNotation(rec, { teamAName: rec.myTeam || "My Team", teamBName: rec.opponent || "" });
}
