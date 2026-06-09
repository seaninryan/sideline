export type MatchViewKind = "editor" | "public" | "notfound";

// Decide what to render at /m/[id]. The row is only ever fetched through RLS,
// which returns it when the viewer owns it OR it is public — so a returned
// private row that the viewer doesn't own can't actually occur, but we still
// guard for it (returns notfound).
export function resolveMatchView(args: { found: boolean; isOwner: boolean; isPublic: boolean }): MatchViewKind {
  if (!args.found) return "notfound";
  if (args.isOwner) return "editor";
  if (args.isPublic) return "public";
  return "notfound";
}
