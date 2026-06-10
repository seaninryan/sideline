import { describe, it, expect } from "vitest";
import { migrateLegacyNotation, backfillNotation } from "@/lib/migrate-notation";

it("strips roster, rewrites T<n>→opp, builds usRoster, keeps legacyRaw, sets notationV", () => {
  const legacy = "U13A Hurling @ Wildebeests\n10. Morty | 11. Rick\nSubs:\n16. Sub\n18:00\n5 Morty goal\n9 T11 goal\n12 Morty\n44 T corner";
  const rec = migrateLegacyNotation({ raw: legacy } as any, { teamAName: "Racoons", teamBName: "Wildebeests" });
  expect(rec.legacyRaw).toBe(legacy);
  expect(rec.notationV).toBe(2);
  // roster block gone from the new raw:
  expect(rec.raw).not.toMatch(/10\.\s*Morty/);
  expect(rec.raw).not.toMatch(/Subs:/);
  // T<n> rewritten to the opponent team name + number; bare T → team name:
  expect(rec.raw).toMatch(/Wildebeests 11 goal/);
  expect(rec.raw).toMatch(/Wildebeests corner/);
  // your players left as names; the header line is dropped (event-only):
  expect(rec.raw).toMatch(/5 Morty goal/);
  expect(rec.raw).toMatch(/12 Morty/);
  // roster captured as a snapshot:
  expect(rec.usRoster?.players.find((p: any) => p.num === 10)?.name).toBe("Morty");
  expect(rec.usRoster?.players.find((p: any) => p.num === 16)?.role).toBe("sub");
  expect(rec.usRoster?.formation).toEqual([[10, 11]]);
});

it("idempotent: a record already at notationV 2 is returned unchanged", () => {
  const rec = { raw: "18:00\n5 Morty goal", notationV: 2 } as any;
  expect(migrateLegacyNotation(rec, { teamAName: "Racoons", teamBName: "Wildebeests" })).toBe(rec);
});

it("a match with no roster block still migrates events (T→opp) and sets notationV", () => {
  const rec = migrateLegacyNotation({ raw: "18:00\n5 T9 goal" } as any, { teamAName: "Racoons", teamBName: "Wildebeests" });
  expect(rec.raw).toMatch(/Wildebeests 9 goal/);
  expect(rec.notationV).toBe(2);
});

it("lifts the legacy header into label/homeAway/opponent", () => {
  const away = migrateLegacyNotation({ raw: "U13A Hurling @ Wildebeests\n10. Morty\n18:00\n5 Morty goal" } as any, { teamAName: "Racoons", teamBName: "Wildebeests" });
  expect(away.label).toBe("U13A Hurling");
  expect(away.homeAway).toBe("away");
  expect(away.opponent).toBe("Wildebeests");
  expect(away.raw.split("\n")[0]).toMatch(/^18:00/);
  const home = migrateLegacyNotation({ raw: "Senior v Rovers\n12:00\n5 Morty goal" } as any, { teamAName: "Racoons", teamBName: "Rovers" });
  expect(home).toMatchObject({ label: "Senior", homeAway: "home", opponent: "Rovers" });
});

it("rewrites T<n>/bare-T using the header opponent when teamBName is empty", () => {
  const rec = migrateLegacyNotation(
    { raw: "U13A @ Foxes\n10. A\n18:00\n5 T goal\n6 T11 free" } as any,
    { teamAName: "Us", teamBName: "" }
  );
  expect(rec.raw).toMatch(/Foxes goal/);
  expect(rec.raw).toMatch(/Foxes 11 free/);
  expect(rec.opponent).toBe("Foxes");
});

it("backfillNotation migrates a legacy record and is idempotent at notationV 2", () => {
  const legacy = {
    raw: "U13A Hurling @ Wildebeests\n10. Morty | 11. Rick\n18:00\n5 Morty goal\n9 T11 goal",
    myTeam: "Racoons", opponent: "Wildebeests",
  } as any;
  const migrated = backfillNotation(legacy);
  expect(migrated.notationV).toBe(2);
  expect(migrated.usRoster?.players.length).toBeGreaterThan(0);
  expect(migrated.raw).toMatch(/Wildebeests 11 goal/);
  expect(migrated.raw.split("\n")[0]).toMatch(/^18:00/);

  const already = { raw: "18:00\n5 Morty goal", notationV: 2, myTeam: "Racoons", opponent: "Wildebeests" } as any;
  expect(backfillNotation(already)).toBe(already);
});

it("backfillNotation stamps an event-only record without migrating (roster intact)", () => {
  const usRoster = { formation: [[10, 11]], players: [{ num: 10, name: "Morty", role: "starting" }, { num: 11, name: "Rick", role: "starting" }] };
  const rec = {
    raw: "18:00\n5 Morty goal",
    usRoster,
    myTeam: "Racoons", opponent: "Wildebeests",
  } as any;
  const out = backfillNotation(rec);
  expect(out.notationV).toBe(2);
  // roster unchanged — not wiped by a roster-block parse:
  expect(out.usRoster).toEqual(usRoster);
  expect(out.usRoster?.players.length).toBe(2);
  // raw not migrated (first line untouched):
  expect(out.raw).toBe("18:00\n5 Morty goal");
  // no legacyRaw stamped (no migration happened):
  expect(out.legacyRaw).toBeUndefined();
});

it("Defense 2: migrateLegacyNotation never replaces a populated usRoster with an empty one", () => {
  // legacy signal (header + T<n>) but NO roster block; record already carries players
  const usRoster = { formation: [[7]], players: [{ num: 7, name: "Summer", role: "starting" }] };
  const rec = {
    raw: "U13A @ Foxes\n18:00\n5 T9 goal",
    usRoster,
    myTeam: "Racoons", opponent: "Foxes",
  } as any;
  const out = migrateLegacyNotation(rec, { teamAName: "Racoons", teamBName: "Foxes" });
  expect(out.notationV).toBe(2);
  // populated roster preserved (parsed roster block was empty):
  expect(out.usRoster).toEqual(usRoster);
  expect(out.usRoster?.players.length).toBe(1);
  // events still migrated:
  expect(out.raw).toMatch(/Foxes 9 goal/);
});
