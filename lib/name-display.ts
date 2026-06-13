import type { Model, NameDisplay, TeamRoster } from "@/lib/types";

export function redactName(name: string, num: number | undefined, mode: NameDisplay): string {
  if (mode === "full" || !name) return name;
  if (mode === "initials") {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    return parts.map((w) => w[0].toUpperCase() + ".").join("");
  }
  return num != null ? `#${num}` : "Player";
}

// Redact a team roster's player names for a public team page (the formation is
// just shirt numbers, so only player names need touching). `full` is a no-op.
export function redactRoster(roster: TeamRoster, mode: NameDisplay): TeamRoster {
  if (mode === "full") return roster;
  return { ...roster, players: roster.players.map((p) => ({ ...p, name: redactName(p.name, p.num, mode) })) };
}

export function applyNameDisplay(model: Model, mode: NameDisplay): Model {
  if (mode === "full") return model;
  const fixPlayer = (p: any) => (p ? { ...p, name: redactName(p.name, p.num, mode) } : p);
  const fixScorer = (s: any) =>
    s ? { ...s, name: redactName(s.name, s.num, mode), scorer: s.scorer ? redactName(s.scorer, s.num, mode) : s.scorer } : s;
  // A timeline event can name players in several fields: a score's `scorer`, a
  // card's `who`, and a sub's `on`/`off` — redact each (blank/team-level stay blank).
  const fixTimeline = (t: any) => {
    if (!t) return t;
    let r = t;
    if (t.scorer) r = { ...r, scorer: redactName(t.scorer, t.num, mode) };
    if (t.who) r = { ...r, who: redactName(t.who, t.num, mode) };
    if (t.on) r = { ...r, on: redactName(t.on, t.onNum, mode) };
    if (t.off) r = { ...r, off: redactName(t.off, t.offNum, mode) };
    return r;
  };
  return {
    ...model,
    homeScorers: (model.homeScorers || []).map(fixScorer),
    awayScorers: (model.awayScorers || []).map(fixScorer),
    timelineHA: (model.timelineHA || []).map(fixTimeline),
    ...(model.homeRoster
      ? { homeRoster: { ...model.homeRoster, players: model.homeRoster.players.map(fixPlayer) } }
      : {}),
    ...(model.awayRoster
      ? { awayRoster: { ...model.awayRoster, players: model.awayRoster.players.map(fixPlayer) } }
      : {}),
  };
}
