import React from "react";

// little flag on a pole — the GAA goal (green) / point (white) motif, matching the chart
export function Flag({ fill }: { fill: string }) {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true" style={{ flex: "none" }}>
      <line x1="3.5" y1="1.5" x2="3.5" y2="14.5" stroke="#3a3a3a" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M3.5 2 L13 4.4 L3.5 7.6 Z" fill={fill} stroke="#3a3a3a" strokeWidth="0.9" strokeLinejoin="round" />
    </svg>
  );
}

// icon for a live-entry event button; goal/point are mode-aware (GAA flags vs a soccer ball)
export function evIcon(key: string, mode?: string): React.ReactNode {
  switch (key) {
    case "goal": case "goalfree": case "og": return mode === "goals" ? <span aria-hidden="true">⚽</span> : <Flag fill="#1f9d3f" />;
    case "point": case "pointfree": case "point65": case "point45": return <Flag fill="#fbfbf5" />;
    case "point2": return <Flag fill="#e67e22" />;
    case "yellow": return <span aria-hidden="true">🟨</span>;
    case "red": return <span aria-hidden="true">🟥</span>;
    case "corner": return <span aria-hidden="true">🚩</span>;
    case "sub": return <span aria-hidden="true">🔁</span>;
    case "half": return <span aria-hidden="true">▶️</span>;
    case "ht": return <span aria-hidden="true">⏸️</span>;
    case "ft": return <span aria-hidden="true">🏁</span>;
    default: return null;
  }
}
