import React from "react";
import Jersey from "@/components/Jersey";
import { gpTotal } from "@/lib/util";

// Combined scorers leaderboard for both teams, ordered by total. The kit jersey
// (left) shows which team. Mode-aware columns: GAA shows Goals / Points / Frees
// / Total; soccer shows just Goals. Shared by the editor + public page.
export default function Scorers({ us = [], them = [], colorUs, colorUs2, colorThem, colorThem2, mode = "gaa" }: {
  us?: any[]; them?: any[];
  colorUs: string; colorUs2: string; colorThem: string; colorThem2: string;
  mode?: string;
}) {
  const gaa = mode !== "goals";
  const rows = [
    ...us.map((s) => ({ ...s, c1: colorUs, c2: colorUs2 })),
    ...them.map((s) => ({ ...s, c1: colorThem, c2: colorThem2 })),
  ].sort((a, b) => gpTotal(b.g, b.p, mode) - gpTotal(a.g, a.p, mode));

  if (!rows.length) return <p className="sc-empty">No scorers recorded.</p>;

  return (
    <table className="sc-tbl">
      <thead>
        <tr>
          <th>Player</th>
          {gaa ? <><th>Goals</th><th>Points</th><th>Frees</th><th>Total</th></> : <th>Goals</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((s, i) => (
          <tr key={i}>
            <td>
              <div className="sc-player"><Jersey c1={s.c1} c2={s.c2} num={s.num || undefined} size={22} /><span className="sc-name">{s.name}</span></div>
            </td>
            {gaa ? (
              <>
                <td className="n">{s.g}</td>
                <td className="n">{s.p}</td>
                <td className="sc-f">{s.frees || "–"}</td>
                <td className="n">{s.g}-{s.p}</td>
              </>
            ) : (
              <td className="n">{s.g}</td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
