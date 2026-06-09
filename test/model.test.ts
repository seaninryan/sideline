import { describe, it, expect } from "vitest";
import { buildModel } from "@/lib/model";
import { SAMPLE_RECORD } from "@/lib/sample";

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
  it("pins the discrete-sequence stats", () => {
    expect(m.leadChanges).toBe(1);
    expect(m.timesLevel).toBe(3);
    expect(m.maxLead).toBe(5);
    expect(m.maxLeadSide).toBe("us");
  });
});
