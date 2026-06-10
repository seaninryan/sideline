import React from "react";
import { SPORTS } from "@/lib/constants";

// Sport icons shared by the match list rows, the sport filter chips, and the
// teams pages. Hurling/camogie are an outlined hurley (flared grip, tapering
// shaft, broad bas — flat-ish lower edge, bulbous back) with a tape band 3/4
// down and a grip wrap up top, lying "\"; gaelic is a stitched ball with a
// catching hand over it; soccer is the plain ⚽ emoji.
export default function SportIcon({ sport, size = 20, className }: {
  sport: string;
  size?: number;
  className?: string;
}) {
  if (sport === "hurling" || sport === "camogie") {
    // a drawn hurley PNG (transparent background); fits the square box
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src="/hurley.png" alt="" aria-hidden="true" className={className}
        width={size} height={size} style={{ width: size, height: size, objectFit: "contain", display: "block" }} />
    );
  }

  const box: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    width: size, height: size, fontSize: Math.round(size * 0.95), lineHeight: 1,
  };

  if (sport === "soccer") {
    return <span className={className} style={box} aria-hidden="true">⚽</span>;
  }
  if (sport === "gaelic") {
    const bs = Math.round(size * 1.2); // ball a touch bigger so it matches the ⚽ emoji
    return (
      <span className={className} style={{ position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center", width: size, height: size, overflow: "visible" }} aria-hidden="true">
        <svg width={bs} height={bs} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 7.2 L16 10.1 L14.5 14.8 H9.5 L8 10.1 Z" />
          <path d="M12 7.2 V3.5 M16 10.1 L19.3 8.9 M14.5 14.8 L16.8 18 M9.5 14.8 L7.2 18 M8 10.1 L4.7 8.9" />
        </svg>
        <span style={{ position: "absolute", left: "-16%", bottom: "-14%", fontSize: Math.round(size * 0.8), lineHeight: 1 }}>🫱</span>
      </span>
    );
  }

  // unknown sport → a neutral dot
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <circle cx="12" cy="12" r="3" fill="currentColor" />
    </svg>
  );
}

// Sports that have a usable icon (everything currently in SPORTS).
export const ICON_SPORTS = Object.keys(SPORTS);
