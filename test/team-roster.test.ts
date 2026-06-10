import { describe, it, expect } from "vitest";
import { renamePlayer, renumberPlayer, addPlayer, removePlayer, swapPositions, setNumber, movePlayer } from "@/lib/team-roster";
import type { TeamRoster } from "@/lib/types";

const base = (): TeamRoster => ({
  formation: [[1], [2, 3]],
  players: [
    { num: 1, name: "GK", role: "starting" },
    { num: 2, name: "RB", role: "starting" },
    { num: 3, name: "CB", role: "starting" },
    { num: 12, name: "Bench", role: "sub" },
  ],
});

describe("setNumber", () => {
  it("changes a number when free", () => {
    const r = setNumber(base(), 1, 5);
    expect(r.players.find((p) => p.num === 5)!.name).toBe("GK");
    expect(r.formation[0]).toEqual([5]);
  });
  it("bumps the clashing player to the lowest free number", () => {
    // 2 → 3 collides with CB(3); CB should move to lowest free (4)
    const r = setNumber(base(), 2, 3);
    expect(r.players.find((p) => p.name === "RB")!.num).toBe(3);
    expect(r.players.find((p) => p.name === "CB")!.num).toBe(4);
    expect(new Set(r.players.map((p) => p.num)).size).toBe(4); // still unique
  });
  it("no-op when from == to", () => expect(setNumber(base(), 2, 2)).toEqual(base()));
});

describe("movePlayer", () => {
  it("moves a starter to another line", () => {
    const r = movePlayer(base(), 1, 1); // GK(1) from line 0 → line 1
    expect(r.formation).toEqual([[2, 3, 1]]); // old line 0 emptied & dropped
  });
  it("moves a starter to the bench", () => {
    const r = movePlayer(base(), 2, "subs");
    expect(r.players.find((p) => p.num === 2)!.role).toBe("sub");
    expect(r.formation.flat()).not.toContain(2);
  });
  it("moves a sub onto a new line as a starter", () => {
    const r = movePlayer(base(), 12, "new");
    expect(r.players.find((p) => p.num === 12)!.role).toBe("starting");
    expect(r.formation[r.formation.length - 1]).toEqual([12]);
  });
});

describe("renamePlayer", () => {
  it("sets the name by number, leaves others", () => {
    const r = renamePlayer(base(), 2, "Alex");
    expect(r.players.find((p) => p.num === 2)!.name).toBe("Alex");
    expect(r.players.find((p) => p.num === 1)!.name).toBe("GK");
  });
  it("does not mutate the input", () => {
    const b = base(); renamePlayer(b, 2, "Alex");
    expect(b.players.find((p) => p.num === 2)!.name).toBe("RB");
  });
});

describe("renumberPlayer", () => {
  it("changes the number in players and formation", () => {
    const r = renumberPlayer(base(), 3, 5);
    expect(r.players.find((p) => p.num === 5)!.name).toBe("CB");
    expect(r.players.some((p) => p.num === 3)).toBe(false);
    expect(r.formation).toEqual([[1], [2, 5]]);
  });
  it("no-op if the new number is already taken", () => {
    const r = renumberPlayer(base(), 3, 2);
    expect(r).toEqual(base());
  });
});

describe("addPlayer", () => {
  it("adds a starter with the next free number and a new formation row", () => {
    const r = addPlayer(base(), "starting");
    expect(r.players).toHaveLength(5);
    const added = r.players[r.players.length - 1];
    expect(added).toEqual({ num: 4, name: "", role: "starting" });
    expect(r.formation[r.formation.length - 1]).toEqual([4]);
  });
  it("adds a sub with the next free number, not in the formation", () => {
    const r = addPlayer(base(), "sub");
    const added = r.players[r.players.length - 1];
    expect(added.role).toBe("sub");
    expect(added.num).toBe(4);
    expect(r.formation.flat()).not.toContain(4);
  });
});

describe("removePlayer", () => {
  it("removes from players and formation, dropping empty rows", () => {
    const r = removePlayer(base(), 1);
    expect(r.players.some((p) => p.num === 1)).toBe(false);
    expect(r.formation).toEqual([[2, 3]]);
  });
});

describe("swapPositions", () => {
  it("starter<->starter swaps the cells, leaves players untouched", () => {
    const r = swapPositions(base(), 2, 3);
    expect(r.formation).toEqual([[1], [3, 2]]);
    // num/name/role unchanged
    expect(r.players.find((p) => p.num === 2)!).toEqual({ num: 2, name: "RB", role: "starting" });
    expect(r.players.find((p) => p.num === 3)!).toEqual({ num: 3, name: "CB", role: "starting" });
  });
  it("starter<->starter across rows", () => {
    const r = swapPositions(base(), 1, 3);
    expect(r.formation).toEqual([[3], [2, 1]]);
  });
  it("starter<->sub: sub takes the cell and roles exchange", () => {
    const r = swapPositions(base(), 2, 12); // 2 is a starter, 12 is a sub
    expect(r.formation).toEqual([[1], [12, 3]]);
    expect(r.players.find((p) => p.num === 2)!.role).toBe("sub");
    expect(r.players.find((p) => p.num === 12)!.role).toBe("starting");
    // names/nums unchanged
    expect(r.players.find((p) => p.num === 2)!.name).toBe("RB");
    expect(r.players.find((p) => p.num === 12)!.name).toBe("Bench");
  });
  it("starter<->sub regardless of argument order", () => {
    const r = swapPositions(base(), 12, 2); // sub first
    expect(r.formation).toEqual([[1], [12, 3]]);
    expect(r.players.find((p) => p.num === 2)!.role).toBe("sub");
    expect(r.players.find((p) => p.num === 12)!.role).toBe("starting");
  });
  it("sub<->sub swaps bench order", () => {
    const two = (): TeamRoster => ({
      formation: [[1]],
      players: [
        { num: 1, name: "GK", role: "starting" },
        { num: 12, name: "B1", role: "sub" },
        { num: 13, name: "B2", role: "sub" },
      ],
    });
    const r = swapPositions(two(), 12, 13);
    expect(r.formation).toEqual([[1]]);
    const subOrder = r.players.filter((p) => p.role === "sub").map((p) => p.num);
    expect(subOrder).toEqual([13, 12]);
  });
  it("unknown num is a no-op clone", () => {
    expect(swapPositions(base(), 2, 99)).toEqual(base());
    expect(swapPositions(base(), 99, 2)).toEqual(base());
  });
  it("does not mutate the input", () => {
    const b = base();
    swapPositions(b, 2, 3);
    expect(b.formation).toEqual([[1], [2, 3]]);
  });
});
