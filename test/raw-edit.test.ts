import { describe, it, expect } from "vitest";
import { eventLineMinute, deleteEventLine, insertEventLine, replaceEventLine } from "@/lib/raw-edit";
import { mkId, remapImport } from "@/lib/util";

// ---- notation-block helpers ----
describe("eventLineMinute", () => {
  it("eventLineMinute ordinary line", () => expect(eventLineMinute("23 Rick free 0-1 0-0")).toEqual(23));
  it("eventLineMinute clock line", () => expect(eventLineMinute("18:21")).toEqual(null));
  it("eventLineMinute bare minute", () => expect(eventLineMinute("38")).toEqual(null));
  it("eventLineMinute bare HT", () => expect(eventLineMinute("HT")).toEqual(null));
  it("eventLineMinute minuted FT", () => expect(eventLineMinute("51 FT")).toEqual(null));
  it("eventLineMinute +N", () => expect(eventLineMinute("+6")).toEqual(null));
  it("eventLineMinute minute-less note", () => expect(eventLineMinute("Rick for Morty")).toEqual(null));
  it("eventLineMinute numbered sub", () => expect(eventLineMinute("43 12 Rick for 6 Morty")).toEqual(43));
});

describe("deleteEventLine", () => {
  const RAW = "a\nb\nc";
  it("deleteEventLine", () => expect(deleteEventLine(RAW, 1)).toEqual("a\nc"));
  it("deleteEventLine out of range", () => expect(deleteEventLine(RAW, 9)).toEqual(RAW));
});

// ---- insertEventLine: anchor picks the half, minute places the line ----
// Event-only notation (no header / roster block): srcLine == raw line index.
const BLK = [
  "18:21",                              // 0  half 1 start (startMin 21)
  "23 Rick free 0-1 0-0",               // 1  elapsed 2
  "27 Jack miss pen",                   // 2  elapsed 6 (note)
  "31 Wildebeests 0-1 0-1",             // 3  elapsed 10
  "51 HT",                              // 4
  "18:55",                              // 5  half 2 start (startMin 55)
  "58 Wildebeests goal 0-1 1-1",        // 6  elapsed 3
  "2 Rick 0-2 1-1",                     // 7  elapsed 7 (wrapped past the hour)
].join("\n");

describe("insertEventLine", () => {
  const at = (r: string, i: number) => r.split("\n")[i];
  it("insert places by minute", () => {
    const a = insertEventLine(BLK, 1, "29 Morty 0-2 0-1");
    expect(at(a, 3)).toEqual("29 Morty 0-2 0-1"); // between the 27' and 31' lines
  });
  it("insert tie lands after existing", () => {
    const b = insertEventLine(BLK, 1, "27 Morty 0-2 0-1");
    expect(at(b, 3)).toEqual("27 Morty 0-2 0-1"); // after the existing 27' line
  });
  it("insert never crosses HT", () => {
    const c = insertEventLine(BLK, 1, "49 Morty 0-2 0-1");
    expect([at(c, 4), at(c, 5)]).toEqual(["49 Morty 0-2 0-1", "51 HT"]);
  });
  it("insert wraps past the hour", () => {
    const d = insertEventLine(BLK, 6, "5 Morty 1-1 1-1"); // half 2, elapsed 10 — wraps
    expect(at(d, 8)).toEqual("5 Morty 1-1 1-1"); // after the 2' line
  });
  it("insert minute-less goes right after anchor", () => {
    const e = insertEventLine(BLK, 3, "switched Rick to midfield");
    expect(at(e, 4)).toEqual("switched Rick to midfield");
  });
  it("insert after half-start block", () => {
    const f = insertEventLine(BLK, 5, "57 Morty 1-1 1-1"); // anchor = half-2 clock line, elapsed 2
    expect(at(f, 6)).toEqual("57 Morty 1-1 1-1");
  });
});

// ---- replaceEventLine ----
describe("replaceEventLine", () => {
  const at = (r: string, i: number) => r.split("\n")[i];
  it("replace re-sorts on minute change", () => {
    const a = replaceEventLine(BLK, 3, "25 Wildebeests 0-1 0-1"); // 31' -> 25' (elapsed 4): moves before the 27' note
    expect([at(a, 2), at(a, 3)]).toEqual(["25 Wildebeests 0-1 0-1", "27 Jack miss pen"]);
  });
  it("replace same minute stays put", () => {
    const b = replaceEventLine(BLK, 1, "23 Rick 0-1 0-0"); // text-only edit, same minute
    expect(at(b, 1)).toEqual("23 Rick 0-1 0-0");
  });
  it("replace marker stays put", () => {
    const c = replaceEventLine(BLK, 4, "51 HT +3"); // marker: edited in place, never re-sorted
    expect(at(c, 4)).toEqual("51 HT +3");
  });
  it("replace note same minute stays put", () => {
    const d = replaceEventLine(BLK, 2, "27 Jack miss pen saved"); // still minuted, same minute
    expect(at(d, 2)).toEqual("27 Jack miss pen saved");
  });
  it("replace out of range is a no-op", () => expect(replaceEventLine(BLK, 99, "x")).toEqual(BLK));
});

// ---- insertEventLine contract-pinning (Task-3 review) ----
describe("insertEventLine contract-pinning", () => {
  const at = (r: string, i: number) => r.split("\n")[i];
  it("insert into bare-minute extra-time half", () => {
    // extra time: a third half started by a bare minute line; insert respects its startMin
    const ET = BLK + "\n70 FT\n75\n78 Rick 1-2 1-1"; // FT=8, bare-minute start=9, 78'=10
    const g = insertEventLine(ET, 10, "76 Morty 0-3 1-1"); // anchor = the 78' line in the bare-minute half
    expect(at(g, 10)).toEqual("76 Morty 0-3 1-1"); // 76' elapsed 1, before the 78' line
  });
  it("insert with post-FT anchor lands before FT", () => {
    // anchoring past FT still keeps the line inside the half (before the FT marker)
    const h = insertEventLine(BLK + "\n70 FT\nafter-match note", 9, "65 Morty 0-3 1-1");
    expect(at(h, 8)).toEqual("65 Morty 0-3 1-1");
  });
});

// ---- import remap: fresh UUIDs, incoming ids dropped, records preserved ----
describe("import remap", () => {
  let seq = 0;
  const gen = () => "uuid-" + (++seq);
  const exp = { v: 1, matches: [
    { id: "m1718000000001", raw: "A @ B", myTeam: "A" },
    { id: "m1718000000002", raw: "C @ D", myTeam: "C" },
  ] };
  const out = remapImport(exp, gen);
  it("remap count", () => expect(out.length).toEqual(2));
  it("remap fresh ids", () => expect(out.map((x) => x.id)).toEqual(["uuid-1", "uuid-2"]));
  it("remap drops old id", () => expect((out[0].rec as any).id).toEqual(undefined));
  it("remap keeps record", () => expect([(out[0].rec as any).raw, (out[0].rec as any).myTeam]).toEqual(["A @ B", "A"]));
  it("remap bare array", () => {
    let seq2 = 0;
    const gen2 = () => "uuid-" + (++seq2);
    expect(remapImport([{ id: "x", raw: "E @ F" }], gen2).length).toEqual(1);
  });
  it("remap empty/garbage", () => {
    let seq3 = 0;
    const gen3 = () => "uuid-" + (++seq3);
    expect(remapImport(null, gen3).length).toEqual(0);
  });
  it("mkId is uuid-shaped", () => expect(/^[0-9a-f-]{36}$/.test(mkId())).toEqual(true));
});
