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
// poster image. Dual-keyed during ③.2: "us"|"them" reads timeline + usScorers/
// themScorers; "home"|"away" reads timelineHA + homeScorers/awayScorers. The
// us/them branch is removed in ③.2b once the editor migrates.
export function lineupBadges(
  m: Partial<Pick<Model, "timeline" | "usScorers" | "themScorers" | "timelineHA" | "homeScorers" | "awayScorers">>,
  side: "us" | "them" | "home" | "away",
  num: number,
): LineupBadges {
  const venue = side === "home" || side === "away";
  const scorers = venue
    ? (side === "home" ? m.homeScorers : m.awayScorers)
    : (side === "them" ? m.themScorers : m.usScorers);
  const tl = (venue ? m.timelineHA : m.timeline) || [];
  const sc = (scorers || []).find((s: any) => s.num === num && (s.g || s.p));
  let subOn = false, subOff = false, og = false;
  const cards: string[] = [];
  tl.forEach((t: any) => {
    const tSide = venue
      ? (t.side === "away" ? "away" : "home")
      : (t.side === "them" ? "them" : "us");
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
