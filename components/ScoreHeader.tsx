"use client";
import React from "react";
import { scoreHeaderResult } from "@/lib/score-header";

// Shared score header for the editor (persistent, above the tabs) and the public page.
// Teams are passed already ordered home-left / away-right. Result indicator is neutral:
// "Leading by N" (in play) / "Won by N" (full time) under the leader, or "Tie" centred.
export default function ScoreHeader({
  homeName, awayName, homeStr, awayStr, homeColors, awayColors, grade, dateStr, homeTotal, awayTotal, phase,
}: {
  homeName: string; awayName: string;
  homeStr: string; awayStr: string;
  homeColors: [string, string]; awayColors: [string, string];
  grade: string; dateStr: string;
  homeTotal: number; awayTotal: number; phase: string;
}) {
  const r = scoreHeaderResult({ homeTotal, awayTotal, phase });
  const flag = (c: [string, string]) => (
    <span className="sh-flag"><i style={{ background: c[0] }} /><i style={{ background: c[1] }} /></span>
  );
  const lead = (side: "home" | "away") =>
    r.kind !== "tie" && r.side === side
      ? <span className="sh-lead">{r.kind === "won" ? "Won by" : "Leading by"} {r.margin}</span>
      : null;
  return (
    <div className="sh">
      <div className="sh-meta"><span>{(grade || "Match").toUpperCase()}</span><span>{dateStr}</span></div>
      <div className="sh-row">
        <div className="sh-team">{flag(homeColors)}<div className="sh-nm">{homeName}</div><div className="sh-sc">{homeStr}</div>{lead("home")}</div>
        {r.kind === "tie" ? <span className="sh-tie">TIE</span> : <span className="sh-dash">–</span>}
        <div className="sh-team">{flag(awayColors)}<div className="sh-nm">{awayName}</div><div className="sh-sc">{awayStr}</div>{lead("away")}</div>
      </div>
    </div>
  );
}
