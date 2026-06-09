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
  scoringMode?: "gaa" | "goals";
  autoMode?: boolean;
  sport?: string;
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
  legacyRaw?: string;
  notationV?: number;
  savedAt?: number;
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
  color1?: string;
  color2?: string;
  sport?: string;
  roster: TeamRoster;
  updated_at?: string;
}
