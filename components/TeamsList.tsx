"use client";
import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import BrandFooter from "@/components/BrandFooter";
import SportIcon from "@/components/SportIcon";
import TeamEditor from "@/components/TeamEditor";
import { teamStore } from "@/lib/team-store";
import { createClient } from "@/lib/supabase/client";
import { SPORTS } from "@/lib/constants";
import type { TeamRecord } from "@/lib/types";

type Filter = "both" | "private" | "public";
const PAGE = 5;

export default function TeamsList({ userId, email }: { userId: string; email: string | null }) {
  const router = useRouter();
  const sb = createClient();
  const [teams, setTeams] = useState<TeamRecord[] | null>(null);
  const [editing, setEditing] = useState<null | "new" | TeamRecord>(null);
  const [filter, setFilter] = useState<Filter>("both");
  const [yourLimit, setYourLimit] = useState(PAGE);

  // public teams discovery feed (own + others), paginated
  const [feed, setFeed] = useState<TeamRecord[]>([]);
  const [feedMore, setFeedMore] = useState(true);
  const [feedLoading, setFeedLoading] = useState(false);
  const feedOffset = useRef(0);

  const reload = () => teamStore.list(userId).then(setTeams);
  const dup = async (t: TeamRecord) => { const d = await teamStore.duplicate(t); await reload(); if (d) setEditing(d); };
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [userId]);

  const loadFeed = async () => {
    if (feedLoading || !feedMore) return;
    setFeedLoading(true);
    const rows = await teamStore.listPublic({ offset: feedOffset.current, limit: PAGE });
    feedOffset.current += rows.length;
    setFeed((f) => [...f, ...rows]);
    if (rows.length < PAGE) setFeedMore(false);
    setFeedLoading(false);
  };
  useEffect(() => { loadFeed(); /* first page */ /* eslint-disable-next-line */ }, []);

  const flag = (t: TeamRecord) => `linear-gradient(135deg, ${t.color1 || "#888"} 50%, ${t.color2 || "#555"} 50%)`;
  const meta = (t: TeamRecord) => (
    <span className="tl-meta">{t.sport && SPORTS[t.sport] && <SportIcon sport={t.sport} size={15} />}{t.roster.players.length} players</span>
  );

  const yoursFiltered = (teams || []).filter((t) =>
    filter === "both" ? true : filter === "public" ? t.is_public : !t.is_public);

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
          <TeamEditor initial={editing === "new" ? null : editing} userId={userId} onDone={() => { setEditing(null); reload(); }} />
        </div>
        <BrandFooter />
      </div>
    );
  }

  return (
    <div className="mt-root">
      {header}
      <div className="tl-list ml-page">
        <div className="ml-sechead">
          <h3>Your teams</h3>
          <div className="ml-seg">
            {(["both", "private", "public"] as Filter[]).map((f) => (
              <button key={f} className={filter === f ? "on" : ""} onClick={() => setFilter(f)}>{f[0].toUpperCase() + f.slice(1)}</button>
            ))}
          </div>
          <button className="mt-btn solid" style={{ marginLeft: 8 }} onClick={() => setEditing("new")}>＋ New team</button>
        </div>

        {teams === null ? <p className="ml-note">Loading…</p>
          : (teams || []).length === 0 ? <div className="ml-empty"><p>No teams yet.</p><button className="mt-btn solid" onClick={() => setEditing("new")}>＋ New team</button></div>
          : yoursFiltered.length === 0 ? <p className="ml-note">No {filter === "both" ? "" : filter + " "}teams.</p>
          : <>
              {yoursFiltered.slice(0, yourLimit).map((t) => (
                <div className="tl-row" key={t.id} onClick={() => setEditing(t)}>
                  <span className="tl-flag" style={{ background: flag(t) }} />
                  <span className="tl-name">{t.name}</span>
                  <span className={"tl-priv " + (t.is_public ? "public" : "private")}>{t.is_public ? "◉ public" : "🔒 private"}</span>
                  <button className="tl-dup" title="Duplicate" onClick={(e) => { e.stopPropagation(); dup(t); }}>⧉</button>
                  {meta(t)}
                </div>
              ))}
              {yoursFiltered.length > yourLimit && (
                <button className="ml-more" onClick={() => setYourLimit((n) => n + PAGE)}>Show older</button>
              )}
            </>}

        <div className="ml-sechead" style={{ marginTop: 26 }}><h3>Public teams</h3></div>
        {feed.map((t) => (
          <Link className="tl-row" key={t.id} href={`/t/${t.short_code || t.id}`}>
            <span className="tl-flag" style={{ background: flag(t) }} />
            <span className="tl-name">{t.name}</span>
            {meta(t)}
          </Link>
        ))}
        {!feed.length && !feedLoading && <p className="ml-note">No public teams yet.</p>}
        {feedLoading && <p className="ml-note">Loading…</p>}
        {feedMore && !feedLoading && <button className="ml-more" onClick={loadFeed}>Show more</button>}
      </div>
      <BrandFooter />
    </div>
  );
}
