"use client";
import React, { useEffect, useState } from "react";
import { loadAll } from "@/lib/store";
import MatchTracker from "@/components/MatchTracker";

export default function EditorApp() {
  const [phase, setPhase] = useState<"load" | "ready" | "error">("load");
  useEffect(() => {
    loadAll().then(() => setPhase("ready")).catch(() => setPhase("error"));
  }, []);
  if (phase === "ready") return <MatchTracker />;
  return (
    <div className="si-wrap">
      <div className="si-card">
        <h1>SIDELINE</h1>
        <p>{phase === "error" ? "Couldn't load your matches — check your connection and refresh." : "Loading your matches…"}</p>
      </div>
    </div>
  );
}
