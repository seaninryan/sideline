import { describe, it, expect } from "vitest";
import { redactName, applyNameDisplay, redactRoster } from "@/lib/name-display";
import type { TeamRoster } from "@/lib/types";

describe("redactRoster", () => {
  const roster: TeamRoster = {
    formation: [[1, 2]],
    players: [
      { num: 1, name: "Rick Sanchez", role: "starting" },
      { num: 2, name: "Morty", role: "starting" },
      { num: 16, name: "", role: "sub" },
    ],
  };
  it("full is a no-op (same object)", () => expect(redactRoster(roster, "full")).toBe(roster));
  it("initials redacts player names, keeps formation", () => {
    const r = redactRoster(roster, "initials");
    expect(r.players.map((p) => p.name)).toEqual(["R.S.", "M.", ""]);
    expect(r.formation).toEqual([[1, 2]]);
  });
  it("none uses shirt numbers (blank names stay blank, as in matches)", () => {
    const r = redactRoster(roster, "none");
    expect(r.players.map((p) => p.name)).toEqual(["#1", "#2", ""]);
  });
});

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
  it("leaves formationRows (shirt numbers, not players) untouched", () => {
    const model: any = {
      usScorers: [], themScorers: [], starters: [], subs: [], missing: [], timeline: [],
      formationRows: [[1, 2, 3], [4, 5]],
    };
    expect(applyNameDisplay(model, "none").formationRows).toEqual([[1, 2, 3], [4, 5]]);
    expect(applyNameDisplay(model, "initials").formationRows).toEqual([[1, 2, 3], [4, 5]]);
  });
});

describe("applyNameDisplay redacts home/away keys", () => {
  const base: any = {
    homeScorers: [{ num: 10, name: "Rick Sanchez", scorer: "Rick Sanchez", g: 1, p: 0 }],
    awayScorers: [{ num: 7, name: "Morty Smith", scorer: "Morty Smith", g: 0, p: 1 }],
    homeRoster: { formation: [[10]], players: [{ num: 10, name: "Rick Sanchez", role: "starting" }] },
    awayRoster: { formation: [[7]], players: [{ num: 7, name: "Morty Smith", role: "starting" }] },
    timelineHA: [{ kind: "score", side: "home", num: 10, scorer: "Rick Sanchez" }],
  };
  it("initials redacts home/away scorers, rosters, and timelineHA scorer", () => {
    const r = applyNameDisplay(base, "initials");
    expect(r.homeScorers[0].name).toBe("R.S.");
    expect(r.awayScorers[0].name).toBe("M.S.");
    expect(r.homeRoster.players[0].name).toBe("R.S.");
    expect(r.awayRoster.players[0].name).toBe("M.S.");
    expect(r.timelineHA[0].scorer).toBe("R.S.");
  });
  it("full is a no-op", () => {
    expect(applyNameDisplay(base, "full")).toBe(base);
  });
});
