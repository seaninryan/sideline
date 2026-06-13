import { describe, it, expect } from "vitest";
import { lineupBadges } from "@/lib/lineup-badges";

// Minimal model-shaped fixture. The helper reads only timelineHA + scorer lists.
const model: any = {
  timelineHA: [
    { kind: "sub", side: "home", onNum: 17, offNum: 10 },
    { kind: "sub", side: "away", onNum: 21, offNum: 4 },
    { kind: "card", side: "home", num: 6, card: "yellow" },
    { kind: "card", side: "home", num: 6, card: "red" },
    { kind: "card", side: "away", num: 6, card: "yellow" },
    { kind: "score", side: "away", og: true, ogNum: 3 },
  ],
  homeScorers: [{ num: 14, g: 1, p: 2 }, { num: 6, g: 0, p: 0 }],
  awayScorers: [{ num: 9, g: 0, p: 3 }],
};

describe("lineupBadges", () => {
  it("sub arrows are side-scoped (home #10 off, home #17 on; away #10 unaffected)", () => {
    expect(lineupBadges(model, "home", 10)).toMatchObject({ subOff: true, subOn: false });
    expect(lineupBadges(model, "home", 17)).toMatchObject({ subOn: true, subOff: false });
    expect(lineupBadges(model, "away", 10)).toMatchObject({ subOn: false, subOff: false });
    expect(lineupBadges(model, "away", 4)).toMatchObject({ subOff: true });
  });
  it("cards are side-scoped and collect multiple", () => {
    expect(lineupBadges(model, "home", 6).cards).toEqual(["yellow", "red"]);
    expect(lineupBadges(model, "away", 6).cards).toEqual(["yellow"]);
  });
  it("score comes from the correct side's scorer list", () => {
    expect(lineupBadges(model, "home", 14).score).toEqual({ g: 1, p: 2 });
    expect(lineupBadges(model, "away", 9).score).toEqual({ g: 0, p: 3 });
    expect(lineupBadges(model, "home", 9).score).toBeNull();
    expect(lineupBadges(model, "home", 6).score).toBeNull();
  });
  it("own goal marks the conceding player (home #3), not the beneficiary side", () => {
    expect(lineupBadges(model, "home", 3).og).toBe(true);
    expect(lineupBadges(model, "away", 3).og).toBe(false);
  });
});
