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
  it("full mode returns the model unchanged", () => {
    const model: any = { homeScorers: [{ name: "Rick Sanchez" }] };
    expect(applyNameDisplay(model, "full")).toBe(model);
  });
  it("redacts homeScorers + awayScorers names with initials mode", () => {
    const model: any = {
      homeScorers: [{ name: "Jerry Smith", num: 5 }],
      awayScorers: [{ name: "Beth Smith", num: 7 }],
      timelineHA: [],
    };
    const out = applyNameDisplay(model, "initials");
    expect(out.homeScorers[0].name).toBe("J.S.");
    expect(out.awayScorers[0].name).toBe("B.S.");
  });
  it("redacts homeScorers names with none mode", () => {
    const model: any = {
      homeScorers: [{ name: "Beth Smith", num: 7 }],
      awayScorers: [],
      timelineHA: [],
    };
    const out = applyNameDisplay(model, "none");
    expect(out.homeScorers[0].name).toBe("#7");
  });
  it("does not emit us/them keys from non-full redaction", () => {
    const model: any = { homeScorers: [], awayScorers: [], timelineHA: [] };
    const out = applyNameDisplay(model, "initials");
    expect(out.usScorers).toBeUndefined();
    expect(out.themScorers).toBeUndefined();
    expect(out.starters).toBeUndefined();
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

describe("applyNameDisplay redacts timeline card + sub names", () => {
  const base: any = {
    timelineHA: [
      { kind: "card", side: "home", card: "yellow", who: "Rick Sanchez", num: 10 },
      { kind: "sub", side: "away", on: "Morty Smith", off: "Beth Smith", onNum: 7, offNum: 9 },
      { kind: "card", side: "away", card: "red", who: "", num: null }, // team-level card → stays blank
      { kind: "score", side: null, sure: false, scorer: "Rick Sanchez", desc: "Rick Sanchez", num: 10 }, // unresolved score: desc is shown
    ],
  };
  it("initials redacts an unresolved score's desc (shown when scorer is unsure)", () => {
    const r = applyNameDisplay(base, "initials");
    expect(r.timelineHA[3].scorer).toBe("R.S.");
    expect(r.timelineHA[3].desc).toBe("R.S.");
  });
  it("initials redacts card 'who' and sub 'on'/'off'", () => {
    const r = applyNameDisplay(base, "initials");
    expect(r.timelineHA[0].who).toBe("R.S.");
    expect(r.timelineHA[1].on).toBe("M.S.");
    expect(r.timelineHA[1].off).toBe("B.S.");
  });
  it("none falls back to shirt number for card/sub", () => {
    const r = applyNameDisplay(base, "none");
    expect(r.timelineHA[0].who).toBe("#10");
    expect(r.timelineHA[1].on).toBe("#7");
    expect(r.timelineHA[1].off).toBe("#9");
  });
  it("leaves a team-level card (blank who) blank", () => {
    const r = applyNameDisplay(base, "none");
    expect(r.timelineHA[2].who).toBe("");
  });
});
