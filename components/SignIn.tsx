"use client";
import React from "react";
import BrandHeader from "@/components/BrandHeader";
export default function SignIn({ phase, err, onSignIn }: {
  phase: string; err: string; onSignIn: () => void;
}) {
  const busy = phase === "wait" || phase === "load";
  const label = phase === "load" ? "Loading your matches…" : phase === "wait" ? "Starting…" : "Sign in with Google";
  return (
    <div className="si-wrap"><div className="si-card">
      <div className="si-brand"><BrandHeader /></div>
      <p>Match data is saved privately to your account and synced across your devices.</p>
      <button className="si-btn" onClick={onSignIn} disabled={busy}>{label}</button>
      <div className="si-status">{err || (phase === "load" ? "Syncing…" : "")}</div>
    </div></div>
  );
}
