// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import LineupView from "@/components/match-tracker/LineupView";

const EMPTY_ROSTER = { players: [], formation: [] };

function props(over: Partial<any> = {}) {
  return {
    editLineup: false,
    setEditLineup: vi.fn(),
    homeRoster: { players: [{ num: 10, name: "Rick", role: "start" }], formation: [[10]] },
    awayRoster: { players: [], formation: [] },
    setHomeRoster: vi.fn(),
    setAwayRoster: vi.fn(),
    EMPTY_ROSTER,
    colorHome: "#111", colorAway: "#222", colorHome2: "#333", colorAway2: "#444",
    homeName: "Wildebeests", awayName: "Racoons",
    formationRows: [[10]],
    chunk: (arr: any[], n: number) => (arr.length ? [arr] : []),
    starters: [{ num: 10, name: "Rick", role: "start" }],
    subs: [],
    missing: [],
    subPick: null,
    setSubPick: vi.fn(),
    tapPlayer: vi.fn(),
    subArrows: () => null,
    playerMarks: () => null,
    scoreFor: () => null,
    ...over,
  } as any;
}

describe("LineupView", () => {
  it("renders both team headers and a starter in the pitch view", () => {
    render(<LineupView {...props()} />);
    expect(screen.getByText("Wildebeests")).toBeTruthy();
    expect(screen.getByText("Racoons")).toBeTruthy();
    expect(screen.getByText("Rick")).toBeTruthy();
  });

  it("tapping a player fires tapPlayer", () => {
    const tapPlayer = vi.fn();
    render(<LineupView {...props({ tapPlayer })} />);
    fireEvent.click(screen.getByText("Rick").closest(".mt-jersey")!);
    expect(tapPlayer).toHaveBeenCalledWith({ num: 10, name: "Rick" }, "pitch", "home");
  });

  it("editLineup mode renders the roster editor with add buttons", () => {
    render(<LineupView {...props({ editLineup: "home" })} />);
    expect(screen.getByText(/Edit Wildebeests/)).toBeTruthy();
    expect(screen.getByText("+ Player")).toBeTruthy();
    expect(screen.getByText("+ Sub")).toBeTruthy();
  });

  it("✎ Edit lineup fires setEditLineup", () => {
    const setEditLineup = vi.fn();
    render(<LineupView {...props({ setEditLineup })} />);
    fireEvent.click(screen.getAllByText("✎ Edit lineup")[0]);
    expect(setEditLineup).toHaveBeenCalledWith("home");
  });
});
