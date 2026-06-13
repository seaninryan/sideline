export type NameDisplay = "full" | "initials" | "none";

export interface Settings {
  myTeam?: string;
  scoringMode?: "gaa" | "goals";
  sport?: string;
  label?: string;
  homeAway?: "home" | "away";
  opponent?: string;
  usRoster?: TeamRoster;
  oppRoster?: TeamRoster;
}

export interface MatchRecord {
  raw: string;
  matchDate?: string;
  date?: string;
  myTeam?: string;
  sport: string;
  colorUs?: string;
  colorUs2?: string;
  colorThem?: string;
  colorThem2?: string;
  nameDisplay?: NameDisplay;
  homeTeamId?: string | null;
  awayTeamId?: string | null;
  oppRoster?: TeamRoster;
  usRoster?: TeamRoster;
  label?: string;
  homeAway?: "home" | "away";
  opponent?: string;
  usSquad?: string;     // squad sub-line, snapshotted from the linked teams at link time
  oppSquad?: string;
  // ③.1 — home/away scaffold, derived on save from us/them + homeAway (torn out in ③.4).
  homeTeam?: string;
  awayTeam?: string;
  colorHome?: string;
  colorHome2?: string;
  colorAway?: string;
  colorAway2?: string;
  homeRoster?: TeamRoster;
  awayRoster?: TeamRoster;
  homeSquad?: string;
  awaySquad?: string;
  legacyRaw?: string;
  notationV?: number;
  savedAt?: number;
}

export interface Profile {
  id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  is_admin: boolean;
  created_at: string;
}

export interface MatchRow {
  id: string;
  owner?: string;
  is_public: boolean;
  short_code?: string | null;
  name_display: NameDisplay;
  match_date: string | null;
  my_team: string | null;
  opponent: string | null;
  sport: string | null;
  data: MatchRecord;
  updated_at?: string;
}

export interface ParsedMatch {
  mode: "gaa" | "goals";
  opp: string | null;
  totals: { us: { g: number; p: number; str: string }; them: { g: number; p: number; str: string } };
  result: string;
  scorers: any[];
  roster: any[];
  formationRows: any[];
  series: any[];
  goalDots: any[];
  chartMarkers: any[];
  htLine: any;
  leadChanges: number;
  timesLevel: number;
  maxLead: number;
  maxLeadSide: string | null;
  warnings: any[];
  scoring: any[];
  notes: any[];
  halfMarks: any[];
  [k: string]: any;
}

export type Model = Record<string, any>;

export interface TeamRoster {
  formation: number[][];                 // rows of shirt numbers (starting XV/XI layout)
  players: { num: number; name: string; role: "starting" | "sub" }[];
}

export interface TeamRecord {
  id: string;
  owner?: string;
  short_code?: string | null;
  name: string;
  squad?: string;       // squad label, part of identity: (sport, name, squad). "" = plain club team.
  color1?: string;
  color2?: string;
  sport?: string;
  roster: TeamRoster;
  is_public?: boolean;
  name_display?: NameDisplay;
  listed?: boolean;     // when public, also shown in the public-teams feed
  updated_at?: string;
}
