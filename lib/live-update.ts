import type { Model } from "./types";

// True when the displayed score (either side's "G-PP" string) differs between
// two models. Drives the one-shot score-header pulse on a live update; an edit
// that doesn't move the score (lineup tweak, corner, name-privacy) returns false.
export function scoreChanged(prev: Model, next: Model): boolean {
  return (
    prev.totals.us.str !== next.totals.us.str ||
    prev.totals.them.str !== next.totals.them.str
  );
}
