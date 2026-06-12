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
  const margin = Math.abs(m.totals.us.total - m.totals.them.total);
  const resTxt = m.result === "Win" ? "WIN" : m.result === "Loss" ? "DEFEAT" : "DRAW";
  const resFull = resTxt + (m.effMode === "gaa" && margin ? ` BY ${margin}` : "");
  const resBg = m.result === "Win" ? "#f5c518" : m.result === "Loss" ? "#c0392b" : "#e7dec6";
  const resFg = m.result === "Loss" ? "#fff" : "#11241b";
  const usShort = (m.usName || "Us").split(" ")[0];
  const themShort = (m.themName || "Them").split(" ")[0];

  const mForBadges = m as Pick<Model, "timeline" | "usScorers" | "themScorers">;
  const badges = (n: number, side: "us" | "them") => {
    const b = lineupBadges(mForBadges, side, n);
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
  const scoreFor = (n: number, side: "us" | "them") => {
    const sc = lineupBadges(mForBadges, side, n).score;
    if (!sc) return null;
    return <div className="sc">{m.effMode === "goals" ? "●".repeat(sc.g) : `${sc.g}-${sc.p}`}</div>;
  };
  const findName = (n: number) => { const p = (m.starters || []).find((x: any) => x.num === n); return p ? p.name : ""; };

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
  const imgFilename = `${safe(m.usName || "match")}-${safe(m.themName || "")}.png`;
  const imgTitle = `${m.usName} ${m.totals.us.str} – ${m.totals.them.str} ${m.themName}`;

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
        const usIsHome = m.homeAway === "home";
        const usTotal = gpTotal(m.totals.us.g, m.totals.us.p, m.effMode);
        const themTotal = gpTotal(m.totals.them.g, m.totals.them.p, m.effMode);
        const finished = (m.halfMarks || []).some((mk: any) => mk.marker === "FT");
        const started = (m.halfMarks || []).length > 0 || (m.timeline || []).length > 0;
        const phase = finished ? "over" : started ? "play" : "pre";
        const live = started && !finished;
        return (
          <div key={pulse} className={pulse > 0 ? "pm-score-wrap pm-pulse" : "pm-score-wrap"}>
            <ScoreHeader
              homeName={usIsHome ? m.usName : m.themName}
              awayName={usIsHome ? m.themName : m.usName}
              homeStr={usIsHome ? m.totals.us.str : m.totals.them.str}
              awayStr={usIsHome ? m.totals.them.str : m.totals.us.str}
              homeColors={usIsHome ? [m.colorUs, m.colorUs2] : [m.colorThem, m.colorThem2]}
              awayColors={usIsHome ? [m.colorThem, m.colorThem2] : [m.colorUs, m.colorUs2]}
              grade={m.grade || m.sport || ""}
              dateStr={m.dateStr}
              homeTotal={usIsHome ? usTotal : themTotal}
              awayTotal={usIsHome ? themTotal : usTotal}
              phase={phase}
              live={live}
              homeSquad={usIsHome ? m.usSquad : m.oppSquad}
              awaySquad={usIsHome ? m.oppSquad : m.usSquad}
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
          { k: `Biggest lead${m.maxLeadSide ? ` · ${m.maxLeadSide === "us" ? usShort : themShort}` : ""}`, v: m.maxLead },
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

      {/* lineup — pitch when we have formation rows, else a flat starters list */}
      {((m.formationRows && m.formationRows.length > 0) || (m.starters && m.starters.length > 0)) && (
        <section className="pm-sec">
          <p className="pm-label">Team · {(m.usName || "").toUpperCase()}</p>
          {(m.formationRows && m.formationRows.length > 0) ? (
            <div className="pm-pitch">
              {m.formationRows.map((row: number[], ri: number) => (
                <div className="pm-pitch-row" key={ri}>
                  {row.map((n, ci) => (
                    <div className="pm-jersey" key={ci}>
                      <Jersey c1={m.colorUs} c2={m.colorUs2} num={n} size={40} />
                      <div className="nm">{findName(n)} {badges(n, "us")}</div>
                      {scoreFor(n, "us")}
                    </div>
                  ))}
                </div>
              ))}
              {m.subs && m.subs.length > 0 && (
                <>
                  <div className="pm-subhead">Subs</div>
                  <div className="pm-pitch-row">
                    {m.subs.map((p: any) => (
                      <div className="pm-jersey" key={p.num}>
                        <Jersey c1={m.colorUs} c2={m.colorUs2} num={p.num} size={34} />
                        <div className="nm">{p.name} {badges(p.num, "us")}</div>
                        {scoreFor(p.num, "us")}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="pm-lineup-list">
              {m.starters.map((p: any, i: number) => (
                <span className="pm-lineup-item" key={i}>{p.num ? `${p.num}. ` : ""}{p.name}{lineupBadges(mForBadges, "us", p.num).subOff ? " ▼" : ""}</span>
              ))}
            </div>
          )}
          {!(m.formationRows && m.formationRows.length > 0) && m.subs && m.subs.length > 0 && <p className="pm-bench">Subs: {m.subs.map((p: any) => `${p.num} ${p.name}`).join("  ·  ")}</p>}
          {m.missing && m.missing.length > 0 && <p className="pm-bench">Missing: {m.missing.map((p: any) => `${p.num} ${p.name}`).join("  ·  ")}</p>}
        </section>
      )}
      {m.oppRoster && m.oppRoster.formation && m.oppRoster.formation.length > 0 && (
        <section className="pm-sec">
          <p className="pm-label">Team · {(m.themName || "").toUpperCase()}</p>
          <div className="pm-pitch">
            {m.oppRoster.formation.map((row: number[], ri: number) => (
              <div className="pm-pitch-row" key={ri}>
                {row.map((n, ci) => { const op = m.oppRoster.players.find((x: any) => x.num === n); return (
                  <div className="pm-jersey" key={ci}>
                    <Jersey c1={m.colorThem} c2={m.colorThem2} num={n} size={38} />
                    <div className="nm">{op ? op.name : ""} {badges(n, "them")}</div>
                    {scoreFor(n, "them")}
                  </div>
                ); })}
              </div>
            ))}
            {(() => { const os = (m.oppRoster.players || []).filter((p: any) => p.role === "sub"); return os.length > 0 ? (
              <>
                <div className="pm-subhead">Subs</div>
                <div className="pm-pitch-row">
                  {os.map((p: any) => (
                    <div className="pm-jersey" key={p.num}>
                      <Jersey c1={m.colorThem} c2={m.colorThem2} num={p.num} size={34} />
                      <div className="nm">{p.name} {badges(p.num, "them")}</div>
                      {scoreFor(p.num, "them")}
                    </div>
                  ))}
                </div>
              </>
            ) : null; })()}
          </div>
        </section>
      )}

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
