"use client";
import React from "react";
import ScoreChart from "@/components/ScoreChart";
import type { Model } from "@/lib/types";

export default function PublicMatch({ model }: { model: Model }) {
  const m = model;
  return (
    <div className="mt-root" style={{ maxWidth: 760, margin: "0 auto", padding: 16 }}>
      <h1 style={{ textAlign: "center" }}>{m.usName} {m.totals.us.str} – {m.totals.them.str} {m.themName}</h1>
      <p style={{ textAlign: "center" }}>{[m.grade, m.dateStr, m.result].filter(Boolean).join(" · ")}</p>
      <ScoreChart series={m.series} goalDots={m.goalDots} htLine={m.htLine} colorUs={m.colorUs} colorThem={m.colorThem} />
      <h3>Scorers</h3>
      <ul>{m.usScorers.map((s: any, i: number) => <li key={i}>{s.name} — {s.g}-{s.p}</li>)}</ul>
      <h3>Lineup</h3>
      <ul>{m.starters.map((p: any, i: number) => <li key={i}>{p.num ? `#${p.num} ` : ""}{p.name}</li>)}</ul>
    </div>
  );
}
