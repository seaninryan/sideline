// @ts-nocheck
"use client";
import React from "react";
import { useMatchEditor } from "@/components/match-tracker/useMatchEditor";
import DetailsView from "@/components/match-tracker/DetailsView";
import MinuteStep from "@/components/MinuteStep";
import RosterPitch from "@/components/RosterPitch";
import Jersey from "@/components/Jersey";
import ShareSheet from "@/components/ShareSheet";
import ShareImageModal from "@/components/ShareImageModal";
import TeamPicker from "@/components/TeamPicker";
import AppHeader from "@/components/AppHeader";
import BrandFooter from "@/components/BrandFooter";
import ScoreHeader from "@/components/ScoreHeader";
import GameModeView from "@/components/match-tracker/GameModeView";
import NewMatchWizard from "@/components/match-tracker/NewMatchWizard";
import { addPlayer } from "@/lib/team-roster";
import { evIcon } from "@/lib/event-icons";
import { gpTotal, contrastOn, fmtDateDow } from "@/lib/util";
import { PALETTE, SPORTS } from "@/lib/constants";
import { whoToken } from "@/lib/event-line";
import { teamStore } from "@/lib/team-store";

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
          <NewMatchWizard
            nw={nw} setNw={setNw} nwTeams={nwTeams}
            nwPickHome={nwPickHome} nwCreateHome={nwCreateHome}
            nwPickAway={nwPickAway} nwCreateAway={nwCreateAway}
            finishNew={finishNew} onCancel={() => router.push("/")}
          />
        )}
        {view === "game" && (
          <GameModeView
            phase={phase} halfMarks={halfMarks} gmStage={gmStage} setGmStage={setGmStage}
            liveEvents={liveEvents} effMode={effMode} homeName={homeName} awayName={awayName}
            colorHome={colorHome} colorAway={colorAway} colorHome2={colorHome2} colorAway2={colorAway2}
            homeColor={homeColor} awayColor={awayColor} homeColor2={homeColor2} awayColor2={awayColor2}
            timelineHA={timelineHA} undoTarget={undoTarget} canUndo={canUndo} evLabel={evLabel}
            addLive={addLive} pickGmTeam={pickGmTeam} gmPicker={gmPicker}
            onPitchSet={onPitchSet} benchSet={benchSet} completeSub={completeSub} undoRaw={undoRaw}
          />
        )}

        {view === "details" && (
          <DetailsView
            parsed={parsed} effMode={effMode} homeName={homeName} awayName={awayName} maxLeadVenue={maxLeadVenue}
            homeSeries={homeSeries} goalDots={goalDots} chartMarkers={chartMarkers} htLine={htLine} halfMarks={halfMarks}
            homeScorers={homeScorers} awayScorers={awayScorers} timelineHA={timelineHA}
            homeColor={homeColor} awayColor={awayColor} homeColor2={homeColor2} awayColor2={awayColor2}
          />
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
