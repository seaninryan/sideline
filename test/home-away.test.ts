import { describe, it, expect } from "vitest";
import { matchOutcome, recordHomeAway, sideToVenue, venueSeries, venueItems } from "@/lib/home-away";

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

// ④a shim — recordHomeAway operates on the editor's still-us/them payload.
describe("recordHomeAway", () => {
  const base: any = {
    raw: "", sport: "hurling",
    myTeam: "Racoons", opponent: "Wildebeests",
    colorUs: "#aaa", colorUs2: "#bbb", colorThem: "#ccc", colorThem2: "#ddd",
    usRoster: { formation: [], players: [{ num: 1, name: "U", role: "starting" }] },
    oppRoster: { formation: [], players: [{ num: 2, name: "T", role: "starting" }] },
    usSquad: "U13A", oppSquad: "U13B",
  };

  it("homeAway=home → home = us values", () => {
    const r = recordHomeAway({ ...base, homeAway: "home" });
    expect(r).toMatchObject({
      homeTeam: "Racoons", awayTeam: "Wildebeests",
      colorHome: "#aaa", colorHome2: "#bbb", colorAway: "#ccc", colorAway2: "#ddd",
      homeSquad: "U13A", awaySquad: "U13B",
    });
    expect(r.homeRoster).toBe(base.usRoster);
    expect(r.awayRoster).toBe(base.oppRoster);
  });

  it("homeAway=away → home = them values", () => {
    const r = recordHomeAway({ ...base, homeAway: "away" });
    expect(r).toMatchObject({
      homeTeam: "Wildebeests", awayTeam: "Racoons",
      colorHome: "#ccc", colorHome2: "#ddd", colorAway: "#aaa", colorAway2: "#bbb",
      homeSquad: "U13B", awaySquad: "U13A",
    });
    expect(r.homeRoster).toBe(base.oppRoster);
    expect(r.awayRoster).toBe(base.usRoster);
  });

  it("missing names/squads → empty strings", () => {
    const r = recordHomeAway({ raw: "", sport: "soccer", homeAway: "home" });
    expect(r.homeTeam).toBe("");
    expect(r.awayTeam).toBe("");
    expect(r.homeSquad).toBe("");
    expect(r.awaySquad).toBe("");
  });

  it("missing homeAway is treated as away (us = away)", () => {
    const r = recordHomeAway({ ...base, homeAway: undefined });
    expect(r.homeTeam).toBe("Wildebeests");
    expect(r.awayTeam).toBe("Racoons");
  });
});

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
