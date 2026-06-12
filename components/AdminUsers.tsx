"use client";
import React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import AppHeader from "@/components/AppHeader";
import { relativeDate } from "@/lib/match-list";
import type { UserStat } from "@/lib/admin";

export default function AdminUsers({ stats, email }: { stats: UserStat[]; email: string | null }) {
  const sb = React.useMemo(() => createClient(), []);
  const router = useRouter();
  const now = Date.now();
  return (
    <div className="mt-root">
      <AppHeader email={email} screen="admin" isAdmin
        onSignOut={async () => { await sb.auth.signOut(); router.push("/"); }} />
      <div className="ml-page">
        <h2 className="mt-h">Users ({stats.length})</h2>
        <div className="adm-list">
          {stats.map((s) => (
            <Link key={s.profile.id} className="adm-row" href={`/admin/users/${s.profile.id}`}>
              {s.profile.avatar_url
                ? <img className="adm-av" src={s.profile.avatar_url} alt="" />
                : <span className="adm-av adm-av-ph">{(s.profile.full_name || s.profile.email || "?").slice(0, 1).toUpperCase()}</span>}
              <span className="adm-id">
                <strong>{s.profile.full_name || "—"}</strong>
                <span className="adm-email">{s.profile.email}</span>
              </span>
              <span className="adm-meta">
                <span>{relativeDate(s.profile.created_at, now)}</span>
                <span>{s.total} matches · {s.public} public · {s.listed} listed</span>
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
