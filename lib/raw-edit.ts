import { squash } from "@/lib/util";
import { parseMatch } from "@/lib/parser";

/* ---- roster bounds helper (still used elsewhere) ---- */
export const rosterEnd = (lines: string[]): number => { const e = lines.findIndex((l) => /^\s*\d{1,2}:\d{2}\s*$/.test(l)); return e === -1 ? lines.length : e; };

/* ---- event-line edits on the raw notation (notation blocks) ---- */
// Lines that are structure, not events: half-start clocks, bare minutes,
// HT/FT markers (bare or minuted, mirroring the parser's two regexes) and
// "+N" added-time overrides. They never re-sort.
const isStructureLine = (l: string): boolean => {
  const s = (l || "").trim();
  return /^\d{1,2}:\d{2}$/.test(s) || /^\d{1,2}$/.test(s) || /^\+\d{1,2}(\s+added)?$/i.test(s)
    || /^(ht|ft|half ?time|full ?time)$/i.test(s) || /^\d{1,2}\b\s*(ht|ft|half ?time|full ?time|end)\b/i.test(s);
};
// the leading minute of an ordinary event line, else null
export function eventLineMinute(line: string): number | null {
  if (isStructureLine(line)) return null;
  const m = (line || "").match(/^\s*(\d{1,2})\b\s*\S/);
  return m ? parseInt(m[1], 10) : null;
}
export function deleteEventLine(raw: string, idx: number): string {
  const lines = raw.split("\n");
  if (idx < 0 || idx >= lines.length) return raw;
  lines.splice(idx, 1);
  return lines.join("\n");
}
// shared placement core: put `line` inside half `half`, ordered by elapsed
// minute. Returns null when by-minute placement doesn't apply (no minute on
// the line, or the half has no start mark) — callers fall back to a splice.
export function placeEventLineByMinute(raw: string, half: number, line: string): string | null {
  const newMin = eventLineMinute(line);
  if (newMin == null) return null;
  const lines = raw.split("\n");
  const p = parseMatch(raw, {});
  const start = p.halfMarks.find((m: any) => !m.marker && m.half === half);
  if (!start) return null;
  const startMin = start.startMin != null ? start.startMin : parseInt(start.clock.split(":")[1], 10);
  let newElapsed = newMin - startMin; if (newElapsed < 0) newElapsed += 60; // same wrap as the parser
  const endMark = p.halfMarks.find((m: any) => m.marker && m.half === half && m.srcLine > start.srcLine);
  const nextStart = p.halfMarks.find((m: any) => !m.marker && m.half === half + 1);
  let at = endMark ? endMark.srcLine : nextStart ? nextStart.srcLine : lines.length;
  while (at > start.srcLine + 1 && !(lines[at - 1] || "").trim()) at--; // don't strand it past trailing blanks
  const entries = [...p.scoring, ...p.notes]
    .filter((e: any) => e.half === half && e.srcLine != null && e.srcLine > start.srcLine && e.srcLine < at)
    .sort((x: any, y: any) => x.srcLine - y.srcLine);
  for (const e of entries) {
    if (e.elapsed != null && e.elapsed > newElapsed) { at = e.srcLine; break; } // minute-less notes stick to their predecessor
  }
  lines.splice(at, 0, line);
  return lines.join("\n");
}
export function insertEventLine(raw: string, afterIdx: number, line: string): string {
  const p = parseMatch(raw, {});
  // the anchor decides the half: its own entry, or the nearest entry above it
  let half: number | null = null;
  const all = [...p.scoring, ...p.notes, ...p.halfMarks];
  for (let i = afterIdx; i >= 0 && half == null; i--) {
    const hit = all.find((e: any) => e.srcLine === i);
    if (hit) half = hit.half;
  }
  const placed = half != null ? placeEventLineByMinute(raw, half, line) : null;
  if (placed != null) return placed;
  const lines = raw.split("\n");
  lines.splice(afterIdx + 1, 0, line); // minute-less line (or no parsable anchor): literally after the anchor
  return lines.join("\n");
}
export function replaceEventLine(raw: string, idx: number, newLine: string): string {
  const lines = raw.split("\n");
  if (idx < 0 || idx >= lines.length) return raw;
  const oldMin = eventLineMinute(lines[idx]);
  const newMin = eventLineMinute(newLine);
  if (oldMin == null || newMin == null || oldMin === newMin) {
    lines[idx] = newLine; // structure/minute-less lines edit in place; so do same-minute edits
    return lines.join("\n");
  }
  const p = parseMatch(raw, {});
  const hit = [...p.scoring, ...p.notes].find((e: any) => e.srcLine === idx);
  if (!hit) { lines[idx] = newLine; return lines.join("\n"); }
  const without = [...lines.slice(0, idx), ...lines.slice(idx + 1)].join("\n");
  const placed = placeEventLineByMinute(without, hit.half, newLine);
  if (placed != null) return placed;
  lines[idx] = newLine;
  return lines.join("\n");
}
