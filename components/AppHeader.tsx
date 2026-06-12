"use client";
import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BRAND_CHANT } from "@/lib/constants";
import { buildHeaderMenu, type HeaderScreen } from "@/lib/header-menu";

// The persistent header used on every screen. Left side is always the brand
// (logo + wordmark) and an optional back link. The right side is at most ONE
// visible primary action plus a single "⋯" overflow menu — nav items built
// from buildHeaderMenu on top, the account block (email + Sign out) below a
// divider. Signed-out users get an inline Sign in button instead of the account
// block. Reuses the editor's `mt-bar`/`mt-btn` styling.
export default function AppHeader({
  email = null,
  onSignIn,
  onSignOut,
  backHref = null,
  primary = null,
  screen,
  isAdmin = false,
}: {
  email?: string | null;
  onSignIn?: () => void;
  onSignOut?: () => void;
  backHref?: string | null;
  primary?: React.ReactNode;
  screen: HeaderScreen;
  isAdmin?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const navItems = buildHeaderMenu({ screen, email, isAdmin });

  // close on outside click / Escape
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const hasMenu = navItems.length > 0 || !!email;

  return (
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
      <div className="grow" />
      {primary}
      {!email && onSignIn && <button className="mt-btn" onClick={onSignIn}>Sign in</button>}
      {hasMenu && (
        <div className="ah-menu-wrap" ref={wrapRef}>
          <button
            className={"mt-btn ah-more" + (open ? " solid" : "")}
            aria-label="More options"
            aria-haspopup="menu"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          >⋯</button>
          {open && (
            <div className="ah-menu" role="menu">
              {navItems.map((it) => (
                <button key={it.href} role="menuitem" className="ah-menu-item"
                  onClick={() => { setOpen(false); router.push(it.href); }}>{it.label}</button>
              ))}
              {email && (
                <>
                  {navItems.length > 0 && <div className="ah-menu-div" />}
                  <div className="ah-menu-acct">{email}</div>
                  <button role="menuitem" className="ah-menu-item"
                    onClick={() => { setOpen(false); onSignOut && onSignOut(); }}>Sign out</button>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
