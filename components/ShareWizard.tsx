"use client";
import React, { useState } from "react";
import { store } from "@/lib/store";
import { createClient } from "@/lib/supabase/client";
import type { MatchRecord, NameDisplay } from "@/lib/types";

const NAME_OPTS: { v: NameDisplay; label: string; hint: string }[] = [
  { v: "full", label: "Full names", hint: "Show players as written" },
  { v: "initials", label: "Initials", hint: "e.g. R.S." },
  { v: "none", label: "No names", hint: "Shirt numbers only" },
];

export default function ShareWizard({ record, curId, onClose, onApplied }: {
  record: MatchRecord; curId: string; onClose: () => void;
  onApplied: (patch: { nameDisplay: NameDisplay }) => void;
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [nameDisplay, setNameDisplay] = useState<NameDisplay>(record.nameDisplay || "full");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [bust] = useState(() => Date.now()); // freshens the preview <img> each time the wizard opens
  const shareUrl = typeof location !== "undefined" ? `${location.origin}/m/${curId}` : "";

  const publish = async () => {
    setBusy(true);
    await store.set(curId, { ...record, nameDisplay });
    const sb = createClient();
    await sb.from("matches").update({ is_public: true, name_display: nameDisplay }).eq("id", curId);
    onApplied({ nameDisplay });
    setBusy(false);
    setStep(3);
  };

  return (
    <div className="mt-share-wiz">
      <div className="mt-row" style={{ alignItems: "center" }}>
        <span className="mt-h" style={{ margin: 0, flex: 1 }}>Share match</span>
        <button className="mt-add alt" onClick={onClose}>✕ Close</button>
      </div>

      {step === 1 && (
        <div className="sw-step">
          <p className="hint">How should player names appear on the public page? (Use initials or no names for youth matches.)</p>
          {NAME_OPTS.map((o) => (
            <button key={o.v}
              className={`mt-big sw-opt${nameDisplay === o.v ? " sel" : ""}`}
              onClick={() => setNameDisplay(o.v)}>
              {o.label} <span className="sw-hint">{o.hint}</span>
            </button>
          ))}
          <div className="sw-nav">
            <button className="mt-add" onClick={() => setStep(2)}>Next →</button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="sw-step">
          <p className="hint">Make this match public? Anyone with the link can view it. Names will show as: <strong>{nameDisplay}</strong>.</p>
          <div className="sw-nav">
            <button className="mt-add alt" onClick={() => setStep(1)}>← Back</button>
            <button className="mt-add" disabled={busy} onClick={publish}>{busy ? "Publishing…" : "Make public"}</button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="sw-step">
          <p className="hint">Public link ready — share it anywhere.</p>
          <input className="mt-inp" readOnly value={shareUrl} onFocus={(e) => e.currentTarget.select()} style={{ width: "100%" }} />
          <div className="sw-nav">
            <button className="mt-add" onClick={() => { navigator.clipboard?.writeText(shareUrl); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
              {copied ? "Copied ✓" : "Copy link"}
            </button>
          </div>
          <p className="hint">Link preview:</p>
          {/* cache-buster: the OG route sends max-age=3600, so without this the panel shows a stale card after a redesign */}
          <img src={`/m/${curId}/opengraph-image?cb=${bust}`} alt="Score card preview" style={{ maxWidth: "100%", borderRadius: 8, border: "1px solid var(--line)" }} />
          <div className="sw-nav"><button className="mt-add alt" onClick={onClose}>Done</button></div>
        </div>
      )}
    </div>
  );
}
