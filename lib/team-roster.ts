import type { TeamRoster } from "@/lib/types";

const clone = (r: TeamRoster): TeamRoster => JSON.parse(JSON.stringify(r));
const nextFreeNum = (r: TeamRoster): number => {
  const used = new Set(r.players.map((p) => p.num));
  let n = 1; while (used.has(n)) n++; return n;
};

export function renamePlayer(r: TeamRoster, num: number, name: string): TeamRoster {
  const c = clone(r);
  const p = c.players.find((x) => x.num === num);
  if (p) p.name = name;
  return c;
}

export function renumberPlayer(r: TeamRoster, oldNum: number, newNum: number): TeamRoster {
  if (oldNum === newNum) return clone(r);
  if (r.players.some((p) => p.num === newNum)) return clone(r); // taken → no-op
  const c = clone(r);
  const p = c.players.find((x) => x.num === oldNum);
  if (!p) return c;
  p.num = newNum;
  c.formation = c.formation.map((row) => row.map((n) => (n === oldNum ? newNum : n)));
  return c;
}

export function addPlayer(r: TeamRoster, role: "starting" | "sub"): TeamRoster {
  const c = clone(r);
  const num = nextFreeNum(c);
  c.players.push({ num, name: "", role });
  if (role === "starting") c.formation.push([num]);
  return c;
}

export function removePlayer(r: TeamRoster, num: number): TeamRoster {
  const c = clone(r);
  c.players = c.players.filter((p) => p.num !== num);
  c.formation = c.formation.map((row) => row.filter((n) => n !== num)).filter((row) => row.length > 0);
  return c;
}
