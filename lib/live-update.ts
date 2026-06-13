import type { Model } from "./types";

// True when the displayed score (either side's "G-PP" string) differs between
// two models. Drives the one-shot score-header pulse on a live update; an edit
// that doesn't move the score (lineup tweak, corner, name-privacy) returns false.
export function scoreChanged(prev: Model, next: Model): boolean {
  return (
    prev.homeTotals?.str !== next.homeTotals?.str ||
    prev.awayTotals?.str !== next.awayTotals?.str
  );
}

// What the editor should do with a Realtime payload for the open match. The
// editor both reads and writes the row, so it must ignore the echo of its own
// saves (incoming savedAt <= the savedAt it last wrote) and never silently
// clobber unsaved local edits (→ "conflict", surfaced as a Load-latest banner).
export type Incoming = "ignore" | "apply" | "conflict" | "deleted";
export function reconcileIncoming(args: {
  event: "UPDATE" | "DELETE";
  dirty: boolean;
  localSavedAt: number;
  incomingSavedAt: number;
}): Incoming {
  if (args.event === "DELETE") return "deleted";
  if (args.incomingSavedAt <= args.localSavedAt) return "ignore"; // our own echo / stale
  return args.dirty ? "conflict" : "apply";
}
