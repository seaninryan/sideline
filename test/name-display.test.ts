import { describe, it, expect } from "vitest";
import { redactName, applyNameDisplay } from "@/lib/name-display";

describe("redactName", () => {
  it("full keeps the name", () => expect(redactName("Rick Sanchez", undefined, "full")).toBe("Rick Sanchez"));
  it("initials reduces multi-word to dotted initials", () => expect(redactName("Rick Sanchez", undefined, "initials")).toBe("R.S."));
  it("initials of a single word is first letter", () => expect(redactName("Morty", undefined, "initials")).toBe("M."));
  it("none uses shirt number when known", () => expect(redactName("Rick Sanchez", 10, "none")).toBe("#10"));
  it("none falls back to a neutral label", () => expect(redactName("Rick Sanchez", undefined, "none")).toBe("Player"));
});

describe("applyNameDisplay", () => {
  it("redacts scorer + roster names but keeps team names", () => {
    const model: any = {
      usName: "Racoons", themName: "Wildebeests",
      usScorers: [{ name: "Rick Sanchez", num: 10 }],
      starters: [{ name: "Morty Smith", num: 11 }],
      subs: [], missing: [], timeline: [{ scorer: "Rick Sanchez", num: 10 }],
    };
    const out = applyNameDisplay(model, "initials");
    expect(out.usName).toBe("Racoons");
    expect(out.usScorers[0].name).toBe("R.S.");
    expect(out.starters[0].name).toBe("M.S.");
    expect(out.timeline[0].scorer).toBe("R.S.");
  });
  it("full mode returns the model unchanged", () => {
    const model: any = { usScorers: [{ name: "Rick Sanchez" }] };
    expect(applyNameDisplay(model, "full").usScorers[0].name).toBe("Rick Sanchez");
  });
  it("redacts themScorers names with initials mode", () => {
    const model: any = {
      usScorers: [],
      themScorers: [{ name: "Jerry Smith", num: 5 }],
      starters: [], subs: [], missing: [], timeline: [],
    };
    const out = applyNameDisplay(model, "initials");
    expect(out.themScorers[0].name).toBe("J.S.");
  });
  it("redacts themScorers names with none mode", () => {
    const model: any = {
      usScorers: [],
      themScorers: [{ name: "Beth Smith", num: 7 }],
      starters: [], subs: [], missing: [], timeline: [],
    };
    const out = applyNameDisplay(model, "none");
    expect(out.themScorers[0].name).toBe("#7");
  });
});
