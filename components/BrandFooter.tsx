import React from "react";
import { BRAND_SITE, BRAND_SITE_URL, BRAND_CHANT, APP_VERSION } from "@/lib/constants";

/* Shared brand footer used on every screen (landing, editor, public match,
   teams). Green band with the HWG pill, a clickable herewego.ie link, the
   chant, and a subtle version line so bug reports can quote the build. */
export default function BrandFooter() {
  return (
    <footer className="pm-foot">
      <svg width="56" height="32" viewBox="0 0 128 70" aria-hidden="true">
        <rect x="4" y="8" width="120" height="54" rx="27" fill="#0c3b2a" stroke="#f5c518" strokeWidth="4" />
        <text x="64" y="48" fontSize="34" textAnchor="middle" style={{ fontFamily: "var(--font-bebas), sans-serif" }}>
          <tspan fill="#f4efe1">HW</tspan><tspan fill="#f5c518">G</tspan>
        </text>
      </svg>
      <a href={BRAND_SITE_URL}>{BRAND_SITE}</a>
      <div className="pm-chant">{BRAND_CHANT}</div>
      <div className="pm-foot-ver">{APP_VERSION}</div>
    </footer>
  );
}
