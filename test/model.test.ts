import { describe, it, expect } from "vitest";
import { buildModel } from "@/lib/model";
import { parseMatch } from "@/lib/parser";
import { SAMPLE_RECORD } from "@/lib/sample";
import type { MatchRecord, TeamRoster } from "@/lib/types";

describe("buildModel", () => {
  const m = buildModel(SAMPLE_RECORD);
  it("carries home/away totals + neutral outcome", () => {
    expect(m.awayTotals.str).toBe("2-6"); // Racoons are away
    expect(m.homeTotals.str).toBe("2-7"); // Wildebeests are home
    expect(m.outcome).toEqual({ winner: "home", margin: 1 });
  });
  it("home/away names from record + parser", () => {
    expect(m.awayName).toBe("Racoons");
    expect(m.homeName).toBe("Wildebeests");
  });
  it("defaults nameDisplay to full", () => expect(m.nameDisplay).toBe("full"));
});

// Canonical SAMPLE assertions — the discrete event-only fixture is the source of
// truth; totals are COUNTED. Stats pinned to the values the sequence yields.
describe("canonical SAMPLE_RECORD", () => {
  const m = buildModel(SAMPLE_RECORD);
  it("reproduces Racoons 2-6, Wildebeests 2-7 (Loss)", () => {
    expect(m.awayTotals.str).toBe("2-6");
    expect(m.homeTotals.str).toBe("2-7");
    expect(m.outcome).toEqual({ winner: "home", margin: 1 });
  });
  it("credits Rick 2-4 with 4 frees on side away (Racoons are away)", () => {
    const rick = m.parsed.scorers.find((s: any) => s.name === "Rick");
    expect(rick).toMatchObject({ g: 2, p: 4, frees: 4, side: "away" });
  });
  it("credits Morty 0-1 on side away", () => {
    const morty = m.parsed.scorers.find((s: any) => s.name === "Morty");
    expect(morty).toMatchObject({ g: 0, p: 1, side: "away" });
  });
  it("Rick + Morty appear in awayScorers", () => {
    expect(m.awayScorers.find((s: any) => s.name === "Rick")).toMatchObject({ g: 2, p: 4 });
    expect(m.awayScorers.find((s: any) => s.name === "Morty")).toMatchObject({ g: 0, p: 1 });
  });
  it("parses with no warnings", () => expect(m.parsed.warnings).toEqual([]));
  it("exposes homeScorers as an array (empty when scores are team-level)", () => {
    // SAMPLE uses team-level opponent attribution ("Wildebeests free"); Wildebeests
    // are home, so homeScorers is empty — confirms the field is present + array-shaped.
    expect(Array.isArray(m.homeScorers)).toBe(true);
  });
  it("pins the discrete-sequence stats", () => {
    expect(m.leadChanges).toBe(1);
    expect(m.timesLevel).toBe(3);
    expect(m.maxLead).toBe(5);
    expect(m.maxLeadVenue).toBe("away"); // us led; us is away
  });
  it("exposes neutral home/away view", () => {
    // neutral home/away view (additive) — SAMPLE is homeAway:"away", so Racoons are away
    expect(m.homeName).toBe("Wildebeests");
    expect(m.awayName).toBe("Racoons");
    expect(m.homeTotals.str).toBe("2-7");
    expect(m.awayTotals.str).toBe("2-6");
    expect(m.homeColors).toEqual(["#c0392b", "#2c5fa8"]);
    expect(m.awayColors).toEqual(["#f5c518", "#1f7a4d"]);
    expect(m.outcome).toEqual({ winner: "home", margin: 1 });
  });
  it("exposes homeRoster/awayRoster/maxLeadVenue by venue", () => {
    const m = buildModel(SAMPLE_RECORD);
    // Racoons are away → awayRoster is the Racoons roster
    expect(m.awayRoster).toBe(SAMPLE_RECORD.awayRoster);
    expect(m.homeRoster).toBe(SAMPLE_RECORD.homeRoster);
    expect(m.maxLeadVenue).toBe("away"); // Racoons (away) led
  });
  it("exposes homeSeries + timelineHA aliases of the home/away series/timeline", () => {
    expect(Array.isArray(m.homeSeries)).toBe(true);
    expect(m.homeSeries.length).toBe(m.series.length);
    // the parser is already home/away — Racoons events are tagged side "away"
    const awayEvent = m.timeline.find((t: any) => t.side === "away");
    const mapped = m.timelineHA.find((t: any) => t.seq === awayEvent.seq && t.half === awayEvent.half);
    expect(mapped.side).toBe("away");
  });
  it("no longer exposes us/them output keys", () => {
    const mm = buildModel(SAMPLE_RECORD);
    for (const k of ["usName", "themName", "usScorers", "themScorers", "colorUs", "colorThem", "usSquad", "oppSquad", "maxLeadSide", "oppRoster", "totals", "result"]) {
      expect(mm[k], k).toBeUndefined();
    }
    expect(mm.homeName).toBeTruthy();
    expect(mm.homeScorers).toBeDefined();
    expect(mm.homeRoster).toBeDefined();
  });
});

describe("parseMatch(SAMPLE) home/away identity", () => {
  const p = parseMatch(SAMPLE_RECORD.raw, {
    homeTeam: SAMPLE_RECORD.homeTeam, awayTeam: SAMPLE_RECORD.awayTeam, scoringMode: "gaa",
    homeRoster: SAMPLE_RECORD.homeRoster, awayRoster: SAMPLE_RECORD.awayRoster,
  });
  it("home = Wildebeests 2-7, away = Racoons 2-6", () => {
    expect(p.totals.home.str).toBe("2-7");
    expect(p.totals.away.str).toBe("2-6");
    expect(p.away).toBe("Racoons");
  });
});

describe("buildModel home scorers — named home-side scorer", () => {
  // Home = Wildebeests here; a named Wildebeests scorer surfaces in homeScorers.
  const homeRoster: TeamRoster = { formation: [[9]], players: [{ num: 9, name: "Gerald", role: "starting" }] };
  const record: MatchRecord = {
    raw: "18:00\n5 Racoons 10 goal\n10 Wildebeests 9 goal\n20 Wildebeests 9\n40 FT",
    homeTeam: "Wildebeests", awayTeam: "Racoons",
    sport: "hurling",
    homeRoster,
    awayRoster: { formation: [[10]], players: [{ num: 10, name: "Morty", role: "starting" }] },
  };
  const m = buildModel(record);
  it("surfaces named home scorer in homeScorers", () => {
    expect(m.homeScorers.length).toBeGreaterThan(0);
    const gerald = m.homeScorers.find((s: any) => s.name === "Gerald");
    expect(gerald).toBeDefined();
    expect(gerald).toMatchObject({ side: "home", g: 1 });
  });
  it("awayScorers contains the away-team scorer", () => {
    const morty = m.awayScorers.find((s: any) => s.name === "Morty");
    expect(morty).toMatchObject({ side: "away", g: 1 });
  });
});
