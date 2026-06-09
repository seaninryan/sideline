import { parseMatch } from "@/lib/parser";
import { gpTotal, fmtDateShort, MONTHS } from "@/lib/util";
import { SPORTS } from "@/lib/constants";
import type { MatchRecord } from "@/lib/types";

export interface RowView {
  homeName: string;
  awayName: string;
  homeStr: string;
  awayStr: string;
  winner: "home" | "away" | "draw";
  sportEmoji: string;
  homeColors: [string, string];
  awayColors: [string, string];
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
  const sp = (SPORTS as Record<string, { mode: string }>)[rec.sport || ""];
  const scoringMode = sp ? (sp.mode as "gaa" | "goals") : (rec.autoMode ? undefined : rec.scoringMode);
  const parsed = parseMatch(rec.raw, { myTeam: rec.myTeam, scoringMode });
  const { header, totals } = parsed;
  const mode = parsed.mode;

  const usTotal = gpTotal(totals.us.g, totals.us.p, mode);
  const themTotal = gpTotal(totals.them.g, totals.them.p, mode);
  const usIsHome = header.homeAway === "home"; // homeAway "" (no opponent line) → us treated as away; fine for a list row

  const usName = rec.myTeam || "My Team";
  const themName = header.opposition || "Opponent";
  const usColors: [string, string] = [rec.colorUs || "#f5c518", rec.colorUs2 || "#1f7a4d"];
  const themColors: [string, string] = [rec.colorThem || "#c0392b", rec.colorThem2 || "#2c5fa8"];

  let winnerSide: "us" | "them" | "draw";
  if (usTotal === themTotal) winnerSide = "draw";
  else winnerSide = usTotal > themTotal ? "us" : "them";
  const winner: RowView["winner"] =
    winnerSide === "draw" ? "draw" : (winnerSide === "us") === usIsHome ? "home" : "away";

  return {
    homeName: usIsHome ? usName : themName,
    awayName: usIsHome ? themName : usName,
    homeStr: usIsHome ? totals.us.str : totals.them.str,
    awayStr: usIsHome ? totals.them.str : totals.us.str,
    winner,
    sportEmoji: resolveSportEmoji(rec.sport, header.sport, mode),
    homeColors: usIsHome ? usColors : themColors,
    awayColors: usIsHome ? themColors : usColors,
  };
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Human "2h ago" / "Yesterday" / short-date, given an explicit `now` (testable).
export function relativeDate(iso: string | undefined, now: number): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (isNaN(t)) return "";
  const diff = now - t;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = new Date(t);
  const nd = new Date(now);
  const dayStart = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((dayStart(nd) - dayStart(d)) / 86400000);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return fmtDateShort(iso);
}
