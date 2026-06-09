import { describe, it, expect } from "vitest";
import { renamePlayer, renumberPlayer, addPlayer, removePlayer } from "@/lib/team-roster";
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
