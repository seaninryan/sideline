"use client";
import React, { useState } from "react";
import type { TeamRecord } from "@/lib/types";
import SportIcon from "@/components/SportIcon";
import { filterTeams } from "@/lib/match-sport";

const RECENT = 5;

// Type-ahead team picker as a compact list. `sport` (when set) scopes
// suggestions; `exclude` drops one team id (e.g. the already-picked side).
// With no query it shows the most-recent teams (+ "Show more"); typing filters
// across all of them. A typed name with no exact match offers "Create '…'".
export default function TeamPicker({
  teams, sport, side, exclude, onPick, onCreate,
}: {
  teams: TeamRecord[];
  sport?: string;
  side: "us" | "them";
  exclude?: string | null;
  onPick: (t: TeamRecord) => void;
  onCreate: (name: string, squad: string) => void;
}) {
  const [q, setQ] = useState("");
  const [squad, setSquad] = useState("");
  const [expanded, setExpanded] = useState(false);

  const all = filterTeams(teams, q, sport).filter((t) => t.id !== exclude);
  const shown = q.trim() ? all : (expanded ? all : all.slice(0, RECENT));
  const exact = all.some((t) => t.name.trim().toLowerCase() === q.trim().toLowerCase());
  const fallback = side === "us" ? ["#f5c518", "#1f7a4d"] : ["#c0392b", "#2c5fa8"];

  return (
    <div className="tp">
      <input
        className="nw-in tp-search"
        placeholder="Search teams, or type a new name…"
        value={q}
        onChange={(e) => { const v = e.target.value; setQ(v); if (!v.trim()) setSquad(""); }}
        autoFocus
      />
      <div className="tp-list">
        {shown.map((t) => (
          <button key={t.id} className="tp-row" onClick={() => onPick(t)}>
            <span className="tp-flag" style={{ background: `linear-gradient(135deg, ${t.color1 || fallback[0]} 50%, ${t.color2 || fallback[1]} 50%)` }} />
            <span className="tp-name">{t.name}{t.squad ? <span className="tp-squad">{t.squad}</span> : null}</span>
            {t.sport && <SportIcon sport={t.sport} size={16} />}
          </button>
        ))}
        {!shown.length && <p className="mt-note" style={{ margin: "6px 2px" }}>No matching teams.</p>}
      </div>
      {!q.trim() && !expanded && all.length > RECENT && (
        <button className="tp-more" onClick={() => setExpanded(true)}>Show all {all.length} teams</button>
      )}
      {q.trim() && !exact && (
        <div className="tp-createbox">
          <input className="nw-in" placeholder="Squad (optional, e.g. U12 Boys)" value={squad} onChange={(e) => setSquad(e.target.value)} />
          <button className="mt-add tp-create" onClick={() => onCreate(q.trim(), squad.trim())}>+ Create &quot;{q.trim()}{squad.trim() ? ` · ${squad.trim()}` : ""}&quot;</button>
        </div>
      )}
    </div>
  );
}
