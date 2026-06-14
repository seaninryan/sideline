// @ts-nocheck
"use client";
import React from "react";
import { useMatchEditor } from "@/components/match-tracker/useMatchEditor";
import DetailsView from "@/components/match-tracker/DetailsView";
import ShareSheet from "@/components/ShareSheet";
import ShareImageModal from "@/components/ShareImageModal";
import TeamPicker from "@/components/TeamPicker";
import AppHeader from "@/components/AppHeader";
import BrandFooter from "@/components/BrandFooter";
import ScoreHeader from "@/components/ScoreHeader";
import GameModeView from "@/components/match-tracker/GameModeView";
import NewMatchWizard from "@/components/match-tracker/NewMatchWizard";
import LineupView from "@/components/match-tracker/LineupView";
import NotationView from "@/components/match-tracker/NotationView";
import { gpTotal, fmtDateDow } from "@/lib/util";
import { PALETTE, SPORTS } from "@/lib/constants";
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

        {view === "lineup" && (
          <LineupView
            editLineup={editLineup} setEditLineup={setEditLineup}
            homeRoster={homeRoster} awayRoster={awayRoster}
            setHomeRoster={setHomeRoster} setAwayRoster={setAwayRoster} EMPTY_ROSTER={EMPTY_ROSTER}
            colorHome={colorHome} colorAway={colorAway} colorHome2={colorHome2} colorAway2={colorAway2}
            homeName={homeName} awayName={awayName}
            formationRows={formationRows} chunk={chunk} starters={starters} subs={subs} missing={missing}
            subPick={subPick} setSubPick={setSubPick} tapPlayer={tapPlayer}
            subArrows={subArrows} playerMarks={playerMarks} scoreFor={scoreFor}
          />
        )}

        {view === "advanced" && (
          <NotationView
            notaView={notaView} setNotaView={setNotaView} canUndo={canUndo} undoRaw={undoRaw}
            setBlkEdit={setBlkEdit} setBlkIns={setBlkIns} setLineupEdit={setLineupEdit}
            raw={raw} setRaw={setRaw} blocks={blocks} blkEdit={blkEdit} blkIns={blkIns}
            blkOk={blkOk} blkDelete={blkDelete} blkPill={blkPill} openBlk={openBlk} openInsert={openInsert}
            liveEvents={liveEvents} effMode={effMode} evLabel={evLabel}
            colorHome={colorHome} colorAway={colorAway} homeName={homeName} awayName={awayName}
            gmPicker={gmPicker} insCommit={insCommit} insPickTeam={insPickTeam} buildEventLine={buildEventLine}
            subWho={subWho} whoCtx={whoCtx} onPitchSet={onPitchSet} benchSet={benchSet}
            notePhantom={notePhantom} noteLine={noteLine}
          />
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
