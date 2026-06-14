"use client";
import React from "react";
import StatGrid from "@/components/StatGrid";
import ScoreChart from "@/components/ScoreChart";
import Scorers from "@/components/Scorers";
import Timeline from "@/components/Timeline";
import { htScore } from "@/lib/half-time";

export interface DetailsViewProps {
  parsed: any;                 // ParsedMatch (warnings/series/leadChanges/timesLevel/maxLead)
  effMode: "gaa" | "goals";
  homeName: string;
  awayName: string;
  maxLeadVenue: "home" | "away" | null;
  homeSeries: any[];
  goalDots: any[];
  chartMarkers: any[];
  htLine: any;
  halfMarks: any[];
  homeScorers: any[];
  awayScorers: any[];
  timelineHA: any[];
  homeColor: string;
  awayColor: string;
  homeColor2: string;
  awayColor2: string;
}

// Read-only Details view: match stats, score-progression chart, scorers, timeline.
// Extracted from MatchTracker (decomposition ③) — behaviour-identical; first typed view.
export default function DetailsView({
  parsed, effMode, homeName, awayName, maxLeadVenue,
  homeSeries, goalDots, chartMarkers, htLine, halfMarks,
  homeScorers, awayScorers, timelineHA,
  homeColor, awayColor, homeColor2, awayColor2,
}: DetailsViewProps) {
  return (
    <>
      {parsed.warnings.length > 0 && (
        <div className="mt-warn">
          <b>Heads up — check {parsed.warnings.length} {parsed.warnings.length === 1 ? "entry" : "entries"}.</b>
          <span> {parsed.warnings.map((w: any) => `${w.minute}' — ${w.msg}`).join("; ")}.</span>
        </div>
      )}
      <StatGrid stats={[
        { k: "Half-time", v: htScore(parsed.series, effMode) },
        { k: "Lead changes", v: parsed.leadChanges },
        { k: "Times level", v: parsed.timesLevel },
        { k: `Biggest lead${maxLeadVenue ? " · " + (maxLeadVenue === "home" ? homeName : awayName) : ""}`, v: parsed.maxLead },
      ]} />

      <p className="mt-h">Score progression</p>
      <div style={{ width: "100%" }}>
        <ScoreChart series={homeSeries} goalDots={goalDots} chartMarkers={chartMarkers} htLine={htLine} colorHome={homeColor} colorAway={awayColor} mode={effMode} />
      </div>

      <p className="mt-h" style={{ marginTop: 18 }}>Scorers</p>
      <Scorers home={homeScorers} away={awayScorers} colorHome={homeColor} colorHome2={homeColor2} colorAway={awayColor} colorAway2={awayColor2} mode={effMode} />

      <p className="mt-h" style={{ marginTop: 18 }}>Timeline</p>
      <Timeline timeline={timelineHA} halfMarks={halfMarks} colorHome={homeColor} colorHome2={homeColor2} colorAway={awayColor} colorAway2={awayColor2} nameHome={homeName} nameAway={awayName} />
    </>
  );
}
