import { describe, it, expect } from "vitest";
import { sideToVenue, matchOutcome, venueSeries, venueItems } from "@/lib/home-away";

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

describe("venueSeries", () => {
  const series = [{ x: 0, us: 1, them: 2, usScore: "0-1", themScore: "0-2", mmin: 5 }];
  it("usIsHome=true keeps us as home", () => {
    expect(venueSeries(series, true)[0]).toMatchObject({ x: 0, home: 1, away: 2, homeScore: "0-1", awayScore: "0-2" });
  });
  it("usIsHome=false swaps us→away", () => {
    expect(venueSeries(series, false)[0]).toMatchObject({ x: 0, home: 2, away: 1, homeScore: "0-2", awayScore: "0-1" });
  });
  it("preserves other point fields (mmin)", () => {
    expect(venueSeries(series, true)[0].mmin).toBe(5);
  });
});

describe("venueItems", () => {
  const items = [
    { side: "us", usScore: "1-0", themScore: "0-0", kind: "score" },
    { side: "them", usScore: "1-0", themScore: "0-1", kind: "score" },
    { side: null, kind: "note" },
  ];
  it("usIsHome=true: us→home, them→away; adds home/awayScore", () => {
    const r = venueItems(items as any, true);
    expect(r[0]).toMatchObject({ side: "home", homeScore: "1-0", awayScore: "0-0", kind: "score" });
    expect(r[1]).toMatchObject({ side: "away", homeScore: "1-0", awayScore: "0-1" });
    expect(r[2]).toMatchObject({ side: null, kind: "note" });
  });
  it("usIsHome=false: us→away, them→home", () => {
    const r = venueItems(items as any, false);
    expect(r[0].side).toBe("away");
    expect(r[1].side).toBe("home");
    expect(r[0]).toMatchObject({ homeScore: "0-0", awayScore: "1-0" });
  });
});
