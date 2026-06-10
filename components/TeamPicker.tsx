"use client";
import React, { useState } from "react";
import type { TeamRecord } from "@/lib/types";
import { SPORTS } from "@/lib/constants";
import { contrastOn } from "@/lib/util";
import { filterTeams } from "@/lib/match-sport";

// Type-ahead team picker. `sport` (when set) scopes suggestions to that sport.
// Picking an existing team → onPick; a typed name with no exact match → onCreate.
export default function TeamPicker({
  teams, sport, side, onPick, onCreate,
}: {
  teams: TeamRecord[];
  sport?: string;
  side: "us" | "them";
  onPick: (t: TeamRecord) => void;
  onCreate: (name: string) => void;
}) {
  const [q, setQ] = useState("");
  const matches = filterTeams(teams, q, sport).slice(0, 12);
  const exact = matches.some((t) => t.name.trim().toLowerCase() === q.trim().toLowerCase());
  const fallback = side === "us" ? ["#f5c518", "#1f7a4d"] : ["#c0392b", "#2c5fa8"];
  return (
    <div className="tp">
      <input
        className="nw-in tp-search"
        placeholder="Search or type a new team…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        autoFocus
      />
      <div className="mt-grid tp-list">
        {matches.map((t) => {
          const c1 = t.color1 || fallback[0];
          const c2 = t.color2 || fallback[1];
          return (
            <button key={t.id} className="mt-big nw-team" style={{ background: c1, color: contrastOn(c1), borderColor: c2 }} onClick={() => onPick(t)}>
              {t.sport && SPORTS[t.sport] ? SPORTS[t.sport].emoji + " " : ""}{t.name}
            </button>
          );
        })}
      </div>
      {q.trim() && !exact && (
        <button className="mt-add tp-create" onClick={() => onCreate(q.trim())}>+ Create "{q.trim()}"</button>
      )}
    </div>
  );
}
