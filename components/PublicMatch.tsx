"use client";
import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import ScoreChart from "@/components/ScoreChart";
import AppHeader from "@/components/AppHeader";
import ScoreHeader from "@/components/ScoreHeader";
import { gpTotal } from "@/lib/util";
import { createClient } from "@/lib/supabase/client";
import { contrastOn } from "@/lib/util";
import { buildInfographicSVG } from "@/lib/infographic";
import { svgToPng } from "@/lib/svg-to-png.client";
import { BRAND_SITE, BRAND_SITE_URL, BRAND_CHANT } from "@/lib/constants";
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

  // subs involved (for lineup arrows), mirrors the poster
  const subOff = new Set<number>();
  (m.timeline || []).forEach((t: any) => { if (t.kind === "sub" && t.offNum != null) subOff.add(t.offNum); });
  const scoreText = (s: any) => (m.effMode === "goals" ? `${s.g}` : `${s.g}-${s.p}`) + (s.frees ? ` (${s.frees}f)` : "");
  const findName = (n: number) => { const p = (m.starters || []).find((x: any) => x.num === n); return p ? p.name : ""; };
  const halves: number[] = [...new Set<number>((m.timeline || []).map((t: any) => t.half as number))].sort((a, b) => a - b);

  const sb = useMemo(() => createClient(), []);
  const router = useRouter();
  const [share, setShare] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  React.useEffect(() => { sb.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null)); }, []);
  const copyLink = () => { navigator.clipboard?.writeText(location.href); };
  const shareImage = () => {
    try {
      const { svg, width, height } = buildInfographicSVG(m);
      svgToPng(svg, width, height).then(({ blob }) => {
        if (!blob) return;
        const file = new File([blob], "match.png", { type: "image/png" });
        if (navigator.canShare && navigator.canShare({ files: [file] })) navigator.share({ files: [file] }).catch(() => {});
        else { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "match.png"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1500); }
      }).catch(() => {});
    } catch { /* ignore */ }
  };

  return (
    <div className="pm-root mt-root">
      <AppHeader
        email={email}
        showNew={!!email}
        onNew={() => router.push("/m/new")}
        onSignIn={async () => { await sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${location.origin}/auth/callback` } }); }}
        onSignOut={async () => { await sb.auth.signOut(); router.refresh(); }}
      >
        <button className="mt-btn ah-icn" aria-label="Share" title="Share" onClick={() => setShare((o) => !o)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
            <line x1="8.6" y1="10.5" x2="15.4" y2="6.5" /><line x1="8.6" y1="13.5" x2="15.4" y2="17.5" />
          </svg>
        </button>
      </AppHeader>
      {share && (
        <div className="mt-live" style={{ marginTop: 0 }}>
          <div className="mt-row"><span className="mt-h" style={{ margin: 0, flex: 1 }}>Share</span><button className="mt-add alt" onClick={() => setShare(false)}>✕ Close</button></div>
          <button className="mt-add" style={{ marginTop: 8 }} onClick={copyLink}>🔗 Copy link</button>
          <button className="mt-add alt" style={{ marginTop: 8 }} onClick={shareImage}>🖼 Share as image</button>
        </div>
      )}

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
        <div className="pm-stats">
          <div className="pm-stat"><b>{m.ht || "—"}</b><span>Half-time</span></div>
          <div className="pm-stat"><b>{m.leadChanges}</b><span>Lead changes</span></div>
          <div className="pm-stat"><b>{m.timesLevel}</b><span>Times level</span></div>
          <div className="pm-stat"><b>{m.maxLead}</b><span>Biggest lead{m.maxLeadSide ? ` · ${(m.maxLeadSide === "us" ? usShort : themShort)}` : ""}</span></div>
        </div>
      </section>

      {/* chart */}
      <section className="pm-sec">
        <p className="pm-label">Score progression</p>
        <div className="pm-chart">
          <ScoreChart series={m.series} goalDots={m.goalDots} htLine={m.htLine} colorUs={m.colorUs} colorThem={m.colorThem} />
        </div>
      </section>

      {/* scorers */}
      <section className="pm-sec">
        <p className="pm-label">Scorers · {(m.usName || "").toUpperCase()}</p>
        {!m.usScorers.length && <p className="pm-empty">No scores recorded</p>}
        {m.usScorers.map((s: any, i: number) => (
          <div className="pm-scorer" key={i}>
            <span>{s.num ? `${s.num}. ` : ""}{s.name}</span><b>{scoreText(s)}</b>
          </div>
        ))}
      </section>

      {/* opponent scorers */}
      {m.themScorers && m.themScorers.length > 0 && (
        <section className="pm-sec">
          <p className="pm-label">Scorers · {(m.themName || "").toUpperCase()}</p>
          {m.themScorers.map((s: any, i: number) => (
            <div className="pm-scorer" key={i}>
              <span>{s.num ? `${s.num}. ` : ""}{s.name}</span><b>{scoreText(s)}</b>
            </div>
          ))}
        </section>
      )}

      {/* lineup — pitch when we have formation rows, else a flat starters list */}
      {((m.formationRows && m.formationRows.length > 0) || (m.starters && m.starters.length > 0)) && (
        <section className="pm-sec">
          <p className="pm-label">Team · {(m.usName || "").toUpperCase()}</p>
          {(m.formationRows && m.formationRows.length > 0) ? (
            <div className="pm-pitch">
              {m.formationRows.map((row: number[], ri: number) => (
                <div className="pm-pitch-row" key={ri}>
                  {row.map((n, ci) => {
                    const sc = (m.usScorers || []).find((s: any) => s.num === n && (s.g || s.p));
                    return (
                      <div className="pm-jersey" key={ci}>
                        <div className="sq" style={{ background: m.colorUs, color: contrastOn(m.colorUs) }}>{n}</div>
                        <div className="nm">{findName(n)}{subOff.has(n) ? " ▼" : ""}</div>
                        {sc && <div className="sc">{m.effMode === "goals" ? "●".repeat(sc.g) : `${sc.g}-${sc.p}`}</div>}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          ) : (
            <div className="pm-lineup-list">
              {m.starters.map((p: any, i: number) => (
                <span className="pm-lineup-item" key={i}>{p.num ? `${p.num}. ` : ""}{p.name}{subOff.has(p.num) ? " ▼" : ""}</span>
              ))}
            </div>
          )}
          {m.subs && m.subs.length > 0 && <p className="pm-bench">Subs: {m.subs.map((p: any) => `${p.num} ${p.name}`).join("  ·  ")}</p>}
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
                    <div className="sq" style={{ background: m.colorThem, color: contrastOn(m.colorThem) }}>{n}</div>
                    <div className="nm">{op ? op.name : ""}</div>
                  </div>
                ); })}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* timeline */}
      {(m.timeline && m.timeline.length > 0) && (
        <section className="pm-sec">
          <p className="pm-label">Timeline</p>
          <div className="pm-tl">
            {halves.map((h) => (
              <React.Fragment key={h}>
                <div className="pm-half"><span>{h === 1 ? "FIRST HALF" : h === 2 ? "SECOND HALF" : `PERIOD ${h}`}</span></div>
                {m.timeline.filter((t: any) => t.half === h).map((it: any, i: number) => {
                  const mm = it.minute != null ? `${it.mmin || it.minute}'` : "";
                  const us = it.side === "us";
                  if (it.kind === "score") {
                    const col = us ? m.colorUs : m.colorThem;
                    const evName = it.scorer === "Opposition" ? m.themName : it.scorer;
                    const label = `${evName}${it.type === "goal" ? "  GOAL" : it.fromFree ? "  (free)" : it.setPiece ? `  ('${it.setPiece})` : ""}`;
                    const run = `${it.usScore} – ${it.themScore}`;
                    return (
                      <div className="pm-ev" key={i}>
                        <div className="us">{us && <><span className="min">{mm}</span> {label}<div className="run">{run}</div></>}</div>
                        <div className="dot" style={{ background: col }} />
                        <div className="them">{!us && <>{mm} {label}<div className="run">{run}</div></>}</div>
                      </div>
                    );
                  }
                  if (it.kind === "sub") {
                    return (
                      <div className="pm-ev" key={i}>
                        <div className="us">{mm} <span className="on">▲ {it.on}</span> <span className="off">▼ {it.off}</span></div>
                        <div className="dot alt" />
                        <div className="them" />
                      </div>
                    );
                  }
                  return (
                    <div className="pm-ev" key={i}>
                      <div className="us note">{mm} {it.text}</div>
                      <div className="dot alt" />
                      <div className="them" />
                    </div>
                  );
                })}
              </React.Fragment>
            ))}
          </div>
        </section>
      )}

      {/* brand footer */}
      <footer className="pm-foot">
        <svg width="56" height="32" viewBox="0 0 128 70" aria-hidden="true">
          <rect x="4" y="8" width="120" height="54" rx="27" fill="#0c3b2a" stroke="#f5c518" strokeWidth="4" />
          <text x="64" y="48" fontSize="34" textAnchor="middle" style={{ fontFamily: "var(--font-bebas), sans-serif" }}>
            <tspan fill="#f4efe1">HW</tspan><tspan fill="#f5c518">G</tspan>
          </text>
        </svg>
        <a href={BRAND_SITE_URL}>{BRAND_SITE}</a>
        <div className="pm-chant">{BRAND_CHANT}</div>
      </footer>
    </div>
  );
}
