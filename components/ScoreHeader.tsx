"use client";
import React from "react";
import { scoreHeaderResult } from "@/lib/score-header";
import Jersey from "@/components/Jersey";

// Shared score header for the editor (persistent, above the tabs) and the public page.
// Teams are passed already ordered home-left / away-right. Result indicator is neutral:
// "Leading by N" (in play) / "Won by N" (full time) under the leader, or "Tie" centred.
export default function ScoreHeader({
  homeName, awayName, homeStr, awayStr, homeColors, awayColors, grade, dateStr, homeTotal, awayTotal, phase, action,
}: {
  homeName: string; awayName: string;
  homeStr: string; awayStr: string;
  homeColors: [string, string]; awayColors: [string, string];
  grade: string; dateStr: string;
  homeTotal: number; awayTotal: number; phase: string;
  action?: React.ReactNode;
}) {
  const r = scoreHeaderResult({ homeTotal, awayTotal, phase });
  const flag = (c: [string, string]) => <Jersey c1={c[0]} c2={c[1]} size={40} />;
  const showResult = phase !== "pre"; // a not-yet-started match isn't "leading" or "tied"
  const lead = (side: "home" | "away") =>
    showResult && r.kind !== "tie" && r.side === side
      ? <span className="sh-lead">{r.kind === "won" ? "Won by" : "Leading by"} {r.margin}</span>
      : null;
  return (
    <div className="sh">
      {action && <div className="sh-action">{action}</div>}
      {dateStr && <div className="sh-meta">{dateStr}</div>}
      <div className="sh-row">
        <div className="sh-team">{flag(homeColors)}<div className="sh-nm">{homeName}</div><div className="sh-sc">{homeStr}</div>{lead("home")}</div>
        {showResult && r.kind === "tie" ? <span className="sh-tie">TIE</span> : <span className="sh-dash">–</span>}
        <div className="sh-team">{flag(awayColors)}<div className="sh-nm">{awayName}</div><div className="sh-sc">{awayStr}</div>{lead("away")}</div>
      </div>
    </div>
  );
}
