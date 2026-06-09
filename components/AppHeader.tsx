"use client";
import React, { useState } from "react";
import Link from "next/link";
import { BRAND_CHANT } from "@/lib/constants";

// The persistent header used on every screen. Brand + optional back link on the
// left; a context-specific action cluster (children) plus New and the account /
// sign-in control on the right. Reuses the editor's existing `mt-bar`/`mt-btn`/
// `mt-logo` classes so it inherits the established styling.
export default function AppHeader({
  email = null,
  showNew = false,
  showTeams = false,
  onNew,
  onSignIn,
  onSignOut,
  backHref = null,
  children,
}: {
  email?: string | null;
  showNew?: boolean;
  showTeams?: boolean;
  onNew?: () => void;
  onSignIn?: () => void;
  onSignOut?: () => void;
  backHref?: string | null;
  children?: React.ReactNode;
}) {
  const [acct, setAcct] = useState(false);
  return (
    <>
      <div className="mt-bar">
        <Link className="mt-logo" href="/" aria-label="Here We Go — home" style={{ textDecoration: "none" }}>
          <svg width="40" height="22" viewBox="0 0 128 70" aria-hidden="true" style={{ flex: "none" }}>
            <rect x="4" y="8" width="120" height="54" rx="27" fill="#0c3b2a" stroke="#f5c518" strokeWidth="4" />
            <text x="64" y="48" fontSize="34" textAnchor="middle" style={{ fontFamily: "var(--font-bebas), sans-serif" }}>
              <tspan fill="#f4efe1">HW</tspan><tspan fill="#f5c518">G</tspan>
            </text>
          </svg>
          <span className="mt-brand">
            <span className="mt-wm">HERE WE <span className="mt-go">GO</span></span>
            <span className="mt-chant">{BRAND_CHANT}</span>
          </span>
        </Link>
        {backHref && <Link className="ah-back" href={backHref}>‹ matches</Link>}
        {showTeams && <Link className="ah-back" href="/teams">Teams</Link>}
        <div className="grow" />
        {showNew && <button className="mt-btn solid" onClick={onNew}>＋ New</button>}
        {children}
        {email ? (
          <button className={"mt-btn" + (acct ? " solid" : "")} onClick={() => setAcct((o) => !o)}>{email} ▾</button>
        ) : (
          <button className="mt-btn" onClick={onSignIn}>Sign in</button>
        )}
      </div>
      {email && acct && (
        <div className="mt-bar sub">
          <button className="mt-btn" onClick={() => { setAcct(false); onSignOut && onSignOut(); }}>Sign out</button>
        </div>
      )}
    </>
  );
}
