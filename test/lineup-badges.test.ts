import { describe, it, expect } from "vitest";
import { lineupBadges } from "@/lib/lineup-badges";

// Minimal model-shaped fixture. The helper reads only timeline + scorer lists.
const model: any = {
  timeline: [
    { kind: "sub", side: "us", onNum: 17, offNum: 10 },
    { kind: "sub", side: "them", onNum: 21, offNum: 4 },
    { kind: "card", side: "us", num: 6, card: "yellow" },
    { kind: "card", side: "us", num: 6, card: "red" },
    { kind: "card", side: "them", num: 6, card: "yellow" },
    { kind: "score", side: "them", og: true, ogNum: 3 },
  ],
  usScorers: [{ num: 14, g: 1, p: 2 }, { num: 6, g: 0, p: 0 }],
  themScorers: [{ num: 9, g: 0, p: 3 }],
};

describe("lineupBadges", () => {
  it("sub arrows are side-scoped (our #10 off, our #17 on; their #10 unaffected)", () => {
    expect(lineupBadges(model, "us", 10)).toMatchObject({ subOff: true, subOn: false });
    expect(lineupBadges(model, "us", 17)).toMatchObject({ subOn: true, subOff: false });
    expect(lineupBadges(model, "them", 10)).toMatchObject({ subOn: false, subOff: false });
    expect(lineupBadges(model, "them", 4)).toMatchObject({ subOff: true });
  });
  it("cards are side-scoped and collect multiple", () => {
    expect(lineupBadges(model, "us", 6).cards).toEqual(["yellow", "red"]);
    expect(lineupBadges(model, "them", 6).cards).toEqual(["yellow"]);
  });
  it("score comes from the correct side's scorer list", () => {
    expect(lineupBadges(model, "us", 14).score).toEqual({ g: 1, p: 2 });
    expect(lineupBadges(model, "them", 9).score).toEqual({ g: 0, p: 3 });
    expect(lineupBadges(model, "us", 9).score).toBeNull();
    expect(lineupBadges(model, "us", 6).score).toBeNull();
  });
  it("own goal marks the conceding player (our #3), not the beneficiary side", () => {
    expect(lineupBadges(model, "us", 3).og).toBe(true);
    expect(lineupBadges(model, "them", 3).og).toBe(false);
  });
});

// ③.2a: dual-keyed fixture for home/away branch
const modelHA: any = {
  usScorers: [{ num: 10, g: 1, p: 2 }],
  themScorers: [{ num: 7, g: 0, p: 1 }],
  homeScorers: [{ num: 10, g: 1, p: 2 }],
  awayScorers: [{ num: 7, g: 0, p: 1 }],
  timeline: [
    { kind: "sub", side: "us", onNum: 12, offNum: 10 },
    { kind: "card", side: "them", num: 7, card: "yellow" },
    { kind: "score", side: "them", og: true, ogNum: 4 },
  ],
  timelineHA: [
    { kind: "sub", side: "home", onNum: 12, offNum: 10 },
    { kind: "card", side: "away", num: 7, card: "yellow" },
    { kind: "score", side: "away", og: true, ogNum: 4 },
  ],
};

describe("lineupBadges us/them keying", () => {
  it("reads timeline + usScorers for an us player", () => {
    expect(lineupBadges(modelHA, "us", 10)).toMatchObject({ subOff: true, score: { g: 1, p: 2 } });
    expect(lineupBadges(modelHA, "us", 12)).toMatchObject({ subOn: true });
    expect(lineupBadges(modelHA, "us", 4)).toMatchObject({ og: true });
  });
  it("reads themScorers + cards for a them player", () => {
    expect(lineupBadges(modelHA, "them", 7)).toMatchObject({ cards: ["yellow"], score: { g: 0, p: 1 } });
  });
});

describe("lineupBadges home/away keying", () => {
  it("reads timelineHA + homeScorers for a home player", () => {
    expect(lineupBadges(modelHA, "home", 10)).toMatchObject({ subOff: true, score: { g: 1, p: 2 } });
    expect(lineupBadges(modelHA, "home", 12)).toMatchObject({ subOn: true });
    expect(lineupBadges(modelHA, "home", 4)).toMatchObject({ og: true });
  });
  it("reads awayScorers + cards for an away player", () => {
    expect(lineupBadges(modelHA, "away", 7)).toMatchObject({ cards: ["yellow"], score: { g: 0, p: 1 } });
  });
});
