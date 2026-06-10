"use client";
import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import BrandFooter from "@/components/BrandFooter";
import SportIcon from "@/components/SportIcon";
import TeamEditor from "@/components/TeamEditor";
import { teamStore } from "@/lib/team-store";
import { createClient } from "@/lib/supabase/client";
import { SPORTS } from "@/lib/constants";
import type { TeamRecord } from "@/lib/types";

export default function TeamsList({ userId, email }: { userId: string; email: string | null }) {
  const router = useRouter();
  const sb = createClient();
  const [teams, setTeams] = useState<TeamRecord[] | null>(null);
  const [editing, setEditing] = useState<null | "new" | TeamRecord>(null);

  const reload = () => teamStore.list(userId).then(setTeams);
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [userId]);

  const header = (
    <AppHeader
      email={email}
      backHref="/"
      onSignOut={async () => { await sb.auth.signOut(); router.push("/"); }}
      primary={<button className="mt-btn solid" onClick={() => router.push("/m/new")}>＋ New</button>}
    />
  );

  if (editing) {
    return (
      <div className="mt-root">
        {header}
        <div className="ml-page">
          <TeamEditor initial={editing === "new" ? null : editing} onDone={() => { setEditing(null); reload(); }} />
        </div>
        <BrandFooter />
      </div>
    );
  }

  return (
    <div className="mt-root">
      {header}
      <div className="tl-list ml-page">
        <div className="ml-sechead"><h3>Your teams</h3><button className="mt-btn solid" style={{ marginLeft: "auto" }} onClick={() => setEditing("new")}>＋ New team</button></div>
        {teams === null ? <p className="ml-note">Loading…</p>
          : teams.length === 0 ? <div className="ml-empty"><p>No teams yet.</p><button className="mt-btn solid" onClick={() => setEditing("new")}>＋ New team</button></div>
          : teams.map((t) => (
            <div className="tl-row" key={t.id} onClick={() => setEditing(t)}>
              <span className="tl-flag" style={{ background: `linear-gradient(135deg, ${t.color1 || "#888"} 50%, ${t.color2 || "#555"} 50%)` }} />
              <span className="tl-name">{t.name}</span>
              <span className="tl-meta">{t.sport && SPORTS[t.sport] && <SportIcon sport={t.sport} size={15} />}{t.roster.players.length} players</span>
            </div>
          ))}
      </div>
      <BrandFooter />
    </div>
  );
}
