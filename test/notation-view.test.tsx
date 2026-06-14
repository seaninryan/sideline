// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import NotationView from "@/components/match-tracker/NotationView";

function props(over: Partial<any> = {}) {
  return {
    notaView: "blocks" as const,
    setNotaView: vi.fn(),
    canUndo: false,
    undoRaw: vi.fn(),
    setBlkEdit: vi.fn(), setBlkIns: vi.fn(), setLineupEdit: vi.fn(),
    raw: "12:00\n3 Rick goal",
    setRaw: vi.fn(),
    blocks: { list: [{ idx: 0, text: "3 Rick goal" }] },
    blkEdit: null, blkIns: null,
    blkOk: vi.fn(), blkDelete: vi.fn(),
    blkPill: () => <span className="pill" />,
    openBlk: vi.fn(), openInsert: vi.fn(),
    liveEvents: [{ key: "point", label: "Point" }],
    effMode: "gaa" as const,
    evLabel: (k: string) => k,
    colorHome: "#111", colorAway: "#222",
    homeName: "Wildebeests", awayName: "Racoons",
    gmPicker: () => null,
    insCommit: vi.fn(), insPickTeam: vi.fn(),
    buildEventLine: vi.fn(() => ""),
    subWho: (p: any) => p?.name || "",
    whoCtx: vi.fn(() => ({})),
    onPitchSet: vi.fn(), benchSet: vi.fn(),
    notePhantom: false,
    noteLine: vi.fn(() => ""),
    ...over,
  } as any;
}

describe("NotationView", () => {
  it("blocks view renders the block list rows", () => {
    render(<NotationView {...props()} />);
    expect(screen.getByText("3 Rick goal")).toBeTruthy();
    expect(screen.getByText("Notation — tap a line to edit")).toBeTruthy();
  });

  it("tapping a block fires openBlk", () => {
    const openBlk = vi.fn();
    render(<NotationView {...props({ openBlk })} />);
    fireEvent.click(screen.getByText("3 Rick goal"));
    expect(openBlk).toHaveBeenCalledWith({ idx: 0, text: "3 Rick goal" });
  });

  it("the toggle button switches to text mode via setNotaView", () => {
    const setNotaView = vi.fn();
    render(<NotationView {...props({ setNotaView })} />);
    fireEvent.click(screen.getByText("Edit as text"));
    expect(setNotaView).toHaveBeenCalledWith("text");
  });

  it("text view renders the raw textarea", () => {
    render(<NotationView {...props({ notaView: "text" })} />);
    expect(screen.getByText(/Format reminder/)).toBeTruthy();
  });
});
