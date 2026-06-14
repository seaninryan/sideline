// @ts-nocheck
"use client";
import React from "react";
import { useMatchEditor } from "@/components/match-tracker/useMatchEditor";
import MinuteStep from "@/components/MinuteStep";
import ScoreChart from "@/components/ScoreChart";
import RosterPitch from "@/components/RosterPitch";
import Jersey from "@/components/Jersey";
import ShareSheet from "@/components/ShareSheet";
import ShareImageModal from "@/components/ShareImageModal";
import TeamPicker from "@/components/TeamPicker";
import SportIcon from "@/components/SportIcon";
import AppHeader from "@/components/AppHeader";
import BrandFooter from "@/components/BrandFooter";
import ScoreHeader from "@/components/ScoreHeader";
import StatGrid from "@/components/StatGrid";
import Scorers from "@/components/Scorers";
import Timeline from "@/components/Timeline";
import { addPlayer } from "@/lib/team-roster";
import { gpTotal, contrastOn, fmtDateDow } from "@/lib/util";
import { PALETTE, SPORTS } from "@/lib/constants";
import { whoToken } from "@/lib/event-line";
import { htScore } from "@/lib/half-time";
import { teamStore } from "@/lib/team-store";

// little flag on a pole — the GAA goal (green) / point (white) motif, matching the chart
function Flag({ fill }) {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true" style={{ flex: "none" }}>
      <line x1="3.5" y1="1.5" x2="3.5" y2="14.5" stroke="#3a3a3a" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M3.5 2 L13 4.4 L3.5 7.6 Z" fill={fill} stroke="#3a3a3a" strokeWidth="0.9" strokeLinejoin="round" />
    </svg>
  );
}
// icon for a live-entry event button; goal/point are mode-aware (GAA flags vs a soccer ball)
function evIcon(key, mode) {
  switch (key) {
    case "goal": case "goalfree": case "og": return mode === "goals" ? <span aria-hidden="true">⚽</span> : <Flag fill="#1f9d3f" />;
    case "point": case "pointfree": case "point65": case "point45": return <Flag fill="#fbfbf5" />;
    case "yellow": return <span aria-hidden="true">🟨</span>;
    case "red": return <span aria-hidden="true">🟥</span>;
    case "corner": return <span aria-hidden="true">🚩</span>;
    case "sub": return <span aria-hidden="true">🔁</span>;
    case "half": return <span aria-hidden="true">▶️</span>;
    case "ht": return <span aria-hidden="true">⏸️</span>;
    case "ft": return <span aria-hidden="true">🏁</span>;
    default: return null;
  }
}

export default function MatchTracker({ initialId = null, wizard = false }: { initialId?: string | null; wizard?: boolean }) {
  const {
    router, sb,
    raw, setRaw, recordPayload, curId,
    homeTeam, setHomeTeam, awayTeam, setAwayTeam,
    colorHome, setColorHome, colorHome2, setColorHome2, colorAway, setColorAway, colorAway2, setColorAway2,
    homeRoster, setHomeRoster, awayRoster, setAwayRoster,
    homeTeamId, setHomeTeamId, awayTeamId, setAwayTeamId,
    homeSquad, setHomeSquad, awaySquad, setAwaySquad,
    nameDisplay, setNameDisplay,
    label, setLabel,
    sport, setSport,
    matchDate, setMatchDate,
    userEmail, userUid, userIsAdmin,
    saved, savedMsg, refreshList,
    colorPick, setColorPick,
    modal, setModal,
    menuOpen, setMenuOpen,
    confirmDel, setConfirmDel,
    exportText, importText, setImportText,
    notaView, setNotaView,
    blkEdit, setBlkEdit, blkIns, setBlkIns, lineupEdit, setLineupEdit,
    remoteConflict, setRemoteConflict,
    showDetails, setShowDetails,
    tab, setTab, view, tabs,
    canUndo, undoRaw, doUndo, undoTarget,
    parsed, header, roster, totals, result, series, goalDots, chartMarkers, scorers, scoring, notes, halfMarks, htLine,
    effMode, sportLabel, homeName, awayName, usedColors,
    timeline, timelineHA, homeScorers, awayScorers, homeSeries,
    homeColor, awayColor, homeColor2, awayColor2, homeSquadV, awaySquadV,
    maxLeadVenue, starters, subs, missing, formationRows, liveRows, liveEvents, chunk,
    phase, evEnabled,
    blocks,
    doSave, doLoad, doResyncLatest, doNew, doDuplicate, doDelete,
    setHeaderField, onHomeTeamChange,
    append, completeSub, evLabel, pickGmTeam, onPitchSet, benchSet, gmPicker,
    tapPitch, tapBench, resetLineupModes, tapPlayer, renumValid, applyRenum,
    whoCtx, buildEventLine, liveLine, whoGrid, addLive,
    enterNew, enterShare,
    nwPickHome, nwCreateHome, nwPickAway, nwCreateAway,
    reTeamPickHome, reTeamCreateHome, reTeamPickAway, reTeamCreateAway, reTeamApply,
    finishNew, doSwap,
    blkPill, openBlk, blkOk, blkDelete, openInsert, openLineup, lineupOk,
    insCommit, insPickTeam, subWho, noteLine, notePhantom,
    subArrows, playerMarks, scoreFor,
    doExport, openBackup, copyExport, doImport,
    subPick, setSubPick, editLineup, setEditLineup,
    gmStage, setGmStage,
    nw, setNw, nwTeams, setNwTeams, reTeam, setReTeam,
    share, setShare, shareModel, setShareModel,
    EMPTY_ROSTER,
  } = useMatchEditor({ initialId, wizard });

  return (
    <div className="mt-root">

      {/* frozen top chrome — header + scoreboard + tabs stay pinned while the body scrolls */}
      <div className="mt-frozen">
      {/* persistent header */}
      {!nw && (
        <AppHeader
          email={userEmail}
          onSignOut={async () => { await sb.auth.signOut(); router.push("/"); }}
          primary={
            <button className="mt-btn ah-icn" aria-label="Share" title="Share" onClick={enterShare}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
                <line x1="8.6" y1="10.5" x2="15.4" y2="6.5" /><line x1="8.6" y1="13.5" x2="15.4" y2="17.5" />
              </svg>
            </button>
          }
          screen="editor"
          isAdmin={userIsAdmin}
        />
      )}
      {!nw && remoteConflict && (
        <div className="mt-warn">
          Updated on another device.
          <button className="mt-add alt" style={{ marginLeft: 8 }} onClick={doResyncLatest}>Load latest</button>
        </div>
      )}
      {nw && (
        <AppHeader
          email={userEmail}
          onSignOut={async () => { await sb.auth.signOut(); router.push("/"); }}
          screen="editor"
        />
      )}

      {!nw && shareModel && (
        <ShareImageModal model={shareModel.model} filename={shareModel.filename} title={shareModel.title} onClose={() => setShareModel(null)} />
      )}

      {!nw && modal && (
        <div className="mt-panel">
          {modal.kind === "backup" && (
            <>
              <div className="mt-panel-head"><h3>Backup &amp; transfer</h3><button className="mt-add alt" onClick={() => setModal(null)}>Close</button></div>
              <p className="hint">From the device that has your matches, tap Copy, then paste it into Import on the other device. ({modal.count} saved here.)</p>
              <textarea readOnly value={exportText} onClick={(e) => e.target.select()} />
              <div className="row"><button className="mt-add" onClick={copyExport}>Copy</button></div>
              <p className="hint" style={{ marginTop: 14 }}>Import — paste a backup here to load every match onto this device:</p>
              <textarea value={importText} placeholder="paste backup text here" onChange={(e) => setImportText(e.target.value)} />
              <div className="row"><button className="mt-add" onClick={doImport} disabled={!importText.trim()}>Import</button></div>
            </>
          )}
        </div>
      )}

      {!nw && share && curId && (
        <ShareSheet
          record={{ ...recordPayload(), savedAt: Date.now() }}
          curId={curId}
          onClose={() => setShare(false)}
          onShareImage={() => { setShare(false); doExport(); }}
          onApplied={({ nameDisplay }) => setNameDisplay(nameDisplay)}
        />
      )}

      {/* score header (shared with the public page) — the editor adds an Edit-details toggle on the panel */}
      {!nw && (() => {
        const homeT = totals.home;
        const awayT = totals.away;
        return (
          <ScoreHeader
            homeName={homeName}
            awayName={awayName}
            homeStr={homeT.str}
            awayStr={awayT.str}
            homeColors={[homeColor, homeColor2]}
            awayColors={[awayColor, awayColor2]}
            grade={header.label || sportLabel || ""}
            dateStr={matchDate ? fmtDateDow(matchDate) : ""}
            homeTotal={gpTotal(homeT.g, homeT.p, effMode)}
            awayTotal={gpTotal(awayT.g, awayT.p, effMode)}
            phase={phase}
            live={phase === "play" || phase === "ht"}
            homeSquad={homeSquadV}
            awaySquad={awaySquadV}
            action={<button className="sh-edit" onClick={() => { setShowDetails((o) => !o); if (showDetails) setColorPick(null); }}>{showDetails ? "▾ Hide" : "✎ Edit"}</button>}
          />
        );
      })()}

      {/* match details panel — drops below the scoreboard */}
      {!nw && showDetails && (
      <div className="mt-settings">
        <label>Date <input type="date" value={(matchDate || "").slice(0, 10)} onChange={(e) => e.target.value && setMatchDate(`${e.target.value}T${(matchDate || "").slice(11, 16) || "12:00"}`)} />
          <input type="time" value={(matchDate || "").slice(11, 16)} onChange={(e) => e.target.value && setMatchDate(`${(matchDate || "").slice(0, 10)}T${e.target.value}`)} /></label>
        <label>Home team <input type="text" value={homeTeam} onChange={(e) => onHomeTeamChange(e.target.value)} /> <button className="mt-swatch" title="Primary" style={{ background: colorHome }} onClick={() => setColorPick(colorPick === "home" ? null : "home")} /><button className="mt-swatch" title="Secondary" style={{ background: colorHome2 }} onClick={() => setColorPick(colorPick === "home2" ? null : "home2")} /></label>
        <button className="mt-btn" title="Swap home/away" onClick={doSwap}>⇄ Swap</button>
        <label>Away team <input type="text" value={awayTeam} placeholder="Away team"
          onChange={(e) => setHeaderField("away", e.target.value)} /> <button className="mt-swatch" title="Primary" style={{ background: colorAway }} onClick={() => setColorPick(colorPick === "away" ? null : "away")} /><button className="mt-swatch" title="Secondary" style={{ background: colorAway2 }} onClick={() => setColorPick(colorPick === "away2" ? null : "away2")} /></label>
        <label>Sport
          <select className="mt-sel" style={{ color: "#222", background: "#fffdf6", borderColor: "#d8cfb8" }}
            value={sport}
            onChange={(e) => {
              const v = e.target.value;
              if (v === sport) return;
              setReTeam({ sport: v, prevSport: sport, home: null, away: null });
              if (userUid) teamStore.list(userUid).then(setNwTeams).catch(() => {});
            }}>
            {!sport && <option value="" disabled>— choose sport —</option>}
            {Object.entries(SPORTS).map(([k, s]) => <option key={k} value={k}>{s.emoji} {s.label}</option>)}
          </select>
        </label>
        {reTeam && (
          <div className="mt-live" style={{ marginTop: 10 }}>
            <div className="mt-row">
              <span className="mt-h" style={{ margin: 0, flex: 1 }}>Re-pick teams for {SPORTS[reTeam.sport]?.label || "new sport"}</span>
              <button className="mt-add alt" onClick={() => setReTeam(null)}>✕ Cancel</button>
            </div>
            {!reTeam.home ? (
              <>
                <p className="mt-note" style={{ marginTop: 0, marginBottom: 8 }}>Pick the home team, or create one.</p>
                <TeamPicker teams={nwTeams} sport={reTeam.sport} onPick={reTeamPickHome} onCreate={reTeamCreateHome} />
              </>
            ) : (
              <>
                <p className="mt-note" style={{ marginTop: 0, marginBottom: 8 }}>Home team: <b>{reTeam.home.name}</b>. Now pick the away team{reTeam.away ? <> — <b>{reTeam.away.name}</b></> : ", or create one"}.</p>
                <TeamPicker teams={nwTeams} sport={reTeam.sport} exclude={reTeam.home.id} onPick={reTeamPickAway} onCreate={reTeamCreateAway} />
                <div className="mt-row" style={{ marginTop: 10 }}>
                  <button className="mt-add alt" onClick={() => setReTeam({ ...reTeam, home: null, away: null })}>← Back</button>
                  <button className="mt-add" style={{ flex: 1, marginLeft: 8 }} disabled={!reTeam.away} onClick={reTeamApply}>Apply {SPORTS[reTeam.sport]?.label} teams</button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
      )}

      {!nw && showDetails && colorPick && (() => {
        const map = {
          home: [colorHome, setColorHome, `${homeName} — primary`], home2: [colorHome2, setColorHome2, `${homeName} — secondary`],
          away: [colorAway, setColorAway, `${awayName} — primary`], away2: [colorAway2, setColorAway2, `${awayName} — secondary`],
        };
        const [val, setVal, label] = map[colorPick];
        const sw = (c) => (
          <button key={c} className={"mt-swatch big" + (c === (val || "").toLowerCase() ? " on" : "")}
            style={{ background: c }} onClick={() => { setVal(c); setColorPick(null); }} title={c} />
        );
        return (
          <div className="mt-live" style={{ marginTop: 0 }}>
            <div className="mt-row">
              <span className="mt-h" style={{ margin: 0 }}>Colour — {label}</span>
              <button className="mt-add alt" style={{ marginLeft: "auto" }} onClick={() => setColorPick(null)}>Done</button>
            </div>
            {usedColors.length > 0 && <>
              <p className="mt-note" style={{ marginTop: 10, marginBottom: 4 }}>Used before</p>
              <div className="mt-row">{usedColors.map(sw)}</div>
            </>}
            <p className="mt-note" style={{ marginTop: 10, marginBottom: 4 }}>Palette</p>
            <div className="mt-row">{PALETTE.filter((c) => !usedColors.includes(c)).map(sw)}</div>
            <p className="mt-note" style={{ marginTop: 10, marginBottom: 4 }}>Advanced — exact colour
              <input type="color" value={val} onChange={(e) => setVal(e.target.value)} style={{ marginLeft: 8, verticalAlign: "middle" }} /></p>
          </div>
        );
      })()}

      {/* tabs */}
      {!nw && (
      <div className="mt-tabs">
        {tabs.map(([id, lbl]) => (
          <button key={id} className={"mt-tab" + (tab === id ? " on" : "")} onClick={() => setTab(id)}>{lbl}</button>
        ))}
      </div>
      )}
      </div>{/* /mt-frozen */}
      {savedMsg && <div className="mt-toast">{savedMsg}</div>}

      <div className="mt-body">
        {view === "new" && (
          <div className="mt-game nw">
            <div className="mt-row" style={{ marginBottom: 8 }}>
              <span className="mt-h" style={{ margin: 0, flex: 1 }}>{nw.stage === "home" ? "Home team" : nw.stage === "away" ? "Away team" : "New match"}</span>
              <button className="mt-add alt" onClick={() => router.push("/")}>✕ Cancel</button>
            </div>

            {(() => {
              const idx = nw.stage === "date" ? 0 : nw.stage === "home" ? 1 : 2;
              return (
                <div className="nw-steps" aria-label={`Step ${idx + 1} of 3`}>
                  {[0, 1, 2].map((i) => (
                    <React.Fragment key={i}>
                      {i > 0 && <span className={"nw-bar" + (i <= idx ? " done" : "")} />}
                      <span className={"nw-dot" + (i === idx ? " on" : i < idx ? " done" : "")}>{i + 1}</span>
                    </React.Fragment>
                  ))}
                </div>
              );
            })()}

            {/* stage 1 — when + sport */}
            {nw.stage === "date" && (
              <>
                <p className="nw-prompt">First, choose when the match will be</p>
                <div className="mt-row nw-date">
                  <input type="date" value={nw.date.slice(0, 10)} onChange={(e) => e.target.value && setNw({ ...nw, date: `${e.target.value}T${nw.date.slice(11, 16)}` })} />
                  <input type="time" value={nw.date.slice(11, 16)} onChange={(e) => e.target.value && setNw({ ...nw, date: `${nw.date.slice(0, 10)}T${e.target.value}` })} />
                </div>
                {(() => { const d = new Date(nw.date); return isNaN(d.getTime()) ? null : <p className="nw-dow">{d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}</p>; })()}
                <p className="nw-prompt" style={{ marginTop: 18 }}>…and which sport</p>
                <div className="nw-sports">
                  {Object.entries(SPORTS).map(([k, s]) => (
                    <button key={k} className={"nw-sport" + (nw.sport === k ? " on" : "")} onClick={() => setNw({ ...nw, sport: k, home: null, away: null })}>
                      <SportIcon sport={k} size={22} /> <span>{s.label}</span>
                    </button>
                  ))}
                </div>
                <div className="nw-nav">
                  <span className="grow" />
                  <button className="nw-link" disabled={!nw.sport} onClick={() => setNw({ ...nw, stage: "home" })}>Next →</button>
                </div>
              </>
            )}

            {/* stage 2 — home team */}
            {nw.stage === "home" && (
              <>
                <p className="mt-note" style={{ marginTop: 0, marginBottom: 8 }}>Pick the home team, or create one.</p>
                <TeamPicker teams={nwTeams} sport={nw.sport} onPick={nwPickHome} onCreate={nwCreateHome} />
                <div className="nw-nav">
                  <button className="nw-link" onClick={() => setNw({ ...nw, stage: "date" })}>← Back</button>
                </div>
              </>
            )}

            {/* stage 3 — away team (Create finishes) */}
            {nw.stage === "away" && (
              <>
                <p className="mt-note" style={{ marginTop: 0, marginBottom: 8 }}>Pick the away team{nw.away ? <> — <b>{nw.away.name}</b></> : ", or create one"}.</p>
                <TeamPicker teams={nwTeams} sport={nw.sport} exclude={nw.home && nw.home.id} onPick={nwPickAway} onCreate={nwCreateAway} />
                <div className="nw-nav">
                  <button className="nw-link" onClick={() => setNw({ ...nw, stage: "home", away: null })}>← Back</button>
                  <button className="mt-big gm-team" style={{ flex: 1, marginLeft: 10 }} disabled={!nw.home || !nw.away} onClick={finishNew}>Create match →</button>
                </div>
              </>
            )}
          </div>
        )}
        {view === "game" && (
          <div className="mt-game">
            <div className={"gm-phase gm-phase--" + phase}>
              <span className="dot" />
              <span className="lbl">
                {phase === "pre" ? "Before throw-in" : phase === "ht" ? "Half time" : phase === "over" ? "Full time" : `Half ${halfMarks.filter((m) => !m.marker).length} · in play`}
              </span>
            </div>

            {/* full time: only Undo + a pointer to Advanced */}
            {phase === "over" && (
              <p className="mt-note" style={{ marginTop: 0 }}>
                <b>Full time — match closed.</b> Need to change something? Edit it in the <b>Advanced</b> tab. (Or undo the FT line below to keep adding.)
              </p>
            )}

            {/* stage 1 — what happened? all events here; team is picked next where it matters */}
            {phase !== "over" && gmStage.stage === "event" && (
              (phase === "pre" || phase === "ht") ? (
                <>
                  <div className="mt-grid">
                    <button className="mt-big gm-team ev" onClick={() => addLive("half", null)}>{evIcon("half")}<span>Start half</span></button>
                  </div>
                  <p className="mt-note" style={{ marginTop: 10, marginBottom: 0 }}>
                    {phase === "pre" ? "Tap Start half at throw-in to open scoring." : "Half time — Start half opens the second half."}
                  </p>
                </>
              ) : (
                <>
                  <p className="mt-note" style={{ marginTop: 0, marginBottom: 8 }}>What happened?</p>
                  <div className="mt-grid">
                    {liveEvents.filter((ev) => !["half", "ht", "ft"].includes(ev.key)).map((ev) => (
                      <button key={ev.key} className="mt-big ev" onClick={() => setGmStage({ stage: "team", ev: ev.key })}>{evIcon(ev.key, effMode)}<span>{ev.label}</span></button>
                    ))}
                    <button className="mt-big ev" onClick={() => setGmStage({ stage: "team", ev: "sub" })}>{evIcon("sub")}<span>Sub</span></button>
                  </div>
                  <div className="mt-grid" style={{ marginTop: 10 }}>
                    <button className="mt-big ev" onClick={() => addLive("ht", null)}>{evIcon("ht")}<span>HT</span></button>
                    <button className="mt-big ev" onClick={() => addLive("ft", null)}>{evIcon("ft")}<span>FT</span></button>
                  </div>
                </>
              )
            )}

            {/* stage 2 — which team? (scores, cards, corner, sub) */}
            {phase !== "over" && gmStage.stage === "team" && (
              <>
                <p className="mt-note" style={{ marginTop: 0, marginBottom: 8 }}>{evLabel(gmStage.ev)} — which team?</p>
                <div className="mt-grid">
                  <button className="mt-big gm-team" style={{ background: colorHome, color: contrastOn(colorHome) }} onClick={() => pickGmTeam("home")}>{homeName}</button>
                  <button className="mt-big gm-team" style={{ background: colorAway, color: contrastOn(colorAway) }} onClick={() => pickGmTeam("away")}>{awayName}</button>
                </div>
                <button className="mt-add alt" style={{ marginTop: 12 }} onClick={() => setGmStage({ stage: "event" })}>← Back</button>
              </>
            )}

            {/* stage 3 — which player? (scores / cards) */}
            {phase !== "over" && gmStage.stage === "who" && (
              <>
                <p className="mt-note" style={{ marginTop: 0, marginBottom: 8 }}>{evLabel(gmStage.ev)} · {gmStage.team === "away" ? awayName : homeName} — who?</p>
                {gmPicker(gmStage.team, (p) => { addLive(gmStage.ev, p, gmStage.team); setGmStage({ stage: "event" }); }, { allowUnknown: true })}
                <button className="mt-add alt" style={{ marginTop: 12 }} onClick={() => setGmStage({ stage: "team", ev: gmStage.ev })}>← Back</button>
              </>
            )}

            {/* sub flow — off then on, on the team's jersey pitch */}
            {phase !== "over" && gmStage.stage === "subOff" && (
              <>
                <p className="mt-note" style={{ marginTop: 0, marginBottom: 8 }}>{gmStage.team === "away" ? awayName : homeName} sub — who goes off?</p>
                {gmPicker(gmStage.team, (p) => setGmStage({ ...gmStage, stage: "subOn", off: p }), { eligible: onPitchSet(gmStage.team) })}
                <button className="mt-add alt" style={{ marginTop: 12 }} onClick={() => setGmStage({ stage: "team", ev: "sub" })}>← Back</button>
              </>
            )}
            {phase !== "over" && gmStage.stage === "subOn" && (
              <>
                <p className="mt-note" style={{ marginTop: 0, marginBottom: 8 }}>{gmStage.off.name || gmStage.off.num} off — who comes on?</p>
                {gmPicker(gmStage.team, (p) => { completeSub(p, gmStage.off, gmStage.team); setGmStage({ stage: "event" }); }, { eligible: benchSet(gmStage.team) })}
                <button className="mt-add alt" style={{ marginTop: 12 }} onClick={() => setGmStage({ ...gmStage, stage: "subOff" })}>← Back</button>
              </>
            )}

            {/* pinned bottom: last entry + undo */}
            <div className="gm-undo">
              <span className="t">{undoTarget ? `Last: ${undoTarget.text}` : "Nothing added yet"}</span>
              <button className="mt-add alt" disabled={!canUndo} onClick={undoRaw}>↩ Undo</button>
            </div>

            {/* running timeline beneath the controls */}
            <p className="mt-h" style={{ marginTop: 16 }}>Timeline</p>
            <Timeline timeline={timelineHA} halfMarks={halfMarks} colorHome={homeColor} colorHome2={homeColor2} colorAway={awayColor} colorAway2={awayColor2} nameHome={homeName} nameAway={awayName} />
          </div>
        )}

        {view === "details" && (
          <>
            {parsed.warnings.length > 0 && (
              <div className="mt-warn">
                <b>Heads up — check {parsed.warnings.length} {parsed.warnings.length === 1 ? "entry" : "entries"}.</b>
                <span> {parsed.warnings.map((w) => `${w.minute}' — ${w.msg}`).join("; ")}.</span>
              </div>
            )}
            <StatGrid stats={[
              { k: "Half-time", v: htScore(parsed.series, effMode) },
              { k: "Lead changes", v: parsed.leadChanges },
              { k: "Times level", v: parsed.timesLevel },
              { k: `Biggest lead${maxLeadVenue ? " · " + (maxLeadVenue === "home" ? homeName : awayName) : ""}`, v: parsed.maxLead },
            ]} />

            <p className="mt-h">Score progression</p>
            <div style={{ width: "100%" }}>
              <ScoreChart series={homeSeries} goalDots={goalDots} chartMarkers={chartMarkers} htLine={htLine} colorHome={homeColor} colorAway={awayColor} mode={effMode} />
            </div>

            <p className="mt-h" style={{ marginTop: 18 }}>Scorers</p>
            <Scorers home={homeScorers} away={awayScorers} colorHome={homeColor} colorHome2={homeColor2} colorAway={awayColor} colorAway2={awayColor2} mode={effMode} />

            <p className="mt-h" style={{ marginTop: 18 }}>Timeline</p>
            <Timeline timeline={timelineHA} halfMarks={halfMarks} colorHome={homeColor} colorHome2={homeColor2} colorAway={awayColor} colorAway2={awayColor2} nameHome={homeName} nameAway={awayName} />
          </>
        )}

        {view === "lineup" && (editLineup ? (() => {
          const side = editLineup === "away" ? "away" : "home";
          const roster = (side === "away" ? awayRoster : homeRoster) || EMPTY_ROSTER;
          const setRoster = side === "away" ? setAwayRoster : setHomeRoster;
          const c1 = side === "away" ? colorAway : colorHome, c2 = side === "away" ? colorAway2 : colorHome2;
          const nm = side === "away" ? awayName : homeName;
          return (
            <>
              <div className="mt-row" style={{ marginBottom: 8 }}>
                <span className="mt-h" style={{ margin: 0, flex: 1 }}>Edit {nm} — tap to rename/renumber; ⇄ Swap or ↕ Move</span>
                <button className="mt-add" onClick={() => setEditLineup(false)}>✓ Done</button>
              </div>
              <RosterPitch roster={roster} color1={c1} color2={c2} editable onChange={setRoster} />
              <div className="mt-row" style={{ marginTop: 8 }}>
                <button className="mt-add alt" onClick={() => setRoster(addPlayer(roster, "starting"))}>+ Player</button>
                <button className="mt-add alt" onClick={() => setRoster(addPlayer(roster, "sub"))}>+ Sub</button>
              </div>
            </>
          );
        })() : (() => {
          // one editable pitch per side, keyed by venue; home then away
          const renderEditPitch = (side) => {
            const isHome = side === "home";
            const rosterObj = isHome ? homeRoster : awayRoster;
            const c1 = isHome ? colorHome : colorAway, c2 = isHome ? colorHome2 : colorAway2;
            const nm = isHome ? homeName : awayName;
            const players = (rosterObj && rosterObj.players) || [];
            const rows = isHome
              ? formationRows
              : ((rosterObj && rosterObj.formation && rosterObj.formation.length)
                  ? rosterObj.formation
                  : chunk(players.filter((p) => p.role !== "sub").map((p) => p.num), 3));
            const sideStarters = isHome ? starters : players.filter((p) => p.role !== "sub" && p.role !== "missing");
            const sideSubs = isHome ? subs : players.filter((p) => p.role === "sub");
            const sideMissing = isHome ? missing : players.filter((p) => p.role === "missing");
            const hasLineup = isHome ? formationRows.length > 0 : (rosterObj && rosterObj.formation && rosterObj.formation.length > 0);
            return (
              <React.Fragment key={side}>
                <div className="mt-row" style={{ marginTop: isHome ? 0 : 18, marginBottom: 6 }}>
                  <span className="mt-h" style={{ margin: 0, flex: 1 }}>{nm}</span>
                  <button className="mt-add alt" onClick={() => setEditLineup(side)}>✎ Edit lineup</button>
                </div>
                {hasLineup ? (
                  <div className="mt-pitch" style={{ background: `linear-gradient(${c2}22, #0c3b2a 60%)` }}>
                    {rows.map((row, ri) => (
                      <div className="mt-line" key={ri}>
                        {row.map((n) => {
                          const p = sideStarters.find((x) => x.num === n);
                          const picked = subPick && subPick.side === side && subPick.role === "off" && subPick.num === n;
                          return (
                            <div className="mt-jersey" key={n} style={{ cursor: "pointer", outline: picked ? "2px solid #f5c518" : "none", outlineOffset: 2, borderRadius: 8 }} onClick={() => tapPlayer({ num: n, name: p ? p.name : String(n) }, "pitch", side)}>
                              <Jersey c1={c1} c2={c2} num={n} size={isHome ? 44 : 40} />
                              <div className="nm">{p ? p.name : ""} {subArrows(n, side)}{playerMarks(n, side)}</div>
                              {scoreFor(n, side)}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                    {sideSubs.length > 0 && (
                      <>
                        <div className="rp-subhead">Subs</div>
                        <div className="mt-line">
                          {sideSubs.map((p) => {
                            const picked = subPick && subPick.side === side && subPick.role === "on" && subPick.num === p.num;
                            return (
                              <div className="mt-jersey" key={p.num} style={{ cursor: "pointer", outline: picked ? "2px solid #f5c518" : "none", outlineOffset: 2, borderRadius: 8 }} onClick={() => tapPlayer({ num: p.num, name: p.name }, "bench", side)}>
                                <Jersey c1={c1} c2={c2} num={p.num} size={36} />
                                <div className="nm">{p.name} {subArrows(p.num, side)}{playerMarks(p.num, side)}</div>
                                {scoreFor(p.num, side)}
                              </div>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>
                ) : (
                  <p className="mt-note">No {nm} lineup yet — tap Edit lineup to add players.</p>
                )}
                {sideMissing.length > 0 && <><p className="mt-h" style={{ marginTop: 14 }}>Missing</p><div className="mt-bench">{sideMissing.map((p) => <span className="b miss" key={p.num}>{p.num}. {p.name}</span>)}</div></>}
              </React.Fragment>
            );
          };
          return (
            <>
              {renderEditPitch("home")}
              {subPick ? (
                <div className="mt-live" style={{ marginTop: 10, marginBottom: 0 }}>
                  <div className="mt-row">
                    <span className="mt-h" style={{ margin: 0 }}>
                      {subPick.role === "off" ? <>{subPick.num}. {subPick.name} off — now tap who comes on</> : <>{subPick.num}. {subPick.name} on — now tap who comes off</>}
                    </span>
                    <button className="mt-add alt" style={{ marginLeft: "auto" }} onClick={() => setSubPick(null)}>Cancel</button>
                  </div>
                </div>
              ) : (
                <p className="mt-note" style={{ marginTop: 8 }}>Substitution: tap the player going off and the sub coming on (either order). The minute is filled in for you — edit it in Notation any time.</p>
              )}
              {renderEditPitch("away")}
            </>
          );
        })())}

        {view === "advanced" && (
          <>
            <div className="mt-row" style={{ marginTop: 0, marginBottom: 6 }}>
              <p className="mt-h" style={{ margin: 0, flex: 1 }}>{notaView === "blocks" ? "Notation — tap a line to edit" : "Raw notation (edit freely — re-parses instantly)"}</p>
              {canUndo && <button className="mt-add alt" onClick={undoRaw}>↩ Undo</button>}
              <button className="mt-add alt" onClick={() => { setBlkEdit(null); setBlkIns(null); setLineupEdit(null); setNotaView(notaView === "blocks" ? "text" : "blocks"); }}>
                {notaView === "blocks" ? "Edit as text" : "Blocks"}
              </button>
            </div>
            {notaView === "text" ? (
              <>
                <textarea className="mt-ta" value={raw} onChange={(e) => setRaw(e.target.value)} spellCheck={false} />
                <p className="mt-note" style={{ marginTop: 8 }}>
                  Format reminder: header <code>Team @ Opp</code> (@ = away, v = home) · roster <code>11. Rick</code> ·
                  start each half with the clock time on its own line · scoring lines <code>min scorer [free|goal|own goal|'65|'45]</code> ·
                  opposition = <code>T</code> / <code>T11</code> · subs <code>X for Y</code> · cards <code>min who yellow|red card</code> ·
                  corners <code>min [T] corner</code> · added time <code>min HT +3</code> · notes anything else.
                </p>
              </>
            ) : (
              <div className="mt-blks">
                {blocks.list.map((b) => (
                  <React.Fragment key={b.idx}>
                    {blkEdit && blkEdit.idx === b.idx ? (
                      <div className="mt-blk editing">
                        {blkEdit.minute != null && <MinuteStep val={blkEdit.minute} onChange={(m) => setBlkEdit({ ...blkEdit, minute: m, confirmDel: false })} />}
                        <input className="mt-blkta" style={{ marginTop: blkEdit.minute != null ? 7 : 0 }} value={blkEdit.rest}
                          onChange={(e) => setBlkEdit({ ...blkEdit, rest: e.target.value, confirmDel: false })} spellCheck={false} />
                        <div className="mt-blkrow">
                          <button className="mt-add" onClick={blkOk}>OK</button>
                          <button className="mt-add alt" onClick={() => setBlkEdit(null)}>Cancel</button>
                          {blkEdit.kind !== "half" && (
                            <button className={"mt-add danger" + (blkEdit.confirmDel ? " armed" : "")} onClick={blkDelete}>
                              {blkEdit.confirmDel ? "Tap again to delete" : "Delete"}
                            </button>
                          )}
                        </div>
                        {blkEdit.minute != null && <p className="mt-note" style={{ margin: "6px 0 0" }}>OK re-parses — changing the minute moves the line to its spot in the half.</p>}
                      </div>
                    ) : (
                      <div className="mt-blk">
                        <button className="mt-blk-main" onClick={() => openBlk(b)}>{blkPill(b)}<span className="t">{b.text}</span></button>
                        <button className="mt-blk-add" onClick={() => openInsert(b)} title="Insert event after this line" aria-label="Insert after">＋</button>
                      </div>
                    )}
                    {blkIns && blkIns.afterIdx === b.idx && (
                      <div className="mt-blk editing">
                        <p className="mt-h" style={{ margin: "0 0 6px" }}>Insert after "{b.text.slice(0, 24)}…"</p>
                        {blkIns.stage !== "note" && <MinuteStep val={blkIns.minute} onChange={(m) => setBlkIns({ ...blkIns, minute: m })} />}

                        {/* stage 1 — what happened? (+ sub / note) */}
                        {blkIns.stage === "event" && (
                          <>
                            <p className="mt-note" style={{ margin: "7px 0 4px" }}>What happened?</p>
                            <div className="mt-grid">
                              {liveEvents.filter((ev) => !["half", "ht", "ft"].includes(ev.key)).map((ev) => (
                                <button key={ev.key} className="mt-big sm ev" onClick={() => setBlkIns({ ...blkIns, stage: "team", ev: ev.key })}>{evIcon(ev.key, effMode)}<span>{ev.label}</span></button>
                              ))}
                            </div>
                            <div className="mt-grid" style={{ marginTop: 7 }}>
                              <button className="mt-big sm ev" onClick={() => setBlkIns({ ...blkIns, stage: "team", ev: "sub" })}>{evIcon("sub")}<span>Sub</span></button>
                              <button className="mt-big sm" onClick={() => setBlkIns({ ...blkIns, stage: "note" })}>Note</button>
                            </div>
                            <div className="mt-blkrow"><button className="mt-add alt" onClick={() => setBlkIns(null)}>Cancel</button></div>
                          </>
                        )}

                        {/* stage 2 — which team? */}
                        {blkIns.stage === "team" && (
                          <>
                            <p className="mt-note" style={{ margin: "7px 0 4px" }}>{evLabel(blkIns.ev)} — which team?</p>
                            <div className="mt-grid">
                              <button className="mt-big sm" style={{ background: colorHome, color: contrastOn(colorHome) }} onClick={() => insPickTeam("home")}>{homeName}</button>
                              <button className="mt-big sm" style={{ background: colorAway, color: contrastOn(colorAway) }} onClick={() => insPickTeam("away")}>{awayName}</button>
                            </div>
                            <div className="mt-blkrow"><button className="mt-add alt" onClick={() => setBlkIns({ ...blkIns, stage: "event", ev: null })}>← Back</button></div>
                          </>
                        )}

                        {/* stage 3 — which player? */}
                        {blkIns.stage === "who" && (
                          <>
                            <p className="mt-note" style={{ margin: "7px 0 4px" }}>{evLabel(blkIns.ev)} · {blkIns.team === "away" ? awayName : homeName} — who?</p>
                            {gmPicker(blkIns.team, (p) => insCommit(buildEventLine(blkIns.ev, blkIns.team, p, blkIns.minute)), { allowUnknown: true })}
                            <div className="mt-blkrow"><button className="mt-add alt" onClick={() => setBlkIns({ ...blkIns, stage: "team" })}>← Back</button></div>
                          </>
                        )}

                        {/* sub flow — off then on, on the team's jersey pitch (eligibility tracked) */}
                        {blkIns.stage === "subOff" && (
                          <>
                            <p className="mt-note" style={{ margin: "7px 0 4px" }}>{blkIns.team === "away" ? awayName : homeName} sub — who goes off?</p>
                            {gmPicker(blkIns.team, (p) => setBlkIns({ ...blkIns, stage: "subOn", off: p }), { eligible: onPitchSet(blkIns.team) })}
                            <div className="mt-blkrow"><button className="mt-add alt" onClick={() => setBlkIns({ ...blkIns, stage: "team" })}>← Back</button></div>
                          </>
                        )}
                        {blkIns.stage === "subOn" && (
                          <>
                            <p className="mt-note" style={{ margin: "7px 0 4px" }}>{subWho(blkIns.off)} off — who comes on?</p>
                            {gmPicker(blkIns.team, (p) => insCommit(`${blkIns.minute} ${whoToken(p, blkIns.team, whoCtx())} for ${whoToken(blkIns.off, blkIns.team, whoCtx())}`), { eligible: benchSet(blkIns.team) })}
                            <div className="mt-blkrow"><button className="mt-add alt" onClick={() => setBlkIns({ ...blkIns, stage: "subOff" })}>← Back</button></div>
                          </>
                        )}

                        {/* note flow */}
                        {blkIns.stage === "note" && (
                          <>
                            <input className="mt-blkta" style={{ marginTop: 7 }} placeholder="note text" value={blkIns.noteText} onChange={(e) => setBlkIns({ ...blkIns, noteText: e.target.value })} />
                            <label className="mt-note" style={{ display: "block", marginTop: 6 }}>
                              <input type="checkbox" checked={blkIns.noteMin} onChange={(e) => setBlkIns({ ...blkIns, noteMin: e.target.checked })} /> attach a minute
                            </label>
                            {blkIns.noteMin && <MinuteStep val={blkIns.minute} onChange={(m) => setBlkIns({ ...blkIns, minute: m })} />}
                            {notePhantom && <p className="mt-note" style={{ color: "#c0392b", margin: "4px 0 0" }}>Careful — a minuted line with no note keyword reads as a score. Leave the minute off for a plain note.</p>}
                            <div className="mt-blkrow">
                              <button className="mt-add" disabled={!noteLine()} onClick={() => insCommit(noteLine())}>OK</button>
                              <button className="mt-add alt" onClick={() => setBlkIns({ ...blkIns, stage: "event" })}>← Back</button>
                            </div>
                          </>
                        )}

                        {["event", "team", "who", "subOff", "subOn"].includes(blkIns.stage) && (
                          <p className="mt-note" style={{ margin: "8px 0 0" }}>Lands by minute within the half — may sit further down than where you tapped.</p>
                        )}
                      </div>
                    )}
                  </React.Fragment>
                ))}
                {blocks.list.length === 0 && <p className="mt-note">Nothing yet — tap Start half above at throw-in, or Edit as text.</p>}
              </div>
            )}
          </>
        )}
        {view !== "game" && view !== "new" && curId && (
          <section className="mt-danger">
            <h3 className="mt-h">Danger</h3>
            <button
              className={"mt-add" + (confirmDel ? " danger" : "")}
              onClick={() => {
                if (!confirmDel) { setConfirmDel(true); setTimeout(() => setConfirmDel(false), 3500); return; }
                setConfirmDel(false); doDelete();
              }}
            >{confirmDel ? "Tap again to delete this match" : "🗑 Delete match"}</button>
          </section>
        )}
      </div>
      <BrandFooter />
    </div>
  );
}
