import { fmtScore } from "@/lib/util";

// Half-time score string ("1 – 1" / "0-3 – 1-1"), derived from the running
// series — the last half-1 point's cumulative score. The series already applies
// the scoring mode (in goals mode every score counts as a goal), so this is
// correct in both modes. Used by the model (public page) AND the editor so the
// two never diverge. Series points carry `half` + `usScore`/`themScore` strings.
export function htScore(series: any[], effMode: string): string {
  const h1 = series.filter((p) => p.half === 1 && p.usScore);
  return h1.length
    ? `${h1[h1.length - 1].usScore} – ${h1[h1.length - 1].themScore}`
    : `${fmtScore(0, 0, effMode)} – ${fmtScore(0, 0, effMode)}`;
}
