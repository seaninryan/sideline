import { describe, it, expect } from "vitest";
import { matchRowView, relativeDate, isUpcoming, isLive } from "@/lib/match-list";
import { SAMPLE_RECORD } from "@/lib/sample";
import type { MatchRecord } from "@/lib/types";

const rec: MatchRecord = SAMPLE_RECORD;

describe("matchRowView", () => {
  const v = matchRowView(rec);
  // SAMPLE_RECORD has homeAway "away" → Racoons are AWAY, so home = Wildebeests.
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

describe("matchRowView squad mapping", () => {
  it("maps usSquad/oppSquad to home/away by venue", () => {
    const rec: any = { raw: "", myTeam: "Racoons", opponent: "Wildebeests", homeAway: "home",
      usSquad: "U12 Boys", oppSquad: "Senior" };
    const v = matchRowView(rec);
    expect(v.homeSquad).toBe("U12 Boys");
    expect(v.awaySquad).toBe("Senior");
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
  it("tomorrow", () => expect(relativeDate("2026-06-10T15:00:00", now)).toBe("Tomorrow"));
  it("future this week → weekday + date", () => expect(relativeDate("2026-06-12T15:00:00", now)).toMatch(/Jun/));
  it("far future → short date", () => expect(relativeDate("2026-08-01T15:00:00", now)).toMatch(/Aug/));
  it("later today (future, same day)", () => expect(relativeDate("2026-06-09T18:00:00", now)).toBe("Later today"));
});

describe("isUpcoming", () => {
  const now = Date.parse("2026-06-09T12:00:00");
  it("a future calendar day is upcoming", () => expect(isUpcoming("2026-06-10T09:00:00", now)).toBe(true));
  it("today is not upcoming (already started)", () => expect(isUpcoming("2026-06-09T18:00:00", now)).toBe(false));
  it("a past day is not upcoming", () => expect(isUpcoming("2026-06-08T09:00:00", now)).toBe(false));
  it("empty / invalid → false", () => { expect(isUpcoming("", now)).toBe(false); expect(isUpcoming("nope", now)).toBe(false); });
});

describe("isLive", () => {
  const NOW = Date.parse("2026-06-11T20:00:00");
  // a started, unfinished match: one scoring event, no FT marker
  const started = { raw: "20:00\n3 Rick goal", myTeam: "Racoons", opponent: "Wildebeests" } as any;
  const finished = { raw: "20:00\n3 Rick goal\nFT", myTeam: "Racoons", opponent: "Wildebeests" } as any;
  const empty = { raw: "", myTeam: "Racoons", opponent: "Wildebeests" } as any;
  const recentIso = "2026-06-11T19:30"; // 30m before NOW
  const staleIso = "2026-06-11T15:00"; // 5h before NOW
  const futureIso = "2026-06-12T19:00"; // tomorrow
  const laterTodayIso = "2026-06-11T22:00"; // 2h after NOW, same calendar day

  it("is live when started, unfinished, kickoff within 3h", () => {
    expect(isLive({ ...started, matchDate: recentIso }, NOW)).toBe(true);
  });
  it("is not live once FT is recorded", () => {
    expect(isLive({ ...finished, matchDate: recentIso }, NOW)).toBe(false);
  });
  it("is not live with no events", () => {
    expect(isLive({ ...empty, matchDate: recentIso }, NOW)).toBe(false);
  });
  it("is not live when both kickoff and last edit are stale", () => {
    expect(isLive({ ...started, matchDate: staleIso }, NOW, staleIso)).toBe(false);
  });
  it("is not live for a future calendar day", () => {
    expect(isLive({ ...started, matchDate: futureIso }, NOW)).toBe(false);
  });
  it("is not live when kickoff is later today (a future time, same day)", () => {
    expect(isLive({ ...started, matchDate: laterTodayIso }, NOW)).toBe(false);
  });
  it("is live when kickoff is missing but it was edited recently", () => {
    expect(isLive({ ...started, matchDate: "" }, NOW, recentIso)).toBe(true);
  });
  it("is live when kickoff is stale but it was edited recently", () => {
    expect(isLive({ ...started, matchDate: staleIso }, NOW, recentIso)).toBe(true);
  });
});
