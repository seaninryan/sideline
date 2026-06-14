// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import GameModeView from "@/components/match-tracker/GameModeView";

function props(over: Partial<any> = {}) {
  return {
    phase: "play", halfMarks: [{}], gmStage: { stage: "event" },
    setGmStage: vi.fn(), liveEvents: [{ key: "point", label: "Point" }, { key: "goal", label: "Goal" }],
    effMode: "gaa", homeName: "Wildebeests", awayName: "Racoons",
    colorHome: "#111", colorAway: "#222", colorHome2: "#333", colorAway2: "#444",
    homeColor: "#111", awayColor: "#222", homeColor2: "#333", awayColor2: "#444",
    timelineHA: [], undoTarget: null, canUndo: false,
    evLabel: (k: string) => (k === "point" ? "Point" : k),
    addLive: vi.fn(), pickGmTeam: vi.fn(), gmPicker: () => null,
    onPitchSet: vi.fn(), benchSet: vi.fn(), completeSub: vi.fn(), undoRaw: vi.fn(),
    ...over,
  } as any;
}

describe("GameModeView", () => {
  it("in play, stage=event renders the event buttons + HT/FT + timeline", () => {
    render(<GameModeView {...props()} />);
    expect(screen.getByText("Point")).toBeTruthy();
    expect(screen.getByText("Goal")).toBeTruthy();
    expect(screen.getByText("HT")).toBeTruthy();
    expect(screen.getByText("FT")).toBeTruthy();
  });

  it("tapping an event advances to the team stage", () => {
    const setGmStage = vi.fn();
    render(<GameModeView {...props({ setGmStage })} />);
    fireEvent.click(screen.getByText("Point"));
    expect(setGmStage).toHaveBeenCalledWith({ stage: "team", ev: "point" });
  });

  it("stage=team shows both team buttons and picks one", () => {
    const pickGmTeam = vi.fn();
    render(<GameModeView {...props({ gmStage: { stage: "team", ev: "point" }, pickGmTeam })} />);
    fireEvent.click(screen.getByText("Wildebeests"));
    expect(pickGmTeam).toHaveBeenCalledWith("home");
  });

  it("at full time shows the closed-match note, not event buttons", () => {
    render(<GameModeView {...props({ phase: "over" })} />);
    expect(screen.getByText(/Full time — match closed/)).toBeTruthy();
    expect(screen.queryByText("Point")).toBeNull();
  });
});
