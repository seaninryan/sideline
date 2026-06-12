import { describe, it, expect } from "vitest";
import { sideToVenue, matchOutcome } from "@/lib/home-away";

describe("sideToVenue", () => {
  it("us is home when homeAway is home", () => {
    expect(sideToVenue("us", "home")).toBe("home");
    expect(sideToVenue("them", "home")).toBe("away");
  });
  it("us is away when homeAway is away", () => {
    expect(sideToVenue("us", "away")).toBe("away");
    expect(sideToVenue("them", "away")).toBe("home");
  });
  it("null/unknown side → null", () => {
    expect(sideToVenue(null, "home")).toBeNull();
    expect(sideToVenue(undefined, "home")).toBeNull();
    expect(sideToVenue("xx" as any, "home")).toBeNull();
  });
});

describe("matchOutcome", () => {
  it("home higher → winner home with margin", () => {
    expect(matchOutcome(13, 12)).toEqual({ winner: "home", margin: 1 });
  });
  it("away higher → winner away with margin", () => {
    expect(matchOutcome(10, 15)).toEqual({ winner: "away", margin: 5 });
  });
  it("level → no winner, zero margin", () => {
    expect(matchOutcome(11, 11)).toEqual({ winner: null, margin: 0 });
  });
});
