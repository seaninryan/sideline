// @vitest-environment jsdom
import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import DetailsView from "@/components/match-tracker/DetailsView";

const baseProps = {
  parsed: { warnings: [], series: [], leadChanges: 2, timesLevel: 3, maxLead: 5 },
  effMode: "gaa" as const,
  homeName: "Wildebeests",
  awayName: "Racoons",
  maxLeadVenue: "home" as const,
  homeSeries: [],
  goalDots: [],
  chartMarkers: [],
  htLine: null,
  halfMarks: [],
  homeScorers: [{ num: 10, name: "Rick", g: 1, p: 2, frees: 0 }],
  awayScorers: [],
  timelineHA: [],
  homeColor: "#111", awayColor: "#222", homeColor2: "#333", awayColor2: "#444",
};

describe("DetailsView", () => {
  it("renders the stats + section headers without throwing", () => {
    render(<DetailsView {...baseProps} />);
    expect(screen.getByText("Score progression")).toBeTruthy();
    expect(screen.getByText("Scorers")).toBeTruthy();
    expect(screen.getByText("Timeline")).toBeTruthy();
    expect(screen.getByText("Lead changes")).toBeTruthy();
    // biggest-lead names the home side when maxLeadVenue is "home"
    expect(screen.getByText(/Biggest lead · Wildebeests/)).toBeTruthy();
  });

  it("renders a scorer passed in homeScorers", () => {
    render(<DetailsView {...baseProps} />);
    expect(screen.getAllByText("Rick").length).toBeGreaterThan(0);
  });

  it("shows the warnings banner when parsed.warnings is non-empty", () => {
    render(<DetailsView {...baseProps} parsed={{ ...baseProps.parsed, warnings: [{ minute: 23, msg: "couldn't tell whose score" }] }} />);
    expect(screen.getByText(/Heads up — check 1 entry/)).toBeTruthy();
  });
});
