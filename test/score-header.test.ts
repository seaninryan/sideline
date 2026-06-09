import { describe, it, expect } from "vitest";
import { scoreHeaderResult } from "@/lib/score-header";

describe("scoreHeaderResult", () => {
  it("level → tie", () => {
    expect(scoreHeaderResult({ homeTotal: 13, awayTotal: 13, phase: "play" })).toEqual({ kind: "tie", margin: 0 });
  });
  it("home ahead in play → lead/home with margin", () => {
    expect(scoreHeaderResult({ homeTotal: 14, awayTotal: 12, phase: "play" })).toEqual({ kind: "lead", side: "home", margin: 2 });
  });
  it("away ahead in play → lead/away", () => {
    expect(scoreHeaderResult({ homeTotal: 9, awayTotal: 13, phase: "ht" })).toEqual({ kind: "lead", side: "away", margin: 4 });
  });
  it("home ahead at full time → won/home", () => {
    expect(scoreHeaderResult({ homeTotal: 20, awayTotal: 14, phase: "over" })).toEqual({ kind: "won", side: "home", margin: 6 });
  });
  it("away ahead at full time → won/away", () => {
    expect(scoreHeaderResult({ homeTotal: 1, awayTotal: 3, phase: "over" })).toEqual({ kind: "won", side: "away", margin: 2 });
  });
  it("level at full time → tie (not won)", () => {
    expect(scoreHeaderResult({ homeTotal: 10, awayTotal: 10, phase: "over" })).toEqual({ kind: "tie", margin: 0 });
  });
});
