import { describe, it, expect } from "vitest";
import { whoToken, onPitchNums } from "@/lib/event-line";
import { parseEvents } from "@/lib/parse-events";
import type { TeamRoster } from "@/lib/types";

// "Rick" is on both teams; "Morty" is unique to us.
const usRoster = { formation: [[10], [11]], players: [
  { num: 10, name: "Morty", role: "starting" }, { num: 11, name: "Rick", role: "starting" }] } as TeamRoster;
const oppRoster = { formation: [[9], [11]], players: [
  { num: 9, name: "Gerald", role: "starting" }, { num: 11, name: "Rick", role: "starting" }] } as TeamRoster;
const ctx = { usName: "Racoons", themName: "Wildebeests", usRoster, oppRoster };

describe("whoToken", () => {
  it("leaves a name unique to our side unqualified", () => {
    expect(whoToken({ num: 10, name: "Morty" }, "us", ctx)).toBe("Morty");
  });
  it("qualifies a name shared with the opponent (the silent-drop bug)", () => {
    expect(whoToken({ num: 11, name: "Rick" }, "us", ctx)).toBe("Racoons Rick");
  });
  it("numbers opponents with their team token", () => {
    expect(whoToken({ num: 9, name: "" }, "them", ctx)).toBe("Wildebeests 9");
  });
  it("falls back to the team token for an unknown player", () => {
    expect(whoToken("unknown", "us", ctx)).toBe("Racoons");
    expect(whoToken(null, "them", ctx)).toBe("Wildebeests");
  });
});

describe("onPitchNums", () => {
  const roster = { formation: [[1], [2], [3]], players: [
    { num: 1, name: "A", role: "starting" }, { num: 2, name: "B", role: "starting" }, { num: 3, name: "C", role: "starting" },
    { num: 16, name: "X", role: "sub" }, { num: 17, name: "Y", role: "sub" }] } as TeamRoster;

  it("is the starters when there are no subs", () => {
    expect([...onPitchNums(roster)].sort()).toEqual([1, 2, 3]);
  });
  it("swaps off for on as subs are applied", () => {
    const on = onPitchNums(roster, [{ offNum: 2, onNum: 16 }]);
    expect(on.has(2)).toBe(false);
    expect(on.has(16)).toBe(true);
  });
  it("a sub already brought on is on the pitch (can't come on twice)", () => {
    const on = onPitchNums(roster, [{ offNum: 2, onNum: 16 }]);
    const bench = roster.players.map((p) => p.num).filter((n) => !on.has(n));
    expect(bench).not.toContain(16); // 16 is on — not an eligible "coming on" pick
    expect(bench).toContain(17);     // 17 still benched
    expect(bench).toContain(2);      // 2 came off — back on the bench
  });
});

describe("whoToken end-to-end against the parser", () => {
  const A = { name: "Racoons", roster: usRoster };
  const B = { name: "Wildebeests", roster: oppRoster };
  it("a bare shared name is dropped, the qualified token scores for us", () => {
    // the un-qualified form really is ambiguous — this is the bug we fix
    const amb = parseEvents("12:00\n5 Rick", { teamA: A, teamB: B });
    expect(amb.totals.A.total).toBe(0);
    expect(amb.warnings.length).toBeGreaterThan(0);
    // the qualified token the editor now generates counts cleanly for us
    const good = parseEvents(`12:00\n5 ${whoToken({ num: 11, name: "Rick" }, "us", ctx)}`, { teamA: A, teamB: B });
    expect(good.totals.A.total).toBe(1);
    expect(good.warnings.length).toBe(0);
  });
});
