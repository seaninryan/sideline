import { describe, it, expect } from "vitest";
import { parseMatch } from "@/lib/parser";
import { htScore } from "@/lib/half-time";

// Regression: in goals/soccer mode a bare scoring line is tagged type "point";
// the old editor HT calc re-summed by type and rendered 0 goals → "0 – 0" even
// though the first half was 1-1. htScore reads the running series (which applies
// the goals-mode conversion), so it is correct in both modes.
const SOCCER = `19:02
14 DKB
23 Barna
32 HT
38
42 Barna
01 dkb
07 Barna
10 FT`;

describe("htScore", () => {
  it("goals mode: bare first-half scores count (was 0-0)", () => {
    const p = parseMatch(SOCCER, { homeTeam: "DKB", awayTeam: "Barna", scoringMode: "goals" });
    expect(htScore(p.series, "goals")).toBe("1 – 1");
  });

  it("gaa mode: half-time points show as g-p", () => {
    const p = parseMatch("18:00\n10 DKB\n20 Barna free\n30 HT\n38\n40 DKB goal", { homeTeam: "DKB", awayTeam: "Barna", scoringMode: "gaa" });
    expect(htScore(p.series, "gaa")).toBe("0-1 – 0-1");
  });

  it("no first-half scores → 0 – 0", () => {
    expect(htScore([{ half: 1, usScore: "0", themScore: "0" }], "goals")).toBe("0 – 0");
  });
});
