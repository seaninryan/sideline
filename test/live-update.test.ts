import { describe, it, expect } from "vitest";
import { scoreChanged } from "@/lib/live-update";
import { reconcileIncoming } from "@/lib/live-update";

// Minimal Model-shaped fixture: scoreChanged reads homeTotals.str / awayTotals.str
// (the home/away view buildModel emits — ③.2a).
const mk = (homeStr: string, awayStr: string): any => ({
  homeTotals: { str: homeStr }, awayTotals: { str: awayStr },
});

describe("scoreChanged", () => {
  it("is false when both score strings are identical", () => {
    expect(scoreChanged(mk("1-05", "0-07"), mk("1-05", "0-07"))).toBe(false);
  });

  it("is true when the home score string changes", () => {
    expect(scoreChanged(mk("1-05", "0-07"), mk("1-06", "0-07"))).toBe(true);
  });

  it("is true when the away score string changes", () => {
    expect(scoreChanged(mk("1-05", "0-07"), mk("1-05", "1-07"))).toBe(true);
  });
});

describe("reconcileIncoming", () => {
  const base = { dirty: false, localSavedAt: 100, incomingSavedAt: 200 } as const;

  it("DELETE → deleted", () => {
    expect(reconcileIncoming({ ...base, event: "DELETE" })).toBe("deleted");
  });
  it("our own echo (incoming <= local) → ignore", () => {
    expect(reconcileIncoming({ event: "UPDATE", dirty: false, localSavedAt: 200, incomingSavedAt: 200 })).toBe("ignore");
    expect(reconcileIncoming({ event: "UPDATE", dirty: false, localSavedAt: 200, incomingSavedAt: 150 })).toBe("ignore");
  });
  it("newer remote update, no local edits → apply", () => {
    expect(reconcileIncoming({ event: "UPDATE", dirty: false, localSavedAt: 100, incomingSavedAt: 200 })).toBe("apply");
  });
  it("newer remote update with unsaved local edits → conflict", () => {
    expect(reconcileIncoming({ event: "UPDATE", dirty: true, localSavedAt: 100, incomingSavedAt: 200 })).toBe("conflict");
  });
  it("DELETE wins even when dirty", () => {
    expect(reconcileIncoming({ event: "DELETE", dirty: true, localSavedAt: 100, incomingSavedAt: 0 })).toBe("deleted");
  });
});
