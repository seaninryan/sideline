import React from "react";

// Shared 2×2 match-stats grid used by the editor (Details tab) and the public
// page, so both read identically. Each stat is a big value + an uppercase label.
export default function StatGrid({ stats }: { stats: { k: string; v: React.ReactNode }[] }) {
  return (
    <div className="sg">
      {stats.map((s, i) => (
        <div className="sg-cell" key={i}><b>{s.v}</b><span>{s.k}</span></div>
      ))}
    </div>
  );
}
