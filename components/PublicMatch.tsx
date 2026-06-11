"use client";
import React, { useMemo, useState } from "react";
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
import { createClient } from "@/lib/supabase/client";
import ShareImageModal from "@/components/ShareImageModal";
import type { Model } from "@/lib/types";

export default function PublicMatch({ model }: { model: Model }) {
  const m = model;
  const margin = Math.abs(m.totals.us.total - m.totals.them.total);
  const resTxt = m.result === "Win" ? "WIN" : m.result === "Loss" ? "DEFEAT" : "DRAW";
  const resFull = resTxt + (m.effMode === "gaa" && margin ? ` BY ${margin}` : "");
  const resBg = m.result === "Win" ? "#f5c518" : m.result === "Loss" ? "#c0392b" : "#e7dec6";
  const resFg = m.result === "Loss" ? "#fff" : "#11241b";
  const usShort = (m.usName || "Us").split(" ")[0];
  const themShort = (m.themName || "Them").split(" ")[0];

  // lineup badges derived from the timeline — mirrors the editor's subArrows / playerMarks
  const subOn: Record<string, Set<number>> = { us: new Set(), them: new Set() };
  const subOff: Record<string, Set<number>> = { us: new Set(), them: new Set() };
  const cardsBy: Record<string, Record<number, string[]>> = { us: {}, them: {} };
  (m.timeline || []).forEach((t: any) => {
    const side = t.side === "them" ? "them" : "us";
    if (t.kind === "sub") { if (t.onNum != null) subOn[side].add(t.onNum); if (t.offNum != null) subOff[side].add(t.offNum); }
    if (t.kind === "card" && t.num != null) (cardsBy[side][t.num] ||= []).push(t.card);
  });
  const badges = (n: number, side: "us" | "them") => (
    <>
      {(subOn[side].has(n) || subOff[side].has(n)) && (
        <span className="pm-arrows">{subOn[side].has(n) && <span className="on">▲</span>}{subOff[side].has(n) && <span className="off">▼</span>}</span>
      )}
      {(cardsBy[side][n] || []).map((c, i) => <span key={i} className={"pm-card " + (c === "red" ? "red" : "yellow")} />)}
    </>
  );
  const usScoreFor = (n: number) => (m.usScorers || []).find((s: any) => s.num === n && (s.g || s.p));
  const findName = (n: number) => { const p = (m.starters || []).find((x: any) => x.num === n); return p ? p.name : ""; };

  const sb = useMemo(() => createClient(), []);
  const router = useRouter();
  const [share, setShare] = useState(false);
  const [imgOpen, setImgOpen] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  React.useEffect(() => { sb.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null)); }, []);
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
        menuItems={email ? [{ label: "＋ New", onClick: () => router.push("/m/new") }] : []}
      />
      {share && (
        <div className="mt-live" style={{ marginTop: 0 }}>
          <div className="mt-row"><span className="mt-h" style={{ margin: 0, flex: 1 }}>Share</span><button className="mt-add alt" onClick={() => setShare(false)}>✕ Close</button></div>
          <button className="mt-add" style={{ marginTop: 8 }} onClick={copyLink}>🔗 Copy link</button>
          <button className="mt-add alt" style={{ marginTop: 8 }} onClick={() => { setShare(false); setImgOpen(true); }}>🖼 Share as image</button>
        </div>
      )}
      {imgOpen && <ShareImageModal model={m} filename={imgFilename} title={imgTitle} onClose={() => setImgOpen(false)} />}

      {/* score header (shared with the editor) */}
      {(() => {
        const usIsHome = m.homeAway === "home";
        const usTotal = gpTotal(m.totals.us.g, m.totals.us.p, m.effMode);
        const themTotal = gpTotal(m.totals.them.g, m.totals.them.p, m.effMode);
        const phase = (m.halfMarks || []).some((mk: any) => mk.marker === "FT") ? "over" : "play";
        return (
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
          />
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
          <ScoreChart series={m.series} goalDots={m.goalDots} chartMarkers={m.chartMarkers} htLine={m.htLine} colorUs={m.colorUs} colorThem={m.colorThem} nameUs={m.usName} nameThem={m.themName} mode={m.effMode} />
        </div>
      </section>

      {/* scorers — both teams, combined leaderboard */}
      <section className="pm-sec">
        <p className="pm-label">Scorers</p>
        <Scorers us={m.usScorers} them={m.themScorers} colorUs={m.colorUs} colorUs2={m.colorUs2} colorThem={m.colorThem} colorThem2={m.colorThem2} mode={m.effMode} />
      </section>

      {/* lineup — pitch when we have formation rows, else a flat starters list */}
      {((m.formationRows && m.formationRows.length > 0) || (m.starters && m.starters.length > 0)) && (
        <section className="pm-sec">
          <p className="pm-label">Team · {(m.usName || "").toUpperCase()}</p>
          {(m.formationRows && m.formationRows.length > 0) ? (
            <div className="pm-pitch">
              {m.formationRows.map((row: number[], ri: number) => (
                <div className="pm-pitch-row" key={ri}>
                  {row.map((n, ci) => {
                    const sc = usScoreFor(n);
                    return (
                      <div className="pm-jersey" key={ci}>
                        <Jersey c1={m.colorUs} c2={m.colorUs2} num={n} size={40} />
                        <div className="nm">{findName(n)} {badges(n, "us")}</div>
                        {sc && <div className="sc">{m.effMode === "goals" ? "●".repeat(sc.g) : `${sc.g}-${sc.p}`}</div>}
                      </div>
                    );
                  })}
                </div>
              ))}
              {m.subs && m.subs.length > 0 && (
                <>
                  <div className="pm-subhead">Subs</div>
                  <div className="pm-pitch-row">
                    {m.subs.map((p: any) => {
                      const sc = usScoreFor(p.num);
                      return (
                        <div className="pm-jersey" key={p.num}>
                          <Jersey c1={m.colorUs} c2={m.colorUs2} num={p.num} size={34} />
                          <div className="nm">{p.name} {badges(p.num, "us")}</div>
                          {sc && <div className="sc">{m.effMode === "goals" ? "●".repeat(sc.g) : `${sc.g}-${sc.p}`}</div>}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="pm-lineup-list">
              {m.starters.map((p: any, i: number) => (
                <span className="pm-lineup-item" key={i}>{p.num ? `${p.num}. ` : ""}{p.name}{subOff.us.has(p.num) ? " ▼" : ""}</span>
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
          <Timeline timeline={m.timeline} halfMarks={m.halfMarks} colorUs={m.colorUs} colorUs2={m.colorUs2} colorThem={m.colorThem} colorThem2={m.colorThem2} usName={m.usName} themName={m.themName} />
        </section>
      )}

      {/* brand footer */}
      <BrandFooter />
    </div>
  );
}
