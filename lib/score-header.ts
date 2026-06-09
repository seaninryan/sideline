export interface ScoreHeaderResult {
  kind: "lead" | "won" | "tie";
  side?: "home" | "away";
  margin: number;
}

// Neutral result indicator for the score header. In play → "lead"; at full time → "won";
// equal totals → "tie" in either phase. Margin is in whatever unit the totals are passed in
// (points for GAA via gpTotal, goals for soccer).
export function scoreHeaderResult(args: { homeTotal: number; awayTotal: number; phase: string }): ScoreHeaderResult {
  const { homeTotal, awayTotal, phase } = args;
  if (homeTotal === awayTotal) return { kind: "tie", margin: 0 };
  const side = homeTotal > awayTotal ? "home" : "away";
  return { kind: phase === "over" ? "won" : "lead", side, margin: Math.abs(homeTotal - awayTotal) };
}
