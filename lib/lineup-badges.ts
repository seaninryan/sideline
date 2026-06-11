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
// poster image — all of which previously hand-rolled (and diverged on) this.
// Reads only timeline + per-side scorer lists; the editor builds these in the
// identical shape (MatchTracker timeline/usScorers/themScorers).
export function lineupBadges(
  m: Pick<Model, "timeline" | "usScorers" | "themScorers">,
  side: "us" | "them",
  num: number,
): LineupBadges {
  const scorers = side === "them" ? m.themScorers : m.usScorers;
  const sc = (scorers || []).find((s: any) => s.num === num && (s.g || s.p));
  let subOn = false, subOff = false, og = false;
  const cards: string[] = [];
  (m.timeline || []).forEach((t: any) => {
    const tSide = t.side === "them" ? "them" : "us";
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
