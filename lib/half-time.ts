import { fmtScore } from "@/lib/util";

// Half-time score string ("1 – 1" / "0-3 – 1-1"), derived from the running
// series — the last half-1 point's cumulative score. The series already applies
// the scoring mode (in goals mode every score counts as a goal), so this is
// correct in both modes. Used by both the model (public page) and the editor;
// series points carry `half` + a home/away (`homeScore`/`awayScore`) score pair.
export function htScore(series: any[], effMode: string): string {
  const left = (p: any) => p.homeScore;
  const right = (p: any) => p.awayScore;
  const h1 = series.filter((p) => p.half === 1 && left(p));
  return h1.length
    ? `${left(h1[h1.length - 1])} – ${right(h1[h1.length - 1])}`
    : `${fmtScore(0, 0, effMode)} – ${fmtScore(0, 0, effMode)}`;
}
