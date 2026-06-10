import React from "react";
import { contrastOn } from "@/lib/util";

// A team jersey shirt filled with the kit's primary colour, trimmed in the
// secondary, with an optional shirt number. Shared by the lineup pitch
// (RosterPitch) and the scoreboard (ScoreHeader).
export default function Jersey({ c1, c2, num, size = 40 }: {
  c1: string;
  c2: string;
  num?: number;
  size?: number;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" style={{ display: "block" }}>
      <path
        d="M17 6 C19 9 29 9 31 6 L37 8 L47 15 L41 25 L35 21 L35 43 L13 43 L13 21 L7 25 L1 15 L11 8 Z"
        fill={c1} stroke={c2} strokeWidth="2.5" strokeLinejoin="round"
      />
      {num != null && (
        <text x="24" y="34" textAnchor="middle" fontSize="16" fontFamily="var(--font-bebas), sans-serif" fill={contrastOn(c1)}>{num}</text>
      )}
    </svg>
  );
}
