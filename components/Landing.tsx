"use client";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import BrandFooter from "@/components/BrandFooter";
import MatchRow from "@/components/MatchRow";
import SportIcon, { ICON_SPORTS } from "@/components/SportIcon";
import { createClient } from "@/lib/supabase/client";
import { matchRowView, relativeDate, isUpcoming } from "@/lib/match-list";
import { SPORTS } from "@/lib/constants";
import type { MatchRecord } from "@/lib/types";

interface Row { id: string; short_code: string | null; is_public?: boolean; data: MatchRecord; updated_at?: string; }
type Filter = "both" | "personal" | "public";
const PAGE = 5;

export default function Landing({ userId, email }: { userId: string | null; email: string | null }) {
  const sb = useMemo(() => createClient(), []);
  const router = useRouter();
  const now = Date.now();

  const [own, setOwn] = useState<Row[] | null>(null);
  const [filter, setFilter] = useState<Filter>("both");
  const [sportFilter, setSportFilter] = useState<string | null>(null);
  const [ownLimit, setOwnLimit] = useState(PAGE);
  const [feed, setFeed] = useState<Row[]>([]);
  const [more, setMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const loadingRef = useRef(false);
  const moreRef = useRef(true);
  const offsetRef = useRef(0);

  // own matches (RLS already scopes to us, but filter by owner so the global
  // public rows that public_read would also return don't leak into "your matches")
  useEffect(() => {
    if (!userId) { setOwn([]); return; }
    sb.from("matches").select("id,short_code,is_public,data,updated_at").eq("owner", userId)
      .order("match_date", { ascending: false, nullsFirst: false })
      .then(({ data, error }) => { if (error) console.warn(error.message); setOwn(((data as Row[]) || [])); });
  }, [userId]);

  // Recent public matches — the global feed. Includes our OWN public matches too
  // (they also appear under "Your matches"). Offset pagination, PAGE at a time.
  const loadFeed = useCallback(async () => {
    if (loadingRef.current || !moreRef.current) return;
    loadingRef.current = true; setLoading(true);
    const q = sb.from("matches").select("id,short_code,data,updated_at")
      .eq("is_public", true).eq("listed", true).order("match_date", { ascending: false, nullsFirst: false });
    const { data } = await q.range(offsetRef.current, offsetRef.current + PAGE - 1);
    const rows = (data as Row[]) || [];
    offsetRef.current += rows.length;
    setFeed((f) => [...f, ...rows]);
    if (rows.length < PAGE) { moreRef.current = false; setMore(false); }
    loadingRef.current = false; setLoading(false);
  }, []);

  useEffect(() => { loadFeed(); /* first page */ }, []); // eslint-disable-line

  const onSignIn = async () => {
    const { error } = await sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${location.origin}/auth/callback` } });
    if (error) console.warn(error.message);
  };
  const onSignOut = async () => { await sb.auth.signOut(); router.refresh(); };

  const href = (r: Row) => `/m/${r.short_code || r.id}`;
  const dateOf = (r: Row) => r.data.matchDate || r.data.date;
  const dateMs = (r: Row) => Date.parse(dateOf(r) || "") || 0;
  // resolved sport key per row (cheap path uses the stored column)
  const sportOf = (r: Row) => r.data.sport || matchRowView(r.data).sport;

  // privacy filter applies to "your matches" only; the sport filter applies to both
  const bySport = (r: Row) => !sportFilter || sportOf(r) === sportFilter;
  const ownByPrivacy = (own || []).filter((r) =>
    filter === "both" ? true : filter === "public" ? r.is_public : !r.is_public);
  const ownFiltered = ownByPrivacy.filter(bySport);
  const ownUpcoming = ownFiltered.filter((r) => isUpcoming(dateOf(r), now)).sort((a, b) => dateMs(a) - dateMs(b));
  const ownPast = ownFiltered.filter((r) => !isUpcoming(dateOf(r), now)); // already date-desc from the query

  const feedFiltered = feed.filter(bySport);
  const feedUpcoming = feedFiltered.filter((r) => isUpcoming(dateOf(r), now)).sort((a, b) => dateMs(a) - dateMs(b));
  const feedPast = feedFiltered.filter((r) => !isUpcoming(dateOf(r), now));

  // sport chips: every sport actually present across both lists, in canonical
  // order. Hidden entirely when there's nothing to choose between.
  const present = new Set([...(own || []), ...feed].map(sportOf).filter(Boolean));
  const sportChips = ICON_SPORTS.filter((s) => present.has(s));

  const row = (r: Row, opts: { privacy?: boolean; upcoming?: boolean } = {}) => (
    <MatchRow key={r.id} record={r.data} href={href(r)}
      date={relativeDate(dateOf(r), now)}
      upcoming={opts.upcoming}
      privacy={opts.privacy ? (r.is_public ? "public" : "private") : null} />
  );

  return (
    <div className="mt-root">
      <AppHeader
        email={email}
        onSignIn={onSignIn}
        onSignOut={onSignOut}
        primary={email ? <button className="mt-btn solid" onClick={() => router.push("/m/new")}>＋ New</button> : null}
        menuItems={email ? [{ label: "👥 Teams", onClick: () => router.push("/teams") }] : []}
      />

      <div className="ml-page">
        {!email && (
          <div className="ml-cta">
            <div className="ml-cta-txt">
              <strong>Track your own games</strong>
              <p>Sign in to record matches, build your teams, and share them.</p>
            </div>
            <button className="mt-btn solid" onClick={onSignIn}>Sign in</button>
          </div>
        )}
        {sportChips.length > 1 && (
          <div className="ml-sports" role="group" aria-label="Filter by sport">
            <button className={"ml-sport-chip" + (sportFilter === null ? " on" : "")} title="All sports" onClick={() => setSportFilter(null)}>All</button>
            {sportChips.map((s) => (
              <button key={s} className={"ml-sport-chip" + (sportFilter === s ? " on" : "")} title={SPORTS[s].label} aria-label={SPORTS[s].label} onClick={() => setSportFilter(s)}>
                <SportIcon sport={s} size={20} />
              </button>
            ))}
          </div>
        )}

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
            ) : (own || []).length === 0 ? (
              <div className="ml-empty">
                <p>No matches yet — track your first one.</p>
                <button className="mt-btn solid" onClick={() => router.push("/m/new")}>＋ New match</button>
              </div>
            ) : ownFiltered.length === 0 ? (
              <p className="ml-note">No matches{sportFilter ? ` for ${SPORTS[sportFilter].label}` : ""}{filter !== "both" ? ` (${filter})` : ""}.</p>
            ) : (
              <>
                {ownUpcoming.length > 0 && (
                  <>
                    <div className="ml-subhead">Upcoming</div>
                    {ownUpcoming.map((r) => row(r, { privacy: true, upcoming: true }))}
                    {ownPast.length > 0 && <div className="ml-subhead">Past</div>}
                  </>
                )}
                {ownPast.slice(0, ownLimit).map((r) => row(r, { privacy: true }))}
                {ownPast.length > ownLimit && (
                  <button className="ml-more" onClick={() => setOwnLimit((n) => n + PAGE)}>Show older</button>
                )}
              </>
            )}
          </>
        )}

        <div className="ml-sechead" style={{ marginTop: email ? 26 : 0 }}><h3>Recent public matches</h3></div>
        {feedUpcoming.length > 0 && (
          <>
            <div className="ml-subhead">Upcoming</div>
            {feedUpcoming.map((r) => row(r, { upcoming: true }))}
            {feedPast.length > 0 && <div className="ml-subhead">Past</div>}
          </>
        )}
        {feedPast.map((r) => row(r))}
        {!feedFiltered.length && !loading && <p className="ml-note">No public matches{sportFilter ? ` for ${SPORTS[sportFilter].label}` : ""} yet.</p>}
        {loading && <p className="ml-note">Loading…</p>}
        {more && !loading && <button className="ml-more" onClick={loadFeed}>Show more</button>}
      </div>
      <BrandFooter />
    </div>
  );
}
