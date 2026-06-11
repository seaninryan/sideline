import { describe, it, expect } from "vitest";
import { scoreChanged } from "@/lib/live-update";

// Minimal Model-shaped fixture: scoreChanged only reads totals.us.str / totals.them.str.
const mk = (usStr: string, themStr: string): any => ({
  totals: { us: { str: usStr }, them: { str: themStr } },
});

describe("scoreChanged", () => {
  it("is false when both score strings are identical", () => {
    expect(scoreChanged(mk("1-05", "0-07"), mk("1-05", "0-07"))).toBe(false);
  });

  it("is true when our score string changes", () => {
    expect(scoreChanged(mk("1-05", "0-07"), mk("1-06", "0-07"))).toBe(true);
  });

  it("is true when their score string changes", () => {
    expect(scoreChanged(mk("1-05", "0-07"), mk("1-05", "1-07"))).toBe(true);
  });
});
