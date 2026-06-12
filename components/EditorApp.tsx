"use client";
import React, { useEffect, useState } from "react";
import { loadAll, linkUnlinkedMatches } from "@/lib/store";
import { createClient } from "@/lib/supabase/client";
import MatchTracker from "@/components/MatchTracker";
import BrandHeader from "@/components/BrandHeader";

// Client bootstrap for the editor: runs loadAll() then renders MatchTracker.
// While it loads (or on error) it shows an on-brand splash — the same brand
// lockup the rest of the app uses — instead of a bare heading.
export default function EditorApp({ initialId = null, wizard = false }: { initialId?: string | null; wizard?: boolean }) {
  const [phase, setPhase] = useState<"load" | "ready" | "error">("load");
  useEffect(() => {
    loadAll()
      .then(async () => {
        try {
          const { data } = await createClient().auth.getUser();
          await linkUnlinkedMatches(data.user?.id ?? null);
        } catch {}
        setPhase("ready");
      })
      .catch(() => setPhase("error"));
  }, []);
  if (phase === "ready") return <MatchTracker initialId={initialId} wizard={wizard} />;
  const error = phase === "error";
  return (
    <div className="si-wrap">
      <div className="si-card">
        <div className="si-brand"><BrandHeader /></div>
        <p>{error ? "Couldn't load your matches — check your connection and refresh." : "Loading your matches…"}</p>
        {!error && <div className="ld-spin" aria-hidden="true" />}
      </div>
    </div>
  );
}
