"use client";
import React from "react";
import { PRIVACY_LEVELS, type PrivacyLevel } from "@/lib/privacy";
import type { NameDisplay } from "@/lib/types";

const NAME_OPTS: { v: NameDisplay; label: string }[] = [
  { v: "full", label: "Full" }, { v: "initials", label: "Initials" }, { v: "none", label: "None" },
];

// Shared 3-way privacy control (matches + teams). The parent owns persistence and
// passes the current level + the public link; this is presentational only.
export default function PrivacyControl({
  level, onLevel, link, copied, onCopy, nameDisplay, onNameDisplay, busy = false,
}: {
  level: PrivacyLevel;
  onLevel: (l: PrivacyLevel) => void;
  link?: string;
  copied?: boolean;
  onCopy?: () => void;
  nameDisplay: NameDisplay;
  onNameDisplay: (v: NameDisplay) => void;
  busy?: boolean;
}) {
  return (
    <div className="pc">
      <div className="pc-seg" role="radiogroup" aria-label="Privacy">
        {PRIVACY_LEVELS.map((o) => (
          <button key={o.v} role="radio" aria-checked={level === o.v} disabled={busy}
            className={"pc-opt" + (level === o.v ? " on" : "")} onClick={() => onLevel(o.v)}>
            <span className="pc-lbl">{o.label}</span>
            <span className="pc-hint">{o.hint}</span>
          </button>
        ))}
      </div>
      {level !== "private" && (
        <>
          {link && (
            <div className="pc-link">
              <input className="mt-inp" readOnly value={link} onFocus={(e) => e.currentTarget.select()} style={{ width: "100%" }} />
              {onCopy && <button className="mt-add" style={{ marginTop: 6 }} onClick={onCopy}>{copied ? "Copied ✓" : "🔗 Copy link"}</button>}
            </div>
          )}
          <p className="mt-note" style={{ margin: "12px 0 4px" }}>Player names on the public page:</p>
          <div className="mt-grid">
            {NAME_OPTS.map((o) => (
              <button key={o.v} className={"mt-big sm" + (nameDisplay === o.v ? " on" : "")} disabled={busy} onClick={() => onNameDisplay(o.v)}>{o.label}</button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
