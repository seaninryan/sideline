"use client";
import React from "react";
export default function SignIn({ phase, err, onSignIn }: {
  phase: string; err: string; onSignIn: () => void;
}) {
  const busy = phase === "wait" || phase === "load";
  const label = phase === "load" ? "Loading your matches…" : phase === "wait" ? "Starting…" : "Sign in with Google";
  return (
    <div className="si-wrap"><div className="si-card">
      <h1>SIDELINE</h1>
      <p>Match data is saved privately to your account and synced across your devices.</p>
      <button className="si-btn" onClick={onSignIn} disabled={busy}>{label}</button>
      <div className="si-status">{err || (phase === "load" ? "Syncing…" : "")}</div>
    </div></div>
  );
}
