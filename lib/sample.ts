import type { MatchRecord, TeamRoster } from "@/lib/types";

// Event-only notation (no header / no roster in the text — those live on the record + teams).
// Every score is a discrete event; totals are COUNTED. Reproduces Racoons 2-6, Wildebeests 2-7.
export const SAMPLE = `18:21
23 Rick free
24 Rick free
25 Wildebeests 11
30 Rick goal
31 Wildebeests free
32 Rick free
33 Morty
37 Wildebeests free
38 Wildebeests goal
43 HT
18:50
51 Wildebeests free
53 Rick goal
55 Wildebeests goal
56 Rick free
58 Wildebeests
60 Wildebeests free
62 Wildebeests
64 Racoons
66 FT`;

const RACOONS: TeamRoster = {
  formation: [[1], [2, 3, 4], [5, 6, 7], [8, 9], [10, 11, 12], [13, 14, 15]],
  players: [
    { num: 1, name: "Birdperson", role: "starting" },
    { num: 2, name: "Jerry S", role: "starting" }, { num: 3, name: "Beth S", role: "starting" }, { num: 4, name: "Summer", role: "starting" },
    { num: 5, name: "Squanchy", role: "starting" }, { num: 6, name: "Mr Poopybutthole", role: "starting" }, { num: 7, name: "Gearhead", role: "starting" },
    { num: 8, name: "Snowball", role: "starting" }, { num: 9, name: "Jessica", role: "starting" },
    { num: 10, name: "Morty", role: "starting" }, { num: 11, name: "Rick", role: "starting" }, { num: 12, name: "Noob Noob", role: "starting" },
    { num: 13, name: "Tammy", role: "starting" }, { num: 14, name: "Kyle", role: "starting" }, { num: 15, name: "Zeep", role: "starting" },
    { num: 17, name: "Pencilvester", role: "sub" }, { num: 18, name: "Sleepy Gary", role: "sub" },
  ],
};

// The canonical match record the editor seeds with and tests build on.
export const SAMPLE_RECORD: MatchRecord = {
  raw: SAMPLE,
  myTeam: "Racoons", opponent: "Wildebeests", label: "U13A Hurling", homeAway: "away",
  sport: "hurling",
  colorUs: "#f5c518", colorUs2: "#1f7a4d", colorThem: "#c0392b", colorThem2: "#2c5fa8",
  nameDisplay: "full",
  usRoster: RACOONS,
  oppRoster: { formation: [], players: [] },
  matchDate: "2026-06-02T18:21",
  notationV: 2,
};
