"use client";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import MatchRow from "@/components/MatchRow";
import { createClient } from "@/lib/supabase/client";
import { relativeDate } from "@/lib/match-list";
import type { MatchRecord } from "@/lib/types";

interface Row { id: string; short_code: string | null; is_public?: boolean; data: MatchRecord; updated_at?: string; }
type Filter = "both" | "personal" | "public";
const PAGE = 20;

export default function Landing({ userId, email }: { userId: string | null; email: string | null }) {
  const sb = useMemo(() => createClient(), []);
  const router = useRouter();
  const now = Date.now();

  const [own, setOwn] = useState<Row[] | null>(null);
  const [filter, setFilter] = useState<Filter>("both");
  const [feed, setFeed] = useState<Row[]>([]);
  const [more, setMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const loadingRef = useRef(false);
  const moreRef = useRef(true);
  const offsetRef = useRef(0);
  const sentinel = useRef<HTMLDivElement | null>(null);

  // own matches (RLS already scopes to us, but filter by owner so the global
  // public rows that public_read would also return don't leak into "your matches")
  useEffect(() => {
    if (!userId) { setOwn([]); return; }
    sb.from("matches").select("id,short_code,is_public,data,updated_at").eq("owner", userId)
      .order("match_date", { ascending: false, nullsFirst: false })
      .then(({ data, error }) => { if (error) console.warn(error.message); setOwn(((data as Row[]) || [])); });
  }, [userId]);

  // Refs (not state) gate concurrent/again loads so loadFeed's identity only
  // depends on userId — otherwise the observer reconnects after every page and
  // can double-fire while the first page is still in view.
  const loadFeed = useCallback(async () => {
    if (loadingRef.current || !moreRef.current) return;
    loadingRef.current = true; setLoading(true);
    let q = sb.from("matches").select("id,short_code,data,updated_at")
      .eq("is_public", true).order("match_date", { ascending: false, nullsFirst: false });
    if (userId) q = q.neq("owner", userId); // own public matches already show above
    // Offset pagination: fine for v1. If rows shift between pages a boundary row
    // can duplicate (shares r.id → same React key, harmless) or be skipped.
    const { data } = await q.range(offsetRef.current, offsetRef.current + PAGE - 1);
    const rows = (data as Row[]) || [];
    offsetRef.current += rows.length;
    setFeed((f) => [...f, ...rows]);
    if (rows.length < PAGE) { moreRef.current = false; setMore(false); }
    loadingRef.current = false; setLoading(false);
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadFeed(); /* first page */ }, []); // eslint-disable-line

  // infinite scroll
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((es) => { if (es[0].isIntersecting) loadFeed(); }, { rootMargin: "300px" });
    io.observe(el);
    return () => io.disconnect();
  }, [loadFeed]);

  const onSignIn = async () => {
    const { error } = await sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${location.origin}/auth/callback` } });
    if (error) console.warn(error.message);
  };
  const onSignOut = async () => { await sb.auth.signOut(); router.refresh(); };

  const ownShown = (own || []).filter((r) =>
    filter === "both" ? true : filter === "public" ? r.is_public : !r.is_public);
  const href = (r: Row) => `/m/${r.short_code || r.id}`;

  return (
    <div className="mt-root">
      <AppHeader email={email} showNew={!!email} showTeams={!!email} onNew={() => router.push("/m/new")} onSignIn={onSignIn} onSignOut={onSignOut} />

      <div className="ml-page">
        {email && (
          <>
            <div className="ml-sechead">
              <h3>Your matches</h3>
              <div className="ml-seg">
                {(["both", "personal", "public"] as Filter[]).map((f) => (
                  <button key={f} className={filter === f ? "on" : ""} onClick={() => setFilter(f)}>{f[0].toUpperCase() + f.slice(1)}</button>
                ))}
              </div>
            </div>
            {own === null ? (
              <p className="ml-note">Loading your matches…</p>
            ) : own.length === 0 ? (
              <div className="ml-empty">
                <p>No matches yet — track your first one.</p>
                <button className="mt-btn solid" onClick={() => router.push("/m/new")}>＋ New match</button>
              </div>
            ) : ownShown.length === 0 ? (
              <p className="ml-note">No {filter} matches.</p>
            ) : (
              ownShown.map((r) => (
                <MatchRow key={r.id} record={r.data} href={href(r)}
                  date={relativeDate(r.data.matchDate || r.data.date, now)}
                  privacy={r.is_public ? "public" : "private"} />
              ))
            )}
          </>
        )}

        <div className="ml-sechead" style={{ marginTop: email ? 26 : 0 }}><h3>Recent public matches</h3></div>
        {feed.map((r) => (
          <MatchRow key={r.id} record={r.data} href={href(r)} date={relativeDate(r.data.matchDate || r.data.date, now)} />
        ))}
        {!feed.length && !loading && <p className="ml-note">No public matches yet.</p>}
        {loading && <p className="ml-note">Loading…</p>}
        <div ref={sentinel} />
      </div>
    </div>
  );
}
