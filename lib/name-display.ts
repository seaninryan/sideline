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
  return {
    ...model,
    usScorers: (model.usScorers || []).map(fixScorer),
    themScorers: (model.themScorers || []).map(fixScorer),
    starters: (model.starters || []).map(fixPlayer),
    subs: (model.subs || []).map(fixPlayer),
    missing: (model.missing || []).map(fixPlayer),
    formationRows: (model.formationRows || []).map((row: any[]) => (row || []).map(fixPlayer)),
    timeline: (model.timeline || []).map((t: any) =>
      t && t.scorer ? { ...t, scorer: redactName(t.scorer, t.num, mode) } : t,
    ),
    ...(model.oppRoster
      ? { oppRoster: { ...model.oppRoster, players: model.oppRoster.players.map(fixPlayer) } }
      : {}),
  };
}
