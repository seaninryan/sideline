import { describe, it, expect } from "vitest";
import { duplicateTeamRecord } from "@/lib/match-sport";

describe("duplicateTeamRecord", () => {
  const src: any = { id: "a", owner: "me", name: "Racoons", squad: "U11 Boys", sport: "hurling",
    color1: "#111", color2: "#222", is_public: true, listed: true,
    roster: { formation: [[1]], players: [{ num: 1, name: "Rick", role: "starting" }] } };
  it("copies roster+colours+sport+squad, names it (2), starts private, new id", () => {
    const d = duplicateTeamRecord(src, "newid");
    expect(d.id).toBe("newid");
    expect(d.name).toBe("Racoons (2)");
    expect(d.squad).toBe("U11 Boys");
    expect(d.sport).toBe("hurling");
    expect(d.color1).toBe("#111");
    expect(d.roster).toEqual(src.roster);
    expect(d.roster).not.toBe(src.roster); // deep clone
    expect(d.is_public).toBeFalsy();
  });
});
