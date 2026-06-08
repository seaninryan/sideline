import { describe, it, expect } from "vitest";
import { buildModel } from "@/lib/model";
import { SAMPLE } from "@/lib/sample";

describe("buildModel", () => {
  const m = buildModel({ raw: SAMPLE, myTeam: "Racoons", scoringMode: "gaa" });
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
