import { describe, it, expect } from "vitest";
import { matchOutcome, recordHomeAway } from "@/lib/home-away";

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
