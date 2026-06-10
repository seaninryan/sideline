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

// locate a number's cell in the formation grid, else null
const findCell = (formation: number[][], num: number): { ri: number; ci: number } | null => {
  for (let ri = 0; ri < formation.length; ri++) {
    const ci = formation[ri].indexOf(num);
    if (ci !== -1) return { ri, ci };
  }
  return null;
};

// swap two players' spots, mirroring the old raw reshuffle.
// starter<->starter: swap their formation cells.
// starter<->sub: the sub takes the starter's cell and the two exchange role.
// sub<->sub: swap their relative order in players.
export function swapPositions(r: TeamRoster, numA: number, numB: number): TeamRoster {
  const c = clone(r);
  const pa = c.players.find((p) => p.num === numA);
  const pb = c.players.find((p) => p.num === numB);
  if (!pa || !pb || numA === numB) return c;
  const ca = findCell(c.formation, numA);
  const cb = findCell(c.formation, numB);
  if (ca && cb) { // both starters: swap cell values
    c.formation[ca.ri][ca.ci] = numB;
    c.formation[cb.ri][cb.ci] = numA;
  } else if (ca || cb) { // one starter, one sub: sub takes the cell, roles exchange
    const cell = ca || cb!;
    const subNum = ca ? numB : numA; // the one not in the formation
    c.formation[cell.ri][cell.ci] = subNum;
    pa.role = pa.role === "starting" ? "sub" : "starting";
    pb.role = pb.role === "starting" ? "sub" : "starting";
  } else { // both subs: swap their order in the players array
    const ia = c.players.indexOf(pa);
    const ib = c.players.indexOf(pb);
    c.players[ia] = pb;
    c.players[ib] = pa;
  }
  return c;
}

// Set a player's number to toNum. If another player already wears toNum, that
// player is bumped to the lowest free number (so numbers stay unique).
export function setNumber(r: TeamRoster, fromNum: number, toNum: number): TeamRoster {
  if (fromNum === toNum || toNum < 1 || toNum > 99) return clone(r);
  let c = clone(r);
  if (c.players.some((p) => p.num === toNum)) {
    const used = new Set(c.players.map((p) => p.num));
    used.delete(toNum); // the clashing player vacates toNum
    let free = 1; while (free === toNum || used.has(free)) free++;
    c = renumberPlayer(c, toNum, free); // bump the clashing player to the lowest free number
  }
  return renumberPlayer(c, fromNum, toNum);
}

// Move a player to a different formation row, a new row, or the subs bench.
// target: a row index (0-based, as currently displayed) | "new" | "subs".
export function movePlayer(r: TeamRoster, num: number, target: number | "new" | "subs"): TeamRoster {
  const c = clone(r);
  const p = c.players.find((x) => x.num === num);
  if (!p) return c;
  let formation = c.formation.map((row) => row.filter((n) => n !== num)); // pull from its current row
  if (target === "subs") {
    p.role = "sub";
  } else {
    p.role = "starting";
    if (target === "new") formation.push([num]);
    else if (typeof target === "number" && target >= 0 && target < formation.length) formation[target] = [...formation[target], num];
    else formation.push([num]);
  }
  c.formation = formation.filter((row) => row.length > 0);
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
