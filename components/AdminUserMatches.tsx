"use client";
import React from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import AppHeader from "@/components/AppHeader";
import MatchRow from "@/components/MatchRow";
import { relativeDate } from "@/lib/match-list";
import type { Profile, MatchRow as MatchRowType } from "@/lib/types";

export type AdminMatch = Pick<MatchRowType, "id" | "data" | "is_public" | "short_code">;

export default function AdminUserMatches({ profile, matches, email }: { profile: Profile; matches: AdminMatch[]; email: string | null }) {
  const sb = React.useMemo(() => createClient(), []);
  const router = useRouter();
  const now = Date.now();
  return (
    <div className="mt-root">
      <AppHeader email={email} screen="admin-user" isAdmin
        onSignOut={async () => { await sb.auth.signOut(); router.push("/"); }} />
      <div className="ml-page">
        <h2 className="mt-h">{profile.full_name || profile.email} · {matches.length} matches</h2>
        {matches.map((r) => (
          <MatchRow key={r.id} record={r.data}
            href={`/m/${r.short_code || r.id}`}
            date={relativeDate(r.data.matchDate || r.data.date, now)}
            privacy={r.is_public ? "public" : "private"} />
        ))}
      </div>
    </div>
  );
}
