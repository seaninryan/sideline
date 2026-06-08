import React from "react";
import { BRAND_HOME, BRAND_CHANT } from "@/lib/constants";

/* Shared brand block for public/HTML surfaces (public match page, sign-in).
   The whole block links home to `/`. The editor top bar keeps its own logo. */
export default function BrandHeader() {
  return (
    <a className="bh" href={BRAND_HOME} aria-label="Here We Go — home">
      <svg className="bh-pill" width="46" height="26" viewBox="0 0 128 70" aria-hidden="true">
        <rect x="4" y="8" width="120" height="54" rx="27" fill="#0c3b2a" stroke="#f5c518" strokeWidth="4" />
        <text x="64" y="48" fontSize="34" textAnchor="middle" style={{ fontFamily: "var(--font-bebas), sans-serif" }}>
          <tspan fill="#f4efe1">HW</tspan><tspan fill="#f5c518">G</tspan>
        </text>
      </svg>
      <span className="bh-brand">
        <span className="bh-wm">HERE WE <span className="bh-go">GO</span></span>
        <span className="bh-chant">{BRAND_CHANT}</span>
      </span>
    </a>
  );
}
