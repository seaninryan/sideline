import { describe, it, expect } from "vitest";
import { migrateRecordToV3 } from "@/lib/team-link";
import { matchRowView } from "@/lib/match-list";
import type { TeamRecord } from "@/lib/types";

// Regression for the v83 production break: a notationV:2 record that still carries
// us/them and whose home/away ROSTER was never derived (③.1 only ran in the editor),
// after a team-reconcile set homeTeam but NOT homeRoster. migrateRecordToV3 must
// derive homeRoster from usRoster so the scorers resolve.

const DK = { formation: [], players: [
  { num: 13, name: "Jack H", role: "starting" },
  { num: 12, name: "Mikey", role: "starting" },
  { num: 11, name: "DKC", role: "starting" },
] } as any;
const NG = { formation: [], players: [{ num: 5, name: "RWB", role: "starting" }] } as any;

const RAW = "18:16\n24 Jack H\n33 Mikey free\n40 DKC goal\n23 Northern Gaels 5\n42 FT";

describe("migrateRecordToV3", () => {
  it("derives homeRoster from usRoster even when homeTeam is already set (no homeRoster)", () => {
    // Hybrid: us/them present, homeTeam set by a prior reconcile, but homeRoster ABSENT.
    const hybrid: any = {
      raw: RAW, sport: "gaelic", notationV: 2,
      myTeam: "Dunkellen Gaels", opponent: "Northern Gaels", homeAway: "home",
      usRoster: DK, oppRoster: NG,
      homeTeam: "Dunkellen Gaels", awayTeam: "Northern Gaels", // set, but no homeRoster
    };
    const v3 = migrateRecordToV3(hybrid, {});
    expect(v3.notationV).toBe(3);
    expect((v3 as any).myTeam).toBeUndefined();        // us/them stripped
    expect(v3.homeTeam).toBe("Dunkellen Gaels");
    expect(v3.homeRoster?.players.length).toBe(3);     // <-- derived from usRoster (the bug)
    expect(v3.awayRoster?.players.length).toBe(1);
    // and it parses correctly now
    const rv = matchRowView(v3);
    expect(rv.homeStr).toBe("1-2");                    // Jack H point, Mikey free point, DKC goal → 1-2
    expect(rv.homeName).toBe("Dunkellen Gaels");
  });

  it("reconciles name/squad from linked teams (durable source)", () => {
    const teamsById: Record<string, TeamRecord> = {
      t1: { id: "t1", name: "Dunkellen Gaels", squad: "U13 Boys", roster: { formation: [], players: [] } } as any,
      t2: { id: "t2", name: "Northern Gaels", squad: "U13 Boys", roster: { formation: [], players: [] } } as any,
    };
    const rec: any = {
      raw: RAW, sport: "gaelic", notationV: 2, homeTeamId: "t1", awayTeamId: "t2",
      myTeam: "Dunkellen", opponent: "Northern", homeAway: "home", usRoster: DK, oppRoster: NG,
    };
    const v3 = migrateRecordToV3(rec, teamsById);
    expect(v3.homeTeam).toBe("Dunkellen Gaels"); // from team, not the stale "Dunkellen"
    expect(v3.homeSquad).toBe("U13 Boys");
    expect(v3.homeRoster?.players.length).toBe(3); // still derived
  });
});
