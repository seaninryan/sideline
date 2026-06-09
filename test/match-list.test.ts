import { describe, it, expect } from "vitest";
import { matchRowView, relativeDate } from "@/lib/match-list";
import { SAMPLE } from "@/lib/sample";
import type { MatchRecord } from "@/lib/types";

const rec: MatchRecord = {
  raw: SAMPLE, myTeam: "Racoons", sport: "hurling", autoMode: true,
  colorUs: "#f5c518", colorUs2: "#1f7a4d", colorThem: "#c0392b", colorThem2: "#2c5fa8",
};

describe("matchRowView", () => {
  const v = matchRowView(rec);
  // SAMPLE header is "U13A Hurling @ Wildebeests" → Racoons are AWAY, so home = Wildebeests.
  it("orders home team (opponent here) on the home side", () => {
    expect(v.homeName).toBe("Wildebeests");
    expect(v.awayName).toBe("Racoons");
  });
  it("carries each side's score string", () => {
    // canonical SAMPLE: Racoons 2-6, Wildebeests 2-7
    expect(v.homeStr).toBe("2-7");
    expect(v.awayStr).toBe("2-6");
  });
  it("marks the higher total as the winner (home here — Racoons lose)", () => {
    expect(v.winner).toBe("home");
  });
  it("resolves the sport emoji", () => {
    expect(v.sportEmoji).toBe("🏑");
  });
  it("assigns kit colours to the correct side", () => {
    expect(v.homeColors).toEqual(["#c0392b", "#2c5fa8"]); // them = home
    expect(v.awayColors).toEqual(["#f5c518", "#1f7a4d"]); // us = away
  });
});

describe("matchRowView draw", () => {
  it("returns draw when totals are equal", () => {
    const drawRec: MatchRecord = { raw: "Home v Away\n12:00\n5 Home\n6 Away", myTeam: "Home", sport: "soccer" };
    expect(matchRowView(drawRec).winner).toBe("draw");
  });
});

describe("relativeDate", () => {
  const now = Date.parse("2026-06-09T12:00:00");
  it("minutes", () => expect(relativeDate("2026-06-09T11:30:00", now)).toBe("30m ago"));
  it("hours", () => expect(relativeDate("2026-06-09T10:00:00", now)).toBe("2h ago"));
  it("yesterday", () => expect(relativeDate("2026-06-08T09:00:00", now)).toBe("Yesterday"));
  it("falls back to a short date for older", () => {
    expect(relativeDate("2026-05-01T09:00:00", now)).toMatch(/May/);
  });
  it("empty input → empty string", () => expect(relativeDate("", now)).toBe(""));
  it("invalid date → empty string", () => expect(relativeDate("not-a-date", now)).toBe(""));
  it("just now under a minute", () => expect(relativeDate("2026-06-09T11:59:30", now)).toBe("just now"));
});
