"use client";
import React, { useMemo, useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import ScoreChart from "@/components/ScoreChart";
import AppHeader from "@/components/AppHeader";
import BrandFooter from "@/components/BrandFooter";
import ScoreHeader from "@/components/ScoreHeader";
import StatGrid from "@/components/StatGrid";
import Scorers from "@/components/Scorers";
import Timeline from "@/components/Timeline";
import Jersey from "@/components/Jersey";
import { gpTotal } from "@/lib/util";
import { lineupBadges } from "@/lib/lineup-badges";
import { createClient } from "@/lib/supabase/client";
import { buildModel } from "@/lib/model";
import { applyNameDisplay } from "@/lib/name-display";
import { scoreChanged } from "@/lib/live-update";
import { fetchIsAdmin } from "@/lib/viewer.client";
import ShareImageModal from "@/components/ShareImageModal";
import type { Model } from "@/lib/types";

export default function PublicMatch({ model: initialModel, id }: { model: Model; id: string }) {
  const [model, setModel] = useState<Model>(initialModel);
  const prevModel = useRef<Model>(initialModel);
  const [pulse, setPulse] = useState(0);
  const [gone, setGone] = useState(false);
  const [conn, setConn] = useState<null | "reconnecting" | "reconnected">(null);
  const wasConnected = useRef(false);
  const m = model;
  const homeShort = (m.homeName || "Home").split(" ")[0];
  const awayShort = (m.awayName || "Away").split(" ")[0];

  const badges = (n: number, side: "home" | "away") => {
    const b = lineupBadges(m, side, n);
    return (
      <>
        {(b.subOn || b.subOff) && (
          <span className="pm-arrows">{b.subOn && <span className="on">▲</span>}{b.subOff && <span className="off">▼</span>}</span>
        )}
        {b.cards.map((c, i) => <span key={i} className={"pm-card " + (c === "red" ? "red" : "yellow")} />)}
        {b.og && <span className="pm-og" style={{ marginLeft: 2, fontSize: 9, fontWeight: 700, color: "#ff6e63" }}>OG</span>}
      </>
    );
  };
  const scoreFor = (n: number, side: "home" | "away") => {
    const sc = lineupBadges(m, side, n).score;
    if (!sc) return null;
    return <div className="sc">{m.effMode === "goals" ? "●".repeat(sc.g) : `${sc.g}-${sc.p}`}</div>;
  };
  const nameIn = (roster: any, n: number) => { const p = (roster?.players || []).find((x: any) => x.num === n); return p ? p.name : ""; };

  const sb = useMemo(() => createClient(), []);
  const router = useRouter();
  const [share, setShare] = useState(false);
  const [imgOpen, setImgOpen] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  React.useEffect(() => {
    sb.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? null);
      fetchIsAdmin(sb, data.user?.id ?? null).then(setIsAdmin);
    });
  }, []);
  // Live updates: rebuild the whole model from each Realtime UPDATE payload.
  useEffect(() => {
    let reconnectT: ReturnType<typeof setTimeout> | undefined;
    const apply = (row: any) => {
      if (row.is_public === false) { setGone(true); return; }
      if (!row.data) return; // truncated/partial payload — skip rather than crash buildModel
      const next = applyNameDisplay(buildModel(row.data), row.name_display || row.data?.nameDisplay || "full");
      if (scoreChanged(prevModel.current, next)) setPulse((p) => p + 1);
      prevModel.current = next;
      setModel(next);
    };
    const refetch = async () => {
      const { data } = await sb
        .from("matches")
        .select("data,name_display,is_public")
        .eq("id", id)
        .maybeSingle();
      if (data) apply(data);
    };
    const ch = sb
      .channel(`match:${id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "matches", filter: `id=eq.${id}` },
        (payload) => apply(payload.new)
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "matches", filter: `id=eq.${id}` },
        () => setGone(true)
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          if (wasConnected.current) {
            refetch();
            setConn("reconnected");
            reconnectT = setTimeout(() => setConn(null), 2000);
          }
          wasConnected.current = true;
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          if (wasConnected.current) setConn("reconnecting");
        }
      });
    return () => { clearTimeout(reconnectT); sb.removeChannel(ch); };
  }, [id, sb]);
  const copyLink = () => { navigator.clipboard?.writeText(location.href); };
  const safe = (s: string) => (s || "match").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
  const imgFilename = `${safe(m.homeName || "match")}-${safe(m.awayName || "")}.png`;
  const imgTitle = `${m.homeName} ${m.homeTotals?.str ?? ""} – ${m.awayTotals?.str ?? ""} ${m.awayName}`;

  return (
    <div className="pm-root mt-root">
      <AppHeader
        email={email}
        onSignIn={async () => { await sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${location.origin}/auth/callback` } }); }}
        onSignOut={async () => { await sb.auth.signOut(); router.refresh(); }}
        primary={
          <button className="mt-btn ah-icn" aria-label="Share" title="Share" onClick={() => setShare((o) => !o)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
              <line x1="8.6" y1="10.5" x2="15.4" y2="6.5" /><line x1="8.6" y1="13.5" x2="15.4" y2="17.5" />
            </svg>
          </button>
        }
        screen="public"
        isAdmin={isAdmin}
      />
      {conn === "reconnecting" && <div className="pm-conn">Reconnecting…</div>}
      {conn === "reconnected" && <div className="pm-conn ok">Reconnected</div>}
      {share && (
        <div className="mt-live" style={{ marginTop: 0 }}>
          <div className="mt-row"><span className="mt-h" style={{ margin: 0, flex: 1 }}>Share</span><button className="mt-add alt" onClick={() => setShare(false)}>✕ Close</button></div>
          <button className="mt-add" style={{ marginTop: 8 }} onClick={copyLink}>🔗 Copy link</button>
          <button className="mt-add alt" style={{ marginTop: 8 }} onClick={() => { setShare(false); setImgOpen(true); }}>🖼 Share as image</button>
        </div>
      )}
      {imgOpen && <ShareImageModal model={m} filename={imgFilename} title={imgTitle} onClose={() => setImgOpen(false)} />}
      {gone ? (
        <section className="pm-sec" style={{ textAlign: "center", padding: "48px 16px" }}>
          <p className="pm-label">This match is no longer shared.</p>
        </section>
      ) : (
       <>
      {/* score header (shared with the editor) */}
      {(() => {
        const homeTotal = gpTotal(m.homeTotals.g, m.homeTotals.p, m.effMode);
        const awayTotal = gpTotal(m.awayTotals.g, m.awayTotals.p, m.effMode);
        const finished = (m.halfMarks || []).some((mk: any) => mk.marker === "FT");
        const started = (m.halfMarks || []).length > 0 || (m.timeline || []).length > 0;
        const phase = finished ? "over" : started ? "play" : "pre";
        const live = started && !finished;
        return (
          <div key={pulse} className={pulse > 0 ? "pm-score-wrap pm-pulse" : "pm-score-wrap"}>
            <ScoreHeader
              homeName={m.homeName}
              awayName={m.awayName}
              homeStr={m.homeTotals.str}
              awayStr={m.awayTotals.str}
              homeColors={m.homeColors}
              awayColors={m.awayColors}
              grade={m.grade || m.sport || ""}
              dateStr={m.dateStr}
              homeTotal={homeTotal}
              awayTotal={awayTotal}
              phase={phase}
              live={live}
              homeSquad={m.homeSquad}
              awaySquad={m.awaySquad}
            />
          </div>
        );
      })()}

      {/* stats 2x2 */}
      <section className="pm-sec">
        <p className="pm-label">Match stats</p>
        <StatGrid stats={[
          { k: "Half-time", v: m.ht || "—" },
          { k: "Lead changes", v: m.leadChanges },
          { k: "Times level", v: m.timesLevel },
          { k: `Biggest lead${m.maxLeadVenue ? ` · ${m.maxLeadVenue === "home" ? homeShort : awayShort}` : ""}`, v: m.maxLead },
        ]} />
      </section>

      {/* chart */}
      <section className="pm-sec">
        <p className="pm-label">Score progression</p>
        <div className="pm-chart">
          <ScoreChart series={m.homeSeries} goalDots={m.goalDots} chartMarkers={m.chartMarkers} htLine={m.htLine} colorHome={m.homeColors[0]} colorAway={m.awayColors[0]} mode={m.effMode} />
        </div>
      </section>

      {/* scorers — both teams, combined leaderboard */}
      <section className="pm-sec">
        <p className="pm-label">Scorers</p>
        <Scorers home={m.homeScorers} away={m.awayScorers} colorHome={m.homeColors[0]} colorHome2={m.homeColors[1]} colorAway={m.awayColors[0]} colorAway2={m.awayColors[1]} mode={m.effMode} />
      </section>

      {/* lineup — two symmetric pitches, home then away */}
      {(() => {
        const renderPitch = (name: string, roster: any, colors: [string, string], side: "home" | "away") => {
          const players = roster?.players || [];
          const starters = players.filter((p: any) => p.role === "starting");
          const subsL = players.filter((p: any) => p.role === "sub");
          const missingL = players.filter((p: any) => p.role === "missing");
          const formation: number[][] = (roster?.formation && roster.formation.length) ? roster.formation : [];
          if (!(formation.length || starters.length)) return null;
          const [c1, c2] = colors;
          return (
            <section className="pm-sec" key={side}>
              <p className="pm-label">Team · {(name || "").toUpperCase()}</p>
              {formation.length ? (
                <div className="pm-pitch">
                  {formation.map((row: number[], ri: number) => (
                    <div className="pm-pitch-row" key={ri}>
                      {row.map((n, ci) => (
                        <div className="pm-jersey" key={ci}>
                          <Jersey c1={c1} c2={c2} num={n} size={40} />
                          <div className="nm">{nameIn(roster, n)} {badges(n, side)}</div>
                          {scoreFor(n, side)}
                        </div>
                      ))}
                    </div>
                  ))}
                  {subsL.length > 0 && (
                    <>
                      <div className="pm-subhead">Subs</div>
                      <div className="pm-pitch-row">
                        {subsL.map((p: any) => (
                          <div className="pm-jersey" key={p.num}>
                            <Jersey c1={c1} c2={c2} num={p.num} size={34} />
                            <div className="nm">{p.name} {badges(p.num, side)}</div>
                            {scoreFor(p.num, side)}
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <div className="pm-lineup-list">
                  {starters.map((p: any, i: number) => (
                    <span className="pm-lineup-item" key={i}>{p.num ? `${p.num}. ` : ""}{p.name}{lineupBadges(m, side, p.num).subOff ? " ▼" : ""}</span>
                  ))}
                </div>
              )}
              {!formation.length && subsL.length > 0 && <p className="pm-bench">Subs: {subsL.map((p: any) => `${p.num} ${p.name}`).join("  ·  ")}</p>}
              {missingL.length > 0 && <p className="pm-bench">Missing: {missingL.map((p: any) => `${p.num} ${p.name}`).join("  ·  ")}</p>}
            </section>
          );
        };
        return <>{renderPitch(m.homeName, m.homeRoster, m.homeColors, "home")}{renderPitch(m.awayName, m.awayRoster, m.awayColors, "away")}</>;
      })()}

      {/* timeline */}
      {(m.timeline && m.timeline.length > 0) && (
        <section className="pm-sec">
          <p className="pm-label">Timeline</p>
          <Timeline timeline={m.timelineHA} halfMarks={m.halfMarks} colorHome={m.homeColors[0]} colorHome2={m.homeColors[1]} colorAway={m.awayColors[0]} colorAway2={m.awayColors[1]} nameHome={m.homeName} nameAway={m.awayName} />
        </section>
      )}

       </>
      )}
      <BrandFooter />
    </div>
  );
}
