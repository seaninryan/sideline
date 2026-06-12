import { describe, it, expect } from "vitest";
import { scoringModeForSport } from "@/lib/constants";

describe("scoringModeForSport", () => {
  it("GAA sports → gaa", () => {
    expect(scoringModeForSport("hurling")).toBe("gaa");
    expect(scoringModeForSport("camogie")).toBe("gaa");
    expect(scoringModeForSport("gaelic")).toBe("gaa");
  });
  it("soccer → goals", () => {
    expect(scoringModeForSport("soccer")).toBe("goals");
  });
  it("unknown or blank → goals (soccer fallback)", () => {
    expect(scoringModeForSport("")).toBe("goals");
    expect(scoringModeForSport(undefined)).toBe("goals");
    expect(scoringModeForSport("quidditch")).toBe("goals");
  });
});
