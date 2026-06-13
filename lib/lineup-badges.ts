import type { Model } from "./types";

export interface LineupBadges {
  subOn: boolean;
  subOff: boolean;
  cards: string[];
  og: boolean;
  score: { g: number; p: number } | null;
}

// Side-aware lineup badges for ONE player (by shirt number) on ONE side.
// Single source of truth shared by the editor lineup, the public page, and the
// poster image. Reads timelineHA + homeScorers/awayScorers (home/away only).
export function lineupBadges(
  m: Partial<Pick<Model, "timelineHA" | "homeScorers" | "awayScorers">>,
  side: "home" | "away",
  num: number,
): LineupBadges {
  const scorers = side === "home" ? m.homeScorers : m.awayScorers;
  const sc = (scorers || []).find((s: any) => s.num === num && (s.g || s.p));
  let subOn = false, subOff = false, og = false;
  const cards: string[] = [];
  (m.timelineHA || []).forEach((t: any) => {
    const tSide = t.side === "away" ? "away" : "home";
    if (t.kind === "sub" && tSide === side) {
      if (t.onNum === num) subOn = true;
      if (t.offNum === num) subOff = true;
    } else if (t.kind === "card" && tSide === side && t.num === num) {
      cards.push(t.card);
    } else if (t.kind === "score" && t.og && t.ogNum === num && tSide !== side) {
      og = true;
    }
  });
  return { subOn, subOff, cards, og, score: sc ? { g: sc.g, p: sc.p } : null };
}
