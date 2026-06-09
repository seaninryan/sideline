import { describe, it, expect } from "vitest";
import { resolveWho } from "@/lib/parse-events";
import type { TeamRoster } from "@/lib/types";

const A = { name: "Racoons", roster: { formation: [[10],[11]], players: [
  { num: 10, name: "Morty", role: "starting" }, { num: 11, name: "Rick", role: "starting" }] } as TeamRoster };
const B = { name: "Wildebeests", roster: { formation: [[9]], players: [
  { num: 9, name: "Gerald", role: "starting" }, { num: 11, name: "Rick", role: "starting" }] } as TeamRoster };

describe("resolveWho", () => {
  it("player name unique across teams → that player + side", () => {
    expect(resolveWho("Morty", A, B)).toMatchObject({ side: "A", num: 10, name: "Morty", teamLevel: false });
  });
  it("Team + number → that team's player", () => {
    expect(resolveWho("Wildebeests 9", A, B)).toMatchObject({ side: "B", num: 9, name: "Gerald", teamLevel: false });
  });
  it("Team name alone → team-level (unattributed)", () => {
    expect(resolveWho("Wildebeests", A, B)).toMatchObject({ side: "B", teamLevel: true });
    expect(resolveWho("Racoons", A, B)).toMatchObject({ side: "A", teamLevel: true });
  });
  it("name on both teams → ambiguous (no side) unless qualified", () => {
    expect(resolveWho("Rick", A, B)).toMatchObject({ side: null, ambiguous: true });
    expect(resolveWho("Wildebeests Rick", A, B)).toMatchObject({ side: "B", num: 11, name: "Rick" });
  });
  it("unknown token → unresolved (no side)", () => {
    expect(resolveWho("Nobody", A, B)).toMatchObject({ side: null, ambiguous: false });
  });
  it("first-name shorthand resolves within a team", () => {
    expect(resolveWho("Gerald", A, B)).toMatchObject({ side: "B", num: 9 });
  });
});
