"use client";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import BrandFooter from "@/components/BrandFooter";
import MatchRow from "@/components/MatchRow";
import SportIcon, { ICON_SPORTS } from "@/components/SportIcon";
import { createClient } from "@/lib/supabase/client";
import { matchRowView, relativeDate, matchBucket } from "@/lib/match-list";
import { SPORTS } from "@/lib/constants";
import { teamStore } from "@/lib/team-store";
import { store, migrateRecordToV3 } from "@/lib/store";
import { reconcileHomeAwayFromTeams } from "@/lib/team-link";
import type { MatchRecord, TeamRecord } from "@/lib/types";

interface Row { id: string; short_code: string | null; is_public?: boolean; data: MatchRecord; updated_at?: string; }
type Filter = "both" | "personal" | "public";
const PAGE = 5;

export default function Landing({ userId, email, isAdmin = false }: { userId: string | null; email: string | null; isAdmin?: boolean }) {
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
      .then(async ({ data, error }) => {
        if (error) console.warn(error.message);
        const rows = (data as Row[]) || [];
        setOwn(rows); // first paint with stored values
        // ④a self-heal: reconcile each row's home/away identity from the linked teams
        // (the durable source) so the home screen shows correct squads/names/colours
        // even without opening the editor. Resilient per-record; only the user's rows.
        try {
          const teams: TeamRecord[] = await teamStore.list(userId);
          const byId: Record<string, TeamRecord> = {};
          teams.forEach((t) => { if (t.id) byId[t.id] = t; });
          let changed = false;
          const healed = rows.map((r) => {
            try {
              // A notationV:2 record may never have had its home/away rosters derived
              // (③.1 only ran in the editor) — fully migrate it (derives rosters from
              // us/them + reconciles identity from teams) so the home screen parses
              // scorers correctly without opening the editor. Other records just get
              // their identity reconciled.
              if ((r.data as any).notationV === 2) {
                const v3 = migrateRecordToV3(r.data, byId);
                changed = true;
                store.set(r.id, v3).catch(() => {});
                return { ...r, data: v3 };
              }
              const patch = reconcileHomeAwayFromTeams(r.data, byId);
              if (Object.keys(patch).some((k) => (patch as any)[k] !== (r.data as any)[k])) {
                changed = true;
                const next = { ...r.data, ...patch };
                store.set(r.id, next).catch(() => {});
                return { ...r, data: next };
              }
            } catch {}
            return r;
          });
          if (changed) setOwn(healed);
        } catch {}
      });
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
  // one parse per row → its section; sort upcoming soonest-first, live most-recent-first,
  // past stays date-desc (the query already orders it that way).
  const bucketed = (rows: Row[]) => {
    const tagged = rows.map((r) => ({ r, b: matchBucket(r.data, now, r.updated_at) }));
    const pick = (b: string) => tagged.filter((t) => t.b === b).map((t) => t.r);
    return {
      upcoming: pick("upcoming").sort((a, b) => dateMs(a) - dateMs(b)),
      live: pick("live").sort((a, b) => dateMs(b) - dateMs(a)),
      past: pick("past"),
    };
  };
  const ownFiltered = ownByPrivacy.filter(bySport);
  const { upcoming: ownUpcoming, live: ownLive, past: ownPast } = bucketed(ownFiltered);

  const feedFiltered = feed.filter(bySport);
  const { upcoming: feedUpcoming, live: feedLive, past: feedPast } = bucketed(feedFiltered);

  // "Past" only gets its own subhead when an Upcoming or Live group precedes it.
  const pastSubhead = (up: Row[], live: Row[], past: Row[]) => past.length > 0 && (up.length > 0 || live.length > 0);

  // sport chips: every sport actually present across both lists, in canonical
  // order. Hidden entirely when there's nothing to choose between.
  const present = new Set([...(own || []), ...feed].map(sportOf).filter(Boolean));
  const sportChips = ICON_SPORTS.filter((s) => present.has(s));

  const row = (r: Row, opts: { privacy?: boolean; upcoming?: boolean; live?: boolean } = {}) => (
    <MatchRow key={r.id} record={r.data} href={href(r)}
      date={relativeDate(dateOf(r), now)}
      upcoming={opts.upcoming}
      live={opts.live}
      privacy={opts.privacy ? (r.is_public ? "public" : "private") : null} />
  );

  return (
    <div className="mt-root">
      <AppHeader
        email={email}
        onSignIn={onSignIn}
        onSignOut={onSignOut}
        primary={email ? <button className="mt-btn solid" onClick={() => router.push("/m/new")}>＋ New</button> : null}
        screen="landing"
        isAdmin={isAdmin}
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
                  </>
                )}
                {ownLive.length > 0 && (
                  <>
                    <div className="ml-subhead">Live</div>
                    {ownLive.map((r) => row(r, { privacy: true, live: true }))}
                  </>
                )}
                {pastSubhead(ownUpcoming, ownLive, ownPast) && <div className="ml-subhead">Past</div>}
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
          </>
        )}
        {feedLive.length > 0 && (
          <>
            <div className="ml-subhead">Live</div>
            {feedLive.map((r) => row(r, { live: true }))}
          </>
        )}
        {pastSubhead(feedUpcoming, feedLive, feedPast) && <div className="ml-subhead">Past</div>}
        {feedPast.map((r) => row(r))}
        {!feedFiltered.length && !loading && <p className="ml-note">No public matches{sportFilter ? ` for ${SPORTS[sportFilter].label}` : ""} yet.</p>}
        {loading && <p className="ml-note">Loading…</p>}
        {more && !loading && <button className="ml-more" onClick={loadFeed}>Show more</button>}
      </div>
      <BrandFooter />
    </div>
  );
}
