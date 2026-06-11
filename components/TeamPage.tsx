"use client";
import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import BrandFooter from "@/components/BrandFooter";
import SportIcon from "@/components/SportIcon";
import { createClient } from "@/lib/supabase/client";
import { contrastOn } from "@/lib/util";
import { SPORTS } from "@/lib/constants";
import type { TeamRecord } from "@/lib/types";
import MatchRow from "@/components/MatchRow";
import { relativeDate } from "@/lib/match-list";
import type { MatchRecord } from "@/lib/types";

export default function TeamPage({ team, isOwner, fixtures = [] }: { team: TeamRecord; isOwner: boolean; fixtures?: { id: string; href: string; data: MatchRecord; date: string | null }[] }) {
  const router = useRouter();
  const sb = createClient();
  const now = Date.now();
  const [email, setEmail] = useState<string | null>(null);
  useEffect(() => { sb.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null)); }, []);
  const byNum = (n: number) => team.roster.players.find((p) => p.num === n);
  const subs = team.roster.players.filter((p) => p.role === "sub");
  const c1 = team.color1 || "#888", c2 = team.color2 || "#555";

  return (
    <div className="pm-root mt-root">
      <AppHeader
        email={email}
        onSignIn={async () => { await sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${location.origin}/auth/callback` } }); }}
        onSignOut={async () => { await sb.auth.signOut(); router.refresh(); }}
        primary={isOwner ? <button className="mt-btn" onClick={() => router.push("/teams")}>Edit</button> : null}
        menuItems={email ? [
          { label: "＋ New", onClick: () => router.push("/m/new") },
          { label: "👥 Teams", onClick: () => router.push("/teams") },
        ] : []}
      />

      <div className="tp-id">
        <span className="tp-flag" style={{ background: `linear-gradient(135deg, ${c1} 50%, ${c2} 50%)` }} />
        <div><div className="mt-h" style={{ margin: 0 }}>{team.name}</div>
          <div className="mt-note" style={{ margin: 0, display: "inline-flex", alignItems: "center", gap: 5 }}>{team.sport && SPORTS[team.sport] ? <><SportIcon sport={team.sport} size={14} />{SPORTS[team.sport].label}</> : "Team"}</div>
          {team.squad && <div className="mt-note" style={{ margin: 0, color: "var(--muted)" }}>{team.squad}</div>}</div>
      </div>

      {team.roster.formation.length > 0 && (
        <div className="te-pitch" style={{ margin: 14, background: `linear-gradient(${c2}22, #0c3b2a 60%)` }}>
          {team.roster.formation.map((row, ri) => (
            <div className="mt-line" key={ri}>
              {row.map((n) => { const p = byNum(n); return (
                <div className="mt-jersey" key={n}>
                  <span className="j" style={{ background: c1, color: contrastOn(c1), borderBottom: `4px solid ${c2}` }}>{n}</span>
                  <span className="nm">{p?.name || ""}</span>
                </div>
              ); })}
            </div>
          ))}
        </div>
      )}
      {subs.length > 0 && <p className="mt-note" style={{ margin: "0 14px" }}>Subs: {subs.map((p) => `${p.num} ${p.name}`).join("  ·  ")}</p>}

      <p className="mt-h" style={{ margin: "18px 14px 6px" }}>Fixtures</p>
      <div className="ml-page" style={{ paddingTop: 0 }}>
        {fixtures.length === 0
          ? <div className="tp-fixtures">No public fixtures involving this team yet.</div>
          : fixtures.map((f) => <MatchRow key={f.id} record={f.data} href={f.href} date={relativeDate(f.date || undefined, now)} />)}
      </div>
      <BrandFooter />
    </div>
  );
}
