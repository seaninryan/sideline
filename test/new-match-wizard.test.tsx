// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import NewMatchWizard from "@/components/match-tracker/NewMatchWizard";

function props(over: Partial<any> = {}) {
  return {
    nw: { stage: "date", date: "2026-06-14T12:00", sport: "", home: null, away: null },
    setNw: vi.fn(),
    nwTeams: [{ id: "t1", name: "Racoons", sport: "hurling" }],
    nwPickHome: vi.fn(), nwCreateHome: vi.fn(),
    nwPickAway: vi.fn(), nwCreateAway: vi.fn(),
    finishNew: vi.fn(), onCancel: vi.fn(),
    ...over,
  } as any;
}

describe("NewMatchWizard", () => {
  it("date stage renders the prompts + sport buttons", () => {
    render(<NewMatchWizard {...props()} />);
    expect(screen.getByText(/First, choose when the match will be/)).toBeTruthy();
    expect(screen.getByText(/…and which sport/)).toBeTruthy();
  });

  it("Cancel fires onCancel", () => {
    const onCancel = vi.fn();
    render(<NewMatchWizard {...props({ onCancel })} />);
    fireEvent.click(screen.getByText("✕ Cancel"));
    expect(onCancel).toHaveBeenCalled();
  });

  it("home stage shows the team picker and picks a team", () => {
    const nwPickHome = vi.fn();
    render(<NewMatchWizard {...props({ nw: { stage: "home", date: "2026-06-14T12:00", sport: "hurling", home: null, away: null }, nwPickHome })} />);
    fireEvent.click(screen.getByText("Racoons"));
    expect(nwPickHome).toHaveBeenCalled();
  });

  it("away stage Create button fires finishNew when both teams set", () => {
    const finishNew = vi.fn();
    render(<NewMatchWizard {...props({ nw: { stage: "away", date: "2026-06-14T12:00", sport: "hurling", home: { id: "t1", name: "Racoons" }, away: { id: "t2", name: "Wildebeests" } }, finishNew })} />);
    fireEvent.click(screen.getByText("Create match →"));
    expect(finishNew).toHaveBeenCalled();
  });
});
