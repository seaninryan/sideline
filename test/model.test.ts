import { describe, it, expect } from "vitest";
import { buildModel } from "@/lib/model";
import { SAMPLE_RECORD } from "@/lib/sample";
import { recordHomeAway } from "@/lib/home-away";
import type { MatchRecord, TeamRoster } from "@/lib/types";

describe("buildModel", () => {
  const m = buildModel(SAMPLE_RECORD);
  it("carries totals + result", () => {
    expect(m.totals.us.str).toBe("2-6");
    expect(m.totals.them.str).toBe("2-7");
    expect(m.result).toBe("Loss");
  });
  it("names from record + parser", () => {
    expect(m.usName).toBe("Racoons");
    expect(m.themName).toBe("Wildebeests");
  });
  it("defaults nameDisplay to full", () => expect(m.nameDisplay).toBe("full"));
});

// Canonical SAMPLE assertions — the discrete event-only fixture is the source of
// truth; totals are COUNTED. Stats pinned to the values the sequence yields.
describe("canonical SAMPLE_RECORD", () => {
  const m = buildModel(SAMPLE_RECORD);
  it("reproduces Racoons 2-6, Wildebeests 2-7 (Loss)", () => {
    expect(m.totals.us.str).toBe("2-6");
    expect(m.totals.them.str).toBe("2-7");
    expect(m.result).toBe("Loss");
  });
  it("credits Rick 2-4 with 4 frees on side us", () => {
    const rick = m.parsed.scorers.find((s: any) => s.name === "Rick");
    expect(rick).toMatchObject({ g: 2, p: 4, frees: 4, side: "us" });
  });
  it("credits Morty 0-1 on side us", () => {
    const morty = m.parsed.scorers.find((s: any) => s.name === "Morty");
    expect(morty).toMatchObject({ g: 0, p: 1, side: "us" });
  });
  it("parses with no warnings", () => expect(m.parsed.warnings).toEqual([]));
  it("exposes themScorers as an array (may be empty when scores are team-level)", () => {
    // SAMPLE uses team-level opponent attribution ("Wildebeests free") so
    // themScorers is empty — this confirms the field is always present and array-shaped.
    expect(Array.isArray(m.themScorers)).toBe(true);
  });
  it("pins the discrete-sequence stats", () => {
    expect(m.leadChanges).toBe(1);
    expect(m.timesLevel).toBe(3);
    expect(m.maxLead).toBe(5);
    expect(m.maxLeadSide).toBe("us");
  });
  it("exposes neutral home/away view", () => {
    // neutral home/away view (additive) — SAMPLE is homeAway:"away", so Racoons are away
    expect(m.homeName).toBe("Wildebeests");
    expect(m.awayName).toBe("Racoons");
    expect(m.homeTotals.str).toBe("2-7");
    expect(m.awayTotals.str).toBe("2-6");
    expect(m.homeColors).toEqual([m.colorThem, m.colorThem2]);
    expect(m.awayColors).toEqual([m.colorUs, m.colorUs2]);
    expect(m.outcome).toEqual({ winner: "home", margin: 1 });
  });
  it("exposes homeSeries + timelineHA display mappings", () => {
    // ② display mapping (additive)
    expect(Array.isArray(m.homeSeries)).toBe(true);
    expect(m.homeSeries.length).toBe(m.series.length);
    // a score event tagged "us" maps to side "away" (SAMPLE is homeAway:"away")
    const usEvent = m.timeline.find((t: any) => t.side === "us");
    const mapped = m.timelineHA.find((t: any) => t.seq === usEvent.seq && t.half === usEvent.half);
    expect(mapped.side).toBe("away");
  });
});

describe("recordHomeAway(SAMPLE_RECORD)", () => {
  const r = recordHomeAway(SAMPLE_RECORD);
  it("homeAway 'away' → home = opponent (Wildebeests)", () => {
    expect(r.homeTeam).toBe("Wildebeests");
    expect(r.awayTeam).toBe("Racoons");
  });
  it("colours follow venue", () => {
    expect(r.colorHome).toBe(SAMPLE_RECORD.colorThem);
    expect(r.colorAway).toBe(SAMPLE_RECORD.colorUs);
  });
});

describe("buildModel themScorers — named opponent scorer", () => {
  const oppRoster: TeamRoster = { formation: [[9]], players: [{ num: 9, name: "Gerald", role: "starting" }] };
  const record: MatchRecord = {
    raw: "18:00\n5 Morty goal\n10 Wildebeests 9 goal\n20 Wildebeests 9\n40 FT",
    myTeam: "Racoons", opponent: "Wildebeests",
    sport: "hurling",
    oppRoster,
    usRoster: { formation: [[10]], players: [{ num: 10, name: "Morty", role: "starting" }] },
  };
  const m = buildModel(record);
  it("surfaces named opponent scorer in themScorers", () => {
    expect(m.themScorers.length).toBeGreaterThan(0);
    const gerald = m.themScorers.find((s: any) => s.name === "Gerald");
    expect(gerald).toBeDefined();
    expect(gerald).toMatchObject({ side: "them", g: 1 });
  });
  it("usScorers still contains own-team scorer", () => {
    const morty = m.usScorers.find((s: any) => s.name === "Morty");
    expect(morty).toMatchObject({ side: "us", g: 1 });
  });
});
