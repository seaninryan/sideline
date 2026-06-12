import { parseMatch } from "@/lib/parser";
import { gpTotal, fmtDateShort, MONTHS } from "@/lib/util";
import { SPORTS, LIVE_WINDOW_MS, scoringModeForSport } from "@/lib/constants";
import type { MatchRecord } from "@/lib/types";

export interface RowView {
  homeName: string;
  awayName: string;
  homeStr: string;
  awayStr: string;
  winner: "home" | "away" | "draw";
  sport: string;
  sportEmoji: string;
  homeColors: [string, string];
  awayColors: [string, string];
  homeSquad: string;
  awaySquad: string;
}

// Resolved sport key (one of SPORTS): an explicit key wins, else a sport named
// in the header, else goals-mode implies soccer. "" when unknown.
export function resolveSportKey(sportKey: string | undefined, headerSport: string, mode: string): string {
  if (sportKey && SPORTS[sportKey]) return sportKey;
  const entry = Object.entries(SPORTS).find(([, s]) => s.label === headerSport);
  if (entry) return entry[0];
  return mode === "goals" ? "soccer" : "";
}

// Sport glyph: an explicit sport key wins, else a sport named in the header,
// else goals-mode implies soccer. Mirrors the editor's local sportEmoji helper.
function resolveSportEmoji(sportKey: string | undefined, headerSport: string, mode: string): string {
  if (sportKey && SPORTS[sportKey]) return SPORTS[sportKey].emoji;
  const byLabel = Object.values(SPORTS).find((s) => s.label === headerSport);
  if (byLabel) return byLabel.emoji;
  return mode === "goals" ? SPORTS.soccer.emoji : "";
}

// Build the compact view-model for a single list row from a stored record.
// Pure: no Date.now, no DOM. Home/away ordering comes from the parsed header;
// winner is decided on the running totals (us-perspective `result` isn't used so
// the same function serves other people's matches in the public feed).
export function matchRowView(rec: MatchRecord): RowView {
  const scoringMode = scoringModeForSport(rec.sport);
  const parsed = parseMatch(rec.raw, {
    myTeam: rec.myTeam, scoringMode,
    usRoster: rec.usRoster, oppRoster: rec.oppRoster,
    label: rec.label, homeAway: rec.homeAway, opponent: rec.opponent,
  });
  const { header, totals } = parsed;
  const mode = parsed.mode;

  const usTotal = gpTotal(totals.us.g, totals.us.p, mode);
  const themTotal = gpTotal(totals.them.g, totals.them.p, mode);
  const usIsHome = rec.homeAway === "home"; // homeAway "" (no opponent line) → us treated as away; fine for a list row

  const usName = rec.myTeam || "My Team";
  const themName = rec.opponent || header.opposition || "Opponent";
  const usColors: [string, string] = [rec.colorUs || "#f5c518", rec.colorUs2 || "#1f7a4d"];
  const themColors: [string, string] = [rec.colorThem || "#c0392b", rec.colorThem2 || "#2c5fa8"];

  let winnerSide: "us" | "them" | "draw";
  if (usTotal === themTotal) winnerSide = "draw";
  else winnerSide = usTotal > themTotal ? "us" : "them";
  const winner: RowView["winner"] =
    winnerSide === "draw" ? "draw" : (winnerSide === "us") === usIsHome ? "home" : "away";

  const usSquad = rec.usSquad || "";
  const oppSquad = rec.oppSquad || "";
  return {
    homeName: usIsHome ? usName : themName,
    awayName: usIsHome ? themName : usName,
    homeStr: usIsHome ? totals.us.str : totals.them.str,
    awayStr: usIsHome ? totals.them.str : totals.us.str,
    winner,
    sport: resolveSportKey(rec.sport, header.sport, mode),
    sportEmoji: resolveSportEmoji(rec.sport, header.sport, mode),
    homeColors: usIsHome ? usColors : themColors,
    awayColors: usIsHome ? themColors : usColors,
    homeSquad: usIsHome ? usSquad : oppSquad,
    awaySquad: usIsHome ? oppSquad : usSquad,
  };
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const dayStartOf = (ms: number) => { const x = new Date(ms); return new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime(); };

// True when the match is scheduled on a future calendar day (a fixture). Exposed
// as a tested utility; list bucketing goes through matchBucket (which also folds
// in started/finished state), so this isn't called directly by the UI any more.
export function isUpcoming(iso: string | undefined, now: number): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  if (isNaN(t)) return false;
  return dayStartOf(t) > dayStartOf(now);
}

// A match is on a past calendar day (its scheduled day is before today). No date
// counts as not-past (a blank fixture sits in Upcoming until played).
function isPastDay(iso: string | undefined, now: number): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  if (isNaN(t)) return false;
  return dayStartOf(t) < dayStartOf(now);
}

// `iso` is within the last LIVE_WINDOW_MS of `now` (a future timestamp is excluded).
function recentWithin(iso: string | undefined, now: number): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  if (isNaN(t)) return false;
  const diff = now - t;
  return diff >= 0 && diff < LIVE_WINDOW_MS;
}

// Parse a record once to learn whether the match has started (≥1 event) and
// whether it has reached full time (an FT half-marker).
function matchProgress(rec: MatchRecord): { started: boolean; finished: boolean } {
  const scoringMode = scoringModeForSport(rec.sport);
  const parsed = parseMatch(rec.raw, {
    myTeam: rec.myTeam, scoringMode,
    usRoster: rec.usRoster, oppRoster: rec.oppRoster,
    label: rec.label, homeAway: rec.homeAway, opponent: rec.opponent,
  });
  const started = parsed.scoring.length > 0 || parsed.notes.length > 0 || parsed.halfMarks.length > 0;
  const finished = parsed.halfMarks.some((m: { marker?: string }) => m.marker === "FT");
  return { started, finished };
}

// Which match-list section a record belongs in. The lifecycle is
// upcoming → live → past: a not-yet-started fixture (today or future) is
// Upcoming; once it has events and no FT and was kicked off / edited within the
// last 3h it is Live; full time, a stale unfinished match, or a not-started past
// day all fall to Past. `now`/`updatedAt` are passed in so the function is pure.
export function matchBucket(rec: MatchRecord, now: number, updatedAt?: string): "upcoming" | "live" | "past" {
  const iso = rec.matchDate || rec.date;
  const { started, finished } = matchProgress(rec);
  if (finished) return "past";
  if (!started) return isPastDay(iso, now) ? "past" : "upcoming";
  return recentWithin(iso, now) || recentWithin(updatedAt, now) ? "live" : "past";
}

// True when a match is currently in progress (the Live section of the list).
export function isLive(rec: MatchRecord, now: number, updatedAt?: string): boolean {
  return matchBucket(rec, now, updatedAt) === "live";
}

// Human "2h ago" / "Yesterday" / "Tomorrow" / short-date, given an explicit
// `now` (testable). Future dates read as fixtures, not "just now".
export function relativeDate(iso: string | undefined, now: number): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (isNaN(t)) return "";
  const d = new Date(t);
  const days = Math.round((dayStartOf(now) - dayStartOf(t)) / 86400000); // +ve past, -ve future
  if (days < 0) { // a future calendar day
    if (days === -1) return "Tomorrow";
    if (days > -7) return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
    return fmtDateShort(iso);
  }
  if (t > now) return "Later today"; // future, but same calendar day
  const diff = now - t;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  if (days === 1) return "Yesterday";
  if (days < 7) return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return fmtDateShort(iso);
}
