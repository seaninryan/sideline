// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import EditorChrome from "@/components/match-tracker/EditorChrome";

// EditorChrome transitively imports teamStore → the supabase browser client,
// which needs env vars at module load. Stub it (no network) so the suite mounts.
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ from: () => ({}), auth: {}, channel: () => ({}), removeChannel: () => {} }),
}));

// AppHeader calls useRouter() from next/navigation, which throws outside the App
// Router context. Provide an inert router so the chrome can mount under jsdom.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push() {}, replace() {}, refresh() {}, back() {}, forward() {}, prefetch() {} }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

function props(over: Partial<any> = {}) {
  return {
    nw: null,
    userEmail: "sean@example.com", userIsAdmin: false, userUid: "u1",
    onSignOut: vi.fn(), enterShare: vi.fn(),
    remoteConflict: false, doResyncLatest: vi.fn(),
    shareModel: null, setShareModel: vi.fn(),
    modal: null, setModal: vi.fn(), exportText: "", copyExport: vi.fn(),
    importText: "", setImportText: vi.fn(), doImport: vi.fn(),
    share: false, curId: "m1", recordPayload: vi.fn(() => ({})), setShare: vi.fn(),
    doExport: vi.fn(), setNameDisplay: vi.fn(),
    totals: { home: { str: "1-10", g: 1, p: 10 }, away: { str: "0-8", g: 0, p: 8 } },
    homeName: "Wildebeests", awayName: "Racoons",
    homeColor: "#111", homeColor2: "#333", awayColor: "#222", awayColor2: "#444",
    header: { label: "Senior" }, sportLabel: "Hurling", matchDate: "2026-06-14T12:00",
    effMode: "gaa", phase: "play", homeSquadV: "", awaySquadV: "",
    showDetails: false, setShowDetails: vi.fn(), setColorPick: vi.fn(), colorPick: null,
    setMatchDate: vi.fn(), homeTeam: "Wildebeests", onHomeTeamChange: vi.fn(),
    colorHome: "#111", colorHome2: "#333", doSwap: vi.fn(), awayTeam: "Racoons",
    setHeaderField: vi.fn(), colorAway: "#222", colorAway2: "#444",
    sport: "hurling", setReTeam: vi.fn(), setNwTeams: vi.fn(), reTeam: null, nwTeams: [],
    reTeamPickHome: vi.fn(), reTeamCreateHome: vi.fn(),
    reTeamPickAway: vi.fn(), reTeamCreateAway: vi.fn(), reTeamApply: vi.fn(),
    setColorHome: vi.fn(), setColorHome2: vi.fn(), setColorAway: vi.fn(), setColorAway2: vi.fn(),
    usedColors: [],
    tabs: [["details", "Details"], ["game", "Game"], ["lineup", "Lineup"], ["advanced", "Notation"]],
    tab: "details", setTab: vi.fn(), savedMsg: "",
    ...over,
  } as any;
}

describe("EditorChrome", () => {
  it("renders the tab bar and the score header team names", () => {
    render(<EditorChrome {...props()} />);
    expect(screen.getByText("Details")).toBeTruthy();
    expect(screen.getByText("Notation")).toBeTruthy();
    expect(screen.getByText("Wildebeests")).toBeTruthy();
    expect(screen.getByText("Racoons")).toBeTruthy();
  });

  it("clicking a tab fires setTab", () => {
    const setTab = vi.fn();
    render(<EditorChrome {...props({ setTab })} />);
    fireEvent.click(screen.getByText("Lineup"));
    expect(setTab).toHaveBeenCalledWith("lineup");
  });

  it("renders the autosave toast when savedMsg is set", () => {
    render(<EditorChrome {...props({ savedMsg: "Saved" })} />);
    expect(screen.getByText("Saved")).toBeTruthy();
  });

  it("shows the conflict banner + Load latest when remoteConflict is true", () => {
    const doResyncLatest = vi.fn();
    render(<EditorChrome {...props({ remoteConflict: true, doResyncLatest })} />);
    fireEvent.click(screen.getByText("Load latest"));
    expect(doResyncLatest).toHaveBeenCalled();
  });

  it("opens the details panel fields when showDetails is true", () => {
    render(<EditorChrome {...props({ showDetails: true })} />);
    expect(screen.getByText("⇄ Swap")).toBeTruthy();
  });
});
